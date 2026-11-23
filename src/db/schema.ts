import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Database schema. Conventions (docs/phases/README.md §4.1): TEXT uuid primary
 * keys, INTEGER Unix-ms UTC `*_at` timestamps, INTEGER 0/1 booleans with CHECK,
 * TEXT + CHECK enums. Migrations are additive once production has data
 * (drizzle/README.md).
 */

/** Phase 0 baseline: proves the migration pipeline before real tables exist. */
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
