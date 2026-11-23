import "server-only";
import { cache } from "react";
import type { Actor } from "@/server/domain/actor";

export type { Actor, MemberActor } from "@/server/domain/actor";

/**
 * The current request's actor, built once per request from the Better Auth
 * session and the `members` row.
 *
 * Phase 0 stub: always anonymous. Implemented in Phase 1 (identity and access).
 */
export const getActor = cache(async (): Promise<Actor> => {
  return { kind: "anonymous" };
});
