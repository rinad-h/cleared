import "server-only";
import { eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { checkups, machines, rooms } from "@/db/schema";
import {
  CreateCheckupInput,
  DueCheckupsInput,
  MachineCheckupsInput,
  UpdateCheckupInput,
  type DueFilter,
} from "@/lib/schemas/checkups";
import { requireRole } from "@/server/authz";
import { batch } from "@/server/batch";
import type { Actor } from "@/server/domain/actor";
import { checkupState, nextDue, type CheckupState } from "@/server/domain/checkups";
import { ServiceError } from "@/server/domain/errors";
import { staffActiveSql } from "@/server/domain/machine-status";
import { parse } from "@/server/domain/parse";
import { SETTINGS_ID } from "@/server/version";

export type CheckupItem = {
  id: string;
  name: string;
  intervalDays: number;
  instructions: string | null;
  active: boolean;
  createdAt: number;
  lastDoneAt: number | null;
  nextDueAt: number;
  state: CheckupState;
  machine: { id: string; name: string; roomName: string };
};

type CheckupRow = {
  id: string;
  machineId: string;
  name: string;
  intervalDays: number;
  instructions: string | null;
  active: boolean;
  createdAt: number;
  machineName: string;
  roomName: string;
  lastDoneAt: number | null;
};

/**
 * Checkups with their latest linked `scheduled_checkup` record (one query,
 * index-backed by `service_records_checkup`), next due and state. No
 * permission check: callers check. Without `machineId`: only active checkups
 * on non-retired machines (the lists, Phase 6 §4.1).
 */
export async function readCheckups(
  db: Db,
  now: number,
  scope: { machineId: string; includeInactive?: boolean } | "lists",
): Promise<CheckupItem[]> {
  const where: SQL =
    scope === "lists"
      ? sql`"checkups"."active" = 1 AND "machines"."status" <> 'retired'`
      : scope.includeInactive
        ? sql`"checkups"."machine_id" = ${scope.machineId}`
        : sql`"checkups"."machine_id" = ${scope.machineId} AND "checkups"."active" = 1`;
  const rows: CheckupRow[] = await db
    .select({
      id: checkups.id,
      machineId: checkups.machineId,
      name: checkups.name,
      intervalDays: checkups.intervalDays,
      instructions: checkups.instructions,
      active: checkups.active,
      createdAt: checkups.createdAt,
      machineName: sql<string>`${machines.name}`.as("checkup_machine_name"),
      roomName: sql<string>`${rooms.name}`.as("checkup_room_name"),
      lastDoneAt: sql<number | null>`(SELECT MAX("s"."performed_at") FROM "service_records" AS "s"
        WHERE "s"."checkup_id" = "checkups"."id" AND "s"."type" = 'scheduled_checkup')`.as("checkup_last_done_at"),
    })
    .from(checkups)
    .innerJoin(machines, eq(machines.id, checkups.machineId))
    .innerJoin(rooms, eq(rooms.id, machines.roomId))
    .where(where)
    .all();
  return rows
    .map((r) => {
      const nextDueAt = nextDue({ createdAt: r.createdAt, intervalDays: r.intervalDays, lastDoneAt: r.lastDoneAt });
      return {
        id: r.id,
        name: r.name,
        intervalDays: r.intervalDays,
        instructions: r.instructions,
        active: r.active,
        createdAt: r.createdAt,
        lastDoneAt: r.lastDoneAt,
        nextDueAt,
        state: checkupState(nextDueAt, now),
        machine: { id: r.machineId, name: r.machineName, roomName: r.roomName },
      };
    })
    .sort((a, b) => a.nextDueAt - b.nextDueAt || a.name.localeCompare(b.name));
}

/** Staff: a machine's checkups (machine detail, the log-service form). */
export async function listMachineCheckups(
  db: Db,
  actor: Actor,
  rawInput: MachineCheckupsInput,
  now: number,
): Promise<CheckupItem[]> {
  requireRole(actor, "staff");
  const input = parse(MachineCheckupsInput, rawInput);
  return readCheckups(db, now, { machineId: input.machineId, includeInactive: input.includeInactive ?? false });
}

const matches = (filter: DueFilter, state: CheckupState) =>
  filter === "all" || (filter === "overdue" ? state === "overdue" : state === "due_soon");

/**
 * Staff: active checkups on live machines across the makerspace. Overdue
 * (most overdue first), due soon (soonest first), or all (by next due).
 */
export async function listDueCheckups(db: Db, actor: Actor, rawInput: DueCheckupsInput, now: number): Promise<CheckupItem[]> {
  requireRole(actor, "staff");
  const { due } = parse(DueCheckupsInput, rawInput);
  return (await readCheckups(db, now, "lists")).filter((c) => matches(due, c.state));
}

/** Staff: how many checkups are due soon and overdue (console nav and home). */
export async function countDueCheckups(db: Db, actor: Actor, now: number): Promise<{ dueSoon: number; overdue: number }> {
  requireRole(actor, "staff");
  const list = await readCheckups(db, now, "lists");
  return {
    dueSoon: list.filter((c) => c.state === "due_soon").length,
    overdue: list.filter((c) => c.state === "overdue").length,
  };
}

const bumpIf = (condition: SQL) =>
  sql`UPDATE settings SET data_version = data_version + 1 WHERE id = ${SETTINGS_ID} AND ${condition}`;

/**
 * Staff: add a checkup to a non-retired machine. One batch: the insert is
 * guarded by "the machine is live and the actor is still active staff", and
 * the version bump by "the row exists".
 */
export async function createCheckup(
  db: Db,
  actor: Actor,
  rawInput: CreateCheckupInput,
  now: number,
): Promise<{ checkupId: string }> {
  requireRole(actor, "staff");
  const input = parse(CreateCheckupInput, rawInput);
  const machine = await db
    .select({ status: machines.status })
    .from(machines)
    .where(eq(machines.id, input.machineId))
    .get();
  if (!machine) throw new ServiceError("NOT_FOUND", "That machine doesn't exist.");
  if (machine.status === "retired") throw new ServiceError("MACHINE_RETIRED", "This machine is retired.");

  const id = crypto.randomUUID();
  const [inserted] = await batch(db, [
    sql`INSERT INTO checkups (id, machine_id, name, interval_days, instructions, active, created_by_member_id, created_at, updated_at)
        SELECT ${id}, ${input.machineId}, ${input.name}, ${input.intervalDays}, ${input.instructions ?? null}, 1,
          ${actor.memberId}, ${now}, ${now}
        WHERE EXISTS (SELECT 1 FROM "machines" WHERE "machines"."id" = ${input.machineId} AND "machines"."status" <> 'retired')
          AND ${staffActiveSql(actor.memberId)}`,
    bumpIf(sql`EXISTS (SELECT 1 FROM "checkups" WHERE "checkups"."id" = ${id})`),
  ]);
  if (inserted.meta.changes === 0) {
    const again = await db.select({ status: machines.status }).from(machines).where(eq(machines.id, input.machineId)).get();
    if (again?.status === "retired") throw new ServiceError("MACHINE_RETIRED", "This machine is retired.");
    throw new ServiceError("FORBIDDEN", "Your access changed. Reload the page.");
  }
  return { checkupId: id };
}

/**
 * Staff: edit, deactivate or reactivate a checkup. A new interval applies at
 * once (next due is recomputed from the same base). Deactivating hides it from
 * the lists; reactivating uses the same rule, so it is usually overdue at once.
 */
export async function updateCheckup(
  db: Db,
  actor: Actor,
  rawInput: UpdateCheckupInput,
  now: number,
): Promise<{ checkupId: string }> {
  requireRole(actor, "staff");
  const input = parse(UpdateCheckupInput, rawInput);
  const changes = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.intervalDays !== undefined ? { intervalDays: input.intervalDays } : {}),
    ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
  if (Object.keys(changes).length === 0) throw new ServiceError("VALIDATION_FAILED", "Nothing to change.");

  const existing = await db.select({ id: checkups.id }).from(checkups).where(eq(checkups.id, input.checkupId)).get();
  if (!existing) throw new ServiceError("NOT_FOUND", "That checkup doesn't exist.");

  const [updated] = await batch(db, [
    db
      .update(checkups)
      .set({ ...changes, updatedAt: now })
      .where(sql`"checkups"."id" = ${input.checkupId} AND ${staffActiveSql(actor.memberId)}`),
    bumpIf(sql`EXISTS (SELECT 1 FROM "checkups" WHERE "checkups"."id" = ${input.checkupId} AND "checkups"."updated_at" = ${now})`),
  ]);
  if (updated.meta.changes === 0) throw new ServiceError("FORBIDDEN", "Your access changed. Reload the page.");
  return { checkupId: input.checkupId };
}
