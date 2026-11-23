/**
 * Enum values shared by the schema (TEXT + CHECK), Zod schemas and the UI.
 * Later phases add session, fault and checkup enums here.
 */

export const ROLES = ["admin", "staff", "member"] as const;
export type Role = (typeof ROLES)[number];

export const MEMBER_STATUSES = ["active", "suspended"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const MACHINE_STATUSES = ["available", "out_of_service", "retired"] as const;
export type MachineStatus = (typeof MACHINE_STATUSES)[number];

/** Why a machine is out of service. Written from Phase 5. */
export const OUT_OF_SERVICE_REASONS = ["issue_reported", "maintenance", "other"] as const;
export type OutOfServiceReason = (typeof OUT_OF_SERVICE_REASONS)[number];

/** The typical session lengths offered by the machine form (minutes, 15–240). */
export const SESSION_LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240] as const;
