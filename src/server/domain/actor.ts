import type { MemberStatus, Role } from "./enums";

/**
 * Who is making a request. Services take an `Actor` argument instead of reading
 * the session, so tests call them as any role without an auth stub
 * (technologies.md §6.7). Built once per request by `getActor()`.
 */
export type Actor =
  | { kind: "anonymous" }
  /** Signed in with Better Auth, but no `members` row yet. */
  | { kind: "user"; userId: string; email: string; name: string }
  | {
      kind: "member";
      memberId: string;
      userId: string;
      role: Role;
      status: MemberStatus;
      displayName: string;
    };

export type UserActor = Extract<Actor, { kind: "user" }>;
export type MemberActor = Extract<Actor, { kind: "member" }>;
export type SignedInActor = UserActor | MemberActor;
