/**
 * Data builders, written straight to the test D1 (no permission checks):
 *   const room = await seed.room();
 *   const cert = await seed.cert({ validityMonths: 12 });
 *   const laser = await seed.machine({ room, requires: [cert], supervised: true });
 * Later phases add `seed.grant(member, cert, { expiresAt })`, …
 */
import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { certifications, machineRequirements, machines, rooms } from "@/db/schema";
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

export const seed = { room, cert, machine };

/** Empty the catalog tables (test files share one D1, so specs reset between tests). */
export async function resetCatalog(db: Db = testDb()) {
  await db.batch([
    db.run(sql`DELETE FROM machine_requirements`),
    db.run(sql`DELETE FROM machines`),
    db.run(sql`DELETE FROM certifications`),
    db.run(sql`DELETE FROM rooms`),
  ]);
}
