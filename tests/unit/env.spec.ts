import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: { ENVIRONMENT: "production", PUBLIC_BASE_URL: "https://cleared.example", ENABLE_SPIKES: "0" },
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
    vi.stubEnv("ENABLE_SPIKES", "1");
    expect(getEnv().ENABLE_SPIKES).toBe("0");
  });
});
