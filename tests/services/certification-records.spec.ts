// P3-40, P3-41: My certifications and the member detail's certifications + history (FR-18).
import { beforeEach, describe, expect, it } from "vitest";
import type { MemberActor } from "@/server/domain/actor";
import { getMemberCertifications, getMyCertifications } from "@/server/services/grants";
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

describe("getMyCertifications (P3-40)", () => {
  it("states: valid / expiring_soon / expired / revoked / none; inactive only if ever held", async () => {
    const student = await actors.member();
    const valid = await seed.cert({ name: "A valid", validityMonths: 12, trainingUrl: "https://t.example/a" });
    const soon = await seed.cert({ name: "B soon" });
    const expired = await seed.cert({ name: "C expired" });
    const revoked = await seed.cert({ name: "D revoked" });
    await seed.cert({ name: "E none", trainingUrl: "https://t.example/e" });
    const inactiveHeld = await seed.cert({ name: "F inactive held", active: false });
    await seed.cert({ name: "G inactive never", active: false });

    await seed.grant(student, valid, { by: staff, expiresAt: T0 + 200 * DAY });
    await seed.grant(student, soon, { by: staff, expiresAt: T0 + 10 * DAY });
    await seed.grant(student, expired, { by: staff, grantedAt: T0 - 400 * DAY, expiresAt: T0 - DAY });
    await seed.grant(student, revoked, { by: staff, revokedAt: T0 - 2 * DAY, revokeReason: "Unsafe use" });
    await seed.grant(student, inactiveHeld, { by: staff });

    const { certifications } = await getMyCertifications(db(), student, T0);
    expect(certifications.map((c) => [c.certification.name, c.state])).toEqual([
      ["A valid", "valid"],
      ["B soon", "expiring_soon"],
      ["C expired", "expired"],
      ["D revoked", "revoked"],
      ["E none", "none"],
      ["F inactive held", "valid"],
    ]);
    expect(certifications[0]).toMatchObject({
      certification: { trainingUrl: "https://t.example/a", validityMonths: 12, active: true },
      grantedAt: T0,
      expiresAt: T0 + 200 * DAY,
      grantedByName: "Demo Staff 1",
    });
    expect(certifications[3]).toMatchObject({ revokedAt: T0 - 2 * DAY, revokeReason: "Unsafe use" });
    expect(certifications[4]).toMatchObject({ grantId: null, grantedAt: null, certification: { trainingUrl: "https://t.example/e" } });
  });

  it("only the member's own grants; non-members and anonymous are refused", async () => {
    const a = await seed.cert();
    const me = await actors.member();
    await seed.grant(await actors.member(), a, { by: staff });
    expect((await getMyCertifications(db(), me, T0)).certifications[0]?.state).toBe("none");
    await expect(getMyCertifications(db(), await actors.nonMember(), T0)).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
    await expect(getMyCertifications(db(), actors.anonymous(), T0)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("getMemberCertifications (P3-41)", () => {
  it("includes the history with granted-by and revoked-by names, newest first", async () => {
    const admin = await actors.admin({ name: "Demo Admin" });
    const student = await actors.member();
    const a = await seed.cert({ name: "Laser basics" });
    const old = await seed.grant(student, a, {
      by: staff,
      grantedAt: T0 - 10 * DAY,
      revokedAt: T0 - 5 * DAY,
      revokedBy: admin,
      revokeReason: "Retrain",
    });
    const fresh = await seed.grant(student, a, { by: admin, grantedAt: T0 - DAY });

    const detail = await getMemberCertifications(db(), staff, { memberId: student.memberId }, T0);
    expect(detail.certifications).toEqual([
      expect.objectContaining({ state: "valid", grantId: fresh.id, grantedByName: "Demo Admin" }),
    ]);
    expect(detail.history).toEqual([
      expect.objectContaining({ id: fresh.id, certificationName: "Laser basics", grantedByName: "Demo Admin", revokedByName: null }),
      expect.objectContaining({
        id: old.id,
        grantedByName: "Demo Staff 1",
        revokedByName: "Demo Admin",
        revokeReason: "Retrain",
        revokedAt: T0 - 5 * DAY,
      }),
    ]);
  });

  it("members → FORBIDDEN; unknown member → NOT_FOUND", async () => {
    const student = await actors.member();
    await expect(getMemberCertifications(db(), student, { memberId: staff.memberId }, T0)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      getMemberCertifications(db(), staff, { memberId: crypto.randomUUID() }, T0),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
