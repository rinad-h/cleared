// Console route handler: GET /api/console (Phase 6 §7.3). The handler runs for
// real against the test D1; only how the request's actor is found is replaced.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { machineSessions } from "@/db/schema";
import type { Actor, MemberActor } from "@/server/domain/actor";
import type { ConsoleData } from "@/server/domain/console";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed } from "../helpers/seed";

const current = vi.hoisted(() => ({ actor: { kind: "anonymous" } as Actor }));
vi.mock("@/lib/actor", () => ({ getActor: async () => current.actor }));
vi.mock("@/db", async () => ({ getDb: (await import("../helpers/db")).testDb }));

const { GET } = await import("@/app/api/console/route");

const request = (etag?: string) =>
  new Request("http://cleared.test/api/console", { headers: etag ? { "If-None-Match": etag } : {} });

let staff: MemberActor;

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
  staff = await actors.staff({ name: "Demo Staff 1" });
});
afterEach(() => {
  vi.useRealTimers();
  current.actor = { kind: "anonymous" };
});

describe("GET /api/console", () => {
  it("#1 signed out → 401; member → 403; staff → 200 with the §5.1 shape", async () => {
    for (const [actor, status, code] of [
      [actors.anonymous(), 401, "UNAUTHENTICATED"],
      [await actors.nonMember(), 403, "NOT_A_MEMBER"],
      [await actors.member(), 403, "FORBIDDEN"],
      [await actors.staff({ status: "suspended" }), 403, "SUSPENDED"],
    ] as const) {
      current.actor = actor;
      const res = await GET(request());
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ code });
    }

    const student = await actors.member({ name: "Demo Student 1" });
    const laser = await seed.machine({ name: "Epilog Laser #1" });
    const now = Date.now();
    await seed.session(student, laser, { startedAt: now - 60_000, minutes: 60 });
    current.actor = staff;
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("ETag")).toMatch(/^W\/"c\.\d+\./);
    const body = (await res.json()) as ConsoleData;
    expect(body).toMatchObject({
      generatedAt: expect.any(String),
      validUntil: expect.any(String),
      counts: { openFaults: 0, outOfServiceFaults: 0, checkupsDueSoon: 0, checkupsOverdue: 0 },
      outOfServiceMachines: [],
      activeSessions: [
        {
          member: { id: student.memberId, displayName: "Demo Student 1" },
          machine: { id: laser.id, name: "Epilog Laser #1", roomName: expect.any(String) },
          supervisionAcknowledged: false,
        },
      ],
      noLongerAuthorized: [],
    });
  });

  it("#2 the same ETag with nothing changed → 304", async () => {
    current.actor = staff;
    const first = await GET(request());
    const etag = first.headers.get("ETag")!;
    const second = await GET(request(etag));
    expect(second.status).toBe(304);
    expect(second.headers.get("ETag")).toBe(etag);
    // Another viewer's ETag gets a full answer.
    current.actor = await actors.staff();
    expect((await GET(request(etag))).status).toBe(200);
  });

  it("#3 after a mutation → 200; after validUntil passes → 200 and the expired session is closed", async () => {
    current.actor = staff;
    const etag = (await GET(request())).headers.get("ETag")!;
    const { createRoom } = await import("@/server/services/rooms");
    await createRoom(testDb(), staff, { name: "Wood Shop" }, Date.now());
    expect((await GET(request(etag))).status).toBe(200);

    const student = await actors.member();
    const saw = await seed.machine({ name: "Bandsaw" });
    const start = Date.now();
    const s = await seed.session(student, saw, { startedAt: start - 5 * 60_000, minutes: 15 });
    const live = await GET(request());
    const liveEtag = live.headers.get("ETag")!;
    expect(((await live.json()) as ConsoleData).activeSessions).toHaveLength(1);

    vi.useFakeTimers({ now: start + 11 * 60_000, toFake: ["Date"] });
    const later = await GET(request(liveEtag));
    expect(later.status).toBe(200);
    expect(((await later.json()) as ConsoleData).activeSessions).toEqual([]);
    expect((await testDb().select().from(machineSessions).where(eq(machineSessions.id, s.id)).get())?.endReason).toBe("expired");
  });
});
