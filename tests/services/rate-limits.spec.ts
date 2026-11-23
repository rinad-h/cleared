// FR-19: per-member action limits (Phase 6 §4.4, §7.3). The services get a
// fake limiter with the binding's semantics (20 per fixed 60 s window per key).
import { beforeEach, describe, expect, it } from "vitest";
import type { MemberActor } from "@/server/domain/actor";
import { bindingLimiter, type RateLimiter } from "@/server/rate-limit";
import { reportFault } from "@/server/services/faults";
import { joinMakerspace } from "@/server/services/join";
import { startSession, endSession } from "@/server/services/sessions";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed, type SeededMachine } from "../helpers/seed";
import { SECOND, T0 } from "../helpers/time";

const db = () => testDb();
const rid = () => crypto.randomUUID();

/** 20 per fixed 60 s window per key, like `RL_ACTIONS`. Records the keys it saw. */
function fakeLimiter(limit = 20, periodMs = 60_000): RateLimiter & { keys: string[] } {
  const counts = new Map<string, { window: number; count: number }>();
  const keys: string[] = [];
  return {
    keys,
    async limit(key, now) {
      keys.push(key);
      const window = Math.floor(now / periodMs) * periodMs;
      const entry = counts.get(key);
      const next = entry && entry.window === window ? { window, count: entry.count + 1 } : { window, count: 1 };
      counts.set(key, next);
      return next.count <= limit;
    },
  };
}

let student: MemberActor;
let other: MemberActor;
let saw: SeededMachine;
let limiter: ReturnType<typeof fakeLimiter>;
const T = Math.floor(T0 / 60_000) * 60_000; // the start of a window

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
  student = await actors.member();
  other = await actors.member();
  saw = await seed.machine({ name: "Bandsaw" });
  limiter = fakeLimiter();
});

const report = (actor: MemberActor, now: number) =>
  reportFault(
    db(),
    actor,
    { machineId: saw.id, description: "Something rattles loudly", takeOutOfService: false, clientRequestId: rid() },
    now,
    { limiter, sleep: async () => {} },
  );

describe("FR-19 — rate limits", () => {
  it("#1 the 21st fault report in one minute → RATE_LIMITED, and it writes nothing", async () => {
    for (let i = 0; i < 20; i++) await report(student, T + i * SECOND);
    await expect(report(student, T + 30 * SECOND)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const { faults } = await import("@/db/schema");
    expect(await db().select().from(faults).all()).toHaveLength(20);
    expect(limiter.keys[0]).toBe(`fault:${student.memberId}`);
  });

  it("#2 another member in the same minute is unaffected", async () => {
    for (let i = 0; i < 20; i++) await report(student, T + i * SECOND);
    await expect(report(student, T + 21 * SECOND)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(report(other, T + 22 * SECOND)).resolves.toMatchObject({ created: true });
  });

  it("#3 session starts and joins are limited the same way, by member id and auth user id", async () => {
    for (let i = 0; i < 20; i++) {
      const { session } = await startSession(db(), student, { machineId: saw.id, clientRequestId: rid() }, T + i * SECOND, { limiter });
      await endSession(db(), student, { sessionId: session.id }, T + i * SECOND + 1);
    }
    await expect(
      startSession(db(), student, { machineId: saw.id, clientRequestId: rid() }, T + 25 * SECOND, { limiter }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(limiter.keys.at(-1)).toBe(`start:${student.memberId}`);

    const newcomer = await actors.nonMember();
    for (let i = 0; i < 20; i++) {
      await joinMakerspace(db(), newcomer, { token: "wrong-token-000000000" }, T + i * SECOND, { limiter }).catch(() => {});
    }
    await expect(
      joinMakerspace(db(), newcomer, { token: "join-token-0000000000" }, T + 30 * SECOND, { limiter }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(limiter.keys.at(-1)).toBe(`join:${newcomer.userId}`);
  });

  it("#4 the next window allows again", async () => {
    for (let i = 0; i < 20; i++) await report(student, T + i * SECOND);
    await expect(report(student, T + 59 * SECOND)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(report(student, T + 60 * SECOND)).resolves.toMatchObject({ created: true });
  });

  it("the binding limiter maps the binding's answer", async () => {
    const calls: string[] = [];
    const limiter = bindingLimiter({
      limit: async ({ key }: { key: string }) => {
        calls.push(key);
        return { success: calls.length <= 1 };
      },
    } as RateLimit);
    expect(await limiter.limit("fault:x", T)).toBe(true);
    expect(await limiter.limit("fault:x", T)).toBe(false);
    expect(calls).toEqual(["fault:x", "fault:x"]);
  });
});
