import type { Actor } from "@/server/domain/actor";
import type { Role } from "@/server/domain/enums";

/**
 * The permission matrix (PRD Section 9). Services use it for decisions; pages
 * use it **only** to hide controls. Hiding a button is never the security:
 * every service checks the actor itself (technologies.md §9).
 *
 * Pure module (no I/O), so client components can import it too.
 */
export const PERMISSIONS = {
  /** Status board, own pass and certifications, own sessions, fault reports. */
  useMemberApp: ["admin", "staff", "member"],
  /** Console home, fault queue, checkups, machine detail, service history, members. */
  viewConsole: ["admin", "staff"],
  /** Sign off and revoke certifications for other members. */
  signOff: ["admin", "staff"],
  /** End anyone's session; out of service / return to service; log service; manage checkups. */
  manageMachineOps: ["admin", "staff"],
  /** Rooms and machine basics; print labels. */
  manageCatalogBasics: ["admin", "staff"],
  /** Suspend/reactivate users with the `member` role. */
  suspendMembers: ["admin", "staff"],
  /** Certifications; machine requirements and the supervised flag; retire machines. */
  manageCertifications: ["admin"],
  /** Change anyone's role. */
  changeRoles: ["admin"],
  /** Suspend/reactivate staff and admins. */
  suspendStaff: ["admin"],
  /** Makerspace name, time zone and the join link. */
  manageSettings: ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Does this role have the permission? */
export function roleCan(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Does this actor have the permission? Only active members have any. */
export function can(actor: Actor, permission: Permission): boolean {
  return actor.kind === "member" && actor.status === "active" && roleCan(actor.role, permission);
}

/** Can `actor` suspend or reactivate someone whose role is `targetRole`? */
export function canChangeStatusOf(actor: Actor, targetRole: Role): boolean {
  return can(actor, targetRole === "member" ? "suspendMembers" : "suspendStaff");
}
