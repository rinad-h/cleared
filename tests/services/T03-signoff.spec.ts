// PRD T03: sign-off, expiry and revocation (Phase 3 §7.3).
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { grants } from "@/db/schema";
import type { MemberActor } from "@/server/domain/actor";
import { addMonthsUtc } from "@/server/domain/time";
import { revokeGrant, signOff } from "@/server/services/grants";
import { getMachineByToken } from "@/server/services/pass";
import { actors, createMakerspace, dataVersion, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed, type SeededCert, type SeededMachine } from "../helpers/seed";
import { DAY, T0 } from "../helpers/time";

const db = () => testDb();
const rid = () => crypto.randomUUID();

let staff: MemberActor;
let student: MemberActor;
let cert: SeededCert;
let machine: SeededMachine;

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
  staff = await actors.staff({ name: "Demo Staff 1" });
  student = await actors.member({ name: "Demo Student 1" });
  cert = await seed.cert({ name: "Laser basics", validityMonths: 12 });
  machine = await seed.machine({ requires: [cert] });
});

async function status(actor: MemberActor, now: number) {
  const result = await getMachineByToken(db(), actor, { token: machine.qrToken }, now);
  if (!result.recognized) throw new Error("not recognized");
  return result.pass;
}

const grantRows = (memberId: string) => db().select().from(grants).where(eq(grants.memberId, memberId)).all();

describe("T03 — sign-off", () => {
  it("#1 staff signs off another member: granted_by = staff, expires = granted + validity; data_version bumps", async () => {
    const before = await dataVersion();
    const { grant, created } = await signOff(db(), staff, { memberId: student.memberId, certificationId: cert.id, clientRequestId: rid() }, T0);
    expect(created).toBe(true);
    expect(grant).toMatchObject({
      memberId: student.memberId,
      certificationId: cert.id,
      grantedByMemberId: staff.memberId,
      grantedAt: T0,
      expiresAt: addMonthsUtc(T0, 12),
      revokedAt: null,
    });
    expect(await dataVersion()).toBe(before + 1);
    expect((await status(student, T0)).status).toBe("CLEARED");
  });

  it("#2 admins and staff can't sign themselves off", async () => {
    const admin = await actors.admin();
    for (const who of [admin, staff]) {
      await expect(
        signOff(db(), who, { memberId: who.memberId, certificationId: cert.id, clientRequestId: rid() }, T0),
      ).rejects.toMatchObject({ code: "SELF_SIGN_OFF" });
    }
    expect(await grantRows(admin.memberId)).toEqual([]);
  });

  it("#3 a direct insert with granted_by = member_id fails on the CHECK constraint", async () => {
    const err = await db()
      .run(sql`INSERT INTO grants (id, member_id, certification_id, granted_by_member_id, granted_at, client_request_id, created_at)
        VALUES (${rid()}, ${staff.memberId}, ${cert.id}, ${staff.memberId}, ${T0}, ${rid()}, ${T0})`)
      .then(() => null, (e: unknown) => e);
    // Drizzle wraps D1's error; the constraint name is in the cause.
    expect(String((err as Error | null)?.cause ?? err)).toMatch(/CHECK constraint failed: grants_no_self_sign_off/);
    expect(await grantRows(staff.memberId)).toEqual([]);
  });

  it("#4 a member can't sign anyone off", async () => {
    await expect(
      signOff(db(), student, { memberId: staff.memberId, certificationId: cert.id, clientRequestId: rid() }, T0),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("#5 12-month validity: cleared until the expiry, NOT CLEARED 1 ms after", async () => {
    const { grant } = await signOff(db(), staff, { memberId: student.memberId, certificationId: cert.id, clientRequestId: rid() }, T0);
    const expiry = grant.expiresAt!;
    expect((await status(student, expiry - 1)).status).toBe("CLEARED");
    expect(await status(student, expiry + 1)).toMatchObject({
      status: "NOT_CLEARED",
      missing: [expect.objectContaining({ state: "expired", since: expiry })],
    });
  });

  it("#6 no validity → never expires, CLEARED far in the future", async () => {
    const forever = await seed.cert({ validityMonths: null });
    machine = await seed.machine({ requires: [forever] });
    const { grant } = await signOff(db(), staff, { memberId: student.memberId, certificationId: forever.id, clientRequestId: rid() }, T0);
    expect(grant.expiresAt).toBeNull();
    expect((await status(student, T0 + 50 * 365 * DAY)).status).toBe("CLEARED");
  });

  it("#7 revoke → the very next pass is NOT CLEARED (revoked)", async () => {
    const { grant } = await signOff(db(), staff, { memberId: student.memberId, certificationId: cert.id, clientRequestId: rid() }, T0);
    const before = await dataVersion();
    await expect(revokeGrant(db(), staff, { grantId: grant.id, reason: "Unsafe use" }, T0 + DAY)).resolves.toEqual({
      revokedGrantIds: [grant.id],
    });
    expect(await dataVersion()).toBe(before + 1);
    expect(await status(student, T0 + DAY)).toMatchObject({
      status: "NOT_CLEARED",
      missing: [expect.objectContaining({ state: "revoked", since: T0 + DAY })],
    });
    const [row] = await grantRows(student.memberId);
    expect(row).toMatchObject({ revokedAt: T0 + DAY, revokedByMemberId: staff.memberId, revokeReason: "Unsafe use" });
  });

  it("revoking also revokes an earlier still-valid grant for the same certification (early renewal)", async () => {
    const first = await signOff(db(), staff, { memberId: student.memberId, certificationId: cert.id, clientRequestId: rid() }, T0);
    const renewal = await signOff(db(), staff, { memberId: student.memberId, certificationId: cert.id, clientRequestId: rid() }, T0 + 300 * DAY);
    const result = await revokeGrant(db(), staff, { grantId: renewal.grant.id, reason: "Unsafe use" }, T0 + 301 * DAY);
    expect(result.revokedGrantIds.sort()).toEqual([first.grant.id, renewal.grant.id].sort());
    expect((await status(student, T0 + 301 * DAY)).status).toBe("NOT_CLEARED");
  });

  it("#8 revoke twice → ALREADY_REVOKED; own grant → SELF_REVOKE; reason missing → VALIDATION_FAILED; member → FORBIDDEN", async () => {
    const { grant } = await signOff(db(), staff, { memberId: student.memberId, certificationId: cert.id, clientRequestId: rid() }, T0);
    await expect(revokeGrant(db(), staff, { grantId: grant.id, reason: "" }, T0)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(revokeGrant(db(), staff, { grantId: grant.id, reason: "ok" }, T0)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(revokeGrant(db(), student, { grantId: grant.id, reason: "Not me" }, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await revokeGrant(db(), staff, { grantId: grant.id, reason: "Unsafe use" }, T0);
    const version = await dataVersion();
    await expect(revokeGrant(db(), staff, { grantId: grant.id, reason: "Again" }, T0)).rejects.toMatchObject({ code: "ALREADY_REVOKED" });
    expect(await dataVersion()).toBe(version);

    const admin = await actors.admin();
    const own = await seed.grant(staff, cert, { by: admin });
    await expect(revokeGrant(db(), staff, { grantId: own.id, reason: "My own" }, T0)).rejects.toMatchObject({ code: "SELF_REVOKE" });
    await expect(revokeGrant(db(), staff, { grantId: rid(), reason: "Missing" }, T0)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("#9 the same clientRequestId twice (sequential and concurrent) → one grant; replays return created:false", async () => {
    const input = { memberId: student.memberId, certificationId: cert.id, clientRequestId: rid() };
    const first = await signOff(db(), staff, input, T0);
    const version = await dataVersion();
    const again = await signOff(db(), staff, input, T0 + 1000);
    expect(again).toEqual({ grant: first.grant, created: false });
    expect(await dataVersion()).toBe(version);

    const other = await actors.member();
    const concurrent = { memberId: other.memberId, certificationId: cert.id, clientRequestId: rid() };
    const results = await Promise.all([1, 2, 3].map(() => signOff(db(), staff, concurrent, T0)));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.grant.id)).size).toBe(1);
    expect(await grantRows(other.memberId)).toHaveLength(1);
    expect(await grantRows(student.memberId)).toHaveLength(1);
  });

  it("#10 the same clientRequestId with a different certification or member → IDEMPOTENCY_MISMATCH", async () => {
    const other = await seed.cert();
    const id = rid();
    await signOff(db(), staff, { memberId: student.memberId, certificationId: cert.id, clientRequestId: id }, T0);
    await expect(
      signOff(db(), staff, { memberId: student.memberId, certificationId: other.id, clientRequestId: id }, T0),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
    const someoneElse = await actors.member();
    await expect(
      signOff(db(), staff, { memberId: someoneElse.memberId, certificationId: cert.id, clientRequestId: id }, T0),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
  });

  it("#11 re-grant after expiry → a new row; both rows kept", async () => {
    const first = await signOff(db(), staff, { memberId: student.memberId, certificationId: cert.id, clientRequestId: rid() }, T0);
    const later = first.grant.expiresAt! + DAY;
    expect((await status(student, later)).status).toBe("NOT_CLEARED");
    await signOff(db(), staff, { memberId: student.memberId, certificationId: cert.id, clientRequestId: rid() }, later);
    expect((await status(student, later)).status).toBe("CLEARED");
    expect(await grantRows(student.memberId)).toHaveLength(2);
  });

  it("#12 inactive certification → CERT_INACTIVE; suspended target → MEMBER_SUSPENDED; unknown → NOT_FOUND", async () => {
    const inactive = await seed.cert({ active: false });
    await expect(
      signOff(db(), staff, { memberId: student.memberId, certificationId: inactive.id, clientRequestId: rid() }, T0),
    ).rejects.toMatchObject({ code: "CERT_INACTIVE" });
    const suspended = await actors.member({ status: "suspended" });
    await expect(
      signOff(db(), staff, { memberId: suspended.memberId, certificationId: cert.id, clientRequestId: rid() }, T0),
    ).rejects.toMatchObject({ code: "MEMBER_SUSPENDED" });
    await expect(
      signOff(db(), staff, { memberId: rid(), certificationId: cert.id, clientRequestId: rid() }, T0),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      signOff(db(), staff, { memberId: student.memberId, certificationId: rid(), clientRequestId: rid() }, T0),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      signOff(db(), staff, { memberId: student.memberId, certificationId: cert.id, clientRequestId: "not-a-uuid" }, T0),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("staff can sign off staff and admins (any role)", async () => {
    const admin = await actors.admin();
    await expect(
      signOff(db(), staff, { memberId: admin.memberId, certificationId: cert.id, clientRequestId: rid() }, T0),
    ).resolves.toMatchObject({ created: true });
  });
});
