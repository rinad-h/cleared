import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { certifications, grants, machineRequirements, machineSessions, machines, members } from "@/db/schema";
import { MemberDetailInput } from "@/lib/schemas/grants";
import { EndSessionInput, ExtendSessionInput, StartSessionInput } from "@/lib/schemas/sessions";
import { requireMember, requireRole } from "@/server/authz";
import { enforceRateLimit, type RateLimitOptions } from "@/server/rate-limit";
import { batch } from "@/server/batch";
import { isUniqueViolation } from "@/server/db-errors";
import type { Actor, MemberActor } from "@/server/domain/actor";
import type { SessionEndReason } from "@/server/domain/enums";
import { ServiceError } from "@/server/domain/errors";
import { parse } from "@/server/domain/parse";
import { computePass, type PassResult } from "@/server/domain/pass";
import {
  capEnd,
  expireSessionsSql,
  extendedEnd,
  holdsAllRequirementsSql,
  isActive,
  memberActiveSql,
  MINUTE_MS,
} from "@/server/domain/sessions";
import { withMachineWrite, type MachineWriteOptions } from "@/server/machine-write";
import { viewerOf } from "@/server/services/pass";
import { bumpVersion, SETTINGS_ID } from "@/server/version";

/* ------------------------------------------------------------------ types */

export type MachineSession = {
  id: string;
  machineId: string;
  memberId: string;
  startedAt: number;
  expectedEndAt: number;
  endedAt: number | null;
  endReason: SessionEndReason | null;
  endedByMemberId: string | null;
  supervisionAcknowledged: boolean;
};

/** A session in a list (My certifications, member detail). Open-but-expired rows read as ended at their expected end. */
export type SessionListItem = {
  id: string;
  machineId: string;
  machineName: string;
  startedAt: number;
  expectedEndAt: number;
  /** null while active. */
  endedAt: number | null;
  endReason: SessionEndReason | null;
  active: boolean;
};

const sessionColumns = {
  id: machineSessions.id,
  machineId: machineSessions.machineId,
  memberId: machineSessions.memberId,
  startedAt: machineSessions.startedAt,
  expectedEndAt: machineSessions.expectedEndAt,
  endedAt: machineSessions.endedAt,
  endReason: machineSessions.endReason,
  endedByMemberId: machineSessions.endedByMemberId,
  supervisionAcknowledged: machineSessions.supervisionAcknowledged,
};

const readSession = (db: Db, id: string) =>
  db.select(sessionColumns).from(machineSessions).where(eq(machineSessions.id, id)).get();

const iso = (ms: number) => new Date(ms).toISOString();

const busy = (session: { startedAt: number; expectedEndAt: number }) =>
  new ServiceError("MACHINE_BUSY", "Someone just started a session on this machine.", undefined, {
    since: iso(session.startedAt),
    estFreeAt: iso(session.expectedEndAt),
  });

const notCleared = (pass: PassResult) =>
  new ServiceError("NOT_CLEARED", "You aren't cleared to use this machine.", undefined, { passStatus: pass.status });

/**
 * The pass for `member` on `machineId`, from the current rows: requirements,
 * the member's grants for them, and the machine's open sessions (one batch).
 */
async function passFor(db: Db, actor: MemberActor, machine: { id: string; status: "available" | "out_of_service"; supervised: boolean }, now: number) {
  const [requirements, grantRows, open] = await db.batch([
    db
      .select({ id: certifications.id, name: certifications.name, trainingUrl: certifications.trainingUrl })
      .from(machineRequirements)
      .innerJoin(certifications, eq(certifications.id, machineRequirements.certificationId))
      .where(eq(machineRequirements.machineId, machine.id)),
    db
      .select({
        id: grants.id,
        certificationId: grants.certificationId,
        grantedAt: grants.grantedAt,
        expiresAt: grants.expiresAt,
        revokedAt: grants.revokedAt,
      })
      .from(grants)
      .where(
        and(
          eq(grants.memberId, actor.memberId),
          inArray(
            grants.certificationId,
            db
              .select({ id: machineRequirements.certificationId })
              .from(machineRequirements)
              .where(eq(machineRequirements.machineId, machine.id)),
          ),
        ),
      ),
    db
      .select(sessionColumns)
      .from(machineSessions)
      .where(and(eq(machineSessions.machineId, machine.id), isNull(machineSessions.endedAt))),
  ]);
  const pass = computePass({
    now,
    machine: { status: machine.status, supervised: machine.supervised },
    requirements,
    viewer: viewerOf(actor),
    grants: grantRows,
  });
  return { pass, active: open.find((s) => isActive(s, now)) ?? null };
}

/* ------------------------------------------------------------------ start */

/**
 * A member starts a session on a machine (FR-10, Phase 4 §4.2). Checks the
 * pass, supervision acknowledgement and whether the machine is free, then
 * writes through the machine write token with a guarded insert that re-checks
 * the member's status and grants atomically. Idempotent on `clientRequestId`.
 */
export async function startSession(
  db: Db,
  actor: Actor,
  rawInput: StartSessionInput,
  now: number,
  options?: MachineWriteOptions & RateLimitOptions,
): Promise<{ session: MachineSession; created: boolean }> {
  requireMember(actor);
  const input = parse(StartSessionInput, rawInput);
  await enforceRateLimit(options?.limiter, `start:${actor.memberId}`, now);

  const replay = async () => {
    const existing = await db
      .select(sessionColumns)
      .from(machineSessions)
      .where(eq(machineSessions.clientRequestId, input.clientRequestId))
      .get();
    if (!existing) return null;
    if (existing.memberId !== actor.memberId || existing.machineId !== input.machineId) {
      throw new ServiceError("IDEMPOTENCY_MISMATCH", "That request was already used. Reload and try again.");
    }
    return { session: existing, created: false };
  };
  const previous = await replay();
  if (previous) return previous;

  const id = crypto.randomUUID();
  const ack = input.supervisionAcknowledged === true;
  try {
    await withMachineWrite(
      db,
      input.machineId,
      now,
      async (machine) => {
        if (machine.status === "retired") {
          throw new ServiceError("MACHINE_RETIRED", "This machine is retired.");
        }
        if (machine.status === "out_of_service") {
          throw new ServiceError("MACHINE_OUT_OF_SERVICE", "This machine is out of service.");
        }
        const { pass, active } = await passFor(db, actor, { id: machine.id, status: machine.status, supervised: machine.supervised }, now);
        if (pass.status !== "CLEARED" && pass.status !== "SUPERVISION_REQUIRED") throw notCleared(pass);
        if (pass.status === "SUPERVISION_REQUIRED" && !ack) {
          throw new ServiceError(
            "SUPERVISION_ACK_REQUIRED",
            "Confirm that a supervisor is present before you start.",
            { supervisionAcknowledged: ["Confirm that a supervisor is present."] },
          );
        }
        if (active) {
          if (active.memberId === actor.memberId) {
            throw new ServiceError("ALREADY_IN_SESSION", "You already have a session on this machine.", undefined, {
              sessionId: active.id,
            });
          }
          throw busy(active);
        }

        const minutes = input.expectedMinutes ?? machine.typicalSessionMinutes;
        const end = now + minutes * MINUTE_MS;
        return {
          where: eq(machines.status, "available"),
          guarded: (guard) => [
            sql`INSERT INTO machine_sessions (id, machine_id, member_id, started_at, expected_end_at,
                  supervision_acknowledged, client_request_id, created_at)
                SELECT ${id}, ${machine.id}, ${actor.memberId}, ${now}, ${end}, ${ack ? 1 : 0}, ${input.clientRequestId}, ${now}
                WHERE ${guard}
                  AND EXISTS (SELECT 1 FROM "machines" WHERE "machines"."id" = ${machine.id} AND "machines"."status" = 'available')
                  AND ${memberActiveSql(actor.memberId)}
                  AND ${holdsAllRequirementsSql(machine.id, actor.memberId, now)}`,
          ],
          result: undefined,
        };
      },
      options,
    );
  } catch (err) {
    if (isUniqueViolation(err, "machine_sessions.client_request_id")) {
      const raced = await replay();
      if (raced) return raced;
    }
    if (isUniqueViolation(err, "machine_sessions.machine_id", "machine_sessions_one_open")) {
      const open = await db
        .select(sessionColumns)
        .from(machineSessions)
        .where(and(eq(machineSessions.machineId, input.machineId), isNull(machineSessions.endedAt)))
        .get();
      throw busy(open ?? { startedAt: now, expectedEndAt: now });
    }
    throw err;
  }

  const session = await readSession(db, id);
  // The token swap won but the guarded insert refused: a grant was revoked or
  // expired, or the member was suspended, between the read and the write.
  if (!session) {
    throw new ServiceError("PASS_CHANGED", "Your pass changed. Check it and try again.");
  }
  return { session, created: true };
}

/* ----------------------------------------------------------------- extend */

/**
 * The owner extends an active session (Phase 4 §4.3), never past 240 minutes
 * from the start. Only while the member is still cleared (D2).
 */
export async function extendSession(
  db: Db,
  actor: Actor,
  rawInput: ExtendSessionInput,
  now: number,
): Promise<{ session: MachineSession }> {
  requireMember(actor);
  const input = parse(ExtendSessionInput, rawInput);
  const session = await readSession(db, input.sessionId);
  if (!session) throw new ServiceError("NOT_FOUND", "That session doesn't exist.");
  if (session.memberId !== actor.memberId) {
    throw new ServiceError("FORBIDDEN", "Only the person using the machine can extend this session.");
  }
  if (!isActive(session, now)) throw new ServiceError("SESSION_ENDED", "This session has already ended.");

  const machine = await db
    .select({ id: machines.id, status: machines.status, supervised: machines.supervised })
    .from(machines)
    .where(eq(machines.id, session.machineId))
    .get();
  if (!machine || machine.status === "retired") throw new ServiceError("SESSION_ENDED", "This session has already ended.");
  const { pass } = await passFor(db, actor, { id: machine.id, status: machine.status, supervised: machine.supervised }, now);
  if (pass.status !== "CLEARED" && pass.status !== "SUPERVISION_REQUIRED") throw notCleared(pass);

  if (session.expectedEndAt >= capEnd(session.startedAt)) {
    throw new ServiceError("SESSION_AT_MAX", "Sessions can last at most 4 hours. Start a new one if you need more time.");
  }
  const newEnd = extendedEnd(session, input.minutes);

  const [updated] = await batch(db, [
    sql`UPDATE machine_sessions SET expected_end_at = ${newEnd}
        WHERE "machine_sessions"."id" = ${session.id} AND "machine_sessions"."member_id" = ${actor.memberId}
          AND "machine_sessions"."ended_at" IS NULL AND "machine_sessions"."expected_end_at" > ${now}
          AND EXISTS (SELECT 1 FROM "machines" WHERE "machines"."id" = ${machine.id} AND "machines"."status" = 'available')
          AND ${memberActiveSql(actor.memberId)}
          AND ${holdsAllRequirementsSql(machine.id, actor.memberId, now)}`,
    sql`UPDATE settings SET data_version = data_version + 1
        WHERE id = ${SETTINGS_ID} AND EXISTS (SELECT 1 FROM "machine_sessions"
          WHERE "machine_sessions"."id" = ${session.id} AND "machine_sessions"."expected_end_at" = ${newEnd}
            AND "machine_sessions"."ended_at" IS NULL)`,
  ]);

  const after = await readSession(db, session.id);
  if (!after) throw new ServiceError("NOT_FOUND", "That session doesn't exist.");
  if (updated.meta.changes === 0) {
    if (!isActive(after, now)) throw new ServiceError("SESSION_ENDED", "This session has already ended.");
    throw new ServiceError("PASS_CHANGED", "Your pass changed. Check it and try again.");
  }
  return { session: after };
}

/* -------------------------------------------------------------------- end */

/**
 * End a session (Phase 4 §4.4). The owner ends their own (`user`); staff and
 * admins may end anyone's (`staff`, with `ended_by`). Idempotent: an ended
 * session is returned unchanged. An expired-but-open session is closed as
 * `expired` at its expected end, which is what really happened (D3).
 */
export async function endSession(
  db: Db,
  actor: Actor,
  rawInput: EndSessionInput,
  now: number,
): Promise<{ session: MachineSession }> {
  requireMember(actor);
  const input = parse(EndSessionInput, rawInput);
  const session = await readSession(db, input.sessionId);
  if (!session) throw new ServiceError("NOT_FOUND", "That session doesn't exist.");
  const mine = session.memberId === actor.memberId;
  if (!mine && actor.role === "member") {
    throw new ServiceError("FORBIDDEN", "Only staff can end someone else's session.");
  }
  if (session.endedAt !== null) return { session };

  const expired = session.expectedEndAt <= now;
  const endedAt = expired ? session.expectedEndAt : now;
  const reason: SessionEndReason = expired ? "expired" : mine ? "user" : "staff";
  const endedBy = expired ? null : actor.memberId;
  const staffGuard = mine
    ? sql`1`
    : sql`EXISTS (SELECT 1 FROM "members" AS "actor"
        WHERE "actor"."id" = ${actor.memberId} AND "actor"."status" = 'active' AND "actor"."role" IN ('admin','staff'))`;

  const [updated] = await batch(db, [
    sql`UPDATE machine_sessions SET ended_at = ${endedAt}, end_reason = ${reason}, ended_by_member_id = ${endedBy}
        WHERE "machine_sessions"."id" = ${session.id} AND "machine_sessions"."ended_at" IS NULL AND ${staffGuard}`,
    sql`UPDATE settings SET data_version = data_version + 1
        WHERE id = ${SETTINGS_ID} AND EXISTS (SELECT 1 FROM "machine_sessions"
          WHERE "machine_sessions"."id" = ${session.id} AND "machine_sessions"."ended_at" = ${endedAt}
            AND "machine_sessions"."end_reason" = ${reason})`,
  ]);

  const after = await readSession(db, session.id);
  if (!after) throw new ServiceError("NOT_FOUND", "That session doesn't exist.");
  if (updated.meta.changes === 0 && after.endedAt === null) {
    throw new ServiceError("FORBIDDEN", "Your access changed. Reload the page.");
  }
  return { session: after };
}

/* ----------------------------------------------------------- lazy expiry */

/**
 * The global sweep (§4.1): close every expired-but-open session. Run by the
 * board and console polls when the ETag check misses. Bumps `data_version`
 * only if it closed something. Returns how many it closed.
 */
export async function expireAllSessions(db: Db, now: number): Promise<number> {
  const [result] = await batch(db, [expireSessionsSql(now, "all")]);
  const closed = result.meta.changes ?? 0;
  if (closed > 0) await bumpVersion(db);
  return closed;
}

/* ------------------------------------------------------------------ reads */

async function sessionList(db: Db, memberId: string, now: number, limit: number): Promise<SessionListItem[]> {
  const rows = await db
    .select({
      id: machineSessions.id,
      machineId: machineSessions.machineId,
      machineName: machines.name,
      startedAt: machineSessions.startedAt,
      expectedEndAt: machineSessions.expectedEndAt,
      endedAt: machineSessions.endedAt,
      endReason: machineSessions.endReason,
    })
    .from(machineSessions)
    .innerJoin(machines, eq(machines.id, machineSessions.machineId))
    .where(eq(machineSessions.memberId, memberId))
    .orderBy(desc(machineSessions.startedAt), asc(machineSessions.id))
    .limit(limit)
    .all();
  return rows.map((r) => {
    const active = isActive(r, now);
    // Not closed yet but past its expected end: show what lazy expiry will record.
    const lapsed = r.endedAt === null && !active;
    return {
      ...r,
      endedAt: lapsed ? r.expectedEndAt : r.endedAt,
      endReason: lapsed ? "expired" : r.endReason,
      active,
    };
  });
}

/** A member: their last 10 sessions (FR-18, My certifications). Computes "active"; closes nothing. */
export async function getMyRecentSessions(db: Db, actor: Actor, now: number): Promise<{ recentSessions: SessionListItem[] }> {
  requireMember(actor);
  return { recentSessions: await sessionList(db, actor.memberId, now, 10) };
}

/** Staff: a member's last 20 sessions and the ones active now (member detail). */
export async function getMemberSessions(
  db: Db,
  actor: Actor,
  rawInput: MemberDetailInput,
  now: number,
): Promise<{ recentSessions: SessionListItem[]; activeSessions: SessionListItem[] }> {
  requireRole(actor, "staff");
  const { memberId } = parse(MemberDetailInput, rawInput);
  const exists = await db.select({ id: members.id }).from(members).where(eq(members.id, memberId)).get();
  if (!exists) throw new ServiceError("NOT_FOUND", "That member doesn't exist.");
  const recentSessions = await sessionList(db, memberId, now, 20);
  return { recentSessions, activeSessions: recentSessions.filter((s) => s.active) };
}

/* -------------------------------------------- effects used by other services */

/**
 * End a member's **active** sessions because their authorization was removed
 * (FR-08): `authorization_removed`, ended by the actor. `scope` picks the
 * machines (those requiring a certification, or all). `guard` must only hold
 * if the removing write happened. Callers first close the member's
 * expired-but-open sessions with `expireSessionsSql(now, { memberId })`.
 */
export function endSessionsForAuthorizationSql(
  memberId: string,
  actorMemberId: string,
  now: number,
  scope: { certificationId: string } | "all",
  guard: SQL,
): SQL {
  const certScope =
    scope === "all"
      ? sql``
      : sql` AND "machine_sessions"."machine_id" IN (SELECT "mr"."machine_id" FROM "machine_requirements" AS "mr"
              WHERE "mr"."certification_id" = ${scope.certificationId})`;
  return sql`UPDATE machine_sessions SET ended_at = ${now}, end_reason = 'authorization_removed', ended_by_member_id = ${actorMemberId}
    WHERE "machine_sessions"."member_id" = ${memberId} AND "machine_sessions"."ended_at" IS NULL
      AND "machine_sessions"."expected_end_at" > ${now}${certScope} AND ${guard}`;
}

/** For retire: end the machine's active session as `staff`, guarded by the machine write token. */
export function endMachineSessionsSql(machineId: string, actorMemberId: string, now: number, guard: SQL) {
  return sql`UPDATE machine_sessions SET ended_at = ${now}, end_reason = 'staff', ended_by_member_id = ${actorMemberId}
    WHERE "machine_sessions"."machine_id" = ${machineId} AND "machine_sessions"."ended_at" IS NULL
      AND "machine_sessions"."expected_end_at" > ${now} AND ${guard}`;
}
