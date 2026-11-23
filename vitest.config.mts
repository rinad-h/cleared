import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));
const emptyModule = fileURLToPath(new URL("./tests/helpers/empty.ts", import.meta.url));

const alias = [
  { find: /^@\//, replacement: `${src}/` },
  // `server-only` throws outside React Server Components; tests import server modules directly.
  { find: /^server-only$/, replacement: emptyModule },
];

/**
 * Two projects:
 * - workers: unit and service tests inside workerd with a real local D1 (no
 *   Cloudflare quota). tests/setup.ts applies the drizzle/ migrations.
 * - dom: client hooks and components (usePoll, AutoRefresh) in happy-dom.
 *
 * There is no CI, so `.only` is always an error (a stray one would silently
 * skip the rest of the suite in `npm run check`).
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations(fileURLToPath(new URL("./drizzle", import.meta.url)));

  return {
    test: {
      allowOnly: false,
      projects: [
        {
          plugins: [
            cloudflareTest({
              // Bindings come from wrangler.jsonc; the entry point is a stub (no build needed).
              wrangler: { configPath: "./wrangler.jsonc" },
              main: "./tests/helpers/test-worker.ts",
              miniflare: {
                // Every var pinned, so a developer's .dev.vars or shell environment
                // can't change what the tests see.
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  ENVIRONMENT: "test",
                  PUBLIC_BASE_URL: "http://cleared.test",
                  BETTER_AUTH_URL: "http://cleared.test",
                  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
                },
              },
            }),
          ],
          resolve: { alias },
          test: {
            name: "workers",
            include: ["tests/unit/**/*.spec.ts", "tests/services/**/*.spec.ts"],
            setupFiles: ["./tests/setup.ts"],
            allowOnly: false,
            // Lets tests read stylesheets as text (`?raw`), e.g. the status-token contrast check.
            css: { include: [/globals\.css/] },
          },
        },
        {
          resolve: { alias },
          test: {
            name: "dom",
            include: ["tests/client/**/*.spec.{ts,tsx}"],
            environment: "happy-dom",
            allowOnly: false,
          },
        },
      ],
    },
  };
});
