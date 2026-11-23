import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: { ENVIRONMENT: "production", PUBLIC_BASE_URL: "https://cleared.example", BREVO_API_KEY: "real-key" },
  }),
}));

const { getEnv } = await import("@/lib/env");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getEnv()", () => {
  it("returns the bindings unchanged outside next dev", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENVIRONMENT", "test");
    expect(getEnv().ENVIRONMENT).toBe("production");
  });

  it("lets process.env override allowlisted keys under next dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENVIRONMENT", "test");
    vi.stubEnv("PUBLIC_BASE_URL", "http://127.0.0.1:4000");
    expect(getEnv()).toMatchObject({ ENVIRONMENT: "test", PUBLIC_BASE_URL: "http://127.0.0.1:4000" });
  });

  it("ignores empty overrides", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENVIRONMENT", "");
    expect(getEnv().ENVIRONMENT).toBe("production");
  });

  it("never lets process.env override keys outside the allowlist", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BREVO_API_KEY", "from-shell");
    expect(getEnv().BREVO_API_KEY).toBe("real-key");
  });
});
