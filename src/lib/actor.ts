import "server-only";
import { cache } from "react";
import { getDb } from "@/db";
import { getSessionUser } from "@/lib/auth";
import type { Actor } from "@/server/domain/actor";
import { resolveActor } from "@/server/services/me";

export type { Actor, MemberActor, UserActor } from "@/server/domain/actor";

/**
 * The current request's actor, built once per request (React `cache`) from the
 * Better Auth session and the `members` row: anonymous, a signed-in user
 * without a membership, or a member (with role and status).
 */
export const getActor = cache(async (): Promise<Actor> => {
  // Read the session first: it's the dynamic access (headers()) that keeps the
  // production build from prerendering signed-in pages and touching D1.
  const sessionUser = await getSessionUser();
  return resolveActor(getDb(), sessionUser);
});
