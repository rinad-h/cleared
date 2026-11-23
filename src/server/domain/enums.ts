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

/** Why a machine session ended (Phase 4). `machine_down` is written from Phase 5. */
export const SESSION_END_REASONS = ["user", "staff", "expired", "machine_down", "authorization_removed"] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

/** Fault lifecycle (Phase 5). */
export const FAULT_STATUSES = ["open", "resolved"] as const;
export type FaultStatus = (typeof FAULT_STATUSES)[number];

/** Service record types (FR-15). */
export const SERVICE_TYPES = ["repair", "scheduled_checkup", "inspection", "cleaning", "calibration", "other"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

/** Service record outcomes (FR-15). `returned_to_service` is the only one that can change the machine's status. */
export const SERVICE_OUTCOMES = ["returned_to_service", "still_out_of_service", "passed", "issues_found"] as const;
export type ServiceOutcome = (typeof SERVICE_OUTCOMES)[number];

/** Reasons staff pick when they take a machine out of service themselves (`issue_reported` comes from faults). */
export const STAFF_OUT_OF_SERVICE_REASONS = ["maintenance", "other"] as const;
export type StaffOutOfServiceReason = (typeof STAFF_OUT_OF_SERVICE_REASONS)[number];
