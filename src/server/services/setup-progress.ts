import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { requireRole } from "@/server/authz";
import type { Actor } from "@/server/domain/actor";

export type SetupProgress = { rooms: number; certifications: number; machines: number };

/**
 * Staff: counts behind the Journey A setup checklist on the console home
 * (temporary until Phase 6 builds the full home). One read.
 */
export async function getSetupProgress(db: Db, actor: Actor): Promise<SetupProgress> {
  requireRole(actor, "staff");
  const row = await db.get<SetupProgress>(sql`SELECT
      (SELECT COUNT(*) FROM rooms) AS rooms,
      (SELECT COUNT(*) FROM certifications WHERE active = 1) AS certifications,
      (SELECT COUNT(*) FROM machines WHERE status <> 'retired') AS machines`);
  return { rooms: Number(row.rooms), certifications: Number(row.certifications), machines: Number(row.machines) };
}
