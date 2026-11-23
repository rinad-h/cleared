import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Variables that the E2E harness (tests/e2e/run.sh) may override through the
 * process environment when running `next dev`. Wrangler's local bindings only
 * read wrangler.jsonc + .dev.vars, so this is how a throwaway E2E server gets
 * its own port, environment name and dev-outbox flag.
 */
const DEV_OVERRIDABLE = [
  "ENVIRONMENT",
  "PUBLIC_BASE_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "REQUIRE_EMAIL_VERIFICATION",
  "ENABLE_DEV_OUTBOX",
] as const;

export type AppEnv = CloudflareEnv & { ENABLE_DEV_OUTBOX?: string };

/**
 * The Worker's bindings and variables for this request.
 *
 * In `next dev` only, values from `process.env` override the bindings for the
 * keys above. `process.env.NODE_ENV` is inlined as "production" in deployed
 * builds, so this branch is removed from the Worker bundle entirely.
 */
export function getEnv(): AppEnv {
  const { env } = getCloudflareContext();
  if (process.env.NODE_ENV !== "development") return env;
  return withDevOverrides(env);
}

/**
 * Only reachable from the `next dev` branch above, so production builds drop it
 * as dead code. The marker in the error below lets scripts/check-bundle.mjs
 * fail the build if this function ever survives into the Worker.
 */
function withDevOverrides(env: AppEnv): AppEnv {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("cleared:dev-env-overrides must only run under next dev");
  }
  const overrides: Record<string, string> = {};
  for (const key of DEV_OVERRIDABLE) {
    const value = process.env[key];
    if (value !== undefined && value !== "") overrides[key] = value;
  }
  return { ...env, ...overrides };
}
