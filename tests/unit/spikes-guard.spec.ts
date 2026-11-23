import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ ENVIRONMENT: undefined as string | undefined }));
vi.mock("@/lib/env", () => ({ getEnv: () => env }));

const { spikesEnabled } = await import("@/server/spikes/guard");

describe("spikesEnabled()", () => {
  it.each([
    ["development", true],
    ["staging", true],
    ["production", false],
    ["test", false],
    [undefined, false],
  ])("ENVIRONMENT=%s → %s", (value, expected) => {
    env.ENVIRONMENT = value;
    expect(spikesEnabled()).toBe(expected);
  });
});
