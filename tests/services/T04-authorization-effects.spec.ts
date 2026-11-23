// PRD T04 (session part): revocation and suspension end sessions (Phase 4 §4.5, §7.3).
// Phase 6: the console's "no longer authorized" flag (#6–#8).
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { machineSessions } from "@/db/schema";
import type { MemberActor } from "@/server/domain/actor";
import { revokeGrant } from "@/server/services/grants";
import { updateMachine } from "@/server/services/machines";
import { updateMember } from "@/server/services/members";
import { getConsole } from "@/server/services/console";
import { endSession, startSession } from "@/server/services/sessions";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed, type SeededCert, type SeededMachine } from "../helpers/seed";
import { MIN, T0 } from "../helpers/time";

const db = () => testDb();
const row = (id: string) => db().select().from(machineSessions).where(eq(machineSessions.id, id)).get();

let staff: MemberActor;
let student: MemberActor;
let certA: SeededCert;
let laser: SeededMachine; // requires A
let printer: SeededMachine; // requires nothing

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
  staff = await actors.staff();
  student = await actors.member();
  certA = await seed.cert({ name: "Cert A" });
  laser = await seed.machine({ requires: [certA] });
  printer = await seed.machine();
});

const start = async (m: MemberActor, machine: SeededMachine, now = T0) =>
  (await startSession(db(), m, { machineId: machine.id, clientRequestId: crypto.randomUUID() }, now)).session;

describe("T04 — revocation and suspension end sessions", () => {
  it("#1/#2 revoking A ends the session on a machine requiring A (authorization_removed, by the revoker); others continue", async () => {
    const grant = await seed.grant(student, certA, { by: staff });
    const onLaser = await start(student, laser);
    const onPrinter = await start(student, printer);
    await revokeGrant(db(), staff, { grantId: grant.id, reason: "Unsafe use" }, T0 + 10 * MIN);
    expect(await row(onLaser.id)).toMatchObject({
      endedAt: T0 + 10 * MIN,
      endReason: "authorization_removed",
      endedByMemberId: staff.memberId,
    });
    expect(await row(onPrinter.id)).toMatchObject({ endedAt: null });
  });

  it("#3 two valid grants for A, one revoked: both are revoked (Phase 3 §11), so the session ends", async () => {
    // The spec expected the session to continue, but Phase 3 decided that a revoke
    // revokes every valid grant of that certification (Phase 4 §11).
    const g1 = await seed.grant(student, certA, { by: staff, grantedAt: T0 - 1000 });
    await seed.grant(student, certA, { by: staff });
    const s = await start(student, laser);
    await revokeGrant(db(), staff, { grantId: g1.id, reason: "Unsafe use" }, T0 + MIN);
    expect(await row(s.id)).toMatchObject({ endReason: "authorization_removed" });
  });

  it("revoking a certification the machine doesn't require ends nothing there", async () => {
    const certB = await seed.cert({ name: "Cert B" });
    await seed.grant(student, certA, { by: staff });
    const gB = await seed.grant(student, certB, { by: staff });
    const s = await start(student, laser);
    await revokeGrant(db(), staff, { grantId: gB.id, reason: "Unsafe use" }, T0 + MIN);
    expect(await row(s.id)).toMatchObject({ endedAt: null });
  });

  it("revoking closes the member's expired-but-open sessions as expired, not as removed", async () => {
    const grant = await seed.grant(student, certA, { by: staff });
    const old = await seed.session(student, laser, { startedAt: T0 - 120 * MIN, minutes: 30 });
    await revokeGrant(db(), staff, { grantId: grant.id, reason: "Unsafe use" }, T0);
    expect(await row(old.id)).toMatchObject({ endedAt: T0 - 90 * MIN, endReason: "expired" });
  });

  it("#4 suspending a member ends all their active sessions (authorization_removed)", async () => {
    await seed.grant(student, certA, { by: staff });
    const a = await start(student, laser);
    const b = await start(student, printer);
    await updateMember(db(), staff, { id: student.memberId, status: "suspended", suspensionReason: "Conduct" }, T0 + 5 * MIN);
    for (const s of [a, b]) {
      expect(await row(s.id)).toMatchObject({
        endedAt: T0 + 5 * MIN,
        endReason: "authorization_removed",
        endedByMemberId: staff.memberId,
      });
    }
  });

  it("a refused suspension ends nothing", async () => {
    const other = await actors.staff();
    const s = await start(other, printer);
    // Staff can't suspend staff.
    await expect(updateMember(db(), staff, { id: other.memberId, status: "suspended" }, T0 + MIN)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await row(s.id)).toMatchObject({ endedAt: null });
  });

  it("#5 a grant expiring mid-session doesn't end it", async () => {
    await seed.grant(student, certA, { by: staff, expiresAt: T0 + 10 * MIN });
    const s = await start(student, laser);
    // Something else writes to the machine after the expiry.
    const admin = await actors.admin();
    await updateMachine(db(), admin, { id: laser.id, typicalSessionMinutes: 30 }, T0 + 20 * MIN);
    expect(await row(s.id)).toMatchObject({ endedAt: null });
  });

  it("retiring a machine ends its active session as staff", async () => {
    const admin = await actors.admin();
    const s = await start(student, printer);
    await updateMachine(db(), admin, { id: printer.id, retire: true }, T0 + 5 * MIN);
    expect(await row(s.id)).toMatchObject({ endedAt: T0 + 5 * MIN, endReason: "staff", endedByMemberId: admin.memberId });
  });
});

describe("T04 — console: sessions whose member is no longer authorized (Phase 6)", () => {
  const consoleAt = async (now: number) => {
    const result = await getConsole(db(), staff, now);
    if (result.notModified) throw new Error("expected a full answer");
    return result.console;
  };

  it("#6 a grant expiring mid-session: the session stays active and is flagged with state expired", async () => {
    await seed.grant(student, certA, { by: staff, expiresAt: T0 + 30 * MIN });
    const s = await start(student, laser);
    const before = await consoleAt(T0 + 25 * MIN);
    expect(before.noLongerAuthorized).toEqual([]);
    // validUntil is the grant's expiry: the poll gets a full answer the moment it lapses.
    expect(before.validUntil).toBe(new Date(T0 + 30 * MIN).toISOString());

    const after = await consoleAt(T0 + 31 * MIN);
    expect(await row(s.id)).toMatchObject({ endedAt: null });
    expect(after.activeSessions.map((a) => a.id)).toEqual([s.id]);
    expect(after.noLongerAuthorized).toEqual([
      {
        sessionId: s.id,
        member: { id: student.memberId, displayName: student.displayName },
        machine: { id: laser.id, name: laser.name },
        missing: [{ id: certA.id, name: "Cert A", state: "expired", since: new Date(T0 + 30 * MIN).toISOString() }],
      },
    ]);
  });

  it("#7 an admin adds a requirement the member lacks → flagged (never held)", async () => {
    const admin = await actors.admin();
    const certB = await seed.cert({ name: "Cert B" });
    const s = await start(student, printer);
    await updateMachine(db(), admin, { id: printer.id, requirementIds: [certB.id] }, T0 + 5 * MIN);
    const c = await consoleAt(T0 + 6 * MIN);
    expect(c.noLongerAuthorized).toMatchObject([{ sessionId: s.id, missing: [{ id: certB.id, state: "never", since: null }] }]);
  });

  it("#8 staff end a flagged session: end_reason staff; it leaves both lists", async () => {
    await seed.grant(student, certA, { by: staff, expiresAt: T0 + 30 * MIN });
    const s = await start(student, laser);
    expect((await consoleAt(T0 + 45 * MIN)).noLongerAuthorized).toHaveLength(1);
    await endSession(db(), staff, { sessionId: s.id }, T0 + 46 * MIN);
    expect(await row(s.id)).toMatchObject({ endReason: "staff", endedByMemberId: staff.memberId });
    const c = await consoleAt(T0 + 47 * MIN);
    expect(c.activeSessions).toEqual([]);
    expect(c.noLongerAuthorized).toEqual([]);
  });
});
