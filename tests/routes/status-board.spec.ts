// T06 #4, #6, #7 through the route handler: GET /api/status-board (Phase 4 §4.7).
// The handler's own code runs for real against the test D1; only how the
// request's actor is found is replaced (services take the actor; no auth stub
// exists in the app).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor, MemberActor } from "@/server/domain/actor";
import type { StatusBoard } from "@/server/domain/board";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed } from "../helpers/seed";

const current = vi.hoisted(() => ({ actor: { kind: "anonymous" } as Actor }));
vi.mock("@/lib/actor", () => ({ getActor: async () => current.actor }));
vi.mock("@/db", async () => ({ getDb: (await import("../helpers/db")).testDb }));

const { GET } = await import("@/app/api/status-board/route");

const request = (etag?: string) =>
  new Request("http://cleared.test/api/status-board", { headers: etag ? { "If-None-Match": etag } : {} });

let student: MemberActor;

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
  student = await actors.member({ name: "Demo Student 1" });
});
afterEach(() => {
  current.actor = { kind: "anonymous" };
});

describe("GET /api/status-board", () => {
  it("#6 signed out → 401; non-member → 403; suspended → 403; never cached", async () => {
    for (const [actor, status, code] of [
      [actors.anonymous(), 401, "UNAUTHENTICATED"],
      [await actors.nonMember(), 403, "NOT_A_MEMBER"],
      [await actors.member({ status: "suspended" }), 403, "SUSPENDED"],
    ] as const) {
      current.actor = actor;
      const res = await GET(request());
      expect(res.status).toBe(status);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toMatchObject({ code });
    }
  });

  it("#7 200 with an ETag, then 304 for the same ETag; a mutation → 200 again", async () => {
    const m = await seed.machine({ name: "Laser" });
    current.actor = student;
    const first = await GET(request());
    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");
    const etag = first.headers.get("ETag")!;
    expect(etag).toMatch(/^W\/"b\.\d+\./);
    expect(((await first.json()) as StatusBoard).rooms[0].machines[0]).toMatchObject({ name: "Laser", state: "available" });

    const second = await GET(request(etag));
    expect(second.status).toBe(304);
    expect(second.headers.get("ETag")).toBe(etag);
    expect(await second.text()).toBe("");

    const { startSession } = await import("@/server/services/sessions");
    await startSession(testDb(), student, { machineId: m.id, clientRequestId: crypto.randomUUID() }, Date.now());
    const third = await GET(request(etag));
    expect(third.status).toBe(200);
    expect(((await third.json()) as StatusBoard).rooms[0].machines[0]).toMatchObject({ state: "in_use" });
  });

  it("#4 privacy: the JSON contains no member ids, names, emails, session ids or QR tokens", async () => {
    const staff = await actors.staff({ name: "Demo Staff 1" });
    const m = await seed.machine({ name: "Laser" });
    const s = await seed.session(student, m, { startedAt: Date.now() - 60_000 });
    current.actor = staff;
    const text = await (await GET(request())).text();
    expect(text).toContain('"state":"in_use"');
    for (const secret of [student.memberId, student.userId, "Demo Student 1", staff.memberId, "Demo Staff 1", s.id, m.qrToken, "example.test"]) {
      expect(text).not.toContain(secret);
    }
  });
});
