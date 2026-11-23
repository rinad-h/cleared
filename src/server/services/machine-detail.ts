import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { certifications, machineRequirements, machineSessions, machines, members, rooms, settings } from "@/db/schema";
import { MachineIdInput } from "@/lib/schemas/faults";
import { requireRole } from "@/server/authz";
import type { Actor } from "@/server/domain/actor";
import type { MachineStatus, OutOfServiceReason, SessionEndReason } from "@/server/domain/enums";
import { ServiceError } from "@/server/domain/errors";
import { parse } from "@/server/domain/parse";
import { isActive } from "@/server/domain/sessions";
import { readOpenFaults, type FaultItem } from "@/server/services/faults";
import { readServiceHistory, type ServiceHistoryPage } from "@/server/services/service-records";
import { SETTINGS_ID } from "@/server/version";

export type MachineDetail = {
  serverNow: number;
  timezone: string;
  machine: {
    id: string;
    name: string;
    room: { id: string; name: string };
    status: MachineStatus;
    supervised: boolean;
    typicalSessionMinutes: number;
    requirements: { id: string; name: string }[];
    outOfService: { reason: OutOfServiceReason; since: number; note: string | null; expectedBackAt: number | null } | null;
  };
  openFaults: FaultItem[];
  /** The open faults that took the machine out of service (they block "Return to service"). */
  blockingFaultIds: string[];
  activeSession: { id: string; member: { id: string; displayName: string }; startedAt: number; expectedEndAt: number } | null;
  recentSessions: {
    id: string;
    member: { id: string; displayName: string };
    startedAt: number;
    expectedEndAt: number;
    endedAt: number | null;
    endReason: SessionEndReason | null;
    active: boolean;
  }[];
  serviceHistory: ServiceHistoryPage;
  /** Phase 6. */
  checkups: never[];
};

/**
 * Staff: everything the machine detail page shows (Phase 5 §6.2): the
 * machine, its requirements and the last 20 sessions in one read batch, then
 * open faults and the first page of service history.
 */
export async function getMachineDetail(
  db: Db,
  actor: Actor,
  rawInput: { machineId: string; cursor?: string },
  now: number,
): Promise<MachineDetail> {
  requireRole(actor, "staff");
  const { machineId } = parse(MachineIdInput, { machineId: rawInput.machineId });

  const [machineRows, requirementRows, sessionRows] = await db.batch([
    db
      .select({
        id: machines.id,
        name: machines.name,
        roomId: machines.roomId,
        roomName: sql<string>`${rooms.name}`.as("room_name"),
        status: machines.status,
        supervised: machines.supervised,
        typicalSessionMinutes: machines.typicalSessionMinutes,
        statusChangedAt: machines.statusChangedAt,
        reason: machines.outOfServiceReason,
        note: machines.statusNote,
        expectedBackAt: machines.expectedBackAt,
        timezone: sql<string | null>`${settings.timezone}`.as("makerspace_timezone"),
      })
      .from(machines)
      .innerJoin(rooms, eq(rooms.id, machines.roomId))
      .leftJoin(settings, eq(settings.id, SETTINGS_ID))
      .where(eq(machines.id, machineId)),
    db
      .select({ id: certifications.id, name: certifications.name })
      .from(machineRequirements)
      .innerJoin(certifications, eq(certifications.id, machineRequirements.certificationId))
      .where(eq(machineRequirements.machineId, machineId))
      .orderBy(asc(sql`${certifications.name} COLLATE NOCASE`)),
    db
      .select({
        id: machineSessions.id,
        // Aliased: a D1 batch keys rows by column name, and both tables have "id".
        memberId: sql<string>`${members.id}`.as("session_member_id"),
        memberName: sql<string>`${members.displayName}`.as("session_member_name"),
        startedAt: machineSessions.startedAt,
        expectedEndAt: machineSessions.expectedEndAt,
        endedAt: machineSessions.endedAt,
        endReason: machineSessions.endReason,
      })
      .from(machineSessions)
      .innerJoin(members, eq(members.id, machineSessions.memberId))
      .where(eq(machineSessions.machineId, machineId))
      .orderBy(desc(machineSessions.startedAt), asc(machineSessions.id))
      .limit(20),
  ]);
  const m = machineRows[0];
  if (!m) throw new ServiceError("NOT_FOUND", "That machine doesn't exist.");

  const [openFaults, serviceHistory] = await Promise.all([
    readOpenFaults(db, now, machineId),
    readServiceHistory(db, machineId, { cursor: rawInput.cursor }),
  ]);

  const recentSessions = sessionRows.map((s) => {
    const active = isActive(s, now);
    const lapsed = s.endedAt === null && !active;
    return {
      id: s.id,
      member: { id: s.memberId, displayName: s.memberName },
      startedAt: s.startedAt,
      expectedEndAt: s.expectedEndAt,
      endedAt: lapsed ? s.expectedEndAt : s.endedAt,
      endReason: lapsed ? ("expired" as const) : s.endReason,
      active,
    };
  });
  const active = recentSessions.find((s) => s.active) ?? null;

  return {
    serverNow: now,
    timezone: m.timezone ?? "UTC",
    machine: {
      id: m.id,
      name: m.name,
      room: { id: m.roomId, name: m.roomName },
      status: m.status,
      supervised: m.supervised,
      typicalSessionMinutes: m.typicalSessionMinutes,
      requirements: requirementRows,
      outOfService:
        m.status === "out_of_service" && m.reason
          ? { reason: m.reason, since: m.statusChangedAt, note: m.note, expectedBackAt: m.expectedBackAt }
          : null,
    },
    openFaults,
    blockingFaultIds: openFaults.filter((f) => f.tookOutOfService).map((f) => f.id),
    activeSession: active
      ? { id: active.id, member: active.member, startedAt: active.startedAt, expectedEndAt: active.expectedEndAt }
      : null,
    recentSessions,
    serviceHistory,
    checkups: [],
  };
}

/** Active staff and admins (the "Other staff" choice on the log-service form). */
export async function listStaff(db: Db, actor: Actor): Promise<{ id: string; displayName: string }[]> {
  requireRole(actor, "staff");
  return db
    .select({ id: members.id, displayName: members.displayName })
    .from(members)
    .where(and(eq(members.status, "active"), sql`${members.role} IN ('admin','staff')`))
    .orderBy(asc(sql`${members.displayName} COLLATE NOCASE`))
    .all();
}
