import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { MACHINE_STATUSES, MEMBER_STATUSES, OUT_OF_SERVICE_REASONS, ROLES } from "../server/domain/enums";
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

/* ------------------------------------------------------------- Phase 2 */

/**
 * Rooms group machines on the board and the label sheet. Names are unique
 * regardless of case (a `COLLATE NOCASE` unique index). Never deleted (Phase 2 Q1).
 */
export const rooms = sqliteTable(
  "rooms",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("rooms_name_length", sql`length(${t.name}) BETWEEN 1 AND 60`),
    uniqueIndex("rooms_name_unique").on(sql`${t.name} COLLATE NOCASE`),
  ],
);

/**
 * Certifications a machine can require (FR-05). `validity_months` null means
 * "never expires". Deactivated, never deleted.
 */
export const certifications = sqliteTable(
  "certifications",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    trainingUrl: text("training_url"),
    validityMonths: integer("validity_months"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("certifications_name_length", sql`length(${t.name}) BETWEEN 2 AND 80`),
    check(
      "certifications_training_url",
      sql`${t.trainingUrl} IS NULL OR (length(${t.trainingUrl}) <= 500 AND (${t.trainingUrl} LIKE 'https://%' OR ${t.trainingUrl} LIKE 'http://%'))`,
    ),
    check(
      "certifications_validity_months",
      sql`${t.validityMonths} IS NULL OR ${t.validityMonths} BETWEEN 1 AND 120`,
    ),
    check("certifications_active", sql`${t.active} IN (0,1)`),
    uniqueIndex("certifications_name_unique").on(sql`${t.name} COLLATE NOCASE`),
  ],
);

/**
 * Machines (FR-04). `qr_token` is created once and never changes (FR-06);
 * `write_token` changes on every write (compare-and-swap, technologies.md §12.2).
 * The out-of-service columns are written from Phase 5.
 */
export const machines = sqliteTable(
  "machines",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    supervised: integer("supervised", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: MACHINE_STATUSES }).notNull().default("available"),
    statusChangedAt: integer("status_changed_at").notNull(),
    outOfServiceReason: text("out_of_service_reason", { enum: OUT_OF_SERVICE_REASONS }),
    statusNote: text("status_note"),
    expectedBackAt: integer("expected_back_at"),
    qrToken: text("qr_token").notNull().unique(),
    typicalSessionMinutes: integer("typical_session_minutes").notNull().default(60),
    writeToken: text("write_token").notNull(),
    retiredAt: integer("retired_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("machines_name_length", sql`length(${t.name}) BETWEEN 1 AND 80`),
    check("machines_supervised", sql`${t.supervised} IN (0,1)`),
    check("machines_status", sql`${t.status} IN (${inList(MACHINE_STATUSES)})`),
    check(
      "machines_out_of_service_reason",
      sql`${t.outOfServiceReason} IS NULL OR ${t.outOfServiceReason} IN (${inList(OUT_OF_SERVICE_REASONS)})`,
    ),
    check("machines_status_note_length", sql`${t.statusNote} IS NULL OR length(${t.statusNote}) <= 200`),
    check("machines_typical_session_minutes", sql`${t.typicalSessionMinutes} BETWEEN 15 AND 240`),
    check(
      "machines_out_of_service_consistent",
      sql`(${t.status} = 'out_of_service') = (${t.outOfServiceReason} IS NOT NULL)`,
    ),
    check("machines_retired_consistent", sql`(${t.status} = 'retired') = (${t.retiredAt} IS NOT NULL)`),
    index("machines_room").on(t.roomId),
    index("machines_status").on(t.status),
    // Unique among non-retired machines: a retired machine's name can be reused (Phase 2 D2).
    uniqueIndex("machines_name_live").on(sql`${t.name} COLLATE NOCASE`).where(sql`status <> 'retired'`),
  ],
);

/** Certifications a machine requires. All of them are required (AND, PRD 7.1). */
export const machineRequirements = sqliteTable(
  "machine_requirements",
  {
    machineId: text("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "restrict" }),
    certificationId: text("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "restrict" }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.machineId, t.certificationId] }),
    index("machine_requirements_cert").on(t.certificationId),
  ],
);

/* ------------------------------------------------------------- Phase 3 */

/**
 * Certification sign-offs (FR-07). Never deleted: revocation fills the three
 * `revoked_*` columns once, and a re-grant is a new row, so the rows are the
 * history (FR-18). Nobody signs themselves off (service check + CHECK backstop).
 * `client_request_id` makes a double-tapped sign-off create one row.
 */
export const grants = sqliteTable(
  "grants",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    certificationId: text("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "restrict" }),
    grantedByMemberId: text("granted_by_member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    grantedAt: integer("granted_at").notNull(),
    expiresAt: integer("expires_at"),
    clientRequestId: text("client_request_id").notNull().unique(),
    revokedAt: integer("revoked_at"),
    revokedByMemberId: text("revoked_by_member_id").references(() => members.id, { onDelete: "restrict" }),
    revokeReason: text("revoke_reason"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check(
      "grants_revoke_reason_length",
      sql`${t.revokeReason} IS NULL OR length(${t.revokeReason}) BETWEEN 3 AND 300`,
    ),
    check("grants_no_self_sign_off", sql`${t.grantedByMemberId} <> ${t.memberId}`),
    check("grants_revoked_by_consistent", sql`(${t.revokedAt} IS NULL) = (${t.revokedByMemberId} IS NULL)`),
    check("grants_revoke_reason_consistent", sql`(${t.revokedAt} IS NULL) = (${t.revokeReason} IS NULL)`),
    check("grants_expiry_after_grant", sql`${t.expiresAt} IS NULL OR ${t.expiresAt} > ${t.grantedAt}`),
    index("grants_member_cert").on(t.memberId, t.certificationId),
  ],
);
