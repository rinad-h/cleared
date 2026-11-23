import "server-only";

/**
 * Permission guards used at the top of every service: `requireUser`,
 * `requireMember`, `requireRole(actor, "staff" | "admin")`. They throw
 * `ServiceError` (`UNAUTHENTICATED`, `NOT_A_MEMBER`, `SUSPENDED`, `FORBIDDEN`).
 *
 * Phase 0 stub. Implemented with the permission matrix in Phase 1.
 */
export {};
