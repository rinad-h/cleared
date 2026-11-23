// PRD T05: sessions (Phase 4 §7.3).
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { machineSessions, machines } from "@/db/schema";
import type { MemberActor } from "@/server/domain/actor";
import { revokeGrant } from "@/server/services/grants";
import { getStatusBoard } from "@/server/services/board";
import { getMachineByToken } from "@/server/services/pass";
import { endSession, extendSession, getMemberSessions, getMyRecentSessions, startSession } from "@/server/services/sessions";
import { updateMachine } from "@/server/services/machines";
import { actors, createMakerspace, dataVersion, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed, type SeededCert, type SeededMachine } from "../helpers/seed";
import { MIN, T0 } from "../helpers/time";

const db = () => testDb();
const rid = () => crypto.randomUUID();
const noSleep = async () => {};

let staff: MemberActor;
let student: MemberActor;
let cert: SeededCert;
let laser: SeededMachine;

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
  staff = await actors.staff({ name: "Demo Staff 1" });
  student = await actors.member({ name: "Demo Student 1" });
  cert = await seed.cert({ name: "Laser basics" });
  laser = await seed.machine({ name: "Laser", requires: [cert], typicalSessionMinutes: 45 });
  await seed.grant(student, cert, { by: staff });
});

const start = (actor: MemberActor, input: Partial<Parameters<typeof startSession>[2]> = {}, now = T0) =>
  startSession(db(), actor, { machineId: laser.id, clientRequestId: rid(), ...input }, now, { sleep: noSleep });

const openRows = (machineId = laser.id) =>
  db()
    .select()
    .from(machineSessions)
    .where(and(eq(machineSessions.machineId, machineId), isNull(machineSessions.endedAt)))
    .all();

async function cleared(name: string) {
  const m = await actors.member({ name });
  await seed.grant(m, cert, { by: staff });
  return m;
}

describe("T05 — start", () => {
  it("#1 a CLEARED member starts 60 min: expected_end_at = now + 60 min, data_version bumps", async () => {
    const v0 = await dataVersion();
    const { session, created } = await start(student, { expectedMinutes: 60 });
    expect(created).toBe(true);
    expect(session).toMatchObject({
      memberId: student.memberId,
      machineId: laser.id,
      startedAt: T0,
      expectedEndAt: T0 + 60 * MIN,
      endedAt: null,
      supervisionAcknowledged: false,
    });
    expect(await dataVersion()).toBeGreaterThan(v0);
  });

  it("#2 five concurrent starts by five cleared members: exactly one wins, the rest MACHINE_BUSY", async () => {
    const people = [student, ...(await Promise.all([1, 2, 3, 4].map((i) => cleared(`Demo Student ${i + 1}`))))];
    const results = await Promise.allSettled(people.map((p) => start(p)));
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(4);
    for (const r of lost) expect(r.reason).toMatchObject({ code: "MACHINE_BUSY" });
    expect(await openRows()).toHaveLength(1);
  });

  it("#3 start on a busy machine → MACHINE_BUSY with times only, no identity", async () => {
    await start(student);
    const other = await cleared("Demo Student 2");
    const err = await start(other, {}, T0 + 5 * MIN).catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: "MACHINE_BUSY",
      details: { since: new Date(T0).toISOString(), estFreeAt: new Date(T0 + 45 * MIN).toISOString() },
    });
    const text = JSON.stringify((err as { details: unknown }).details);
    expect(text).not.toContain(student.memberId);
    expect(text).not.toContain("Demo Student 1");
  });

  it("starting again on a machine you're using → ALREADY_IN_SESSION with your session id", async () => {
    const { session } = await start(student);
    await expect(start(student, {}, T0 + MIN)).rejects.toMatchObject({
      code: "ALREADY_IN_SESSION",
      details: { sessionId: session.id },
    });
  });

  it("#4 supervised machine: a member needs the acknowledgement; staff don't", async () => {
    const supervised = await seed.machine({ requires: [cert], supervised: true });
    await expect(start(student, { machineId: supervised.id })).rejects.toMatchObject({ code: "SUPERVISION_ACK_REQUIRED" });
    const { session } = await start(student, { machineId: supervised.id, supervisionAcknowledged: true });
    expect(session.supervisionAcknowledged).toBe(true);
    await endSession(db(), student, { sessionId: session.id }, T0 + MIN);

    const admin = await actors.admin();
    await seed.grant(staff, cert, { by: admin });
    const { session: staffSession } = await start(staff, { machineId: supervised.id }, T0 + 2 * MIN);
    expect(staffSession.supervisionAcknowledged).toBe(false);
  });

  it("#5 NOT_CLEARED; out of service; retired", async () => {
    const stranger = await actors.member();
    await expect(start(stranger)).rejects.toMatchObject({ code: "NOT_CLEARED", details: { passStatus: "NOT_CLEARED" } });

    await db()
      .update(machines)
      .set({ status: "out_of_service", outOfServiceReason: "maintenance" })
      .where(eq(machines.id, laser.id));
    await expect(start(student)).rejects.toMatchObject({ code: "MACHINE_OUT_OF_SERVICE" });

    const retired = await seed.machine({ retired: true });
    await expect(start(student, { machineId: retired.id })).rejects.toMatchObject({ code: "MACHINE_RETIRED" });
    await expect(start(student, { machineId: crypto.randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("suspended members and non-members can't start", async () => {
    const suspended = await actors.member({ status: "suspended" });
    await expect(start(suspended)).rejects.toMatchObject({ code: "SUSPENDED" });
    await expect(
      startSession(db(), await actors.nonMember(), { machineId: laser.id, clientRequestId: rid() }, T0),
    ).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
  });

  it("#6 expectedMinutes 14 / 241 → VALIDATION_FAILED; omitted → the machine's typical minutes", async () => {
    await expect(start(student, { expectedMinutes: 14 })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(start(student, { expectedMinutes: 241 })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const { session } = await start(student);
    expect(session.expectedEndAt).toBe(T0 + 45 * MIN);
  });

  it("#11 the same clientRequestId twice → one session; the replay returns it", async () => {
    const clientRequestId = rid();
    const first = await start(student, { clientRequestId });
    const again = await start(student, { clientRequestId }, T0 + MIN);
    expect(again).toEqual({ session: first.session, created: false });
    expect(await openRows()).toHaveLength(1);
    // Someone else reusing it is refused.
    const other = await cleared("Demo Student 2");
    await expect(start(other, { clientRequestId })).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
  });
});

describe("T05 — extend", () => {
  it("#7 +15 repeatedly stops at exactly 240 min; at the cap → SESSION_AT_MAX; someone else → FORBIDDEN", async () => {
    const { session } = await start(student, { expectedMinutes: 200 });
    const other = await cleared("Demo Student 2");
    await expect(extendSession(db(), other, { sessionId: session.id, minutes: 15 }, T0 + MIN)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const a = await extendSession(db(), student, { sessionId: session.id, minutes: 15 }, T0 + MIN);
    expect(a.session.expectedEndAt).toBe(T0 + 215 * MIN);
    const b = await extendSession(db(), student, { sessionId: session.id, minutes: 15 }, T0 + 2 * MIN);
    expect(b.session.expectedEndAt).toBe(T0 + 230 * MIN);
    const c = await extendSession(db(), student, { sessionId: session.id, minutes: 15 }, T0 + 3 * MIN);
    expect(c.session.expectedEndAt).toBe(T0 + 240 * MIN);
    await expect(extendSession(db(), student, { sessionId: session.id, minutes: 15 }, T0 + 4 * MIN)).rejects.toMatchObject({
      code: "SESSION_AT_MAX",
    });
  });

  it("can't extend an ended or expired session, or after losing the certification (D2)", async () => {
    const { session } = await start(student, { expectedMinutes: 15 });
    await expect(extendSession(db(), student, { sessionId: session.id, minutes: 15 }, T0 + 15 * MIN)).rejects.toMatchObject({
      code: "SESSION_ENDED",
    });

    // The grant expires mid-session: the session goes on (PRD 7.1) but can't be extended.
    const expiring = await actors.member();
    await seed.grant(expiring, cert, { by: staff, expiresAt: T0 + 30 * MIN });
    const printer = await seed.machine({ requires: [cert] });
    const { session: s2 } = await start(expiring, { machineId: printer.id }, T0 + 20 * MIN);
    await expect(extendSession(db(), expiring, { sessionId: s2.id, minutes: 15 }, T0 + 31 * MIN)).rejects.toMatchObject({
      code: "NOT_CLEARED",
    });
    expect((await openRows(printer.id)).map((r) => r.id)).toEqual([s2.id]);
  });
});

describe("T05 — end", () => {
  it("#8 own → user; staff ends another's → staff + ended_by; a member ending another's → FORBIDDEN; twice → unchanged", async () => {
    const { session } = await start(student);
    const other = await cleared("Demo Student 2");
    await expect(endSession(db(), other, { sessionId: session.id }, T0 + MIN)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const ended = await endSession(db(), student, { sessionId: session.id }, T0 + 10 * MIN);
    expect(ended.session).toMatchObject({ endedAt: T0 + 10 * MIN, endReason: "user", endedByMemberId: student.memberId });
    const v = await dataVersion();
    const again = await endSession(db(), student, { sessionId: session.id }, T0 + 12 * MIN);
    expect(again.session).toEqual(ended.session);
    expect(await dataVersion()).toBe(v);

    const { session: s2 } = await start(other, {}, T0 + 20 * MIN);
    const byStaff = await endSession(db(), staff, { sessionId: s2.id }, T0 + 25 * MIN);
    expect(byStaff.session).toMatchObject({ endedAt: T0 + 25 * MIN, endReason: "staff", endedByMemberId: staff.memberId });
  });

  it("ending an expired-but-open session records `expired` at its expected end (D3)", async () => {
    const { session } = await start(student, { expectedMinutes: 15 });
    const ended = await endSession(db(), student, { sessionId: session.id }, T0 + 40 * MIN);
    expect(ended.session).toMatchObject({ endedAt: T0 + 15 * MIN, endReason: "expired", endedByMemberId: null });
  });
});

describe("T05 — expiry", () => {
  it("#9 start 15 min at T0; the board at T0 + 20 min closes it as expired at its expected end", async () => {
    const { session } = await start(student, { expectedMinutes: 15 });
    await getStatusBoard(db(), student, T0 + 20 * MIN);
    const row = await db().select().from(machineSessions).where(eq(machineSessions.id, session.id)).get();
    expect(row).toMatchObject({ endedAt: T0 + 15 * MIN, endReason: "expired" });
  });

  it("#10 an expired-but-open session doesn't block a new start (closed inside the start batch)", async () => {
    const { session } = await start(student, { expectedMinutes: 15 });
    const other = await cleared("Demo Student 2");
    const { session: next } = await start(other, {}, T0 + 15 * MIN); // exactly at expected_end_at: not active
    expect(next.memberId).toBe(other.memberId);
    const old = await db().select().from(machineSessions).where(eq(machineSessions.id, session.id)).get();
    expect(old).toMatchObject({ endedAt: T0 + 15 * MIN, endReason: "expired" });
  });

  it("±1 ms: active until expected_end_at, not at it", async () => {
    const { session } = await start(student, { expectedMinutes: 15 });
    const pass = async (now: number) => {
      const r = await getMachineByToken(db(), student, { token: laser.qrToken }, now);
      if (!r.recognized) throw new Error("not recognized");
      return r.currentSession.state;
    };
    expect(await pass(session.expectedEndAt - 1)).toBe("mine");
    expect(await pass(session.expectedEndAt)).toBe("none");
  });
});

describe("T05 — races", () => {
  it("#12 start vs revoke (concurrent): no active session remains for a member without a valid grant", async () => {
    for (let i = 0; i < 5; i++) {
      await resetCatalog();
      cert = await seed.cert();
      laser = await seed.machine({ requires: [cert] });
      const m = await actors.member();
      const grant = await seed.grant(m, cert, { by: staff });
      await Promise.allSettled([start(m), revokeGrant(db(), staff, { grantId: grant.id, reason: "Race test" }, T0)]);
      const open = (await openRows()).filter((s) => s.memberId === m.memberId);
      expect(open).toEqual([]);
    }
  });

  it("#13 an admin adds a requirement during a start → the start retries and returns NOT_CLEARED or PASS_CHANGED", async () => {
    const admin = await actors.admin();
    const extra = await seed.cert({ name: "Extra" });
    const results = await Promise.allSettled([
      start(student),
      updateMachine(db(), admin, { id: laser.id, requirementIds: [cert.id, extra.id] }, T0),
    ]);
    const [startResult, update] = results;
    expect(update.status).toBe("fulfilled");
    if (startResult.status === "rejected") {
      expect(["NOT_CLEARED", "PASS_CHANGED"]).toContain((startResult.reason as { code: string }).code);
    } else {
      // The start won the race before the requirement existed.
      expect(startResult.value.created).toBe(true);
    }
    // A start after the change is refused.
    await expect(start(student, {}, T0 + 60 * MIN)).rejects.toMatchObject({ code: "NOT_CLEARED" });
  });
});

describe("recent sessions (FR-18)", () => {
  it("members see their own last sessions; staff see a member's recent and active ones", async () => {
    const { session } = await start(student, { expectedMinutes: 15 });
    const { recentSessions } = await getMyRecentSessions(db(), student, T0 + MIN);
    expect(recentSessions).toEqual([
      expect.objectContaining({ id: session.id, machineName: "Laser", active: true, endedAt: null }),
    ]);
    // Past its end, it reads as expired without anything being written.
    const later = await getMyRecentSessions(db(), student, T0 + 30 * MIN);
    expect(later.recentSessions[0]).toMatchObject({ active: false, endedAt: T0 + 15 * MIN, endReason: "expired" });

    const forStaff = await getMemberSessions(db(), staff, { memberId: student.memberId }, T0 + MIN);
    expect(forStaff.activeSessions.map((s) => s.id)).toEqual([session.id]);
    await expect(getMemberSessions(db(), student, { memberId: student.memberId }, T0)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
