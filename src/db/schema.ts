import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { MEMBER_STATUSES, ROLES } from "../server/domain/enums";
import { user } from "./auth-schema";

/**
 * Database schema. Conventions (docs/phases/README.md §4.1): TEXT uuid primary
 * keys, INTEGER Unix-ms UTC `*_at` timestamps, INTEGER 0/1 booleans with CHECK,
 * TEXT + CHECK enums. Migrations are additive once the deployment has real data
 * (drizzle/README.md).
 *
 * Imports are relative (not `@/`) because drizzle-kit loads this file in plain Node.
 */

export * from "./auth-schema";

/** Phase 0 baseline: proves the migration pipeline before real tables exist. */
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(","));

/**
 * The makerspace's settings: exactly one row (`id = 'singleton'`), created by
 * first-run Setup. The primary key is what makes Setup succeed only once.
 */
export const settings = sqliteTable(
  "settings",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("America/Edmonton"),
    memberJoinToken: text("member_join_token").notNull().unique(),
    joinTokenRotatedAt: integer("join_token_rotated_at").notNull(),
    /** Bumped by every mutation batch; polling ETags are built from it (technologies.md §12.5). */
    dataVersion: integer("data_version").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("settings_singleton", sql`${t.id} = 'singleton'`),
    check("settings_name_length", sql`length(${t.name}) BETWEEN 2 AND 80`),
  ],
);

/**
 * Membership of the makerspace. Roles and suspension live here, not in Better
 * Auth (PRD 10.2). `email` and `display_name` are copied from `user` at join,
 * so staff search needs no join.
 */
export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    authUserId: text("auth_user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "restrict" }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    status: text("status", { enum: MEMBER_STATUSES }).notNull().default("active"),
    statusChangedAt: integer("status_changed_at"),
    statusChangedByMemberId: text("status_changed_by_member_id").references(
      (): AnySQLiteColumn => members.id,
      { onDelete: "restrict" },
    ),
    suspensionReason: text("suspension_reason"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("members_display_name_length", sql`length(${t.displayName}) BETWEEN 1 AND 80`),
    check("members_role", sql`${t.role} IN (${inList(ROLES)})`),
    check("members_status", sql`${t.status} IN (${inList(MEMBER_STATUSES)})`),
    check(
      "members_suspension_reason_length",
      sql`${t.suspensionReason} IS NULL OR length(${t.suspensionReason}) <= 300`,
    ),
    index("members_role_status").on(t.role, t.status),
    index("members_display_name").on(sql`${t.displayName} COLLATE NOCASE`),
    index("members_email").on(sql`${t.email} COLLATE NOCASE`),
  ],
);
