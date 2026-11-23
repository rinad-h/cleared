// PRD T07: faults and out-of-service (Phase 5 §8.3). Out-of-service setup goes through the real services.
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { faults, machineSessions, machines } from "@/db/schema";
import type { MemberActor } from "@/server/domain/actor";
import { getStatusBoard } from "@/server/services/board";
import { getFaultQueue, reportFault } from "@/server/services/faults";
import { returnMachineToService, setMachineOutOfService, updateOutageDetails } from "@/server/services/machine-status";
import { getMachineByToken } from "@/server/services/pass";
import { logServiceRecord } from "@/server/services/service-records";
import { startSession } from "@/server/services/sessions";
import { actors, createMakerspace, dataVersion, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed, type SeededCert, type SeededMachine } from "../helpers/seed";
import { DAY, HOUR, MIN, T0 } from "../helpers/time";

const db = () => testDb();
const rid = () => crypto.randomUUID();
const noSleep = async () => {};
const opts = { sleep: noSleep };

let staff: MemberActor;
let student: MemberActor;
let cert: SeededCert;
let saw: SeededMachine;

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
  staff = await actors.staff({ name: "Demo Staff 1" });
  student = await actors.member({ name: "Demo Student 1" });
  cert = await seed.cert({ name: "Bandsaw basics" });
  saw = await seed.machine({ name: "Bandsaw", requires: [cert] });
  await seed.grant(student, cert, { by: staff });
});

const report = (actor: MemberActor, takeOutOfService: boolean, now = T0, machine = saw, description = "Blade wandering, burning smell") =>
  reportFault(db(), actor, { machineId: machine.id, description, takeOutOfService, clientRequestId: rid() }, now, opts);

const machineRow = (id = saw.id) => db().select().from(machines).where(eq(machines.id, id)).get();

async function pass(actor: MemberActor, now = T0) {
  const r = await getMachineByToken(db(), actor, { token: saw.qrToken }, now);
  if (!r.recognized) throw new Error("not recognized");
  return r;
}

async function boardTile(actor: MemberActor, now = T0) {
  const r = await getStatusBoard(db(), actor, now);
  if (r.notModified) throw new Error("unexpected 304");
  return r.board.rooms.flatMap((room) => room.machines).find((m) => m.id === saw.id)!;
}

describe("T07 — faults and out of service", () => {
  it("#1 take-out-of-service report on a machine in use: OUT OF SERVICE (issue_reported), session ended machine_down", async () => {
    const { session } = await startSession(db(), student, { machineId: saw.id, clientRequestId: rid() }, T0, opts);
    const reporter = await actors.member({ name: "Demo Student 2" });
    const v0 = await dataVersion();
    const result = await report(reporter, true, T0 + 10 * MIN);
    expect(result).toMatchObject({ tookOutOfService: true, created: true });

    expect(await machineRow()).toMatchObject({
      status: "out_of_service",
      outOfServiceReason: "issue_reported",
      statusChangedAt: T0 + 10 * MIN,
      statusNote: null,
      expectedBackAt: null,
    });
    const ended = await db().select().from(machineSessions).where(eq(machineSessions.id, session.id)).get();
    expect(ended).toMatchObject({ endedAt: T0 + 10 * MIN, endReason: "machine_down", endedByMemberId: reporter.memberId });
    const fault = await db().select().from(faults).where(eq(faults.id, result.faultId)).get();
    expect(fault).toMatchObject({ tookOutOfService: true, status: "open", reportedByMemberId: reporter.memberId });
    expect(await dataVersion()).toBeGreaterThan(v0);
  });

  it("#2 the next pass for any member is OUT_OF_SERVICE", async () => {
    await report(student, true);
    for (const who of [student, staff, await actors.member(), await actors.admin()]) {
      const p = await pass(who, T0 + MIN);
      expect(p.pass.status).toBe("OUT_OF_SERVICE");
      expect(p.machine.outOfService).toEqual({ reason: "issue_reported", since: T0, note: null, expectedBackAt: null });
      expect(p.actions.canStart).toBe(false);
      expect(p.actions.canReportFault).toBe(true);
    }
  });

  it("#3 still usable: status unchanged, board issueReported, pass unchanged", async () => {
    const before = await pass(student);
    await report(student, false);
    expect((await machineRow())?.status).toBe("available");
    const tile = await boardTile(student);
    expect(tile).toMatchObject({ state: "available", issueReported: true });
    expect(JSON.stringify(tile)).not.toContain("Blade");
    const after = await pass(student);
    expect(after.pass).toEqual(before.pass);
    expect(after.machine.outOfService).toBeNull();
  });

  it("#4 retired machine → MACHINE_RETIRED; description 9 / 1001 chars → VALIDATION_FAILED", async () => {
    const old = await seed.machine({ retired: true });
    await expect(report(student, false, T0, old)).rejects.toMatchObject({ code: "MACHINE_RETIRED" });
    await expect(report(student, false, T0, saw, "x".repeat(9))).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { description: [expect.any(String)] },
    });
    await expect(report(student, false, T0, saw, "x".repeat(1001))).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await report(student, false, T0, saw, "x".repeat(10))).toMatchObject({ created: true });
  });

  it("#5 fault on a machine already out for maintenance: reason and since unchanged; return now refused", async () => {
    await setMachineOutOfService(db(), staff, { machineId: saw.id, reason: "maintenance", note: "New belt" }, T0 - HOUR, opts);
    await report(student, true, T0);
    expect(await machineRow()).toMatchObject({
      status: "out_of_service",
      outOfServiceReason: "maintenance",
      statusChangedAt: T0 - HOUR,
      statusNote: "New belt",
    });
    await expect(returnMachineToService(db(), staff, { machineId: saw.id }, T0 + MIN, opts)).rejects.toMatchObject({
      code: "OPEN_OOS_FAULT",
    });
  });

  it("#6 return to service refused while an out-of-service fault is open → OPEN_OOS_FAULT with the ids", async () => {
    const { faultId } = await report(student, true);
    const v0 = await dataVersion();
    await expect(returnMachineToService(db(), staff, { machineId: saw.id }, T0 + MIN, opts)).rejects.toMatchObject({
      code: "OPEN_OOS_FAULT",
      details: { faultIds: [faultId] },
    });
    expect((await machineRow())?.status).toBe("out_of_service");
    expect(await dataVersion()).toBe(v0);
  });

  it("#7 staff set out of service with note + expected back → board shows them; the active session ended", async () => {
    const { session } = await startSession(db(), student, { machineId: saw.id, clientRequestId: rid() }, T0, opts);
    const result = await setMachineOutOfService(
      db(),
      staff,
      { machineId: saw.id, reason: "maintenance", note: "Replacing the blade", expectedBackAt: T0 + DAY },
      T0 + 5 * MIN,
      opts,
    );
    expect(result).toMatchObject({
      status: "out_of_service",
      outOfService: { reason: "maintenance", since: T0 + 5 * MIN, note: "Replacing the blade", expectedBackAt: T0 + DAY },
    });
    expect(await boardTile(student, T0 + 6 * MIN)).toMatchObject({
      state: "out_of_service",
      outOfService: {
        reason: "maintenance",
        since: new Date(T0 + 5 * MIN).toISOString(),
        note: "Replacing the blade",
        expectedBackAt: new Date(T0 + DAY).toISOString(),
      },
      issueReported: false,
    });
    const ended = await db().select().from(machineSessions).where(eq(machineSessions.id, session.id)).get();
    expect(ended).toMatchObject({ endReason: "machine_down", endedByMemberId: staff.memberId });

    // Already out → refused; no fault open → staff can return it.
    await expect(
      setMachineOutOfService(db(), staff, { machineId: saw.id, reason: "other" }, T0 + 7 * MIN, opts),
    ).rejects.toMatchObject({ code: "MACHINE_OUT_OF_SERVICE" });
    expect(await returnMachineToService(db(), staff, { machineId: saw.id }, T0 + HOUR, opts)).toMatchObject({
      status: "available",
      outOfService: null,
    });
    expect(await machineRow()).toMatchObject({ statusNote: null, expectedBackAt: null, statusChangedAt: T0 + HOUR });
  });

  it("#8 staff update the note on a fault-triggered outage → reason stays issue_reported", async () => {
    await report(student, true);
    const result = await updateOutageDetails(
      db(),
      staff,
      { machineId: saw.id, note: "Waiting for a part", expectedBackAt: T0 + 2 * DAY },
      T0 + MIN,
      opts,
    );
    expect(result.outOfService).toEqual({ reason: "issue_reported", since: T0, note: "Waiting for a part", expectedBackAt: T0 + 2 * DAY });
    // Blank fields clear the details.
    expect((await updateOutageDetails(db(), staff, { machineId: saw.id, note: "" }, T0 + 2 * MIN, opts)).outOfService).toMatchObject({
      note: null,
      expectedBackAt: null,
    });
    // Not out of service → NOT_OUT_OF_SERVICE.
    const other = await seed.machine();
    await expect(updateOutageDetails(db(), staff, { machineId: other.id, note: "x" }, T0, opts)).rejects.toMatchObject({
      code: "NOT_OUT_OF_SERVICE",
    });
  });

  it("#9 note 201 chars → VALIDATION_FAILED; member actor → FORBIDDEN on status services and the queue", async () => {
    await expect(
      setMachineOutOfService(db(), staff, { machineId: saw.id, reason: "maintenance", note: "x".repeat(201) }, T0, opts),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { note: [expect.any(String)] } });
    await expect(
      setMachineOutOfService(db(), staff, { machineId: saw.id, reason: "maintenance", expectedBackAt: T0 - HOUR }, T0, opts),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { expectedBackAt: [expect.any(String)] } });
    for (const call of [
      () => setMachineOutOfService(db(), student, { machineId: saw.id, reason: "maintenance" }, T0, opts),
      () => updateOutageDetails(db(), student, { machineId: saw.id }, T0, opts),
      () => returnMachineToService(db(), student, { machineId: saw.id }, T0, opts),
      () => getFaultQueue(db(), student, {}, T0),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect((await machineRow())?.status).toBe("available");
  });

  it("#10 queue order: out-of-service faults first, then oldest; resolved faults excluded", async () => {
    const drill = await seed.machine({ name: "Drill press" });
    const lathe = await seed.machine({ name: "Lathe" });
    const a = await report(student, false, T0, drill, "Chuck key missing again");
    const b = await report(student, true, T0 + 10 * MIN, lathe, "Tailstock is cracked badly");
    const c = await report(student, false, T0 + 5 * MIN, saw, "Table insert is loose");
    const d = await report(student, true, T0 + 20 * MIN, saw, "Blade snapped, unsafe now");
    const resolved = await report(student, false, T0 - HOUR, drill, "Belt guard rattles a lot");
    await logServiceRecord(
      db(),
      staff,
      { machineId: drill.id, type: "inspection", workDone: "Tightened the guard", outcome: "passed", faultIds: [resolved.faultId], clientRequestId: rid() },
      T0 + 30 * MIN,
      opts,
    );

    const { items } = await getFaultQueue(db(), staff, {}, T0 + HOUR);
    expect(items.map((i) => i.id)).toEqual([b.faultId, d.faultId, a.faultId, c.faultId]);
    expect(items[0]).toMatchObject({
      machine: { id: lathe.id, name: "Lathe", status: "out_of_service" },
      tookOutOfService: true,
      reportedAt: T0 + 10 * MIN,
      ageMinutes: 50,
      reporter: { id: student.memberId, displayName: "Demo Student 1" },
      description: "Tailstock is cracked badly",
      otherOpenOnMachine: 0,
    });
    expect(items.find((i) => i.id === c.faultId)?.otherOpenOnMachine).toBe(1);
    expect((await getFaultQueue(db(), staff, { machineId: saw.id }, T0 + HOUR)).items.map((i) => i.id)).toEqual([
      d.faultId,
      c.faultId,
    ]);
  });

  it("#11 concurrent reportFault + startSession → never an active session on an out-of-service machine", async () => {
    for (let i = 0; i < 5; i++) {
      const machine = await seed.machine({ requires: [cert] });
      const now = T0 + i * HOUR;
      await Promise.allSettled([
        reportFault(db(), student, { machineId: machine.id, description: "Sparks from the motor", takeOutOfService: true, clientRequestId: rid() }, now, opts),
        startSession(db(), student, { machineId: machine.id, clientRequestId: rid() }, now, opts),
      ]);
      const row = await machineRow(machine.id);
      expect(row?.status).toBe("out_of_service");
      const open = await db()
        .select()
        .from(machineSessions)
        .where(and(eq(machineSessions.machineId, machine.id), isNull(machineSessions.endedAt)))
        .all();
      expect(open).toEqual([]);
    }
  });

  it("#12 T02 #11 / T06 #1 through the real services: OUT OF SERVICE with details for members, non-members and staff", async () => {
    await setMachineOutOfService(
      db(),
      staff,
      { machineId: saw.id, reason: "maintenance", note: "New tube on order", expectedBackAt: T0 + 3 * DAY },
      T0 - DAY,
      opts,
    );
    for (const who of [student, await actors.nonMember(), staff]) {
      const r = await getMachineByToken(db(), who, { token: saw.qrToken }, T0);
      if (!r.recognized) throw new Error("not recognized");
      expect(r.pass.status).toBe("OUT_OF_SERVICE");
      expect(r.machine.outOfService).toEqual({ reason: "maintenance", since: T0 - DAY, note: "New tube on order", expectedBackAt: T0 + 3 * DAY });
    }
    expect(await boardTile(student)).toMatchObject({
      state: "out_of_service",
      outOfService: { reason: "maintenance", since: new Date(T0 - DAY).toISOString(), note: "New tube on order" },
    });
  });

  it("idempotent: the same clientRequestId reports once; another member reusing it → IDEMPOTENCY_MISMATCH", async () => {
    const clientRequestId = rid();
    const input = { machineId: saw.id, description: "Dust collector not running", takeOutOfService: false, clientRequestId };
    const first = await reportFault(db(), student, input, T0, opts);
    const again = await reportFault(db(), student, input, T0 + MIN, opts);
    expect(again).toEqual({ ...first, created: false });
    await expect(reportFault(db(), staff, input, T0, opts)).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
    expect(await db().select().from(faults).all()).toHaveLength(1);
  });

  it("suspended members and non-members can't report", async () => {
    await expect(report(await actors.member({ status: "suspended" }), true)).rejects.toMatchObject({ code: "SUSPENDED" });
    const outsider = await actors.nonMember();
    await expect(
      reportFault(db(), outsider, { machineId: saw.id, description: "Blade wandering badly", clientRequestId: rid() }, T0),
    ).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
  });
});
