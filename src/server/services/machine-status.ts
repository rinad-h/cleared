import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { faults, machines } from "@/db/schema";
import { MachineIdInput, SetOutOfServiceInput, UpdateOutageInput } from "@/lib/schemas/faults";
import { requireRole } from "@/server/authz";
import type { Actor } from "@/server/domain/actor";
import type { MachineStatus, OutOfServiceReason } from "@/server/domain/enums";
import { ServiceError } from "@/server/domain/errors";
import {
  availableColumns,
  endSessionMachineDownSql,
  openOutOfServiceFaultSql,
  staffActiveSql,
  staffOutOfServiceColumns,
} from "@/server/domain/machine-status";
import { parse } from "@/server/domain/parse";
import { withMachineWrite, type MachineWriteOptions } from "@/server/machine-write";

/** A machine's status as the status services return it. Times are UTC ms. */
export type MachineStatusView = {
  machineId: string;
  status: MachineStatus;
  outOfService: { reason: OutOfServiceReason; since: number; note: string | null; expectedBackAt: number | null } | null;
};

export async function readMachineStatus(db: Db, machineId: string): Promise<MachineStatusView> {
  const m = await db
    .select({
      id: machines.id,
      status: machines.status,
      reason: machines.outOfServiceReason,
      since: machines.statusChangedAt,
      note: machines.statusNote,
      expectedBackAt: machines.expectedBackAt,
    })
    .from(machines)
    .where(eq(machines.id, machineId))
    .get();
  if (!m) throw new ServiceError("NOT_FOUND", "That machine doesn't exist.");
  return {
    machineId: m.id,
    status: m.status,
    outOfService:
      m.status === "out_of_service" && m.reason
        ? { reason: m.reason, since: m.since, note: m.note, expectedBackAt: m.expectedBackAt }
        : null,
  };
}

/** The open faults that took this machine out of service (oldest first). */
export async function openOutOfServiceFaultIds(db: Db, machineId: string): Promise<string[]> {
  const rows = await db
    .select({ id: faults.id })
    .from(faults)
    .where(and(eq(faults.machineId, machineId), eq(faults.status, "open"), eq(faults.tookOutOfService, true)))
    .orderBy(asc(faults.createdAt))
    .all();
  return rows.map((r) => r.id);
}

const retired = () => new ServiceError("MACHINE_RETIRED", "This machine is retired and can't be changed.");
const accessChanged = () => new ServiceError("FORBIDDEN", "Your access changed. Reload the page.");
const notOut = () =>
  new ServiceError("NOT_OUT_OF_SERVICE", "This machine isn't out of service. Reload the page to see its status.");
const alreadyOut = () =>
  new ServiceError(
    "MACHINE_OUT_OF_SERVICE",
    "This machine is already out of service. Edit the note or expected-back time instead.",
  );
const openOosFault = (faultIds: string[]) =>
  new ServiceError(
    "OPEN_OOS_FAULT",
    faultIds.length === 1
      ? "A reported fault is still open. Resolve it by logging a service record."
      : `${faultIds.length} reported faults are still open. Resolve them by logging a service record.`,
    undefined,
    { faultIds },
  );

/** `expectedBackAt` must be in the future (a minute of clock skew allowed). */
function checkExpectedBack(expectedBackAt: number | undefined, now: number) {
  if (expectedBackAt !== undefined && expectedBackAt < now - 60_000) {
    throw new ServiceError("VALIDATION_FAILED", "Check the highlighted fields.", {
      expectedBackAt: ["Pick a time in the future."],
    });
  }
}

/**
 * Staff take an available machine out of service (`maintenance` / `other`)
 * with a public note and expected-back time (FR-13). Its active session ends
 * (`machine_down`, D4).
 */
export async function setMachineOutOfService(
  db: Db,
  actor: Actor,
  rawInput: SetOutOfServiceInput,
  now: number,
  options?: MachineWriteOptions,
): Promise<MachineStatusView> {
  requireRole(actor, "staff");
  const input = parse(SetOutOfServiceInput, rawInput);
  checkExpectedBack(input.expectedBackAt, now);

  await withMachineWrite(
    db,
    input.machineId,
    now,
    (machine) => {
      if (machine.status === "retired") throw retired();
      if (machine.status === "out_of_service") throw alreadyOut();
      return {
        set: staffOutOfServiceColumns(input.reason, input.note ?? null, input.expectedBackAt ?? null, now),
        where: and(eq(machines.status, "available"), staffActiveSql(actor.memberId)),
        guarded: (guard) => [endSessionMachineDownSql(machine.id, actor.memberId, now, guard)],
        refused: accessChanged,
        result: undefined,
      };
    },
    options,
  );
  return readMachineStatus(db, input.machineId);
}

/** Staff change the public note and expected-back time of an outage; the reason and since stay. */
export async function updateOutageDetails(
  db: Db,
  actor: Actor,
  rawInput: UpdateOutageInput,
  now: number,
  options?: MachineWriteOptions,
): Promise<MachineStatusView> {
  requireRole(actor, "staff");
  const input = parse(UpdateOutageInput, rawInput);
  checkExpectedBack(input.expectedBackAt, now);

  await withMachineWrite(
    db,
    input.machineId,
    now,
    (machine) => {
      if (machine.status === "retired") throw retired();
      if (machine.status !== "out_of_service") throw notOut();
      return {
        set: { statusNote: input.note ?? null, expectedBackAt: input.expectedBackAt ?? null },
        where: and(eq(machines.status, "out_of_service"), staffActiveSql(actor.memberId)),
        refused: accessChanged,
        result: undefined,
      };
    },
    options,
  );
  return readMachineStatus(db, input.machineId);
}

class AlreadyAvailable extends Error {}

/**
 * Staff return a machine to service. Refused with `OPEN_OOS_FAULT` (and the
 * fault ids) while a fault that took it out is still open: those are resolved
 * by a service record (FR-13). Already available: returned unchanged.
 */
export async function returnMachineToService(
  db: Db,
  actor: Actor,
  rawInput: MachineIdInput,
  now: number,
  options?: MachineWriteOptions,
): Promise<MachineStatusView> {
  requireRole(actor, "staff");
  const { machineId } = parse(MachineIdInput, rawInput);

  const current = await readMachineStatus(db, machineId);
  if (current.status === "available") return current;

  await withMachineWrite(
    db,
    machineId,
    now,
    async (machine) => {
      if (machine.status === "retired") throw retired();
      // Someone else returned it between the reads: nothing to write.
      if (machine.status === "available") throw new AlreadyAvailable();
      const blocking = await openOutOfServiceFaultIds(db, machineId);
      if (blocking.length > 0) throw openOosFault(blocking);
      return {
        set: availableColumns(now),
        where: and(
          eq(machines.status, "out_of_service"),
          sql`NOT ${openOutOfServiceFaultSql(machineId)}`,
          staffActiveSql(actor.memberId),
        ),
        refused: async () => {
          const ids = await openOutOfServiceFaultIds(db, machineId);
          return ids.length > 0 ? openOosFault(ids) : accessChanged();
        },
        result: undefined,
      };
    },
    options,
  ).catch((err: unknown) => {
    if (!(err instanceof AlreadyAvailable)) throw err;
  });
  return readMachineStatus(db, machineId);
}
