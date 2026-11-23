import "server-only";
import { and, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Db } from "@/db";
import { faults, machines, members, serviceRecords } from "@/db/schema";
import { HISTORY_PAGE_DEFAULT, LogServiceInput, ServiceHistoryInput } from "@/lib/schemas/faults";
import { requireRole } from "@/server/authz";
import { isUniqueViolation } from "@/server/db-errors";
import type { Actor } from "@/server/domain/actor";
import type { MachineStatus, ServiceOutcome, ServiceType } from "@/server/domain/enums";
import { ServiceError } from "@/server/domain/errors";
import { returnToServiceSql, staffActiveSql } from "@/server/domain/machine-status";
import { parse } from "@/server/domain/parse";
import { withMachineWrite, type MachineWriteOptions } from "@/server/machine-write";
import { readMachineStatus } from "@/server/services/machine-status";

/** `performedAt` may be this far after `now` (clock skew, §5). */
export const FUTURE_TOLERANCE_MS = 2 * 60_000;
/** The earliest `performedAt` accepted (2000-01-01 UTC). */
export const EARLIEST_PERFORMED_AT = Date.UTC(2000, 0, 1);

export type LogServiceResult = {
  recordId: string;
  machineStatus: MachineStatus;
  resolvedFaultIds: string[];
  created: boolean;
};

export type ServiceRecordItem = {
  id: string;
  performedAt: number;
  /** A staff member, or null when an external technician did the work. */
  performedBy: { id: string; displayName: string } | null;
  externalTechnician: string | null;
  loggedBy: { id: string; displayName: string };
  type: ServiceType;
  workDone: string;
  partsUsed: string | null;
  minutesSpent: number | null;
  outcome: ServiceOutcome;
  linkedFaults: { id: string; description: string; tookOutOfService: boolean; reportedAt: number }[];
  /** This record corrects an earlier one. */
  corrects: { id: string; performedAt: number } | null;
  /** Later records that correct this one. */
  correctedBy: { id: string; performedAt: number }[];
  createdAt: number;
};

export type ServiceHistoryPage = { items: ServiceRecordItem[]; nextCursor: string | null };

const invalid = (code: "INVALID_FAULT" | "INVALID_CORRECTION" | "INVALID_PERFORMER" | "CORRECTION_NO_EFFECTS", field: string, message: string) =>
  new ServiceError(code, message, { [field]: [message] });

/** The performer is an active staff member or admin (re-checked inside the write). */
function performerValidSql(memberId: string): SQL {
  return sql`EXISTS (SELECT 1 FROM "members" AS "performer" WHERE "performer"."id" = ${memberId}
    AND "performer"."status" = 'active' AND "performer"."role" IN ('admin','staff'))`;
}

/** Every listed fault is open and on this machine (re-checked inside the write). */
function faultsOpenSql(machineId: string, ids: string[]): SQL {
  const list = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  return sql`(SELECT COUNT(*) FROM "faults" WHERE "faults"."id" IN (${list}) AND "faults"."machine_id" = ${machineId}
    AND "faults"."status" = 'open') = ${ids.length}`;
}

/* -------------------------------------------------------------------- log */

/**
 * Staff log a service record (FR-15, Phase 5 §5): insert the record, resolve
 * the linked faults, and with `returned_to_service` return the machine to
 * service, but only if no other out-of-service fault is still open. One
 * atomic batch through the machine write token. A correction (`correctsRecordId`)
 * links no faults and never changes the machine's status. Idempotent on
 * `clientRequestId`. There is no edit or delete: the history is append-only
 * (database triggers).
 */
export async function logServiceRecord(
  db: Db,
  actor: Actor,
  rawInput: LogServiceInput,
  now: number,
  options?: MachineWriteOptions,
): Promise<LogServiceResult> {
  requireRole(actor, "staff");
  const input = parse(LogServiceInput, rawInput);

  const replay = async (): Promise<LogServiceResult | null> => {
    const existing = await db
      .select({ id: serviceRecords.id, machineId: serviceRecords.machineId, loggedBy: serviceRecords.loggedByMemberId })
      .from(serviceRecords)
      .where(eq(serviceRecords.clientRequestId, input.clientRequestId))
      .get();
    if (!existing) return null;
    if (existing.loggedBy !== actor.memberId || existing.machineId !== input.machineId) {
      throw new ServiceError("IDEMPOTENCY_MISMATCH", "That request was already used. Reload and try again.");
    }
    const [resolved, status] = await Promise.all([
      db.select({ id: faults.id }).from(faults).where(eq(faults.resolvedByServiceRecordId, existing.id)).all(),
      readMachineStatus(db, existing.machineId),
    ]);
    return { recordId: existing.id, machineStatus: status.status, resolvedFaultIds: resolved.map((f) => f.id), created: false };
  };
  const previous = await replay();
  if (previous) return previous;

  if (input.checkupId) {
    throw new ServiceError("NOT_SUPPORTED_YET", "Linking a checkup comes in a later version.", {
      checkupId: ["Linking a checkup isn't available yet."],
    });
  }

  const performedAt = input.performedAt ?? now;
  if (performedAt > now + FUTURE_TOLERANCE_MS) {
    throw new ServiceError("FUTURE_DATE", "The service date can't be in the future.", {
      performedAt: ["Pick a time that isn't in the future."],
    });
  }
  if (performedAt < EARLIEST_PERFORMED_AT) {
    throw new ServiceError("VALIDATION_FAILED", "Check the highlighted fields.", {
      performedAt: ["Pick a date after 2000."],
    });
  }

  const faultIds = [...new Set(input.faultIds ?? [])];
  const correction = input.correctsRecordId ?? null;
  if (correction && faultIds.length > 0) {
    throw invalid("CORRECTION_NO_EFFECTS", "faultIds", "A correction can't resolve faults. Log a new record instead.");
  }

  // Exactly one performer: an external technician, or a staff member (default: the actor).
  const external = input.externalTechnician ?? null;
  const performerId = external ? null : (input.performedByMemberId ?? actor.memberId);
  if (performerId && performerId !== actor.memberId) {
    const performer = await db
      .select({ role: members.role, status: members.status })
      .from(members)
      .where(eq(members.id, performerId))
      .get();
    if (!performer || performer.status !== "active" || performer.role === "member") {
      throw invalid("INVALID_PERFORMER", "performedByMemberId", "Choose an active staff member or admin.");
    }
  }

  if (correction) {
    const original = await db
      .select({ machineId: serviceRecords.machineId, corrects: serviceRecords.correctsRecordId })
      .from(serviceRecords)
      .where(eq(serviceRecords.id, correction))
      .get();
    if (!original || original.machineId !== input.machineId || original.corrects !== null) {
      throw invalid(
        "INVALID_CORRECTION",
        "correctsRecordId",
        "Only an original record on this machine can be corrected (not a correction).",
      );
    }
  }

  const explainFaults = async (): Promise<ServiceError | null> => {
    if (faultIds.length === 0) return null;
    const rows = await db
      .select({ id: faults.id, machineId: faults.machineId, status: faults.status })
      .from(faults)
      .where(inArray(faults.id, faultIds))
      .all();
    const ok = rows.filter((f) => f.machineId === input.machineId && f.status === "open");
    return ok.length === faultIds.length
      ? null
      : invalid("INVALID_FAULT", "faultIds", "A linked fault is already resolved or belongs to another machine. Reload and try again.");
  };
  const faultProblem = await explainFaults();
  if (faultProblem) throw faultProblem;

  const id = crypto.randomUUID();
  const returns = input.outcome === "returned_to_service" && !correction;
  try {
    await withMachineWrite(
      db,
      input.machineId,
      now,
      (machine) => {
        if (machine.status === "retired") throw new ServiceError("MACHINE_RETIRED", "This machine is retired.");
        return {
          where: and(
            sql`"machines"."status" <> 'retired'`,
            staffActiveSql(actor.memberId),
            performerId ? performerValidSql(performerId) : undefined,
            faultIds.length > 0 ? faultsOpenSql(machine.id, faultIds) : undefined,
          ),
          guarded: (guard) => [
            sql`INSERT INTO service_records (id, machine_id, performed_at, performed_by_member_id, external_technician,
                  logged_by_member_id, type, work_done, parts_used, minutes_spent, outcome, checkup_id, corrects_record_id,
                  client_request_id, created_at)
                SELECT ${id}, ${machine.id}, ${performedAt}, ${performerId}, ${external}, ${actor.memberId}, ${input.type},
                  ${input.workDone}, ${input.partsUsed ?? null}, ${input.minutesSpent ?? null}, ${input.outcome}, NULL,
                  ${correction}, ${input.clientRequestId}, ${now}
                WHERE ${guard}`,
            ...(faultIds.length > 0
              ? [
                  sql`UPDATE faults SET status = 'resolved', resolved_by_service_record_id = ${id}, resolved_at = ${now}
                      WHERE "faults"."id" IN (${sql.join(
                        faultIds.map((f) => sql`${f}`),
                        sql`, `,
                      )}) AND "faults"."machine_id" = ${machine.id} AND "faults"."status" = 'open' AND ${guard}`,
                ]
              : []),
            ...(returns ? [returnToServiceSql(machine.id, now, guard)] : []),
          ],
          refused: async () => {
            const problem = await explainFaults();
            if (problem) return problem;
            if (performerId && performerId !== actor.memberId) {
              return invalid("INVALID_PERFORMER", "performedByMemberId", "Choose an active staff member or admin.");
            }
            return new ServiceError("FORBIDDEN", "Your access changed. Reload the page.");
          },
          result: undefined,
        };
      },
      options,
    );
  } catch (err) {
    if (isUniqueViolation(err, "service_records.client_request_id")) {
      const raced = await replay();
      if (raced) return raced;
    }
    throw err;
  }

  const status = await readMachineStatus(db, input.machineId);
  return { recordId: id, machineStatus: status.status, resolvedFaultIds: faultIds, created: true };
}

/* ---------------------------------------------------------------- history */

const performer = alias(members, "performer");
const logger = alias(members, "logger");

/** One page of a machine's service history, newest first (no permission check: callers check). */
export async function readServiceHistory(
  db: Db,
  machineId: string,
  { cursor, limit = HISTORY_PAGE_DEFAULT }: { cursor?: string; limit?: number } = {},
): Promise<ServiceHistoryPage> {
  let after: SQL | undefined;
  if (cursor) {
    const dot = cursor.indexOf(".");
    const at = Number(cursor.slice(0, dot));
    const lastId = cursor.slice(dot + 1);
    after = or(
      lt(serviceRecords.performedAt, at),
      and(eq(serviceRecords.performedAt, at), lt(serviceRecords.id, lastId)),
    );
  }

  const rows = await db
    .select({
      id: serviceRecords.id,
      performedAt: serviceRecords.performedAt,
      performerId: serviceRecords.performedByMemberId,
      performerName: sql<string | null>`${performer.displayName}`.as("performer_name"),
      externalTechnician: serviceRecords.externalTechnician,
      loggerId: serviceRecords.loggedByMemberId,
      loggerName: sql<string>`${logger.displayName}`.as("logger_name"),
      type: serviceRecords.type,
      workDone: serviceRecords.workDone,
      partsUsed: serviceRecords.partsUsed,
      minutesSpent: serviceRecords.minutesSpent,
      outcome: serviceRecords.outcome,
      correctsRecordId: serviceRecords.correctsRecordId,
      createdAt: serviceRecords.createdAt,
    })
    .from(serviceRecords)
    .leftJoin(performer, eq(performer.id, serviceRecords.performedByMemberId))
    .innerJoin(logger, eq(logger.id, serviceRecords.loggedByMemberId))
    .where(and(eq(serviceRecords.machineId, machineId), after))
    .orderBy(desc(serviceRecords.performedAt), desc(serviceRecords.id))
    .limit(limit + 1)
    .all();

  const page = rows.slice(0, limit);
  const more = rows.length > limit;
  if (page.length === 0) return { items: [], nextCursor: null };

  // Linked faults and corrections both ways: all on this machine, filtered in
  // memory (no IN list against D1's 100-parameter limit).
  const pageIds = new Set(page.map((r) => r.id));
  const [linked, related] = await db.batch([
    db
      .select({
        id: faults.id,
        recordId: faults.resolvedByServiceRecordId,
        description: faults.description,
        tookOutOfService: faults.tookOutOfService,
        reportedAt: faults.createdAt,
      })
      .from(faults)
      .where(and(eq(faults.machineId, machineId), eq(faults.status, "resolved"))),
    db
      .select({ id: serviceRecords.id, performedAt: serviceRecords.performedAt, corrects: serviceRecords.correctsRecordId })
      .from(serviceRecords)
      .where(eq(serviceRecords.machineId, machineId)),
  ]);

  const performedAtById = new Map(related.map((r) => [r.id, r.performedAt]));
  const correctedBy = new Map<string, { id: string; performedAt: number }[]>();
  for (const r of related) {
    if (r.corrects && pageIds.has(r.corrects)) {
      const list = correctedBy.get(r.corrects) ?? [];
      list.push({ id: r.id, performedAt: r.performedAt });
      correctedBy.set(r.corrects, list);
    }
  }
  const faultsByRecord = new Map<string, ServiceRecordItem["linkedFaults"]>();
  for (const f of linked) {
    if (!f.recordId || !pageIds.has(f.recordId)) continue;
    const list = faultsByRecord.get(f.recordId) ?? [];
    list.push({ id: f.id, description: f.description, tookOutOfService: f.tookOutOfService, reportedAt: f.reportedAt });
    faultsByRecord.set(f.recordId, list);
  }

  const items: ServiceRecordItem[] = page.map((r) => ({
    id: r.id,
    performedAt: r.performedAt,
    performedBy: r.performerId && r.performerName !== null ? { id: r.performerId, displayName: r.performerName } : null,
    externalTechnician: r.externalTechnician,
    loggedBy: { id: r.loggerId, displayName: r.loggerName },
    type: r.type,
    workDone: r.workDone,
    partsUsed: r.partsUsed,
    minutesSpent: r.minutesSpent,
    outcome: r.outcome,
    linkedFaults: faultsByRecord.get(r.id) ?? [],
    corrects: r.correctsRecordId
      ? { id: r.correctsRecordId, performedAt: performedAtById.get(r.correctsRecordId) ?? 0 }
      : null,
    correctedBy: (correctedBy.get(r.id) ?? []).sort((a, b) => a.performedAt - b.performedAt),
    createdAt: r.createdAt,
  }));
  const last = page[page.length - 1];
  return { items, nextCursor: more ? `${last.performedAt}.${last.id}` : null };
}

/** Staff: a machine's service history, newest first, with cursor pagination (P5-06). */
export async function getServiceHistory(db: Db, actor: Actor, rawInput: ServiceHistoryInput): Promise<ServiceHistoryPage> {
  requireRole(actor, "staff");
  const input = parse(ServiceHistoryInput, rawInput);
  const exists = await db.select({ id: machines.id }).from(machines).where(eq(machines.id, input.machineId)).get();
  if (!exists) throw new ServiceError("NOT_FOUND", "That machine doesn't exist.");
  return readServiceHistory(db, input.machineId, { cursor: input.cursor, limit: input.limit });
}

/** Staff: one record (for the correction form's pre-fill). */
export async function getServiceRecord(db: Db, actor: Actor, rawInput: { machineId: string; recordId: string }) {
  requireRole(actor, "staff");
  const input = parse(ServiceHistoryInput.pick({ machineId: true }).extend({ recordId: ServiceHistoryInput.shape.machineId }), rawInput);
  const row = await db
    .select()
    .from(serviceRecords)
    .where(and(eq(serviceRecords.id, input.recordId), eq(serviceRecords.machineId, input.machineId)))
    .get();
  if (!row) throw new ServiceError("NOT_FOUND", "That service record doesn't exist.");
  return row;
}
