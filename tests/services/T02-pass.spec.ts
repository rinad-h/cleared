// PRD T02: the machine pass, through getMachineByToken (Phase 3 §7.3).
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { validGrantSql, isGrantValid } from "@/server/domain/grants";
import type { Actor, MemberActor } from "@/server/domain/actor";
import { setMachineOutOfService } from "@/server/services/machine-status";
import { getMachineByToken } from "@/server/services/pass";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed } from "../helpers/seed";
import { DAY, T0 } from "../helpers/time";

const db = () => testDb();

let staff: MemberActor;
beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
  staff = await actors.staff({ name: "Demo Staff 1" });
});

async function passFor(actor: Actor, token: string, now = T0) {
  const result = await getMachineByToken(db(), actor, { token }, now);
  if (!result.recognized) throw new Error("not recognized");
  return result;
}

async function setOutOfService(machineId: string) {
  // Through the real staff flow (Phase 5, T07 #12).
  await setMachineOutOfService(
    db(),
    staff,
    { machineId, reason: "maintenance", note: "New tube on order", expectedBackAt: T0 + 3 * DAY },
    T0 - DAY,
  );
}

describe("T02 — pass logic", () => {
  it("#1 member, requires A, no grant → NOT CLEARED listing A with its training link (never)", async () => {
    const a = await seed.cert({ name: "Laser basics", trainingUrl: "https://training.example/laser" });
    const m = await seed.machine({ requires: [a] });
    const student = await actors.member({ name: "Demo Student 1" });
    const result = await passFor(student, m.qrToken);
    expect(result.viewer).toEqual({ displayName: "Demo Student 1", membership: "active", role: "member" });
    expect(result.serverNow).toBe(T0);
    expect(result.pass).toEqual({
      status: "NOT_CLEARED",
      notClearedReason: "missing_certifications",
      missing: [{ id: a.id, name: "Laser basics", trainingUrl: "https://training.example/laser", state: "never", since: null }],
      earliestExpiry: null,
      certifiedForMachine: false,
    });
  });

  it("#2 valid A → CLEARED with A's expiry", async () => {
    const a = await seed.cert({ validityMonths: 12 });
    const m = await seed.machine({ requires: [a] });
    const student = await actors.member();
    await seed.grant(student, a, { by: staff, expiresAt: T0 + 300 * DAY });
    expect((await passFor(student, m.qrToken)).pass).toMatchObject({ status: "CLEARED", earliestExpiry: T0 + 300 * DAY });
  });

  it("#3 / #4 requires A + B: only A → missing B; both → CLEARED with the earlier expiry", async () => {
    const [a, b] = [await seed.cert(), await seed.cert()];
    const m = await seed.machine({ requires: [a, b] });
    const student = await actors.member();
    await seed.grant(student, a, { by: staff, expiresAt: T0 + 90 * DAY });
    const partial = await passFor(student, m.qrToken);
    expect(partial.pass.status).toBe("NOT_CLEARED");
    expect(partial.pass.missing.map((c) => c.id)).toEqual([b.id]);
    await seed.grant(student, b, { by: staff, expiresAt: T0 + 30 * DAY });
    expect((await passFor(student, m.qrToken)).pass).toMatchObject({ status: "CLEARED", earliestExpiry: T0 + 30 * DAY });
  });

  it("#5 no requirements, active member → CLEARED", async () => {
    const m = await seed.machine();
    expect((await passFor(await actors.member(), m.qrToken)).pass.status).toBe("CLEARED");
  });

  it("#6 – #8 supervised: member → SUPERVISION REQUIRED; staff/admin with certs → CLEARED; staff without → NOT CLEARED", async () => {
    const a = await seed.cert();
    const m = await seed.machine({ requires: [a], supervised: true });
    const student = await actors.member();
    const admin = await actors.admin();
    const otherStaff = await actors.staff();
    for (const who of [student, admin]) await seed.grant(who, a, { by: staff });
    await seed.grant(staff, a, { by: admin });
    expect((await passFor(student, m.qrToken)).pass.status).toBe("SUPERVISION_REQUIRED");
    expect((await passFor(staff, m.qrToken)).pass.status).toBe("CLEARED");
    expect((await passFor(admin, m.qrToken)).pass.status).toBe("CLEARED");
    expect((await passFor(otherStaff, m.qrToken)).pass).toMatchObject({
      status: "NOT_CLEARED",
      notClearedReason: "missing_certifications",
    });
  });

  it("#9 non-member → NOT CLEARED (not_member), named from their account", async () => {
    const m = await seed.machine();
    const result = await passFor(await actors.nonMember({ name: "Nora Visitor" }), m.qrToken);
    expect(result.viewer).toEqual({ displayName: "Nora Visitor", membership: "none", role: null });
    expect(result.pass).toMatchObject({ status: "NOT_CLEARED", notClearedReason: "not_member", missing: [] });
  });

  it("#10 suspended with all certs → NOT CLEARED (suspended)", async () => {
    const a = await seed.cert();
    const m = await seed.machine({ requires: [a] });
    const suspended = await actors.member({ status: "suspended" });
    await seed.grant(suspended, a, { by: staff });
    const result = await passFor(suspended, m.qrToken);
    expect(result.viewer.membership).toBe("suspended");
    expect(result.pass).toMatchObject({ status: "NOT_CLEARED", notClearedReason: "suspended", certifiedForMachine: false });
  });

  it("#11 out of service → OUT OF SERVICE for member, non-member and staff, with the details", async () => {
    const a = await seed.cert();
    const m = await seed.machine({ requires: [a] });
    await seed.grant(await actors.member(), a, { by: staff });
    await setOutOfService(m.id);
    for (const who of [await actors.member(), await actors.nonMember(), staff]) {
      const result = await passFor(who, m.qrToken);
      expect(result.pass.status).toBe("OUT_OF_SERVICE");
      expect(result.machine).toMatchObject({
        status: "out_of_service",
        outOfService: { reason: "maintenance", since: T0 - DAY, note: "New tube on order", expectedBackAt: T0 + 3 * DAY },
      });
    }
  });

  it("#12 a grant that expired 1 ms before now → NOT CLEARED (expired, since = expiry)", async () => {
    const a = await seed.cert({ validityMonths: 12 });
    const m = await seed.machine({ requires: [a] });
    const student = await actors.member();
    await seed.grant(student, a, { by: staff, grantedAt: T0 - 400 * DAY, expiresAt: T0 - 1 });
    expect((await passFor(student, m.qrToken)).pass.missing).toEqual([
      expect.objectContaining({ id: a.id, state: "expired", since: T0 - 1 }),
    ]);
  });

  it("#13 a revoked grant next to a newer valid one → CLEARED", async () => {
    const a = await seed.cert();
    const m = await seed.machine({ requires: [a] });
    const student = await actors.member();
    await seed.grant(student, a, { by: staff, grantedAt: T0 - 10 * DAY, revokedAt: T0 - 5 * DAY });
    await seed.grant(student, a, { by: staff, grantedAt: T0 - DAY });
    expect((await passFor(student, m.qrToken)).pass.status).toBe("CLEARED");
  });

  it("#14 unknown or retired token → recognized:false", async () => {
    const retired = await seed.machine({ retired: true });
    const student = await actors.member();
    expect(await getMachineByToken(db(), student, { token: retired.qrToken }, T0)).toEqual({ recognized: false });
    expect(await getMachineByToken(db(), student, { token: "AAAAAAAAAAAAAAAAAAAAAA" }, T0)).toEqual({ recognized: false });
  });

  it("#15 anonymous → UNAUTHENTICATED", async () => {
    const m = await seed.machine();
    await expect(getMachineByToken(db(), actors.anonymous(), { token: m.qrToken }, T0)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("#16 certifiedForMachine follows certification validity, regardless of supervision or out of service", async () => {
    const a = await seed.cert();
    const m = await seed.machine({ requires: [a], supervised: true });
    const holder = await actors.member();
    const without = await actors.member();
    await seed.grant(holder, a, { by: staff });
    expect((await passFor(holder, m.qrToken)).pass.certifiedForMachine).toBe(true);
    expect((await passFor(without, m.qrToken)).pass.certifiedForMachine).toBe(false);
    await setOutOfService(m.id);
    expect((await passFor(holder, m.qrToken)).pass.certifiedForMachine).toBe(true);
    expect((await passFor(without, m.qrToken)).pass.certifiedForMachine).toBe(false);
  });

  it("#17 isGrantValid and validGrantSql() agree at boundary times", async () => {
    const a = await seed.cert();
    const student = await actors.member();
    const now = T0 + 100 * DAY;
    const shapes = [
      { expiresAt: null, revokedAt: null },
      { expiresAt: now - 1, revokedAt: null },
      { expiresAt: now, revokedAt: null },
      { expiresAt: now + 1, revokedAt: null },
      { expiresAt: null, revokedAt: now - 1 },
      { expiresAt: now + DAY, revokedAt: now },
      { expiresAt: now - DAY, revokedAt: now - 2 * DAY },
    ];
    const ids: { id: string; expected: boolean }[] = [];
    for (const s of shapes) {
      const row = await seed.grant(student, a, { by: staff, grantedAt: T0, expiresAt: s.expiresAt, revokedAt: s.revokedAt });
      ids.push({ id: row.id, expected: isGrantValid(s, now) });
    }
    const rows = await db().all<{ id: string; valid: number }>(
      sql`SELECT "grants"."id" AS id, ${validGrantSql(now)} AS valid FROM grants`,
    );
    const bySql = new Map(rows.map((r) => [r.id, r.valid === 1]));
    for (const { id, expected } of ids) expect(bySql.get(id), id).toBe(expected);
    expect(ids.some((i) => i.expected) && ids.some((i) => !i.expected)).toBe(true);
  });

  it("P3-42 the pass never includes other members' data", async () => {
    const a = await seed.cert();
    const m = await seed.machine({ requires: [a] });
    const other = await actors.member({ name: "Someone Else" });
    await seed.grant(other, a, { by: staff });
    const student = await actors.member({ name: "Me Myself" });
    const result = await passFor(student, m.qrToken);
    expect(result.pass.status).toBe("NOT_CLEARED");
    const text = JSON.stringify(result);
    expect(text).not.toContain("Someone Else");
    expect(text).not.toContain(other.memberId);
    expect(text).not.toContain(staff.memberId);
    expect(text).not.toContain("Demo Staff 1");
  });
});
