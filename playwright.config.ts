import { defineConfig, devices } from "@playwright/test";

/**
 * Run through `npm run test:e2e` (tests/e2e/run.sh), which starts an isolated
 * `next dev` on a throwaway D1 and sets E2E_BASE_URL.
 *
 * There is no CI: `.only` is always an error, and failures aren't retried.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  // Dev mode compiles each route on first visit.
  timeout: 60_000,
  // Assertions wait up to 15 s (default 5 s): under parallel load, a `next dev`
  // server action + redirect + server render (e.g. Join → the status board)
  // can take longer than 5 s.
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    // Setup happens once per database, so the auth flow (which runs it and
    // leaves the admin's session for the others) goes first.
    { name: "setup", testMatch: "auth.spec.ts", use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium",
      testIgnore: "auth.spec.ts",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
