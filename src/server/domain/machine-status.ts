import { sql, type SQL } from "drizzle-orm";
import type { MachineStatus, OutOfServiceReason } from "./enums";

/**
 * Machine status transitions (Phase 5 §4). Pure: no I/O, `now` passed in.
 * The planners decide what changes on the machine row; the SQL builders give
 * the statements a `withMachineWrite` batch adds after its token swap. Every
 * statement takes the batch's token `guard`, so a refused swap changes nothing.
 */

/** The out-of-service columns on `machines`. */
export type OutOfServiceColumns = {
  status: "available" | "out_of_service";
  outOfServiceReason: OutOfServiceReason | null;
  statusNote: string | null;
  expectedBackAt: number | null;
  statusChangedAt: number;
};

/** "Back in service": status available and every out-of-service detail cleared. */
export function availableColumns(now: number): OutOfServiceColumns {
  return { status: "available", outOfServiceReason: null, statusNote: null, expectedBackAt: null, statusChangedAt: now };
}

/**
 * A fault that takes the machine out of service (§4, D3): an available machine
 * goes out with `issue_reported` from now; an already-out machine keeps its
 * reason, note and since time (the outage started earlier). `null`: no change.
 */
export function faultTransition(status: MachineStatus, takeOutOfService: boolean, now: number): OutOfServiceColumns | null {
  if (!takeOutOfService || status !== "available") return null;
  return {
    status: "out_of_service",
    outOfServiceReason: "issue_reported",
    statusNote: null,
    expectedBackAt: null,
    statusChangedAt: now,
  };
}

/** Staff take an available machine out of service with a reason, note and expected-back time. */
export function staffOutOfServiceColumns(
  reason: "maintenance" | "other",
  note: string | null,
  expectedBackAt: number | null,
  now: number,
): OutOfServiceColumns {
  return { status: "out_of_service", outOfServiceReason: reason, statusNote: note, expectedBackAt, statusChangedAt: now };
}

/* ----------------------------------------------------------- SQL builders */

/** An open fault that took this machine out of service (blocks a manual return, FR-13). */
export function openOutOfServiceFaultSql(machineId: string): SQL {
  return sql`EXISTS (SELECT 1 FROM "faults" WHERE "faults"."machine_id" = ${machineId}
    AND "faults"."status" = 'open' AND "faults"."took_out_of_service" = 1)`;
}

/** Any open fault on this machine (blocks retiring it, D6). */
export function anyOpenFaultSql(machineId: string): SQL {
  return sql`EXISTS (SELECT 1 FROM "faults" WHERE "faults"."machine_id" = ${machineId} AND "faults"."status" = 'open')`;
}

/** The actor is still an active staff member or admin when the statement runs. */
export function staffActiveSql(memberId: string): SQL {
  return sql`EXISTS (SELECT 1 FROM "members" AS "actor" WHERE "actor"."id" = ${memberId}
    AND "actor"."status" = 'active' AND "actor"."role" IN ('admin','staff'))`;
}

/**
 * End the machine's active session because it went out of service
 * (`machine_down`, ended by the actor). Expired-but-open sessions were already
 * closed as `expired` by the write helper.
 */
export function endSessionMachineDownSql(machineId: string, actorMemberId: string, now: number, guard: SQL): SQL {
  return sql`UPDATE machine_sessions SET ended_at = ${now}, end_reason = 'machine_down', ended_by_member_id = ${actorMemberId}
    WHERE "machine_sessions"."machine_id" = ${machineId} AND "machine_sessions"."ended_at" IS NULL
      AND "machine_sessions"."expected_end_at" > ${now} AND ${guard}`;
}

/**
 * The self-guarding return to service inside a service-record batch (§4): it
 * runs after the statements that resolve the linked faults, so it sees them
 * resolved, and changes nothing while another out-of-service fault is open.
 */
export function returnToServiceSql(machineId: string, now: number, guard: SQL): SQL {
  return sql`UPDATE machines SET status = 'available', out_of_service_reason = NULL, status_note = NULL,
      expected_back_at = NULL, status_changed_at = ${now}, updated_at = ${now}
    WHERE "machines"."id" = ${machineId} AND "machines"."status" = 'out_of_service' AND ${guard}
      AND NOT ${openOutOfServiceFaultSql(machineId)}`;
}
