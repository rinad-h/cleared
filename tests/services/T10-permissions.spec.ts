// PRD T10, full sweep (Phase 6 §7.3): every row of PRD Section 9, called at the
// service layer as every actor kind. "Allowed" means the call isn't refused for
// a permission reason (it may still fail for a business reason, such as a busy
// machine); "denied" means the exact permission code.
// Plus: every exported service with an actor argument is covered by a row.
import { beforeEach, describe, expect, it } from "vitest";
import type { Actor, MemberActor } from "@/server/domain/actor";
import type { ErrorCode } from "@/server/domain/errors";
import * as board from "@/server/services/board";
import * as certifications from "@/server/services/certifications";
import * as checkups from "@/server/services/checkups";
import * as consoleHome from "@/server/services/console";
import * as faults from "@/server/services/faults";
import * as grants from "@/server/services/grants";
import * as join from "@/server/services/join";
import * as labels from "@/server/services/labels";
import * as machineDetail from "@/server/services/machine-detail";
import * as machineStatus from "@/server/services/machine-status";
import * as machines from "@/server/services/machines";
import * as members from "@/server/services/members";
import * as pass from "@/server/services/pass";
import * as rooms from "@/server/services/rooms";
import * as serviceRecords from "@/server/services/service-records";
import * as sessions from "@/server/services/sessions";
import * as settings from "@/server/services/settings";
import * as setupProgress from "@/server/services/setup-progress";
import * as setup from "@/server/services/setup";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed, type SeededCert, type SeededMachine } from "../helpers/seed";
import { T0 } from "../helpers/time";

const db = () => testDb();
const rid = () => crypto.randomUUID();
const opts = { sleep: async () => {} };
const site = { publicBaseUrl: "https://cleared.example.test", environment: "test" };

const PERMISSION_CODES: ErrorCode[] = ["UNAUTHENTICATED", "NOT_A_MEMBER", "SUSPENDED", "FORBIDDEN", "FORBIDDEN_FIELD"];
const KINDS = ["anonymous", "nonMember", "suspended", "member", "staff", "admin"] as const;
type Kind = (typeof KINDS)[number];

type Ctx = {
  actor: Actor;
  /** Another member (signed off on `cert`, with a session on `laser`). */
  target: MemberActor;
  targetGrantId: string;
  targetSessionId: string;
  cert: SeededCert;
  laser: SeededMachine; // requires cert
  printer: SeededMachine; // requires nothing
  roomId: string;
  checkupId: string;
};

/** Who may call it: active members, staff and admins, or admins only. */
type Level = "user" | "member" | "staff" | "admin";

type Row = {
  services: string[];
  level: Level;
  /** What staff get when the level is admin (default FORBIDDEN). */
  staffCode?: ErrorCode;
  call: (c: Ctx) => Promise<unknown>;
};

const ROWS: Record<string, Row[]> = {
  "Status board, own pass and certs, own session, report fault": [
    { services: ["board.getStatusBoard"], level: "member", call: (c) => board.getStatusBoard(db(), c.actor, T0) },
    { services: ["grants.getMyCertifications"], level: "member", call: (c) => grants.getMyCertifications(db(), c.actor, T0) },
    { services: ["sessions.getMyRecentSessions"], level: "member", call: (c) => sessions.getMyRecentSessions(db(), c.actor, T0) },
    { services: ["certifications.listCertifications"], level: "member", call: (c) => certifications.listCertifications(db(), c.actor) },
    {
      services: ["sessions.startSession"],
      level: "member",
      call: (c) => sessions.startSession(db(), c.actor, { machineId: c.printer.id, clientRequestId: rid() }, T0, opts),
    },
    {
      services: ["sessions.extendSession"],
      level: "member",
      call: (c) => sessions.extendSession(db(), c.actor, { sessionId: rid() }, T0),
    },
    { services: ["sessions.endSession"], level: "member", call: (c) => sessions.endSession(db(), c.actor, { sessionId: rid() }, T0) },
    {
      services: ["faults.reportFault"],
      level: "member",
      call: (c) =>
        faults.reportFault(
          db(),
          c.actor,
          { machineId: c.printer.id, description: "The bed doesn't heat up", takeOutOfService: false, clientRequestId: rid() },
          T0,
          opts,
        ),
    },
  ],
  "Signed in (pass page, join, setup)": [
    { services: ["pass.getMachineByToken"], level: "user", call: (c) => pass.getMachineByToken(db(), c.actor, { token: c.laser.qrToken }, T0) },
    { services: ["join.previewJoin"], level: "user", call: (c) => join.previewJoin(db(), c.actor, { token: "join-token-0000000000" }) },
    { services: ["join.joinMakerspace"], level: "user", call: (c) => join.joinMakerspace(db(), c.actor, { token: "join-token-0000000000" }, T0) },
    {
      services: ["setup.completeSetup"],
      level: "user",
      call: (c) => setup.completeSetup(db(), c.actor, { makerspaceName: "Other Space", timezone: "UTC" }, T0),
    },
  ],
  "Console, fault queue, checkups, machine detail, history, members": [
    { services: ["console.getConsole"], level: "staff", call: (c) => consoleHome.getConsole(db(), c.actor, T0) },
    { services: ["faults.getFaultQueue"], level: "staff", call: (c) => faults.getFaultQueue(db(), c.actor, {}, T0) },
    { services: ["faults.countOpenFaults"], level: "staff", call: (c) => faults.countOpenFaults(db(), c.actor) },
    { services: ["checkups.listDueCheckups"], level: "staff", call: (c) => checkups.listDueCheckups(db(), c.actor, { due: "all" }, T0) },
    { services: ["checkups.countDueCheckups"], level: "staff", call: (c) => checkups.countDueCheckups(db(), c.actor, T0) },
    {
      services: ["checkups.listMachineCheckups"],
      level: "staff",
      call: (c) => checkups.listMachineCheckups(db(), c.actor, { machineId: c.laser.id }, T0),
    },
    {
      services: ["machineDetail.getMachineDetail"],
      level: "staff",
      call: (c) => machineDetail.getMachineDetail(db(), c.actor, { machineId: c.laser.id }, T0),
    },
    { services: ["machineDetail.listStaff"], level: "staff", call: (c) => machineDetail.listStaff(db(), c.actor) },
    {
      services: ["serviceRecords.getServiceHistory"],
      level: "staff",
      call: (c) => serviceRecords.getServiceHistory(db(), c.actor, { machineId: c.laser.id }),
    },
    {
      services: ["serviceRecords.getServiceRecord"],
      level: "staff",
      call: (c) => serviceRecords.getServiceRecord(db(), c.actor, { machineId: c.laser.id, recordId: rid() }),
    },
    { services: ["members.searchMembers"], level: "staff", call: (c) => members.searchMembers(db(), c.actor, {}) },
    { services: ["members.getMember"], level: "staff", call: (c) => members.getMember(db(), c.actor, c.target.memberId) },
    {
      services: ["grants.getMemberCertifications"],
      level: "staff",
      call: (c) => grants.getMemberCertifications(db(), c.actor, { memberId: c.target.memberId }, T0),
    },
    {
      services: ["sessions.getMemberSessions"],
      level: "staff",
      call: (c) => sessions.getMemberSessions(db(), c.actor, { memberId: c.target.memberId }, T0),
    },
    { services: ["setupProgress.getSetupProgress"], level: "staff", call: (c) => setupProgress.getSetupProgress(db(), c.actor) },
  ],
  "Sign off / revoke for others": [
    {
      services: ["grants.signOff"],
      level: "staff",
      call: (c) => grants.signOff(db(), c.actor, { memberId: c.target.memberId, certificationId: c.cert.id, clientRequestId: rid() }, T0),
    },
    {
      services: ["grants.revokeGrant"],
      level: "staff",
      call: (c) => grants.revokeGrant(db(), c.actor, { grantId: c.targetGrantId, reason: "Sweep test" }, T0),
    },
  ],
  "End anyone's session; out of service / return; log service; checkups": [
    {
      services: ["sessions.endSession (other's)"],
      level: "staff",
      call: (c) => sessions.endSession(db(), c.actor, { sessionId: c.targetSessionId }, T0),
    },
    {
      services: ["machineStatus.setMachineOutOfService"],
      level: "staff",
      call: (c) => machineStatus.setMachineOutOfService(db(), c.actor, { machineId: c.printer.id, reason: "maintenance" }, T0, opts),
    },
    {
      services: ["machineStatus.updateOutageDetails"],
      level: "staff",
      call: (c) => machineStatus.updateOutageDetails(db(), c.actor, { machineId: c.printer.id, note: "Parts ordered" }, T0, opts),
    },
    {
      services: ["machineStatus.returnMachineToService"],
      level: "staff",
      call: (c) => machineStatus.returnMachineToService(db(), c.actor, { machineId: c.printer.id }, T0, opts),
    },
    {
      services: ["serviceRecords.logServiceRecord"],
      level: "staff",
      call: (c) =>
        serviceRecords.logServiceRecord(
          db(),
          c.actor,
          { machineId: c.printer.id, type: "cleaning", workDone: "Cleaned the bed and nozzle", outcome: "passed", clientRequestId: rid() },
          T0,
          opts,
        ),
    },
    {
      services: ["checkups.createCheckup"],
      level: "staff",
      call: (c) => checkups.createCheckup(db(), c.actor, { machineId: c.printer.id, name: "Nozzle check", intervalDays: 30 }, T0),
    },
    {
      services: ["checkups.updateCheckup"],
      level: "staff",
      call: (c) => checkups.updateCheckup(db(), c.actor, { checkupId: c.checkupId, intervalDays: 21 }, T0),
    },
  ],
  "Rooms, machine basics, labels": [
    { services: ["rooms.listRooms"], level: "staff", call: (c) => rooms.listRooms(db(), c.actor) },
    { services: ["rooms.createRoom"], level: "staff", call: (c) => rooms.createRoom(db(), c.actor, { name: `Room ${rid().slice(0, 8)}` }, T0) },
    { services: ["rooms.updateRoom"], level: "staff", call: (c) => rooms.updateRoom(db(), c.actor, { id: c.roomId, sortOrder: 3 }, T0) },
    { services: ["rooms.moveRoom"], level: "staff", call: (c) => rooms.moveRoom(db(), c.actor, { id: c.roomId, direction: "down" }, T0) },
    { services: ["machines.listMachines"], level: "staff", call: (c) => machines.listMachines(db(), c.actor) },
    { services: ["machines.getMachine"], level: "staff", call: (c) => machines.getMachine(db(), c.actor, { id: c.laser.id }) },
    {
      services: ["machines.createMachine"],
      level: "staff",
      call: (c) => machines.createMachine(db(), c.actor, { name: `Machine ${rid().slice(0, 8)}`, roomId: c.roomId }, T0),
    },
    {
      services: ["machines.updateMachine"],
      level: "staff",
      call: (c) => machines.updateMachine(db(), c.actor, { id: c.printer.id, typicalSessionMinutes: 45 }, T0),
    },
    { services: ["labels.getLabelSheet"], level: "staff", call: (c) => labels.getLabelSheet(db(), c.actor, {}, T0, site) },
    { services: ["labels.getDoorPoster"], level: "staff", call: (c) => labels.getDoorPoster(db(), c.actor, site) },
  ],
  "Suspend/reactivate members": [
    {
      services: ["members.updateMember"],
      level: "staff",
      call: (c) => members.updateMember(db(), c.actor, { id: c.target.memberId, status: "suspended" }, T0),
    },
  ],
  "Certifications; requirements, supervised, retire": [
    {
      services: ["certifications.createCertification"],
      level: "admin",
      call: (c) => certifications.createCertification(db(), c.actor, { name: `Cert ${rid().slice(0, 8)}` }, T0),
    },
    {
      services: ["certifications.updateCertification"],
      level: "admin",
      call: (c) => certifications.updateCertification(db(), c.actor, { id: c.cert.id, trainingUrl: "https://example.test/t" }, T0),
    },
    {
      services: ["machines.updateMachine (requirements)"],
      level: "admin",
      staffCode: "FORBIDDEN_FIELD",
      call: (c) => machines.updateMachine(db(), c.actor, { id: c.printer.id, requirementIds: [c.cert.id] }, T0),
    },
    {
      services: ["machines.updateMachine (supervised)"],
      level: "admin",
      staffCode: "FORBIDDEN_FIELD",
      call: (c) => machines.updateMachine(db(), c.actor, { id: c.printer.id, supervised: true }, T0),
    },
    {
      services: ["machines.createMachine (supervised)"],
      level: "admin",
      staffCode: "FORBIDDEN_FIELD",
      call: (c) => machines.createMachine(db(), c.actor, { name: `Machine ${rid().slice(0, 8)}`, roomId: c.roomId, supervised: true }, T0),
    },
    {
      services: ["machines.updateMachine (retire)"],
      level: "admin",
      staffCode: "FORBIDDEN_FIELD",
      call: (c) => machines.updateMachine(db(), c.actor, { id: c.printer.id, retire: true }, T0),
    },
  ],
  "Roles; suspend staff/admins; join link; settings": [
    {
      services: ["members.updateMember (role)"],
      level: "admin",
      staffCode: "FORBIDDEN_FIELD",
      call: (c) => members.updateMember(db(), c.actor, { id: c.target.memberId, role: "staff" }, T0),
    },
    { services: ["settings.getSettings"], level: "admin", call: (c) => settings.getSettings(db(), c.actor) },
    { services: ["settings.updateSettings"], level: "admin", call: (c) => settings.updateSettings(db(), c.actor, { name: "Renamed Space" }, T0) },
    { services: ["settings.regenerateJoinLink"], level: "admin", call: (c) => settings.regenerateJoinLink(db(), c.actor, {}, T0) },
  ],
};

/** The expected permission refusal for an actor kind at a level, or null when allowed. */
function expected(kind: Kind, row: Row): ErrorCode | null {
  if (kind === "anonymous") return "UNAUTHENTICATED";
  if (row.level === "user") return null;
  if (kind === "nonMember") return "NOT_A_MEMBER";
  if (kind === "suspended") return "SUSPENDED";
  if (row.level === "member") return null;
  if (kind === "member") return "FORBIDDEN";
  if (row.level === "staff") return null;
  if (kind === "staff") return row.staffCode ?? "FORBIDDEN";
  return null;
}

async function makeCtx(): Promise<Omit<Ctx, "actor"> & { actorsByKind: Record<Kind, Actor> }> {
  await createMakerspace();
  const admin = await actors.admin({ name: "Demo Admin" });
  const staff = await actors.staff({ name: "Demo Staff 1" });
  const target = await actors.member({ name: "Demo Student 2" });
  const room = await seed.room({ name: "Main Room" });
  await seed.room({ name: "Second Room", sortOrder: 1 });
  const cert = await seed.cert({ name: "Laser — Basic" });
  const laser = await seed.machine({ room, name: "Laser", requires: [cert] });
  const printer = await seed.machine({ room, name: "Printer" });
  const grant = await seed.grant(target, cert, { by: staff });
  const session = await seed.session(target, laser, { startedAt: T0, minutes: 60 });
  const { checkupId } = await checkups.createCheckup(db(), staff, { machineId: laser.id, name: "Lens clean", intervalDays: 14 }, T0);
  return {
    target,
    targetGrantId: grant.id,
    targetSessionId: session.id,
    cert,
    laser,
    printer,
    roomId: room.id,
    checkupId,
    actorsByKind: {
      anonymous: actors.anonymous(),
      nonMember: await actors.nonMember(),
      suspended: await actors.member({ status: "suspended" }),
      member: await actors.member({ name: "Demo Student 1" }),
      staff,
      admin,
    },
  };
}

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
});

describe("T10 — PRD Section 9, full sweep", () => {
  for (const [section, rows] of Object.entries(ROWS)) {
    for (const row of rows) {
      it(`${section}: ${row.services.join(", ")}`, async () => {
        for (const kind of KINDS) {
          // Fresh data per actor kind, so an allowed call can't change what the next one sees.
          await resetCatalog();
          await resetIdentity();
          const { actorsByKind, ...rest } = await makeCtx();
          const ctx: Ctx = { ...rest, actor: actorsByKind[kind] };
          const want = expected(kind, row);
          let code: ErrorCode | null = null;
          try {
            await row.call(ctx);
          } catch (err) {
            code = (err as { code?: ErrorCode }).code ?? "INTERNAL";
          }
          if (want) {
            expect(code, `${kind} → ${row.services.join(", ")}`).toBe(want);
          } else {
            expect(PERMISSION_CODES, `${kind} → ${row.services.join(", ")} was refused with ${code}`).not.toContain(code);
            expect(code, `${kind} → ${row.services.join(", ")} failed`).not.toBe("INTERNAL");
          }
        }
      });
    }
  }

  it("the pass is NOT_CLEARED (not an error) for non-members and suspended members", async () => {
    const { actorsByKind, laser } = await makeCtx();
    for (const [kind, reason] of [
      ["nonMember", "not_member"],
      ["suspended", "suspended"],
    ] as const) {
      const result = await pass.getMachineByToken(db(), actorsByKind[kind], { token: laser.qrToken }, T0);
      expect(result).toMatchObject({ recognized: true, pass: { status: "NOT_CLEARED", notClearedReason: reason } });
    }
  });

  it("self sign-off and self revoke are refused for staff and admins", async () => {
    const { actorsByKind, cert } = await makeCtx();
    for (const kind of ["staff", "admin"] as const) {
      const me = actorsByKind[kind] as MemberActor;
      await expect(
        grants.signOff(db(), me, { memberId: me.memberId, certificationId: cert.id, clientRequestId: rid() }, T0),
      ).rejects.toMatchObject({ code: "SELF_SIGN_OFF" });
      const other = kind === "staff" ? (actorsByKind.admin as MemberActor) : (actorsByKind.staff as MemberActor);
      const own = await seed.grant(me, cert, { by: other });
      await expect(grants.revokeGrant(db(), me, { grantId: own.id, reason: "Myself" }, T0)).rejects.toMatchObject({
        code: "SELF_REVOKE",
      });
    }
  });

  it("staff can't suspend staff or admins; members can't end someone else's session", async () => {
    const { actorsByKind, targetSessionId } = await makeCtx();
    const staff = actorsByKind.staff as MemberActor;
    const [s2, a] = [await actors.staff(), actorsByKind.admin as MemberActor];
    for (const victim of [s2, a]) {
      await expect(members.updateMember(db(), staff, { id: victim.memberId, status: "suspended" }, T0)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    await expect(sessions.endSession(db(), actorsByKind.member, { sessionId: targetSessionId }, T0)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("re-asserted: the last admin can't be demoted or suspended; a regenerated join link invalidates the old one; setup can't rerun", async () => {
    const { actorsByKind } = await makeCtx();
    const admin = actorsByKind.admin as MemberActor;
    await expect(members.updateMember(db(), admin, { id: admin.memberId, role: "staff" }, T0)).rejects.toMatchObject({
      code: "LAST_ADMIN",
    });
    await expect(members.updateMember(db(), admin, { id: admin.memberId, status: "suspended" }, T0)).rejects.toMatchObject({
      code: expect.stringMatching(/^(LAST_ADMIN|CANNOT_SUSPEND_SELF)$/),
    });
    await settings.regenerateJoinLink(db(), admin, {}, T0);
    const newcomer = await actors.nonMember();
    await expect(join.joinMakerspace(db(), newcomer, { token: "join-token-0000000000" }, T0)).rejects.toMatchObject({
      code: "INVALID_JOIN_LINK",
    });
    await expect(
      setup.completeSetup(db(), await actors.nonMember(), { makerspaceName: "Other Space", timezone: "UTC" }, T0),
    ).rejects.toMatchObject({ code: "SETUP_ALREADY_DONE" });
  });
});

/* ------------------------------------------------- every service has a row */

const SERVICE_MODULES = import.meta.glob<Record<string, unknown>>("../../src/server/services/*.ts", { eager: true });

/** Exports that take no actor on purpose: internal readers and SQL builders that callers guard. */
const NO_ACTOR = new Set([
  "checkups.readCheckups",
  "faults.readOpenFaults",
  "health.checkDatabase",
  "labels.machineLabelUrl",
  "machineStatus.readMachineStatus",
  "machineStatus.openOutOfServiceFaultIds",
  "me.resolveActor",
  "me.getMakerspace",
  "pass.viewerOf",
  "pass.loadPassContext",
  "serviceRecords.readServiceHistory",
  "sessions.expireAllSessions",
  "sessions.endSessionsForAuthorizationSql",
  "sessions.endMachineSessionsSql",
  "setup.isSetupComplete",
]);
/** Takes an actor but has no permission rule: it describes whoever is signed in (or nobody). */
const NO_RULE = new Set(["me.getMe"]);

const camel = (file: string) => file.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

describe("T10 — every service is in the sweep", () => {
  const covered = new Set(Object.values(ROWS).flatMap((rows) => rows.flatMap((r) => r.services.map((s) => s.split(" ")[0]))));

  const exported: { name: string; fn: (...args: unknown[]) => unknown }[] = [];
  for (const [path, mod] of Object.entries(SERVICE_MODULES)) {
    const file = camel(path.split("/").pop()!.replace(/\.ts$/, ""));
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function") exported.push({ name: `${file}.${name}`, fn: value as (...args: unknown[]) => unknown });
    }
  }

  it("finds the service modules", () => {
    expect(exported.length).toBeGreaterThan(40);
  });

  it.each(exported.map((e) => [e.name, e] as const))("%s takes (db, actor, …) and has a T10 row, or is listed as actor-free", (name, { fn }) => {
    if (NO_ACTOR.has(name)) return;
    expect(String(fn), `${name} doesn't take (db, actor, …)`).toMatch(/^(async\s+)?function\s*\w*\s*\(\s*db\s*,\s*actor\s*[,)=]/);
    if (NO_RULE.has(name)) return;
    expect(covered.has(name), `${name} has no row in the T10 sweep: add one`).toBe(true);
  });
});
