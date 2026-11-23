import "server-only";
import type { Actor, MemberActor, SignedInActor } from "./domain/actor";
import { ServiceError } from "./domain/errors";

/**
 * Permission guards used at the top of every service (technologies.md §9).
 * They narrow the actor's type and throw `ServiceError` when the rule fails.
 */

/** Signed in (with or without a membership), else `UNAUTHENTICATED`. */
export function requireUser(actor: Actor): asserts actor is SignedInActor {
  if (actor.kind === "anonymous") {
    throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");
  }
}

/** An **active** member, else `UNAUTHENTICATED` / `NOT_A_MEMBER` / `SUSPENDED`. */
export function requireMember(actor: Actor): asserts actor is MemberActor {
  requireUser(actor);
  if (actor.kind !== "member") {
    throw new ServiceError("NOT_A_MEMBER", "You aren't a member yet. Ask staff for the join link.");
  }
  if (actor.status !== "active") {
    throw new ServiceError("SUSPENDED", "Your access is suspended. Contact staff.");
  }
}

const RANK = { member: 0, staff: 1, admin: 2 } as const;

/** An active member with at least `role` (admin ⊃ staff), else `FORBIDDEN`. */
export function requireRole(actor: Actor, role: "staff" | "admin"): asserts actor is MemberActor {
  requireMember(actor);
  if (RANK[actor.role] < RANK[role]) {
    throw new ServiceError(
      "FORBIDDEN",
      role === "admin" ? "Only admins can do this." : "Only staff can do this.",
    );
  }
}
