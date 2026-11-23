import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

describe("proxy matcher (P1-20)", () => {
  it("covers the signed-in areas and leaves public pages alone", () => {
    expect(config.matcher).toEqual([
      "/machines/:path*",
      "/m/:path*",
      "/me/:path*",
      "/console/:path*",
      "/setup",
      "/join/:path*",
    ]);
    for (const publicPath of ["/help", "/sign-in", "/sign-up", "/api"]) {
      expect(config.matcher.some((m) => m.startsWith(publicPath))).toBe(false);
    }
  });
});
