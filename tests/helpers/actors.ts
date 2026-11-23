/**
 * Actor builders: `actors.admin()`, `actors.staff()`, `actors.member({ status })`,
 * `actors.nonMember()`, `actors.anonymous()`. Each inserts the Better Auth `user`
 * and (for members) the `members` row, then returns an `Actor` to pass to
 * services. No auth stub: services take the actor as an argument.
 */
import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { members, settings, user } from "@/db/schema";
import type { Actor, MemberActor, UserActor } from "@/server/domain/actor";
import type { MemberStatus, Role } from "@/server/domain/enums";
import { SETTINGS_ID } from "@/server/version";
import { testDb } from "./db";
import { resetFaultsStatements } from "./seed";
import { T0 } from "./time";

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}${crypto.randomUUID().slice(0, 8)}`;

type UserOptions = { name?: string; email?: string; db?: Db };
type MemberOptions = UserOptions & { role?: Role; status?: MemberStatus; joinedAt?: number };

async function insertUser({ name, email, db = testDb() }: UserOptions = {}) {
  const id = `user_${unique()}`;
  const row = {
    id,
    name: name ?? `Test User ${id.slice(-6)}`,
    email: email ?? `${id}@example.test`,
    emailVerified: false,
    createdAt: new Date(T0),
    updatedAt: new Date(T0),
  };
  await db.insert(user).values(row);
  return row;
}

async function nonMember(options: UserOptions = {}): Promise<UserActor> {
  const u = await insertUser(options);
  return { kind: "user", userId: u.id, email: u.email, name: u.name };
}

async function member({ role = "member", status = "active", joinedAt = T0, ...options }: MemberOptions = {}): Promise<MemberActor> {
  const db = options.db ?? testDb();
  const u = await insertUser({ ...options, db });
  const memberId = crypto.randomUUID();
  await db.insert(members).values({
    id: memberId,
    authUserId: u.id,
    email: u.email,
    displayName: u.name,
    role,
    status,
    statusChangedAt: status === "suspended" ? joinedAt : null,
    createdAt: joinedAt,
    updatedAt: joinedAt,
  });
  return { kind: "member", memberId, userId: u.id, role, status, displayName: u.name };
}

export const actors = {
  anonymous: (): Actor => ({ kind: "anonymous" }),
  /** Signed in, no membership. */
  nonMember,
  member,
  staff: (options: Omit<MemberOptions, "role"> = {}) => member({ ...options, role: "staff" }),
  admin: (options: Omit<MemberOptions, "role"> = {}) => member({ ...options, role: "admin" }),
};

/** The makerspace after Setup: the settings row with a known join token. */
export async function createMakerspace({
  name = "Demo Makerspace",
  timezone = "America/Edmonton",
  joinToken = "join-token-0000000000",
  db = testDb(),
}: { name?: string; timezone?: string; joinToken?: string; db?: Db } = {}) {
  await db.insert(settings).values({
    id: SETTINGS_ID,
    name,
    timezone,
    memberJoinToken: joinToken,
    joinTokenRotatedAt: T0,
    dataVersion: 1,
    createdAt: T0,
    updatedAt: T0,
  });
  return { name, timezone, joinToken };
}

/** Empty the identity tables (test files share one D1, so specs reset between tests). */
export async function resetIdentity(db: Db = testDb()) {
  await db.batch([
    ...resetFaultsStatements(db),
    db.run(sql`DELETE FROM machine_sessions`),
    db.run(sql`DELETE FROM grants`),
    db.run(sql`UPDATE members SET status_changed_by_member_id = NULL`),
    db.run(sql`DELETE FROM members`),
    db.run(sql`DELETE FROM settings`),
    db.run(sql`DELETE FROM session`),
    db.run(sql`DELETE FROM account`),
    db.run(sql`DELETE FROM "user"`),
  ]);
}

/** The settings row's change counter. */
export async function dataVersion(db: Db = testDb()): Promise<number> {
  const row = await db.select({ v: settings.dataVersion }).from(settings).get();
  return row?.v ?? 0;
}
