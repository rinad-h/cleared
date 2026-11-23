import "server-only";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { certifications, faults, grants, machineRequirements, machineSessions, machines, members, rooms, settings } from "@/db/schema";
import { requireRole } from "@/server/authz";
import type { Actor } from "@/server/domain/actor";
import { buildConsole, consoleEtag, parseConsoleEtag, type ConsoleData } from "@/server/domain/console";
import { ServiceError } from "@/server/domain/errors";
import { readCheckups } from "@/server/services/checkups";
import { expireAllSessions } from "@/server/services/sessions";
import { SETTINGS_ID } from "@/server/version";

export type ConsoleResult =
  | { notModified: true; etag: string }
  | { notModified: false; etag: string; console: ConsoleData };

/** Machines and members with an open session (subqueries keep the reads index-backed and parameter-free). */
const openSessionMachines = sql`(SELECT "machine_sessions"."machine_id" FROM "machine_sessions" WHERE "machine_sessions"."ended_at" IS NULL)`;
const openSessionMembers = sql`(SELECT "machine_sessions"."member_id" FROM "machine_sessions" WHERE "machine_sessions"."ended_at" IS NULL)`;

/**
 * Staff: the console home (FR-17, Phase 6 §4.3).
 *
 * Same scheme as the board: with an `If-None-Match` from this viewer whose
 * `data_version` still matches and whose `validUntil` hasn't passed →
 * `notModified` after one 1-row read. Otherwise the global lazy-expiry sweep,
 * one batch of reads plus the checkup list, and `buildConsole()`.
 */
export async function getConsole(db: Db, actor: Actor, now: number, ifNoneMatch?: string | null): Promise<ConsoleResult> {
  requireRole(actor, "staff");

  const client = parseConsoleEtag(ifNoneMatch);
  if (client && client.memberId === actor.memberId && client.role === actor.role && now < client.validUntil) {
    const row = await db.select({ v: settings.dataVersion }).from(settings).where(eq(settings.id, SETTINGS_ID)).get();
    if (row && row.v === client.dataVersion) {
      return { notModified: true, etag: consoleEtag(row.v, actor.memberId, actor.role, client.validUntil) };
    }
  }

  await expireAllSessions(db, now);

  // Joined columns are aliased: a D1 batch keys rows by column name (technologies.md §16).
  const [reads, checkupList] = await Promise.all([
    db.batch([
      db
        .select({ timezone: settings.timezone, dataVersion: settings.dataVersion })
        .from(settings)
        .where(eq(settings.id, SETTINGS_ID)),
      db
        .select({ machineId: faults.machineId, tookOutOfService: faults.tookOutOfService })
        .from(faults)
        .innerJoin(machines, eq(machines.id, faults.machineId))
        .where(and(eq(faults.status, "open"), ne(machines.status, "retired"))),
      db
        .select({
          id: machines.id,
          name: machines.name,
          roomName: sql<string>`${rooms.name}`.as("oos_room_name"),
          reason: machines.outOfServiceReason,
          statusChangedAt: machines.statusChangedAt,
          note: machines.statusNote,
          expectedBackAt: machines.expectedBackAt,
        })
        .from(machines)
        .innerJoin(rooms, eq(rooms.id, machines.roomId))
        .where(eq(machines.status, "out_of_service")),
      db
        .select({
          id: machineSessions.id,
          memberId: machineSessions.memberId,
          memberName: sql<string>`${members.displayName}`.as("console_member_name"),
          memberStatus: sql<"active" | "suspended">`${members.status}`.as("console_member_status"),
          memberRole: sql<"admin" | "staff" | "member">`${members.role}`.as("console_member_role"),
          machineId: machineSessions.machineId,
          machineName: sql<string>`${machines.name}`.as("console_machine_name"),
          roomName: sql<string>`${rooms.name}`.as("console_room_name"),
          startedAt: machineSessions.startedAt,
          expectedEndAt: machineSessions.expectedEndAt,
          endedAt: machineSessions.endedAt,
          supervisionAcknowledged: machineSessions.supervisionAcknowledged,
        })
        .from(machineSessions)
        .innerJoin(members, eq(members.id, machineSessions.memberId))
        .innerJoin(machines, eq(machines.id, machineSessions.machineId))
        .innerJoin(rooms, eq(rooms.id, machines.roomId))
        .where(isNull(machineSessions.endedAt)),
      db
        .select({
          machineId: machineRequirements.machineId,
          certificationId: machineRequirements.certificationId,
          certificationName: sql<string>`${certifications.name}`.as("console_cert_name"),
        })
        .from(machineRequirements)
        .innerJoin(certifications, eq(certifications.id, machineRequirements.certificationId))
        .where(sql`${machineRequirements.machineId} IN ${openSessionMachines}`),
      db
        .select({
          id: grants.id,
          memberId: grants.memberId,
          certificationId: grants.certificationId,
          grantedAt: grants.grantedAt,
          expiresAt: grants.expiresAt,
          revokedAt: grants.revokedAt,
        })
        .from(grants)
        .where(sql`${grants.memberId} IN ${openSessionMembers}`),
    ]),
    readCheckups(db, now, "lists"),
  ]);
  const [settingsRows, faultRows, oosRows, sessionRows, requirementRows, grantRows] = reads;

  const s = settingsRows[0];
  if (!s) throw new ServiceError("SETUP_NOT_DONE", "This makerspace isn't set up yet.");

  const { data, validUntil } = buildConsole({
    now,
    timezone: s.timezone,
    openFaults: faultRows,
    checkups: checkupList,
    outOfServiceMachines: oosRows,
    openSessions: sessionRows,
    requirements: requirementRows,
    grants: grantRows,
  });
  return { notModified: false, etag: consoleEtag(s.dataVersion, actor.memberId, actor.role, validUntil), console: data };
}
