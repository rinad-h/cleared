/**
 * Enum values shared by the schema (TEXT + CHECK), Zod schemas and the UI.
 * Later phases add machine, session, fault and checkup enums here.
 */

export const ROLES = ["admin", "staff", "member"] as const;
export type Role = (typeof ROLES)[number];

export const MEMBER_STATUSES = ["active", "suspended"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];
