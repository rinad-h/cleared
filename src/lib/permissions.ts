import type { Actor } from "@/server/domain/actor";

/**
 * UI-side permission helper: decides which controls a page shows.
 * Never the security boundary; services enforce every rule (technologies.md §9).
 *
 * Phase 0 stub. The permission matrix (PRD Section 9) is added in Phase 1.
 */
export type Permission = never;

export function can(_actor: Actor, _permission: Permission): boolean {
  return false;
}
