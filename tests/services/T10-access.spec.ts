// PRD T10: FR-01–FR-05 and Section 9, at the service layer.
// Phase 1: identity and access. Phase 2: the catalog (rooms, machines, certifications, labels).
// Phase 3: sign-off, revoke and certification records.
import { beforeEach, describe, expect, it } from "vitest";
import { createCertification, listCertifications, updateCertification } from "@/server/services/certifications";
import { getDoorPoster, getLabelSheet } from "@/server/services/labels";
import { createMachine, getMachine, listMachines, updateMachine } from "@/server/services/machines";
import { getMachineByToken } from "@/server/services/pass";
import { getMemberCertifications, getMyCertifications, revokeGrant, signOff } from "@/server/services/grants";
import { createRoom, listRooms, moveRoom, updateRoom } from "@/server/services/rooms";
import { getSetupProgress } from "@/server/services/setup-progress";
import type { Actor } from "@/server/domain/actor";
import { joinMakerspace } from "@/server/services/join";
import { getMember, searchMembers, updateMember } from "@/server/services/members";
import { getSettings, regenerateJoinLink, updateSettings } from "@/server/services/settings";
import { completeSetup } from "@/server/services/setup";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed } from "../helpers/seed";
import { T0 } from "../helpers/time";

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
});

const db = () => testDb();

describe("T10 — access control (Phase 1)", () => {
  it("signed out → UNAUTHENTICATED (401) on every service", async () => {
    await createMakerspace();
    const anon = actors.anonymous();
    const id = crypto.randomUUID();
    const calls = [
      () => completeSetup(db(), anon, { makerspaceName: "X Space", timezone: "UTC" }, T0),
      () => joinMakerspace(db(), anon, { token: "t" }, T0),
      () => searchMembers(db(), anon, {}),
      () => getMember(db(), anon, id),
      () => updateMember(db(), anon, { id, status: "suspended" }, T0),
      () => getSettings(db(), anon),
      () => updateSettings(db(), anon, { name: "New" }, T0),
      () => regenerateJoinLink(db(), anon, {}, T0),
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("members → FORBIDDEN (403) on console services", async () => {
    await createMakerspace();
    const m = await actors.member();
    const other = await actors.member();
    const calls = [
      () => searchMembers(db(), m, {}),
      () => getMember(db(), m, other.memberId),
      () => updateMember(db(), m, { id: other.memberId, status: "suspended" }, T0),
      () => getSettings(db(), m),
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("staff → 403 on admin-only fields (FORBIDDEN_FIELD) and admin-only services (FORBIDDEN)", async () => {
    await createMakerspace();
    const staff = await actors.staff();
    const m = await actors.member();
    await expect(updateMember(db(), staff, { id: m.memberId, role: "admin" }, T0)).rejects.toMatchObject({
      code: "FORBIDDEN_FIELD",
    });
    await expect(getSettings(db(), staff)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateSettings(db(), staff, { name: "New" }, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(regenerateJoinLink(db(), staff, {}, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("staff can suspend members but not staff or admins", async () => {
    await createMakerspace();
    const staff = await actors.staff();
    const [m, s, a] = await Promise.all([actors.member(), actors.staff(), actors.admin()]);
    await expect(updateMember(db(), staff, { id: m.memberId, status: "suspended" }, T0)).resolves.toMatchObject({
      status: "suspended",
    });
    for (const target of [s, a]) {
      await expect(updateMember(db(), staff, { id: target.memberId, status: "suspended" }, T0)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  });

  it("the last admin can't be demoted", async () => {
    await createMakerspace();
    const admin = await actors.admin();
    await expect(updateMember(db(), admin, { id: admin.memberId, role: "member" }, T0)).rejects.toMatchObject({
      code: "LAST_ADMIN",
    });
  });

  it("a regenerated join link invalidates the old one", async () => {
    const { joinToken } = await createMakerspace();
    await regenerateJoinLink(db(), await actors.admin(), {}, T0);
    await expect(joinMakerspace(db(), await actors.nonMember(), { token: joinToken }, T0)).rejects.toMatchObject({
      code: "INVALID_JOIN_LINK",
    });
  });

  it("setup can't be rerun", async () => {
    await completeSetup(db(), await actors.nonMember(), { makerspaceName: "First", timezone: "UTC" }, T0);
    await expect(
      completeSetup(db(), await actors.nonMember(), { makerspaceName: "Second", timezone: "UTC" }, T0),
    ).rejects.toMatchObject({ code: "SETUP_ALREADY_DONE" });
  });
});

const SITE = { publicBaseUrl: "https://cleared.example.test", environment: "production" };

/**
 * P2-50 permission sweep: every Phase 2 service, called by one role below its
 * minimum. Adding a service means adding a row here.
 */
describe("T10 — access control (Phase 2 catalog)", () => {
  async function fixtures() {
    await createMakerspace();
    const room = await seed.room();
    const cert = await seed.cert();
    const machine = await seed.machine({ room });
    return { room, cert, machine };
  }

  type Call = [name: string, (actor: Actor) => Promise<unknown>];

  function staffServices(f: Awaited<ReturnType<typeof fixtures>>): Call[] {
    return [
      ["listRooms", (a) => listRooms(db(), a)],
      ["createRoom", (a) => createRoom(db(), a, { name: "Sweep room" }, T0)],
      ["updateRoom", (a) => updateRoom(db(), a, { id: f.room.id, name: "Swept" }, T0)],
      ["moveRoom", (a) => moveRoom(db(), a, { id: f.room.id, direction: "down" }, T0)],
      ["listMachines", (a) => listMachines(db(), a)],
      ["getMachine", (a) => getMachine(db(), a, { id: f.machine.id })],
      ["createMachine", (a) => createMachine(db(), a, { name: "Sweep machine", roomId: f.room.id }, T0)],
      ["updateMachine", (a) => updateMachine(db(), a, { id: f.machine.id, name: "Swept machine" }, T0)],
      ["getLabelSheet", (a) => getLabelSheet(db(), a, {}, T0, SITE)],
      ["getDoorPoster", (a) => getDoorPoster(db(), a, SITE)],
      ["getSetupProgress", (a) => getSetupProgress(db(), a)],
      ["listCertifications(includeInactive)", (a) => listCertifications(db(), a, { includeInactive: true })],
    ];
  }

  function adminServices(f: Awaited<ReturnType<typeof fixtures>>): Call[] {
    return [
      ["createCertification", (a) => createCertification(db(), a, { name: "Sweep cert" }, T0)],
      ["updateCertification", (a) => updateCertification(db(), a, { id: f.cert.id, name: "Swept cert" }, T0)],
    ];
  }

  function adminFields(f: Awaited<ReturnType<typeof fixtures>>): Call[] {
    return [
      ["createMachine(supervised)", (a) => createMachine(db(), a, { name: "S", roomId: f.room.id, supervised: true }, T0)],
      ["createMachine(requirementIds)", (a) => createMachine(db(), a, { name: "S", roomId: f.room.id, requirementIds: [f.cert.id] }, T0)],
      ["updateMachine(supervised)", (a) => updateMachine(db(), a, { id: f.machine.id, supervised: true }, T0)],
      ["updateMachine(requirementIds)", (a) => updateMachine(db(), a, { id: f.machine.id, requirementIds: [] }, T0)],
      ["updateMachine(retire)", (a) => updateMachine(db(), a, { id: f.machine.id, retire: true }, T0)],
    ];
  }

  it("members → FORBIDDEN on staff services", async () => {
    const f = await fixtures();
    const m = await actors.member();
    for (const [name, call] of staffServices(f)) await expect(call(m), name).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("staff → FORBIDDEN on admin services and FORBIDDEN_FIELD on admin-only machine fields", async () => {
    const f = await fixtures();
    const s = await actors.staff();
    for (const [name, call] of adminServices(f)) await expect(call(s), name).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const [name, call] of adminFields(f)) await expect(call(s), name).rejects.toMatchObject({ code: "FORBIDDEN_FIELD" });
  });

  it("suspended members, non-members and anonymous are refused everywhere, including the QR lookup when signed out", async () => {
    const f = await fixtures();
    const cases = [
      [await actors.member({ role: "admin", status: "suspended" }), "SUSPENDED"],
      [await actors.nonMember(), "NOT_A_MEMBER"],
      [actors.anonymous(), "UNAUTHENTICATED"],
    ] as const;
    for (const [actor, code] of cases) {
      for (const [name, call] of [...staffServices(f), ...adminServices(f), ...adminFields(f)]) {
        await expect(call(actor), `${name} as ${actor.kind}`).rejects.toMatchObject({ code });
      }
    }
    await expect(getMachineByToken(db(), actors.anonymous(), { token: f.machine.qrToken }, T0)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(listCertifications(db(), actors.anonymous())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

/** Phase 3: sign-off, revoke and certification records, one role below the minimum. */
describe("T10 — access control (Phase 3 certifications)", () => {
  async function fixtures() {
    await createMakerspace();
    const cert = await seed.cert();
    const target = await actors.member();
    const admin = await actors.admin();
    const grant = await seed.grant(target, cert, { by: admin });
    return { cert, target, grant };
  }

  type Call = [name: string, (actor: Actor) => Promise<unknown>];
  const staffServices = (f: Awaited<ReturnType<typeof fixtures>>): Call[] => [
    ["signOff", (a) => signOff(db(), a, { memberId: f.target.memberId, certificationId: f.cert.id, clientRequestId: crypto.randomUUID() }, T0)],
    ["revokeGrant", (a) => revokeGrant(db(), a, { grantId: f.grant.id, reason: "Sweep" }, T0)],
    ["getMemberCertifications", (a) => getMemberCertifications(db(), a, { memberId: f.target.memberId }, T0)],
  ];

  it("members → FORBIDDEN on staff services; members may read their own certifications", async () => {
    const f = await fixtures();
    const m = await actors.member();
    for (const [name, call] of staffServices(f)) await expect(call(m), name).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getMyCertifications(db(), m, T0)).resolves.toBeDefined();
  });

  it("suspended members, non-members and anonymous are refused everywhere", async () => {
    const f = await fixtures();
    const cases = [
      [await actors.member({ role: "admin", status: "suspended" }), "SUSPENDED"],
      [await actors.nonMember(), "NOT_A_MEMBER"],
      [actors.anonymous(), "UNAUTHENTICATED"],
    ] as const;
    for (const [actor, code] of cases) {
      const calls: Call[] = [...staffServices(f), ["getMyCertifications", (a) => getMyCertifications(db(), a, T0)]];
      for (const [name, call] of calls) {
        await expect(call(actor), `${name} as ${actor.kind}`).rejects.toMatchObject({ code });
      }
    }
  });
});
