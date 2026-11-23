import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { members, settings, user } from "@/db/schema";
import { JoinInput } from "@/lib/schemas/identity";
import { requireUser } from "@/server/authz";
import { enforceRateLimit, type RateLimitOptions } from "@/server/rate-limit";
import type { Actor } from "@/server/domain/actor";
import { ServiceError } from "@/server/domain/errors";
import { toDisplayName } from "@/server/domain/identity";
import { parse } from "@/server/domain/parse";
import { batch } from "@/server/batch";
import { bumpVersion, SETTINGS_ID } from "@/server/version";

export type JoinPreview =
  | { valid: true; makerspaceName: string }
  | { valid: false; reason: "invalid" | "setup-not-done" };

async function readJoinSettings(db: Db) {
  return db
    .select({ name: settings.name, token: settings.memberJoinToken })
    .from(settings)
    .where(eq(settings.id, SETTINGS_ID))
    .get();
}

/** Is this join link current? Used by the join page before the user confirms. */
export async function previewJoin(db: Db, actor: Actor, rawInput: JoinInput): Promise<JoinPreview> {
  requireUser(actor);
  const input = parse(JoinInput, rawInput);
  const row = await readJoinSettings(db);
  if (!row) return { valid: false, reason: "setup-not-done" };
  if (row.token !== input.token) return { valid: false, reason: "invalid" };
  return { valid: true, makerspaceName: row.name };
}

const invalidLink = () =>
  new ServiceError("INVALID_JOIN_LINK", "This join link isn't valid any more. Ask staff for the current link.");

/**
 * Join as a `member` with the current join link (FR-02). Joining again never
 * changes an existing membership (role and status stay as they are). The token
 * is re-checked inside the INSERT, so a link regenerated mid-request can't be used.
 */
export async function joinMakerspace(
  db: Db,
  actor: Actor,
  rawInput: JoinInput,
  now: number,
  options?: RateLimitOptions,
): Promise<{ memberId: string; joined: boolean }> {
  requireUser(actor);
  const input = parse(JoinInput, rawInput);
  await enforceRateLimit(options?.limiter, `join:${actor.userId}`, now);
  if (actor.kind === "member") return { memberId: actor.memberId, joined: false };

  const row = await readJoinSettings(db);
  if (!row) throw new ServiceError("SETUP_NOT_DONE", "This makerspace isn't set up yet.");
  if (row.token !== input.token) throw invalidLink();

  const account = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, actor.userId))
    .get();
  if (!account) throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");

  const memberId = crypto.randomUUID();
  const [inserted] = await batch(db, [
    sql`
      INSERT INTO members (id, auth_user_id, email, display_name, role, status, created_at, updated_at)
      SELECT ${memberId}, ${actor.userId}, ${account.email}, ${toDisplayName(account.name, account.email)},
             'member', 'active', ${now}, ${now}
      WHERE EXISTS (SELECT 1 FROM settings WHERE id = ${SETTINGS_ID} AND member_join_token = ${input.token})
      ON CONFLICT (auth_user_id) DO NOTHING`,
    bumpVersion(db),
  ]);
  if (inserted.meta.changes === 1) return { memberId, joined: true };

  // Nothing inserted: either a concurrent join already created the membership,
  // or the link was regenerated between the check above and the INSERT.
  const existing = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.authUserId, actor.userId))
    .get();
  if (existing) return { memberId: existing.id, joined: false };
  throw invalidLink();
}
