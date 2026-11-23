import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("@/db", () => ({ getDb: () => db }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ ENVIRONMENT: "test" }) }));

const { GET } = await import("@/app/api/health/route");

afterEach(() => {
  vi.restoreAllMocks();
  db.get.mockReset();
});

describe("GET /api/health", () => {
  it("answers ok with the version and environment, never cached", async () => {
    db.get.mockResolvedValue({ ok: 1 });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "ok", environment: "test" });
  });

  it("answers 503 DAILY_LIMIT when D1's daily quota is used up, and logs it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.get.mockRejectedValue(new Error("D1_ERROR: Exceeded daily row read limit"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ code: "DAILY_LIMIT" });
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ event: "health.failed", code: "DAILY_LIMIT" });
  });

  it("answers 500 without details for other failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.get.mockRejectedValue(new Error("connection reset"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("connection reset");
  });
});
