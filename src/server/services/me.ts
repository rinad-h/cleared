import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { members, settings } from "@/db/schema";
import type { Actor } from "@/server/domain/actor";
import type { MemberStatus, Role } from "@/server/domain/enums";
import { SETTINGS_ID } from "@/server/version";

/** The signed-in Better Auth user, as the session reports it. */
export type SessionUser = { id: string; email: string; name: string };

/**
 * Build the request's `Actor` from the session user and the `members` row.
 * The membership is read on every request (one indexed read), so a suspension
 * or role change applies on the next request (Phase 1 D4).
 */
export async function resolveActor(db: Db, sessionUser: SessionUser | null): Promise<Actor> {
  if (!sessionUser) return { kind: "anonymous" };
  const member = await db
    .select({
      id: members.id,
      role: members.role,
      status: members.status,
      displayName: members.displayName,
    })
    .from(members)
    .where(eq(members.authUserId, sessionUser.id))
    .get();
  if (!member) {
    return { kind: "user", userId: sessionUser.id, email: sessionUser.email, name: sessionUser.name };
  }
  return {
    kind: "member",
    memberId: member.id,
    userId: sessionUser.id,
    role: member.role,
    status: member.status,
    displayName: member.displayName,
  };
}

export type Makerspace = { name: string; timezone: string };

/** Public makerspace details (shown on the sign-in page), or null before Setup. */
export async function getMakerspace(db: Db): Promise<Makerspace | null> {
  const row = await db
    .select({ name: settings.name, timezone: settings.timezone })
    .from(settings)
    .where(eq(settings.id, SETTINGS_ID))
    .get();
  return row ?? null;
}

export type Me = {
  user: { id: string; email: string; name: string } | null;
  setupComplete: boolean;
  makerspace: Makerspace | null;
  membership: { id: string; role: Role; status: MemberStatus; displayName: string; email: string } | null;
};

/** What layouts and gates need: who you are, whether Setup ran, and your membership. */
export async function getMe(db: Db, actor: Actor, sessionUser: SessionUser | null): Promise<Me> {
  const makerspace = await getMakerspace(db);
  if (actor.kind === "anonymous" || !sessionUser) {
    return { user: null, setupComplete: makerspace !== null, makerspace, membership: null };
  }
  const user = { id: sessionUser.id, email: sessionUser.email, name: sessionUser.name };
  if (actor.kind === "user") {
    return { user, setupComplete: makerspace !== null, makerspace, membership: null };
  }
  return {
    user,
    setupComplete: makerspace !== null,
    makerspace,
    membership: {
      id: actor.memberId,
      role: actor.role,
      status: actor.status,
      displayName: actor.displayName,
      email: sessionUser.email,
    },
  };
}
