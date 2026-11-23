import { sql, type SQL } from "drizzle-orm";
import { validGrantSql } from "./grants";

/**
 * Machine session rules (Phase 4 §3–4). Pure: no I/O, `now` passed in. The
 * SQL builders return statements for the services' atomic batches.
 */

export const MIN_SESSION_MINUTES = 15;
export const MAX_SESSION_MINUTES = 240;
export const MINUTE_MS = 60_000;

/** The duration chips on the pass (an "Other…" field allows 15–240). */
export const SESSION_DURATION_OPTIONS = [15, 30, 60, 120] as const;
/** What "+15 min" sends; the service accepts 5–60. */
export const EXTEND_MINUTES = 15;
export const MIN_EXTEND_MINUTES = 5;
export const MAX_EXTEND_MINUTES = 60;

/** Board ETags self-heal at least this often (Phase 4 D5). */
export const BOARD_MAX_VALIDITY_MS = 10 * MINUTE_MS;

type SessionTimes = { endedAt: number | null; expectedEndAt: number };

/** Open: not ended yet (it may still be expired-but-open). */
export function isOpen(session: Pick<SessionTimes, "endedAt">): boolean {
  return session.endedAt === null;
}

/** Active: open **and** `now < expected_end_at`. Expired-but-open sessions are never active. */
export function isActive(session: SessionTimes, now: number): boolean {
  return session.endedAt === null && now < session.expectedEndAt;
}

/** The latest a session may run to: 240 minutes after it started. */
export function capEnd(startedAt: number): number {
  return startedAt + MAX_SESSION_MINUTES * MINUTE_MS;
}

/** The end after extending by `minutes`, never past the cap. */
export function extendedEnd(session: { startedAt: number; expectedEndAt: number }, minutes: number): number {
  return Math.min(session.expectedEndAt + minutes * MINUTE_MS, capEnd(session.startedAt));
}

/* ----------------------------------------------------------- SQL builders */

/**
 * Close expired-but-open sessions honestly: `ended_at = expected_end_at`,
 * `end_reason = 'expired'` (§4.1). Scope to one machine, one member, or
 * everything (the board poll's global sweep). `guard` adds a condition
 * (e.g. the machine write token) so a refused batch closes nothing.
 */
export function expireSessionsSql(
  now: number,
  scope: { machineId: string } | { memberId: string } | "all",
  guard?: SQL,
): SQL {
  const where =
    scope === "all"
      ? sql``
      : "machineId" in scope
        ? sql` AND "machine_sessions"."machine_id" = ${scope.machineId}`
        : sql` AND "machine_sessions"."member_id" = ${scope.memberId}`;
  return sql`UPDATE machine_sessions SET ended_at = expected_end_at, end_reason = 'expired'
    WHERE "machine_sessions"."ended_at" IS NULL AND "machine_sessions"."expected_end_at" <= ${now}${where}${
      guard ? sql` AND ${guard}` : sql``
    }`;
}

/**
 * The member still holds a valid grant for every certification the machine
 * requires (the same rule as `computePass`, as SQL; §4.2 guarded insert).
 */
export function holdsAllRequirementsSql(machineId: string, memberId: string, now: number): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM "machine_requirements" AS "r"
    WHERE "r"."machine_id" = ${machineId}
      AND NOT EXISTS (SELECT 1 FROM "grants" AS "g"
                      WHERE "g"."member_id" = ${memberId} AND "g"."certification_id" = "r"."certification_id"
                        AND ${validGrantSql(now, "g")}))`;
}

/** The member is still active when the statement runs. */
export function memberActiveSql(memberId: string): SQL {
  return sql`EXISTS (SELECT 1 FROM "members" AS "m" WHERE "m"."id" = ${memberId} AND "m"."status" = 'active')`;
}
