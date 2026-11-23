import "server-only";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { faults, machines, members, rooms } from "@/db/schema";
import { FaultQueueInput, ReportFaultInput } from "@/lib/schemas/faults";
import { requireMember, requireRole } from "@/server/authz";
import { isUniqueViolation } from "@/server/db-errors";
import type { Actor } from "@/server/domain/actor";
import type { MachineStatus } from "@/server/domain/enums";
import { ServiceError } from "@/server/domain/errors";
import { endSessionMachineDownSql, faultTransition } from "@/server/domain/machine-status";
import { parse } from "@/server/domain/parse";
import { memberActiveSql } from "@/server/domain/sessions";
import { withMachineWrite, type MachineWriteOptions } from "@/server/machine-write";

/** A fault as staff see it (queue, machine detail). Never shown to members or on the board. */
export type FaultItem = {
  id: string;
  machine: { id: string; name: string; roomName: string; status: MachineStatus };
  tookOutOfService: boolean;
  reportedAt: number;
  ageMinutes: number;
  reporter: { id: string; displayName: string };
  description: string;
  /** Other open reports on the same machine (Q3: technicians link them all in one record). */
  otherOpenOnMachine: number;
};

const retired = () => new ServiceError("MACHINE_RETIRED", "This machine is retired.");

/* ----------------------------------------------------------------- report */

/**
 * A member reports a problem (FR-12, Phase 5 §4). With `takeOutOfService` the
 * machine is OUT OF SERVICE for everyone at once (unless it already was: the
 * reason and since time stay, D3) and its active session ends
 * (`machine_down`). Without it, nothing changes but the board shows *Issue
 * reported*. One atomic batch through the machine write token; idempotent on
 * `clientRequestId`.
 */
export async function reportFault(
  db: Db,
  actor: Actor,
  rawInput: ReportFaultInput,
  now: number,
  options?: MachineWriteOptions,
): Promise<{ faultId: string; tookOutOfService: boolean; created: boolean }> {
  requireMember(actor);
  const input = parse(ReportFaultInput, rawInput);

  const replay = async () => {
    const existing = await db
      .select({
        id: faults.id,
        machineId: faults.machineId,
        reportedBy: faults.reportedByMemberId,
        tookOutOfService: faults.tookOutOfService,
      })
      .from(faults)
      .where(eq(faults.clientRequestId, input.clientRequestId))
      .get();
    if (!existing) return null;
    if (existing.reportedBy !== actor.memberId || existing.machineId !== input.machineId) {
      throw new ServiceError("IDEMPOTENCY_MISMATCH", "That request was already used. Reload and try again.");
    }
    return { faultId: existing.id, tookOutOfService: existing.tookOutOfService, created: false };
  };
  const previous = await replay();
  if (previous) return previous;

  const id = crypto.randomUUID();
  const take = input.takeOutOfService;
  try {
    await withMachineWrite(
      db,
      input.machineId,
      now,
      (machine) => {
        if (machine.status === "retired") throw retired();
        const change = faultTransition(machine.status, take, now);
        return {
          set: change ?? undefined,
          // Re-checked atomically: still not retired, still the same status
          // (so "already out" keeps its reason), and the reporter still active.
          where: and(eq(machines.status, machine.status), memberActiveSql(actor.memberId)),
          guarded: (guard) => [
            sql`INSERT INTO faults (id, machine_id, reported_by_member_id, description, took_out_of_service, status,
                  client_request_id, created_at)
                SELECT ${id}, ${machine.id}, ${actor.memberId}, ${input.description}, ${take ? 1 : 0}, 'open',
                  ${input.clientRequestId}, ${now}
                WHERE ${guard}`,
            ...(take ? [endSessionMachineDownSql(machine.id, actor.memberId, now, guard)] : []),
          ],
          refused: () => new ServiceError("SUSPENDED", "Your access is suspended. Contact staff."),
          result: undefined,
        };
      },
      options,
    );
  } catch (err) {
    if (isUniqueViolation(err, "faults.client_request_id")) {
      const raced = await replay();
      if (raced) return raced;
    }
    throw err;
  }
  return { faultId: id, tookOutOfService: take, created: true };
}

/* ------------------------------------------------------------------ reads */

/**
 * Open faults, out-of-service ones first, then oldest (FR-14, §6.1). One
 * read: faults joined to their machine, room and reporter.
 */
export async function readOpenFaults(db: Db, now: number, machineId?: string): Promise<FaultItem[]> {
  const rows = await db
    .select({
      id: faults.id,
      machineId: machines.id,
      machineName: machines.name,
      machineStatus: machines.status,
      roomName: sql<string>`${rooms.name}`.as("room_name"),
      tookOutOfService: faults.tookOutOfService,
      createdAt: faults.createdAt,
      reporterId: members.id,
      reporterName: members.displayName,
      description: faults.description,
    })
    .from(faults)
    .innerJoin(machines, eq(machines.id, faults.machineId))
    .innerJoin(rooms, eq(rooms.id, machines.roomId))
    .innerJoin(members, eq(members.id, faults.reportedByMemberId))
    .where(and(eq(faults.status, "open"), machineId ? eq(faults.machineId, machineId) : undefined, ne(machines.status, "retired")))
    .orderBy(desc(faults.tookOutOfService), asc(faults.createdAt), asc(faults.id))
    .all();

  const perMachine = new Map<string, number>();
  for (const r of rows) perMachine.set(r.machineId, (perMachine.get(r.machineId) ?? 0) + 1);

  return rows.map((r) => ({
    id: r.id,
    machine: { id: r.machineId, name: r.machineName, roomName: r.roomName, status: r.machineStatus },
    tookOutOfService: r.tookOutOfService,
    reportedAt: r.createdAt,
    ageMinutes: Math.max(0, Math.floor((now - r.createdAt) / 60_000)),
    reporter: { id: r.reporterId, displayName: r.reporterName },
    description: r.description,
    otherOpenOnMachine: (perMachine.get(r.machineId) ?? 1) - 1,
  }));
}

/** Staff: the fault queue (FR-14). Optionally one machine's open faults. */
export async function getFaultQueue(
  db: Db,
  actor: Actor,
  rawInput: FaultQueueInput,
  now: number,
): Promise<{ items: FaultItem[] }> {
  requireRole(actor, "staff");
  const input = parse(FaultQueueInput, rawInput);
  return { items: await readOpenFaults(db, now, input.machineId) };
}

/** Staff: how many faults are open (the console nav count). */
export async function countOpenFaults(db: Db, actor: Actor): Promise<number> {
  requireRole(actor, "staff");
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(faults)
    .where(eq(faults.status, "open"))
    .get();
  return row?.n ?? 0;
}
