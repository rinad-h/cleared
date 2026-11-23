import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  ENVIRONMENT: undefined as string | undefined,
  ENABLE_SPIKES: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({ getEnv: () => env }));

const { spikesEnabled } = await import("@/server/spikes/guard");

describe("spikesEnabled()", () => {
  it.each([
    ["development", undefined, true],
    ["production", undefined, false],
    ["production", "1", true],
    ["production", "true", false],
    ["production", "", false],
    ["test", undefined, false],
    [undefined, undefined, false],
  ])("ENVIRONMENT=%s ENABLE_SPIKES=%s → %s", (environment, flag, expected) => {
    env.ENVIRONMENT = environment;
    env.ENABLE_SPIKES = flag;
    expect(spikesEnabled()).toBe(expected);
  });
});
