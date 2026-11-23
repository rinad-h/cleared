// P2-42, P2-43, P2-44, P2-46: machines, requirements, retire, QR tokens (FR-04, FR-06, T10).
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { machineRequirements, machines } from "@/db/schema";
import { getLabelSheet } from "@/server/services/labels";
import { createMachine, getMachine, getMachineByToken, listMachines, updateMachine } from "@/server/services/machines";
import { actors, createMakerspace, dataVersion, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed } from "../helpers/seed";
import { T0 } from "../helpers/time";

const db = () => testDb();
const SITE = { publicBaseUrl: "https://labels.example.test", environment: "production" };

async function row(id: string) {
  return db().select().from(machines).where(eq(machines.id, id)).get();
}

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
});

describe("machines: basics and per-field authorization (P2-42)", () => {
  it("staff create basics; typical session defaults to 60", async () => {
    const staff = await actors.staff();
    const room = await seed.room({ name: "Laser Room" });
    const v0 = await dataVersion();
    const m = await createMachine(db(), staff, { name: "Laser cutter", roomId: room.id }, T0);
    expect(m).toMatchObject({
      name: "Laser cutter",
      room: { id: room.id, name: "Laser Room" },
      status: "available",
      supervised: false,
      typicalSessionMinutes: 60,
      requirements: [],
    });
    expect(await dataVersion()).toBe(v0 + 1);
    expect((await row(m.id))?.statusChangedAt).toBe(T0);
  });

  it("staff sending supervised or requirementIds → FORBIDDEN_FIELD and nothing changes", async () => {
    const staff = await actors.staff();
    const room = await seed.room();
    const cert = await seed.cert();
    const m = await seed.machine({ room, name: "Band saw" });
    const v0 = await dataVersion();

    await expect(
      createMachine(db(), staff, { name: "Drill press", roomId: room.id, supervised: true }, T0),
    ).rejects.toMatchObject({ code: "FORBIDDEN_FIELD" });
    await expect(
      createMachine(db(), staff, { name: "Drill press", roomId: room.id, requirementIds: [] }, T0),
    ).rejects.toMatchObject({ code: "FORBIDDEN_FIELD" });
    // A legal field next to a forbidden one: the whole input is rejected.
    await expect(
      updateMachine(db(), staff, { id: m.id, name: "Renamed", supervised: false }, T0),
    ).rejects.toMatchObject({ code: "FORBIDDEN_FIELD", fieldErrors: { supervised: expect.any(Array) } });
    await expect(
      updateMachine(db(), staff, { id: m.id, typicalSessionMinutes: 30, requirementIds: [cert.id] }, T0),
    ).rejects.toMatchObject({ code: "FORBIDDEN_FIELD" });

    expect(await listMachines(db(), staff)).toHaveLength(1);
    expect(await row(m.id)).toMatchObject({ name: "Band saw", typicalSessionMinutes: 60, writeToken: m.writeToken });
    expect(await dataVersion()).toBe(v0);
  });

  it("staff edit basics; admins set every field", async () => {
    const staff = await actors.staff();
    const admin = await actors.admin();
    const [roomA, roomB] = [await seed.room({ name: "A" }), await seed.room({ name: "B" })];
    const cert = await seed.cert({ name: "Laser basics" });
    const m = await seed.machine({ room: roomA });

    expect(
      await updateMachine(db(), staff, { id: m.id, name: "Laser 2", roomId: roomB.id, typicalSessionMinutes: 90 }, T0),
    ).toMatchObject({ name: "Laser 2", room: { id: roomB.id }, typicalSessionMinutes: 90 });

    const created = await createMachine(
      db(),
      admin,
      { name: "Laser 3", roomId: roomA.id, supervised: true, requirementIds: [cert.id], typicalSessionMinutes: 45 },
      T0,
    );
    expect(created).toMatchObject({ supervised: true, typicalSessionMinutes: 45, requirements: [{ id: cert.id, name: "Laser basics" }] });
  });

  it("typical session minutes: bounds 15 and 240", async () => {
    const staff = await actors.staff();
    const room = await seed.room();
    for (const typicalSessionMinutes of [14, 241, 30.5]) {
      await expect(
        createMachine(db(), staff, { name: `M ${typicalSessionMinutes}`, roomId: room.id, typicalSessionMinutes }, T0),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { typicalSessionMinutes: expect.any(Array) } });
    }
    expect(await createMachine(db(), staff, { name: "Short", roomId: room.id, typicalSessionMinutes: 15 }, T0)).toMatchObject({
      typicalSessionMinutes: 15,
    });
    expect(await createMachine(db(), staff, { name: "Long", roomId: room.id, typicalSessionMinutes: 240 }, T0)).toMatchObject({
      typicalSessionMinutes: 240,
    });
  });

  it("names are unique among live machines (case-insensitive) → NAME_TAKEN; unknown room → NOT_FOUND", async () => {
    const staff = await actors.staff();
    const room = await seed.room();
    await seed.machine({ room, name: "Laser cutter" });
    const other = await seed.machine({ room, name: "Band saw" });
    await expect(createMachine(db(), staff, { name: "LASER CUTTER", roomId: room.id }, T0)).rejects.toMatchObject({
      code: "NAME_TAKEN",
    });
    await expect(updateMachine(db(), staff, { id: other.id, name: "laser cutter" }, T0)).rejects.toMatchObject({
      code: "NAME_TAKEN",
    });
    await expect(createMachine(db(), staff, { name: "Lathe", roomId: crypto.randomUUID() }, T0)).rejects.toMatchObject({
      code: "NOT_FOUND",
      fieldErrors: { roomId: expect.any(Array) },
    });
    await expect(updateMachine(db(), staff, { id: other.id, roomId: crypto.randomUUID() }, T0)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(updateMachine(db(), staff, { id: crypto.randomUUID(), name: "X" }, T0)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(updateMachine(db(), staff, { id: other.id }, T0)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("members → FORBIDDEN on every machine service", async () => {
    const member = await actors.member();
    const room = await seed.room();
    const m = await seed.machine({ room });
    await expect(listMachines(db(), member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getMachine(db(), member, { id: m.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createMachine(db(), member, { name: "X", roomId: room.id }, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateMachine(db(), member, { id: m.id, name: "Y" }, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("requirements (P2-43)", () => {
  it("inactive certification → CERT_INACTIVE and nothing is created or changed", async () => {
    const admin = await actors.admin();
    const room = await seed.room();
    const active = await seed.cert();
    const inactive = await seed.cert({ active: false });
    const v0 = await dataVersion();
    await expect(
      createMachine(db(), admin, { name: "Laser", roomId: room.id, requirementIds: [active.id, inactive.id] }, T0),
    ).rejects.toMatchObject({ code: "CERT_INACTIVE" });
    expect(await listMachines(db(), admin)).toEqual([]);

    const m = await seed.machine({ room, requires: [active] });
    await expect(
      updateMachine(db(), admin, { id: m.id, name: "Renamed", requirementIds: [inactive.id] }, T0),
    ).rejects.toMatchObject({ code: "CERT_INACTIVE" });
    expect(await getMachine(db(), admin, { id: m.id })).toMatchObject({ name: m.name, requirements: [{ id: active.id }] });
    expect(await dataVersion()).toBe(v0);
  });

  it("replace the set (including clearing it); the write token changes on every update", async () => {
    const admin = await actors.admin();
    const [a, b, c] = [await seed.cert({ name: "A cert" }), await seed.cert({ name: "B cert" }), await seed.cert({ name: "C cert" })];
    const m = await seed.machine({ requires: [a, b] });

    await updateMachine(db(), admin, { id: m.id, requirementIds: [c.id, b.id] }, T0);
    expect((await getMachine(db(), admin, { id: m.id })).requirements.map((r) => r.name)).toEqual(["B cert", "C cert"]);
    const t1 = (await row(m.id))!.writeToken;
    expect(t1).not.toBe(m.writeToken);

    await updateMachine(db(), admin, { id: m.id, requirementIds: [] }, T0);
    expect((await getMachine(db(), admin, { id: m.id })).requirements).toEqual([]);
    const t2 = (await row(m.id))!.writeToken;
    expect(t2).not.toBe(t1);

    await updateMachine(db(), admin, { id: m.id, supervised: true }, T0);
    expect((await row(m.id))!.writeToken).not.toBe(t2);
  });

  it("rejects more than 20 or duplicate requirements", async () => {
    const admin = await actors.admin();
    const m = await seed.machine();
    const cert = await seed.cert();
    await expect(updateMachine(db(), admin, { id: m.id, requirementIds: [cert.id, cert.id] }, T0)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    const many = Array.from({ length: 21 }, () => crypto.randomUUID());
    await expect(updateMachine(db(), admin, { id: m.id, requirementIds: many }, T0)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("form input: a hidden empty value sends 'no requirements', a hidden false + checkbox sends supervised", async () => {
    const admin = await actors.admin();
    const cert = await seed.cert();
    const m = await seed.machine({ requires: [cert], supervised: false });
    const form = new FormData();
    form.set("id", m.id);
    form.append("supervised", "false");
    form.append("supervised", "true");
    form.append("requirementIds", "");
    const { parse } = await import("@/server/domain/parse");
    const { MachineUpdate } = await import("@/lib/schemas/catalog");
    const input = parse(MachineUpdate, form);
    expect(input).toMatchObject({ supervised: true, requirementIds: [] });
    expect(await updateMachine(db(), admin, input, T0)).toMatchObject({ supervised: true, requirements: [] });
  });
});

describe("retire (P2-44)", () => {
  it("staff → FORBIDDEN_FIELD; admin retires; retired machines are hidden, unrecognized, frozen, and free their name", async () => {
    const staff = await actors.staff();
    const admin = await actors.admin();
    const room = await seed.room();
    const m = await seed.machine({ room, name: "Laser cutter" });

    await expect(updateMachine(db(), staff, { id: m.id, retire: true }, T0)).rejects.toMatchObject({ code: "FORBIDDEN_FIELD" });
    await expect(updateMachine(db(), admin, { id: m.id, retire: true, name: "X" }, T0)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });

    const retired = await updateMachine(db(), admin, { id: m.id, retire: true }, T0 + 5);
    expect(retired.status).toBe("retired");
    expect(await row(m.id)).toMatchObject({ status: "retired", retiredAt: T0 + 5, statusChangedAt: T0 + 5, outOfServiceReason: null });

    expect(await listMachines(db(), staff)).toEqual([]);
    expect(await listMachines(db(), staff, { includeRetired: true })).toHaveLength(1);
    expect((await getLabelSheet(db(), staff, {}, T0, SITE)).labels).toEqual([]);
    expect(await getMachineByToken(db(), staff, { token: m.qrToken })).toEqual({ recognized: false });
    await expect(updateMachine(db(), admin, { id: m.id, name: "Back again" }, T0)).rejects.toMatchObject({
      code: "MACHINE_RETIRED",
    });
    await expect(updateMachine(db(), admin, { id: m.id, retire: true }, T0)).rejects.toMatchObject({ code: "MACHINE_RETIRED" });

    // The row and its history stay; the name can be used again.
    expect(await row(m.id)).toBeDefined();
    expect(await createMachine(db(), staff, { name: "laser cutter", roomId: room.id }, T0)).toMatchObject({ name: "laser cutter" });
  });

  it("keeps requirements rows of a retired machine", async () => {
    const admin = await actors.admin();
    const cert = await seed.cert();
    const m = await seed.machine({ requires: [cert] });
    await updateMachine(db(), admin, { id: m.id, retire: true }, T0);
    const reqs = await db().select().from(machineRequirements).where(eq(machineRequirements.machineId, m.id)).all();
    expect(reqs).toHaveLength(1);
  });
});

describe("QR tokens (P2-46)", () => {
  it("22 base64url characters, unchanged after rename and move", async () => {
    const staff = await actors.staff();
    const [a, b] = [await seed.room(), await seed.room()];
    const m = await createMachine(db(), staff, { name: "Lathe", roomId: a.id }, T0);
    expect(m.qrToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    await updateMachine(db(), staff, { id: m.id, name: "Big lathe", roomId: b.id }, T0);
    expect((await getMachine(db(), staff, { id: m.id })).qrToken).toBe(m.qrToken);
  });

  it("unique across 1,000 generated machines", async () => {
    const staff = await actors.staff();
    const room = await seed.room();
    const created = [];
    for (let i = 0; i < 1000; i++) created.push(await createMachine(db(), staff, { name: `Machine ${i}`, roomId: room.id }, T0));
    const tokens = new Set(created.map((m) => m.qrToken));
    expect(tokens.size).toBe(1000);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
  }, 120_000);
});
