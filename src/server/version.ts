import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { settings } from "@/db/schema";

export const SETTINGS_ID = "singleton";

/**
 * `UPDATE settings SET data_version = data_version + 1`: include it in every
 * mutation batch so polling ETags change (technologies.md §12.5, AGENTS.md rule 8).
 */
export function bumpVersion(db: Db) {
  return db
    .update(settings)
    .set({ dataVersion: sql`${settings.dataVersion} + 1` })
    .where(eq(settings.id, SETTINGS_ID));
}
