// P2-47, P2-48: label sheet, door poster and machine-by-token (FR-06, T01 partial).
import { beforeEach, describe, expect, it } from "vitest";
import { getDoorPoster, getLabelSheet } from "@/server/services/labels";
import { getMachineByToken } from "@/server/services/pass";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed } from "../helpers/seed";
import { T0 } from "../helpers/time";

const db = () => testDb();
// Deliberately different from any request host (and from the test Worker's PUBLIC_BASE_URL).
const SITE = { publicBaseUrl: "https://cleared.labels-only.example/", environment: "production" };

let joinToken: string;
beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  ({ joinToken } = await createMakerspace({ name: "Demo Makerspace" }));
});

describe("label sheet (P2-47)", () => {
  it("every URL starts with PUBLIC_BASE_URL; selected ids filter; retired excluded", async () => {
    const staff = await actors.staff();
    const room = await seed.room({ name: "Laser Room" });
    const a = await seed.machine({ room, name: "A laser" });
    const b = await seed.machine({ room, name: "B laser" });
    const gone = await seed.machine({ room, name: "C laser", retired: true });

    const sheet = await getLabelSheet(db(), staff, {}, T0, SITE);
    expect(sheet).toMatchObject({
      makerspaceName: "Demo Makerspace",
      environment: "production",
      baseUrl: "https://cleared.labels-only.example",
      generatedAt: T0,
    });
    expect(sheet.labels).toEqual([
      { machineId: a.id, machineName: "A laser", roomName: "Laser Room", url: `https://cleared.labels-only.example/m/${a.qrToken}` },
      { machineId: b.id, machineName: "B laser", roomName: "Laser Room", url: `https://cleared.labels-only.example/m/${b.qrToken}` },
    ]);
    for (const label of sheet.labels) expect(label.url.startsWith("https://cleared.labels-only.example/m/")).toBe(true);

    const selected = await getLabelSheet(db(), staff, { machineIds: `${b.id},${gone.id}` }, T0, SITE);
    expect(selected.labels.map((l) => l.machineId)).toEqual([b.id]);
  });

  it("members → FORBIDDEN; more than 200 ids → VALIDATION_FAILED", async () => {
    await expect(getLabelSheet(db(), await actors.member(), {}, T0, SITE)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const ids = Array.from({ length: 201 }, () => crypto.randomUUID()).join(",");
    await expect(getLabelSheet(db(), await actors.staff(), { machineIds: ids }, T0, SITE)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});

describe("door poster (P2-25)", () => {
  it("board URL for staff; the join link for admins only", async () => {
    const staffPoster = await getDoorPoster(db(), await actors.staff(), SITE);
    expect(staffPoster).toEqual({
      makerspaceName: "Demo Makerspace",
      environment: "production",
      baseUrl: "https://cleared.labels-only.example",
      boardUrl: "https://cleared.labels-only.example/machines",
    });
    const adminPoster = await getDoorPoster(db(), await actors.admin(), SITE);
    expect(adminPoster.joinUrl).toBe(`https://cleared.labels-only.example/join/${joinToken}`);
    await expect(getDoorPoster(db(), await actors.member(), SITE)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("machine by token (P2-48)", () => {
  it("a known token returns the machine and makerspace; unknown and malformed tokens are just unrecognized", async () => {
    const member = await actors.member();
    const room = await seed.room({ name: "Wood Shop" });
    const m = await seed.machine({ room, name: "Table saw", supervised: true });
    expect(await getMachineByToken(db(), member, { token: m.qrToken }, T0)).toMatchObject({
      recognized: true,
      machine: { id: m.id, name: "Table saw", roomName: "Wood Shop", supervised: true, status: "available", outOfService: null },
      makerspace: { name: "Demo Makerspace", timezone: "America/Edmonton" },
    });
    for (const token of ["AAAAAAAAAAAAAAAAAAAAAA", "not a token!", "", "x".repeat(64)]) {
      expect(await getMachineByToken(db(), member, { token }, T0)).toEqual({ recognized: false });
    }
    // Signed in without a membership still resolves (with a NOT CLEARED pass, Phase 3).
    expect(await getMachineByToken(db(), await actors.nonMember(), { token: m.qrToken }, T0)).toMatchObject({ recognized: true });
  });

  it("anonymous → UNAUTHENTICATED", async () => {
    const m = await seed.machine();
    await expect(getMachineByToken(db(), actors.anonymous(), { token: m.qrToken }, T0)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});
