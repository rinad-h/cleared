// PRD T09: recurring checkups (Phase 6 §7.3).
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { checkups, serviceRecords } from "@/db/schema";
import type { MemberActor } from "@/server/domain/actor";
import { checkupState, daysOverdue, nextBoundary, nextDue } from "@/server/domain/checkups";
import {
  countDueCheckups,
  createCheckup,
  listDueCheckups,
  listMachineCheckups,
  updateCheckup,
} from "@/server/services/checkups";
import { getMachineDetail } from "@/server/services/machine-detail";
import { getMachineByToken } from "@/server/services/pass";
import { startSession } from "@/server/services/sessions";
import { logServiceRecord } from "@/server/services/service-records";
import { updateMachine } from "@/server/services/machines";
import { actors, createMakerspace, dataVersion, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed, type SeededMachine } from "../helpers/seed";
import { DAY, HOUR, T0 } from "../helpers/time";

const db = () => testDb();
const rid = () => crypto.randomUUID();
const opts = { sleep: async () => {} };

let staff: MemberActor;
let admin: MemberActor;
let student: MemberActor;
let saw: SeededMachine;

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
  staff = await actors.staff({ name: "Demo Staff 1" });
  admin = await actors.admin({ name: "Demo Admin" });
  student = await actors.member({ name: "Demo Student 1" });
  saw = await seed.machine({ name: "Bandsaw" });
});

const create = (input: Partial<Parameters<typeof createCheckup>[2]> = {}, now = T0, actor: MemberActor = staff) =>
  createCheckup(db(), actor, { machineId: saw.id, name: "Blade tension", intervalDays: 14, ...input }, now);

type LogInput = Parameters<typeof logServiceRecord>[2];
const logCheckup = (checkupId: string, input: Partial<LogInput> = {}, now = T0 + DAY, machine = saw) =>
  logServiceRecord(
    db(),
    staff,
    {
      machineId: machine.id,
      type: "scheduled_checkup",
      workDone: "Checked the blade tension and guides",
      outcome: "passed",
      checkupId,
      clientRequestId: rid(),
      ...input,
    },
    now,
    opts,
  );

const one = async (now: number) => (await listMachineCheckups(db(), staff, { machineId: saw.id }, now))[0];

describe("T09 — domain", () => {
  it("next due, state, boundaries and days overdue", () => {
    const due = nextDue({ createdAt: T0, intervalDays: 14, lastDoneAt: null });
    expect(due).toBe(T0 + 14 * DAY);
    expect(nextDue({ createdAt: T0, intervalDays: 14, lastDoneAt: T0 + 3 * DAY })).toBe(T0 + 17 * DAY);
    expect(checkupState(due, T0 + 6 * DAY)).toBe("ok");
    expect(checkupState(due, T0 + 7 * DAY)).toBe("due_soon");
    expect(checkupState(due, T0 + 14 * DAY - 1)).toBe("due_soon");
    expect(checkupState(due, T0 + 14 * DAY)).toBe("overdue");
    expect(nextBoundary(due, T0)).toBe(T0 + 7 * DAY);
    expect(nextBoundary(due, T0 + 7 * DAY)).toBe(due);
    expect(nextBoundary(due, due)).toBeNull();
    expect(daysOverdue(due, due + 3 * DAY + HOUR)).toBe(3);
    expect(daysOverdue(due, due - DAY)).toBe(0);
  });
});

describe("T09 — checkups", () => {
  it("#1 new checkup, interval 14 at T0: ok at +6 d, due soon at +7 d, overdue at +14 d", async () => {
    const before = await dataVersion();
    const { checkupId } = await create();
    expect(await dataVersion()).toBe(before + 1);
    expect(await one(T0 + 6 * DAY)).toMatchObject({ id: checkupId, nextDueAt: T0 + 14 * DAY, state: "ok", lastDoneAt: null });
    expect((await one(T0 + 7 * DAY)).state).toBe("due_soon");
    expect((await one(T0 + 14 * DAY)).state).toBe("overdue");
    expect(await countDueCheckups(db(), staff, T0 + 14 * DAY)).toEqual({ dueSoon: 0, overdue: 1 });
  });

  it("#2 a linked scheduled_checkup record at T1 → next due T1 + 14 d; leaves the overdue list", async () => {
    const { checkupId } = await create();
    const now = T0 + 15 * DAY;
    expect(await listDueCheckups(db(), staff, { due: "overdue" }, now)).toHaveLength(1);
    const { recordId } = await logCheckup(checkupId, {}, now);
    expect((await db().select().from(serviceRecords).where(eq(serviceRecords.id, recordId)).get())?.checkupId).toBe(checkupId);
    expect(await one(now)).toMatchObject({ lastDoneAt: now, nextDueAt: now + 14 * DAY, state: "ok" });
    expect(await listDueCheckups(db(), staff, { due: "overdue" }, now)).toEqual([]);
  });

  it("#3 a back-dated record doesn't move next due back: the latest performed_at wins", async () => {
    const { checkupId } = await create();
    const now = T0 + 20 * DAY;
    await logCheckup(checkupId, {}, now);
    await logCheckup(checkupId, { performedAt: T0 + 2 * DAY }, now + HOUR);
    expect(await one(now + HOUR)).toMatchObject({ lastDoneAt: now, nextDueAt: now + 14 * DAY });
  });

  it("#4 records of other types, or for other checkups, don't affect it", async () => {
    const { checkupId } = await create();
    const { checkupId: other } = await create({ name: "Dust collector" });
    await logCheckup(other, {}, T0 + 10 * DAY);
    await logServiceRecord(
      db(),
      staff,
      { machineId: saw.id, type: "inspection", workDone: "Looked over the whole saw", outcome: "passed", clientRequestId: rid() },
      T0 + 10 * DAY,
      opts,
    );
    const mine = (await listMachineCheckups(db(), staff, { machineId: saw.id }, T0 + 10 * DAY)).find((c) => c.id === checkupId);
    expect(mine).toMatchObject({ lastDoneAt: null, nextDueAt: T0 + 14 * DAY });
  });

  it("#5 changing the interval 14 → 30 recomputes next due from the same base", async () => {
    const { checkupId } = await create();
    await logCheckup(checkupId, {}, T0 + 5 * DAY);
    await updateCheckup(db(), staff, { checkupId, intervalDays: 30 }, T0 + 6 * DAY);
    expect(await one(T0 + 6 * DAY)).toMatchObject({ intervalDays: 30, nextDueAt: T0 + 35 * DAY });
  });

  it("#6 inactive checkups and checkups on retired machines are left out of the lists", async () => {
    const { checkupId } = await create();
    const drill = await seed.machine({ name: "Drill press" });
    await create({ machineId: drill.id, name: "Chuck check" });
    const now = T0 + 20 * DAY;
    expect(await listDueCheckups(db(), staff, { due: "all" }, now)).toHaveLength(2);

    await updateCheckup(db(), staff, { checkupId, active: false }, T0 + DAY);
    await updateMachine(db(), admin, { id: drill.id, retire: true }, T0 + DAY);
    expect(await listDueCheckups(db(), staff, { due: "all" }, now)).toEqual([]);
    expect(await countDueCheckups(db(), staff, now)).toEqual({ dueSoon: 0, overdue: 0 });

    // Machine detail still lists the inactive one; reactivating brings it back overdue.
    const detail = await getMachineDetail(db(), staff, { machineId: saw.id }, now);
    expect(detail.checkups).toMatchObject([{ id: checkupId, active: false, state: "overdue" }]);
    await updateCheckup(db(), staff, { checkupId, active: true }, now);
    expect(await listDueCheckups(db(), staff, { due: "overdue" }, now)).toMatchObject([{ id: checkupId }]);
    // A retired machine takes no new checkups.
    await expect(create({ machineId: drill.id })).rejects.toMatchObject({ code: "MACHINE_RETIRED" });
  });

  it("#7 checkupId validation: other machine / inactive → INVALID_CHECKUP; wrong type → CHECKUP_TYPE_MISMATCH; correction → CORRECTION_NO_EFFECTS", async () => {
    const { checkupId } = await create();
    const drill = await seed.machine({ name: "Drill press" });
    const { checkupId: drillCheckup } = await create({ machineId: drill.id, name: "Chuck check" });

    await expect(logCheckup(drillCheckup)).rejects.toMatchObject({ code: "INVALID_CHECKUP", fieldErrors: { checkupId: [expect.any(String)] } });
    await expect(logCheckup(crypto.randomUUID())).rejects.toMatchObject({ code: "INVALID_CHECKUP" });
    await expect(logCheckup(checkupId, { type: "repair", outcome: "returned_to_service" })).rejects.toMatchObject({
      code: "CHECKUP_TYPE_MISMATCH",
    });

    const { recordId } = await logCheckup(checkupId);
    await expect(logCheckup(checkupId, { correctsRecordId: recordId })).rejects.toMatchObject({ code: "CORRECTION_NO_EFFECTS" });

    await updateCheckup(db(), staff, { checkupId, active: false }, T0 + DAY);
    await expect(logCheckup(checkupId)).rejects.toMatchObject({ code: "INVALID_CHECKUP" });
    expect(await db().select().from(serviceRecords).all()).toHaveLength(1);
  });

  it("#8 lists are sorted; members → FORBIDDEN", async () => {
    const now = T0 + 30 * DAY;
    await create({ name: "Weekly", intervalDays: 7 }); // overdue by 23 d
    await create({ name: "Fortnightly", intervalDays: 14 }); // overdue by 16 d
    await create({ name: "Monthly", intervalDays: 35 }, T0); // due in 5 d
    await create({ name: "Bimonthly", intervalDays: 33 }, T0); // due in 3 d
    await create({ name: "Yearly", intervalDays: 365 });
    expect((await listDueCheckups(db(), staff, { due: "overdue" }, now)).map((c) => c.name)).toEqual(["Weekly", "Fortnightly"]);
    expect((await listDueCheckups(db(), staff, { due: "soon" }, now)).map((c) => c.name)).toEqual(["Bimonthly", "Monthly"]);
    expect((await listDueCheckups(db(), staff, { due: "all" }, now)).map((c) => c.name)).toEqual([
      "Weekly",
      "Fortnightly",
      "Bimonthly",
      "Monthly",
      "Yearly",
    ]);
    const [first] = await listDueCheckups(db(), staff, { due: "all" }, now);
    expect(first.machine).toMatchObject({ id: saw.id, name: "Bandsaw", roomName: expect.any(String) });

    await expect(listDueCheckups(db(), student, { due: "all" }, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(create({}, T0, student)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listMachineCheckups(db(), student, { machineId: saw.id }, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("#9 checkups never change pass status or block a session start", async () => {
    await create({ intervalDays: 1 });
    const now = T0 + 30 * DAY;
    expect((await one(now)).state).toBe("overdue");
    const pass = await getMachineByToken(db(), student, { token: saw.qrToken }, now);
    expect(pass).toMatchObject({ recognized: true, pass: { status: "CLEARED" } });
    const { created } = await startSession(db(), student, { machineId: saw.id, clientRequestId: rid() }, now, opts);
    expect(created).toBe(true);
  });

  it("validation: lengths and interval limits match the table; nothing to change → VALIDATION_FAILED", async () => {
    await expect(create({ name: "x" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(create({ intervalDays: 0 })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(create({ intervalDays: 731 })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(create({ instructions: "x".repeat(2001) })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(create({ name: "Bad\u0007name" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const { checkupId } = await create({ instructions: "Line one\nLine two" });
    await expect(updateCheckup(db(), staff, { checkupId }, T0)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await updateCheckup(db(), staff, { checkupId, instructions: "" }, T0 + 1);
    expect((await db().select().from(checkups).where(eq(checkups.id, checkupId)).get())?.instructions).toBeNull();
    await expect(updateCheckup(db(), staff, { checkupId: crypto.randomUUID(), name: "Nope" }, T0)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
