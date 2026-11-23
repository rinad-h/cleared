// P2-45: certifications (FR-05, T10).
import { beforeEach, describe, expect, it } from "vitest";
import {
  createCertification,
  listCertifications,
  updateCertification,
} from "@/server/services/certifications";
import { updateMachine } from "@/server/services/machines";
import { actors, createMakerspace, dataVersion, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed } from "../helpers/seed";
import { T0 } from "../helpers/time";

const db = () => testDb();

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
});

describe("certifications", () => {
  it("admin creates and edits; data_version increments", async () => {
    const admin = await actors.admin();
    const v0 = await dataVersion();
    const cert = await createCertification(
      db(),
      admin,
      { name: "Laser basics", trainingUrl: "https://example.test/laser", validityMonths: 12 },
      T0,
    );
    expect(cert).toMatchObject({ name: "Laser basics", trainingUrl: "https://example.test/laser", validityMonths: 12, active: true });
    const edited = await updateCertification(db(), admin, { id: cert.id, trainingUrl: null, validityMonths: null }, T0);
    expect(edited).toMatchObject({ trainingUrl: null, validityMonths: null, name: "Laser basics" });
    expect(await dataVersion()).toBe(v0 + 2);
  });

  it("staff → FORBIDDEN on create and update; members can list active ones", async () => {
    const cert = await seed.cert({ name: "Wood lathe" });
    await seed.cert({ name: "Old cert", active: false });
    const staff = await actors.staff();
    await expect(createCertification(db(), staff, { name: "New cert" }, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateCertification(db(), staff, { id: cert.id, name: "Renamed" }, T0)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const member = await actors.member();
    expect((await listCertifications(db(), member)).map((c) => c.name)).toEqual(["Wood lathe"]);
    await expect(listCertifications(db(), member, { includeInactive: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listCertifications(db(), staff, { includeInactive: true })).map((c) => c.name)).toEqual([
      "Old cert",
      "Wood lathe",
    ]);
    await expect(listCertifications(db(), actors.anonymous())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(listCertifications(db(), await actors.nonMember())).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
  });

  it("validity is 1–120 months or never; training links must be http(s)", async () => {
    const admin = await actors.admin();
    for (const validityMonths of [0, 121, 1.5]) {
      await expect(createCertification(db(), admin, { name: "Bad", validityMonths }, T0)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { validityMonths: expect.any(Array) },
      });
    }
    for (const trainingUrl of ["javascript:alert(1)", "ftp://example.test/x", "example.test", `https://x.test/${"a".repeat(500)}`]) {
      await expect(createCertification(db(), admin, { name: "Bad", trainingUrl }, T0)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { trainingUrl: expect.any(Array) },
      });
    }
    await expect(createCertification(db(), admin, { name: "1", validityMonths: 1 }, T0)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(await createCertification(db(), admin, { name: "Edge low", validityMonths: 1 }, T0)).toMatchObject({ validityMonths: 1 });
    expect(await createCertification(db(), admin, { name: "Edge high", validityMonths: 120 }, T0)).toMatchObject({ validityMonths: 120 });
    // Form values: "" means "never expires" / "no link".
    expect(
      await createCertification(db(), admin, { name: "Form blank", validityMonths: "", trainingUrl: "" } as never, T0),
    ).toMatchObject({ validityMonths: null, trainingUrl: null });
  });

  it("names are unique regardless of case → NAME_TAKEN", async () => {
    const admin = await actors.admin();
    await createCertification(db(), admin, { name: "Laser basics" }, T0);
    await expect(createCertification(db(), admin, { name: "LASER BASICS" }, T0)).rejects.toMatchObject({ code: "NAME_TAKEN" });
  });

  it("deactivate is refused while a live machine requires it (CERT_IN_USE lists the machines), allowed after it's retired", async () => {
    const admin = await actors.admin();
    const cert = await seed.cert({ name: "Laser basics" });
    const laser = await seed.machine({ name: "Laser cutter", requires: [cert] });
    await seed.machine({ name: "Old laser", requires: [cert], retired: true });

    await expect(updateCertification(db(), admin, { id: cert.id, active: false }, T0)).rejects.toMatchObject({
      code: "CERT_IN_USE",
      details: { machines: [{ id: laser.id, name: "Laser cutter" }] },
    });
    expect((await listCertifications(db(), admin))[0]).toMatchObject({ active: true, requiredByCount: 1 });

    await updateMachine(db(), admin, { id: laser.id, retire: true }, T0 + 1);
    expect(await updateCertification(db(), admin, { id: cert.id, active: false }, T0 + 2)).toMatchObject({ active: false });
    expect(await listCertifications(db(), admin)).toEqual([]);
    // Reactivating is always allowed.
    expect(await updateCertification(db(), admin, { id: cert.id, active: true }, T0 + 3)).toMatchObject({ active: true });
  });

  it("unknown id → NOT_FOUND; nothing to change → VALIDATION_FAILED", async () => {
    const admin = await actors.admin();
    await expect(updateCertification(db(), admin, { id: crypto.randomUUID(), name: "Nope" }, T0)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const cert = await seed.cert();
    await expect(updateCertification(db(), admin, { id: cert.id }, T0)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
