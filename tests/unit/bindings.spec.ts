import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

// vitest.config.mts pins every var, so a developer's .dev.vars or shell
// environment can't change what tests see.
describe("test bindings", () => {
  it("are the pinned test values", () => {
    expect(env).toMatchObject({
      ENVIRONMENT: "test",
      PUBLIC_BASE_URL: "http://cleared.test",
      BETTER_AUTH_URL: "http://cleared.test",
      REQUIRE_EMAIL_VERIFICATION: "true",
      EMAIL_DAILY_CAP: "280",
    });
  });
});
