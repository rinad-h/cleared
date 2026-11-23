// PRD T08: the service log (Phase 5 §8.3).
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { faults, machines, serviceRecords } from "@/db/schema";
import type { MemberActor } from "@/server/domain/actor";
import { reportFault } from "@/server/services/faults";
import { getMachineDetail } from "@/server/services/machine-detail";
import { returnMachineToService } from "@/server/services/machine-status";
import { updateMachine } from "@/server/services/machines";
import { getServiceHistory, logServiceRecord } from "@/server/services/service-records";
import { actors, createMakerspace, dataVersion, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed, type SeededMachine } from "../helpers/seed";
import actionsSource from "../../src/actions/service-records.ts?raw";
import { DAY, HOUR, MIN, T0 } from "../helpers/time";

const db = () => testDb();
const rid = () => crypto.randomUUID();
const opts = { sleep: async () => {} };

let staff: MemberActor;
let student: MemberActor;
let saw: SeededMachine;

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
  staff = await actors.staff({ name: "Demo Staff 1" });
  student = await actors.member({ name: "Demo Student 1" });
  saw = await seed.machine({ name: "Bandsaw" });
});

const fault = (takeOutOfService = true, now = T0, machine = saw) =>
  reportFault(db(), student, { machineId: machine.id, description: "Blade wandering, burning smell", takeOutOfService, clientRequestId: rid() }, now, opts);

type LogInput = Parameters<typeof logServiceRecord>[2];
const log = (input: Partial<LogInput> = {}, now = T0 + HOUR, actor: MemberActor = staff) =>
  logServiceRecord(
    db(),
    actor,
    { machineId: saw.id, type: "repair", workDone: "Replaced the blade and guides", outcome: "returned_to_service", clientRequestId: rid(), ...input },
    now,
    opts,
  );

const machineRow = (id = saw.id) => db().select().from(machines).where(eq(machines.id, id)).get();
const faultRow = (id: string) => db().select().from(faults).where(eq(faults.id, id)).get();
const recordRow = (id: string) => db().select().from(serviceRecords).where(eq(serviceRecords.id, id)).get();

describe("T08 — service log", () => {
  it("#1 missing workDone or outcome, or workDone of 9 chars → VALIDATION_FAILED", async () => {
    await expect(log({ workDone: undefined })).rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { workDone: [expect.any(String)] } });
    await expect(log({ outcome: undefined })).rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { outcome: [expect.any(String)] } });
    await expect(log({ workDone: "x".repeat(9) })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(log({ minutesSpent: 0 })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await db().select().from(serviceRecords).all()).toEqual([]);
  });

  it("#2 performedAt more than 2 min after now → FUTURE_DATE (2 min tolerance accepted)", async () => {
    const now = T0 + HOUR;
    await expect(log({ performedAt: now + 2 * MIN + 1 }, now)).rejects.toMatchObject({
      code: "FUTURE_DATE",
      fieldErrors: { performedAt: [expect.any(String)] },
    });
    const { recordId } = await log({ performedAt: now + 2 * MIN }, now);
    expect((await recordRow(recordId))?.performedAt).toBe(now + 2 * MIN);
    await expect(log({ performedAt: Date.UTC(1999, 11, 31) }, now)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("#3 linking the open fault with returned_to_service → fault resolved, machine Available, details cleared", async () => {
    const { faultId } = await fault(true);
    const v0 = await dataVersion();
    const result = await log({ faultIds: [faultId], performedAt: T0 + 50 * MIN }, T0 + HOUR);
    expect(result).toMatchObject({ machineStatus: "available", resolvedFaultIds: [faultId], created: true });
    expect(await faultRow(faultId)).toMatchObject({
      status: "resolved",
      resolvedByServiceRecordId: result.recordId,
      resolvedAt: T0 + HOUR,
    });
    expect(await machineRow()).toMatchObject({
      status: "available",
      outOfServiceReason: null,
      statusNote: null,
      expectedBackAt: null,
      statusChangedAt: T0 + HOUR,
    });
    expect(await recordRow(result.recordId)).toMatchObject({
      performedAt: T0 + 50 * MIN,
      performedByMemberId: staff.memberId,
      loggedByMemberId: staff.memberId,
      externalTechnician: null,
      type: "repair",
      outcome: "returned_to_service",
    });
    expect(await dataVersion()).toBeGreaterThan(v0);
  });

  it("#4 two out-of-service faults; resolving one with returned_to_service → machine stays out", async () => {
    const a = await fault(true, T0);
    const b = await fault(true, T0 + MIN);
    const result = await log({ faultIds: [a.faultId] });
    expect(result).toMatchObject({ machineStatus: "out_of_service", resolvedFaultIds: [a.faultId] });
    expect((await faultRow(b.faultId))?.status).toBe("open");
    await expect(returnMachineToService(db(), staff, { machineId: saw.id }, T0 + 2 * HOUR, opts)).rejects.toMatchObject({
      code: "OPEN_OOS_FAULT",
      details: { faultIds: [b.faultId] },
    });
    expect((await log({ faultIds: [b.faultId] }, T0 + 3 * HOUR)).machineStatus).toBe("available");
  });

  it("#5 still_out_of_service resolving a fault → fault resolved, machine stays out", async () => {
    const { faultId } = await fault(true);
    const result = await log({ faultIds: [faultId], outcome: "still_out_of_service" });
    expect(result.machineStatus).toBe("out_of_service");
    expect((await faultRow(faultId))?.status).toBe("resolved");
    // No blocking fault left: staff can now return it by hand.
    expect((await returnMachineToService(db(), staff, { machineId: saw.id }, T0 + 2 * HOUR, opts)).status).toBe("available");
  });

  it("#6 a fault from another machine, or an already-resolved fault → INVALID_FAULT", async () => {
    const other = await seed.machine();
    const elsewhere = await fault(true, T0, other);
    await expect(log({ faultIds: [elsewhere.faultId] })).rejects.toMatchObject({ code: "INVALID_FAULT" });
    const mine = await fault(false);
    await log({ faultIds: [mine.faultId], outcome: "passed", type: "inspection" });
    await expect(log({ faultIds: [mine.faultId] })).rejects.toMatchObject({ code: "INVALID_FAULT" });
    expect((await faultRow(elsewhere.faultId))?.status).toBe("open");
  });

  it("#7 records can't be edited or deleted: no such action, and direct UPDATE/DELETE fail (append-only)", async () => {
    // The action module's exports, from its source (importing it pulls in Next.js).
    const exported = [...actionsSource.matchAll(/^export\s+(?:const|function|async function)\s+(\w+)/gm)].map((m) => m[1]);
    expect(exported).toEqual(["logServiceRecord"]);
    expect(actionsSource).not.toMatch(/^export\s+(?:\{|\*|default)/m);
    const services = await import("@/server/services/service-records");
    expect(Object.keys(services).filter((k) => /update|edit|delete|remove/i.test(k))).toEqual([]);

    const { recordId } = await log();
    // Drizzle wraps D1's error ("Failed query: …"); the trigger's message is the cause.
    const failure = (p: Promise<unknown>) => p.then(() => "succeeded", (e: Error) => String((e.cause as Error | undefined)?.message ?? e.message));
    expect(await failure(db().run(sql`UPDATE service_records SET work_done = 'Tampered with it' WHERE id = ${recordId}`))).toMatch(/append-only/);
    expect(await failure(db().run(sql`DELETE FROM service_records WHERE id = ${recordId}`))).toMatch(/append-only/);
    expect((await recordRow(recordId))?.workDone).toBe("Replaced the blade and guides");
  });

  it("#8 correction: links to the original, shown both ways, no faults, no status change", async () => {
    const original = await log({ outcome: "passed", type: "inspection", performedAt: T0 }, T0 + MIN);
    const { faultId } = await fault(true, T0 + 2 * MIN);
    await expect(log({ correctsRecordId: original.recordId, faultIds: [faultId] })).rejects.toMatchObject({
      code: "CORRECTION_NO_EFFECTS",
    });
    const fix = await log({ correctsRecordId: original.recordId, outcome: "returned_to_service", workDone: "Inspection was of the guides, not the blade" });
    expect(fix.machineStatus).toBe("out_of_service"); // a correction never changes status
    expect((await faultRow(faultId))?.status).toBe("open");

    const { items } = await getServiceHistory(db(), staff, { machineId: saw.id });
    const fixItem = items.find((i) => i.id === fix.recordId)!;
    const origItem = items.find((i) => i.id === original.recordId)!;
    expect(fixItem.corrects).toEqual({ id: original.recordId, performedAt: T0 });
    expect(origItem.correctedBy).toEqual([{ id: fix.recordId, performedAt: T0 + HOUR }]);

    // One level deep, same machine only.
    await expect(log({ correctsRecordId: fix.recordId })).rejects.toMatchObject({ code: "INVALID_CORRECTION" });
    const other = await seed.machine();
    await expect(log({ machineId: other.id, correctsRecordId: original.recordId })).rejects.toMatchObject({ code: "INVALID_CORRECTION" });
  });

  it("#9 external technician; both set → VALIDATION_FAILED; neither → the actor", async () => {
    const vendor = await log({ externalTechnician: "Acme Tool Repair" });
    expect(await recordRow(vendor.recordId)).toMatchObject({
      externalTechnician: "Acme Tool Repair",
      performedByMemberId: null,
      loggedByMemberId: staff.memberId,
    });
    await expect(log({ externalTechnician: "Acme Tool Repair", performedByMemberId: staff.memberId })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    const other = await actors.admin({ name: "Demo Admin" });
    const byOther = await log({ performedByMemberId: other.memberId });
    expect(await recordRow(byOther.recordId)).toMatchObject({ performedByMemberId: other.memberId, loggedByMemberId: staff.memberId });

    const { items } = await getServiceHistory(db(), staff, { machineId: saw.id });
    expect(items.find((i) => i.id === vendor.recordId)).toMatchObject({
      performedBy: null,
      externalTechnician: "Acme Tool Repair",
      loggedBy: { id: staff.memberId, displayName: "Demo Staff 1" },
    });
    expect(items.find((i) => i.id === byOther.recordId)?.performedBy).toEqual({ id: other.memberId, displayName: "Demo Admin" });
  });

  it("#10 the performer must be active staff/admin → INVALID_PERFORMER", async () => {
    await expect(log({ performedByMemberId: student.memberId })).rejects.toMatchObject({ code: "INVALID_PERFORMER" });
    const gone = await actors.staff({ status: "suspended" });
    await expect(log({ performedByMemberId: gone.memberId })).rejects.toMatchObject({ code: "INVALID_PERFORMER" });
    await expect(log({ performedByMemberId: crypto.randomUUID() })).rejects.toMatchObject({ code: "INVALID_PERFORMER" });
  });

  it("#11 history newest first with pagination; member actor → FORBIDDEN", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push((await log({ outcome: "passed", type: "cleaning", workDone: `Cleaned it, round ${i + 1}`, performedAt: T0 + i * DAY }, T0 + 10 * DAY)).recordId);
    }
    const first = await getServiceHistory(db(), staff, { machineId: saw.id, limit: 2 });
    expect(first.items.map((i) => i.id)).toEqual([ids[4], ids[3]]);
    expect(first.nextCursor).not.toBeNull();
    const second = await getServiceHistory(db(), staff, { machineId: saw.id, limit: 2, cursor: first.nextCursor! });
    expect(second.items.map((i) => i.id)).toEqual([ids[2], ids[1]]);
    const third = await getServiceHistory(db(), staff, { machineId: saw.id, limit: 2, cursor: second.nextCursor! });
    expect(third.items.map((i) => i.id)).toEqual([ids[0]]);
    expect(third.nextCursor).toBeNull();

    await expect(getServiceHistory(db(), student, { machineId: saw.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(log({}, T0, student)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getMachineDetail(db(), student, { machineId: saw.id }, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("#12 the same clientRequestId twice → one record", async () => {
    const { faultId } = await fault(true);
    const clientRequestId = rid();
    const first = await log({ faultIds: [faultId], clientRequestId });
    const again = await log({ faultIds: [faultId], clientRequestId }, T0 + 2 * HOUR);
    expect(again).toEqual({ ...first, created: false });
    expect(await db().select().from(serviceRecords).all()).toHaveLength(1);
    const other = await actors.staff();
    await expect(log({ clientRequestId }, T0 + HOUR, other)).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
  });

  it("#13 retire with open faults → OPEN_FAULTS; after a resolving record → retire OK", async () => {
    const admin = await actors.admin();
    const { faultId } = await fault(false);
    await expect(updateMachine(db(), admin, { id: saw.id, retire: true }, T0 + MIN)).rejects.toMatchObject({ code: "OPEN_FAULTS" });
    expect((await machineRow())?.status).toBe("available");
    await log({ faultIds: [faultId], outcome: "passed", type: "inspection" });
    expect((await updateMachine(db(), admin, { id: saw.id, retire: true }, T0 + 2 * HOUR)).status).toBe("retired");
    await expect(log({}, T0 + 3 * HOUR)).rejects.toMatchObject({ code: "MACHINE_RETIRED" });
  });


  it("machine detail: status, open faults, blocking ids, sessions and the first history page", async () => {
    const past = await seed.session(student, saw, { startedAt: T0 - 2 * HOUR, minutes: 30, endedAt: T0 - 100 * MIN });
    const a = await fault(true, T0);
    const b = await fault(false, T0 + MIN);
    await log({ outcome: "passed", type: "inspection", performedAt: T0 - DAY }, T0);
    const detail = await getMachineDetail(db(), staff, { machineId: saw.id }, T0 + 2 * MIN);
    expect(detail.machine).toMatchObject({
      id: saw.id,
      name: "Bandsaw",
      status: "out_of_service",
      outOfService: { reason: "issue_reported", since: T0, note: null, expectedBackAt: null },
    });
    expect(detail.openFaults.map((f) => f.id)).toEqual([a.faultId, b.faultId]);
    expect(detail.blockingFaultIds).toEqual([a.faultId]);
    expect(detail.activeSession).toBeNull();
    expect(detail.recentSessions).toEqual([
      {
        id: past.id,
        member: { id: student.memberId, displayName: "Demo Student 1" },
        startedAt: T0 - 2 * HOUR,
        expectedEndAt: T0 - 90 * MIN,
        endedAt: T0 - 100 * MIN,
        endReason: "user",
        active: false,
      },
    ]);
    expect(detail.serviceHistory.items).toHaveLength(1);
    expect(detail.timezone).toBe("America/Edmonton");
  });
});
