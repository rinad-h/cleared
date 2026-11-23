/**
 * Data builders, written straight to the test D1 (no permission checks):
 *   const room = await seed.room();
 *   const cert = await seed.cert({ validityMonths: 12 });
 *   const laser = await seed.machine({ room, requires: [cert], supervised: true });
 *   await seed.grant(member, cert, { by: staff, expiresAt: T0 + DAY })
 *   await seed.session(member, laser, { startedAt: T0, minutes: 60 })
 * Faults and service records are made through the real services (Phase 5).
 */
import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { certifications, grants, machineRequirements, machineSessions, machines, rooms } from "@/db/schema";
import type { SessionEndReason } from "@/server/domain/enums";
import type { MemberActor } from "@/server/domain/actor";
import { newToken } from "@/server/domain/identity";
import { testDb } from "./db";
import { T0 } from "./time";

let counter = 0;
const next = () => (++counter).toString(36) + crypto.randomUUID().slice(0, 4);

export type SeededRoom = { id: string; name: string };
export type SeededCert = { id: string; name: string; validityMonths: number | null; active: boolean };
export type SeededMachine = {
  id: string;
  name: string;
  roomId: string;
  qrToken: string;
  writeToken: string;
  supervised: boolean;
};

async function room({ name, sortOrder = 0, db = testDb() }: { name?: string; sortOrder?: number; db?: Db } = {}) {
  const row = { id: crypto.randomUUID(), name: name ?? `Room ${next()}`, sortOrder, createdAt: T0, updatedAt: T0 };
  await db.insert(rooms).values(row);
  return { id: row.id, name: row.name } satisfies SeededRoom;
}

async function cert({
  name,
  validityMonths = null,
  trainingUrl = null,
  active = true,
  db = testDb(),
}: { name?: string; validityMonths?: number | null; trainingUrl?: string | null; active?: boolean; db?: Db } = {}) {
  const row = {
    id: crypto.randomUUID(),
    name: name ?? `Cert ${next()}`,
    trainingUrl,
    validityMonths,
    active,
    createdAt: T0,
    updatedAt: T0,
  };
  await db.insert(certifications).values(row);
  return { id: row.id, name: row.name, validityMonths, active } satisfies SeededCert;
}

async function machine({
  room: inRoom,
  name,
  requires = [],
  supervised = false,
  typicalSessionMinutes = 60,
  retired = false,
  db = testDb(),
}: {
  room?: SeededRoom;
  name?: string;
  requires?: { id: string }[];
  supervised?: boolean;
  typicalSessionMinutes?: number;
  retired?: boolean;
  db?: Db;
} = {}) {
  const r = inRoom ?? (await room({ db }));
  const row = {
    id: crypto.randomUUID(),
    roomId: r.id,
    name: name ?? `Machine ${next()}`,
    supervised,
    status: retired ? ("retired" as const) : ("available" as const),
    statusChangedAt: T0,
    qrToken: newToken(),
    typicalSessionMinutes,
    writeToken: newToken(),
    retiredAt: retired ? T0 : null,
    createdAt: T0,
    updatedAt: T0,
  };
  await db.insert(machines).values(row);
  if (requires.length > 0) {
    await db
      .insert(machineRequirements)
      .values(requires.map((c) => ({ machineId: row.id, certificationId: c.id, createdAt: T0 })));
  }
  return {
    id: row.id,
    name: row.name,
    roomId: r.id,
    qrToken: row.qrToken,
    writeToken: row.writeToken,
    supervised,
  } satisfies SeededMachine;
}

/**
 * A grant written straight to the table. `by` defaults to a fresh staff
 * member (nobody signs themselves off: the CHECK would refuse it).
 */
async function grant(
  member: Pick<MemberActor, "memberId">,
  certification: { id: string },
  {
    by,
    grantedAt = T0,
    expiresAt = null,
    revokedAt = null,
    revokedBy,
    revokeReason = "Seeded revoke",
    db = testDb(),
  }: {
    by: Pick<MemberActor, "memberId">;
    grantedAt?: number;
    expiresAt?: number | null;
    revokedAt?: number | null;
    revokedBy?: Pick<MemberActor, "memberId">;
    revokeReason?: string;
    db?: Db;
  },
) {
  const row = {
    id: crypto.randomUUID(),
    memberId: member.memberId,
    certificationId: certification.id,
    grantedByMemberId: by.memberId,
    grantedAt,
    expiresAt,
    clientRequestId: crypto.randomUUID(),
    revokedAt,
    revokedByMemberId: revokedAt === null ? null : (revokedBy ?? by).memberId,
    revokeReason: revokedAt === null ? null : revokeReason,
    createdAt: grantedAt,
  };
  await db.insert(grants).values(row);
  return row;
}

/** A session written straight to the table (open unless `endedAt` is given). */
async function session(
  member: Pick<MemberActor, "memberId">,
  onMachine: { id: string },
  {
    startedAt = T0,
    minutes = 60,
    endedAt = null,
    endReason = null,
    db = testDb(),
  }: { startedAt?: number; minutes?: number; endedAt?: number | null; endReason?: SessionEndReason | null; db?: Db } = {},
) {
  const row = {
    id: crypto.randomUUID(),
    machineId: onMachine.id,
    memberId: member.memberId,
    startedAt,
    expectedEndAt: startedAt + minutes * 60_000,
    endedAt,
    endReason: endedAt === null ? null : (endReason ?? "user"),
    clientRequestId: crypto.randomUUID(),
    createdAt: startedAt,
  };
  await db.insert(machineSessions).values(row);
  return row;
}

export const seed = { room, cert, machine, grant, session };

/**
 * Empty faults and the append-only service history. The triggers that block
 * DELETE are dropped and recreated in the same batch (tests only).
 */
export function resetFaultsStatements(db: Db) {
  return [
    db.run(sql`DELETE FROM faults`),
    db.run(sql`DROP TRIGGER IF EXISTS service_records_no_delete`),
    // Corrections first: the self-reference is ON DELETE RESTRICT (checked per row).
    db.run(sql`DELETE FROM service_records WHERE corrects_record_id IS NOT NULL`),
    db.run(sql`DELETE FROM service_records`),
    db.run(sql`DELETE FROM checkups`),
    db.run(sql`CREATE TRIGGER service_records_no_delete BEFORE DELETE ON service_records
      BEGIN SELECT RAISE(ABORT, 'service_records are append-only'); END`),
  ] as const;
}

/** Empty the catalog tables (test files share one D1, so specs reset between tests). */
export async function resetCatalog(db: Db = testDb()) {
  await db.batch([
    ...resetFaultsStatements(db),
    db.run(sql`DELETE FROM machine_sessions`),
    db.run(sql`DELETE FROM grants`),
    db.run(sql`DELETE FROM machine_requirements`),
    db.run(sql`DELETE FROM machines`),
    db.run(sql`DELETE FROM certifications`),
    db.run(sql`DELETE FROM rooms`),
  ]);
}
