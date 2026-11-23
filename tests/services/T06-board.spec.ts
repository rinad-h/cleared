// PRD T06: the member status board (Phase 4 §7.3): buildBoard via getStatusBoard.
import { beforeEach, describe, expect, it } from "vitest";
import type { MemberActor } from "@/server/domain/actor";
import { boardEtag, parseBoardEtag, type StatusBoard } from "@/server/domain/board";
import { getStatusBoard } from "@/server/services/board";
import { setMachineOutOfService } from "@/server/services/machine-status";
import { getMachineByToken } from "@/server/services/pass";
import { updateSettings } from "@/server/services/settings";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed } from "../helpers/seed";
import { DAY, MIN, T0 } from "../helpers/time";

const db = () => testDb();

let staff: MemberActor;
let student: MemberActor;

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
  staff = await actors.staff({ name: "Demo Staff 1" });
  student = await actors.member({ name: "Demo Student 1" });
});

async function board(actor: MemberActor, now = T0): Promise<StatusBoard> {
  const r = await getStatusBoard(db(), actor, now);
  if (r.notModified) throw new Error("unexpected 304");
  return r.board;
}
const tiles = (b: StatusBoard) => b.rooms.flatMap((r) => r.machines);
const tile = (b: StatusBoard, name: string) => tiles(b).find((t) => t.name === name)!;

describe("T06 — status board", () => {
  it("#1 available / in use (since, est. free) / out of service", async () => {
    const room = await seed.room({ name: "Shop" });
    await seed.machine({ room, name: "Free" });
    const busy = await seed.machine({ room, name: "Busy" });
    const down = await seed.machine({ room, name: "Down" });
    await seed.session(student, busy, { startedAt: T0 - 10 * MIN, minutes: 60 });
    await setMachineOutOfService(db(), staff, { machineId: down.id, reason: "maintenance", note: "New belt" }, T0 - DAY);

    const b = await board(student);
    expect(tile(b, "Free")).toMatchObject({ state: "available", inUse: null, outOfService: null });
    expect(tile(b, "Busy")).toMatchObject({
      state: "in_use",
      inUse: { since: new Date(T0 - 10 * MIN).toISOString(), estFreeAt: new Date(T0 + 50 * MIN).toISOString() },
    });
    expect(tile(b, "Down")).toMatchObject({
      state: "out_of_service",
      outOfService: { reason: "maintenance", since: new Date(T0 - DAY).toISOString(), note: "New belt", expectedBackAt: null },
    });
    expect(b.makerspace).toEqual({ name: "Demo Makerspace", timezone: "America/Edmonton" });
    // validUntil: the busy machine's estimated end, capped at 10 minutes (D5).
    expect(b.validUntil).toBe(new Date(T0 + 10 * MIN).toISOString());
    expect(tile(await board(student, T0 + 45 * MIN), "Busy").state).toBe("in_use");
    expect((await board(student, T0 + 45 * MIN)).validUntil).toBe(new Date(T0 + 50 * MIN).toISOString());
  });

  it("#2 supervision badge", async () => {
    await seed.machine({ name: "Lathe", supervised: true });
    await seed.machine({ name: "Drill" });
    const b = await board(student);
    expect(tile(b, "Lathe").supervisionRequired).toBe(true);
    expect(tile(b, "Drill").supervisionRequired).toBe(false);
    expect(tile(b, "Drill").issueReported).toBe(false);
  });

  it("#3 ✔/✖ matches computePass().certifiedForMachine", async () => {
    const cert = await seed.cert();
    const m = await seed.machine({ name: "Laser", requires: [cert], supervised: true });
    await seed.grant(student, cert, { by: staff });
    const uncertified = await actors.member();
    const expired = await actors.member();
    await seed.grant(expired, cert, { by: staff, grantedAt: T0 - DAY, expiresAt: T0 - 1 });

    for (const viewer of [student, uncertified, staff, expired]) {
      const pass = await getMachineByToken(db(), viewer, { token: m.qrToken }, T0);
      if (!pass.recognized) throw new Error("not recognized");
      expect(tile(await board(viewer), "Laser").clearedForMe).toBe(pass.pass.certifiedForMachine);
    }
    expect(tile(await board(student), "Laser").clearedForMe).toBe(true);
    expect(tile(await board(staff), "Laser").clearedForMe).toBe(false);
    expect(tile(await board(expired), "Laser").clearedForMe).toBe(false);
  });

  it("#4 privacy: no member ids, emails, names, session ids or QR tokens", async () => {
    const m = await seed.machine({ name: "Laser" });
    const s = await seed.session(student, m, { startedAt: T0 - MIN });
    const text = JSON.stringify(await board(staff));
    for (const secret of [student.memberId, student.userId, student.displayName, staff.memberId, staff.displayName, s.id, m.qrToken, "@example.test"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("#5 retired machines absent; empty rooms omitted; room order respected", async () => {
    const b2 = await seed.room({ name: "B room", sortOrder: 1 });
    const a2 = await seed.room({ name: "A room", sortOrder: 1 });
    const first = await seed.room({ name: "Z first", sortOrder: 0 });
    await seed.room({ name: "Empty", sortOrder: 0 });
    const onlyRetired = await seed.room({ name: "Retired only" });
    await seed.machine({ room: b2, name: "m-b" });
    await seed.machine({ room: a2, name: "zeta" });
    await seed.machine({ room: a2, name: "Alpha" });
    await seed.machine({ room: first, name: "m-z" });
    await seed.machine({ room: onlyRetired, name: "gone", retired: true });
    const b = await board(student);
    expect(b.rooms.map((r) => r.name)).toEqual(["Z first", "A room", "B room"]);
    expect(b.rooms[1].machines.map((m) => m.name)).toEqual(["Alpha", "zeta"]);
    expect(tiles(b).some((t) => t.name === "gone")).toBe(false);
  });

  it("#7 ETag: unchanged → 304; after a mutation → 200; after validUntil → 200 and the session is closed; another member's ETag → 200", async () => {
    const m = await seed.machine({ name: "Laser" });
    await seed.session(student, m, { startedAt: T0, minutes: 30 });
    const first = await getStatusBoard(db(), student, T0 + MIN);
    expect(first.notModified).toBe(false);

    const again = await getStatusBoard(db(), student, T0 + 2 * MIN, first.etag);
    expect(again).toEqual({ notModified: true, etag: first.etag });

    // Another member's ETag (or a forged one) gets a full answer.
    expect((await getStatusBoard(db(), staff, T0 + 2 * MIN, first.etag)).notModified).toBe(false);
    expect((await getStatusBoard(db(), student, T0 + 2 * MIN, 'W/"garbage"')).notModified).toBe(false);

    // Past validUntil (the session's end) → 200, and the sweep closed the session.
    const later = await getStatusBoard(db(), student, T0 + 31 * MIN, first.etag);
    if (later.notModified) throw new Error("expected 200");
    expect(tile(later.board, "Laser").state).toBe("available");

    // A mutation bumps data_version → 200.
    const admin = await actors.admin();
    await updateSettings(db(), admin, { name: "Renamed Makerspace" }, T0 + 32 * MIN);
    expect((await getStatusBoard(db(), student, T0 + 33 * MIN, later.etag)).notModified).toBe(false);
  });

  it("a viewer's grant expiring soon caps validUntil", async () => {
    const cert = await seed.cert();
    await seed.machine({ requires: [cert] });
    await seed.grant(student, cert, { by: staff, expiresAt: T0 + 3 * MIN });
    const b = await board(student);
    expect(b.validUntil).toBe(new Date(T0 + 3 * MIN).toISOString());
    // Without anything due, it's at most 10 minutes away.
    expect((await board(staff)).validUntil).toBe(new Date(T0 + 10 * MIN).toISOString());
  });

  it("ETag helpers round-trip and reject junk", () => {
    const id = crypto.randomUUID();
    expect(parseBoardEtag(boardEtag(7, id, "staff", 123))).toEqual({ dataVersion: 7, memberId: id, role: "staff", validUntil: 123 });
    expect(parseBoardEtag(null)).toBeNull();
    expect(parseBoardEtag('W/"b.1.x.member.2"')).toBeNull();
  });

  it("suspended members, non-members and anonymous are refused", async () => {
    await expect(getStatusBoard(db(), await actors.member({ status: "suspended" }), T0)).rejects.toMatchObject({ code: "SUSPENDED" });
    await expect(getStatusBoard(db(), await actors.nonMember(), T0)).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
    await expect(getStatusBoard(db(), actors.anonymous(), T0)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
