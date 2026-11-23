import "server-only";
import { asc, eq, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { grants, machineRequirements, machineSessions, machines, rooms, settings } from "@/db/schema";
import { requireMember } from "@/server/authz";
import type { Actor } from "@/server/domain/actor";
import { boardEtag, buildBoard, parseBoardEtag, type StatusBoard } from "@/server/domain/board";
import { ServiceError } from "@/server/domain/errors";
import { viewerOf } from "@/server/services/pass";
import { expireAllSessions } from "@/server/services/sessions";
import { SETTINGS_ID } from "@/server/version";

export type BoardResult =
  | { notModified: true; etag: string }
  | { notModified: false; etag: string; board: StatusBoard };

/**
 * Active members: the status board (FR-11, Phase 4 §4.6–4.7).
 *
 * With an `If-None-Match` from this viewer whose `data_version` still matches
 * and whose `validUntil` hasn't passed → `notModified` after one 1-row read.
 * Otherwise: the global lazy-expiry sweep, then one batch of reads and
 * `buildBoard()`. A forged ETag only makes the forger's own board stale.
 */
export async function getStatusBoard(db: Db, actor: Actor, now: number, ifNoneMatch?: string | null): Promise<BoardResult> {
  requireMember(actor);

  const client = parseBoardEtag(ifNoneMatch);
  if (client && client.memberId === actor.memberId && client.role === actor.role && now < client.validUntil) {
    const row = await db.select({ v: settings.dataVersion }).from(settings).where(eq(settings.id, SETTINGS_ID)).get();
    if (row && row.v === client.dataVersion) {
      return { notModified: true, etag: boardEtag(row.v, actor.memberId, actor.role, client.validUntil) };
    }
  }

  await expireAllSessions(db, now);

  const [settingsRows, roomRows, machineRows, requirementRows, sessionRows, grantRows] = await db.batch([
    db
      .select({ name: settings.name, timezone: settings.timezone, dataVersion: settings.dataVersion })
      .from(settings)
      .where(eq(settings.id, SETTINGS_ID)),
    db
      .select({ id: rooms.id, name: rooms.name })
      .from(rooms)
      .orderBy(asc(rooms.sortOrder), asc(sql`${rooms.name} COLLATE NOCASE`)),
    db
      .select({
        id: machines.id,
        roomId: machines.roomId,
        name: machines.name,
        status: machines.status,
        supervised: machines.supervised,
        statusChangedAt: machines.statusChangedAt,
        outOfServiceReason: machines.outOfServiceReason,
        statusNote: machines.statusNote,
        expectedBackAt: machines.expectedBackAt,
      })
      .from(machines)
      .where(ne(machines.status, "retired")),
    db
      .select({ machineId: machineRequirements.machineId, certificationId: machineRequirements.certificationId })
      .from(machineRequirements),
    db
      .select({
        machineId: machineSessions.machineId,
        startedAt: machineSessions.startedAt,
        expectedEndAt: machineSessions.expectedEndAt,
        endedAt: machineSessions.endedAt,
      })
      .from(machineSessions)
      .where(isNull(machineSessions.endedAt)),
    db
      .select({
        id: grants.id,
        certificationId: grants.certificationId,
        grantedAt: grants.grantedAt,
        expiresAt: grants.expiresAt,
        revokedAt: grants.revokedAt,
      })
      .from(grants)
      .where(eq(grants.memberId, actor.memberId)),
  ]);

  const s = settingsRows[0];
  if (!s) throw new ServiceError("SETUP_NOT_DONE", "This makerspace isn't set up yet.");

  const { board, validUntil } = buildBoard({
    now,
    makerspace: { name: s.name, timezone: s.timezone },
    rooms: roomRows,
    machines: machineRows,
    requirements: requirementRows,
    openSessions: sessionRows,
    viewer: viewerOf(actor),
    grants: grantRows,
  });
  return { notModified: false, etag: boardEtag(s.dataVersion, actor.memberId, actor.role, validUntil), board };
}
