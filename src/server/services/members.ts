import "server-only";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { members } from "@/db/schema";
import { MemberPatch, MemberSearch } from "@/lib/schemas/identity";
import { canChangeStatusOf } from "@/lib/permissions";
import { requireRole } from "@/server/authz";
import type { Actor } from "@/server/domain/actor";
import type { MemberStatus, Role } from "@/server/domain/enums";
import { ServiceError } from "@/server/domain/errors";
import { parse } from "@/server/domain/parse";
import { expireSessionsSql } from "@/server/domain/sessions";
import { batch } from "@/server/batch";
import { endSessionsForAuthorizationSql } from "@/server/services/sessions";
import { bumpVersion } from "@/server/version";

export type MemberListItem = {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  status: MemberStatus;
};

export type MemberDetail = MemberListItem & {
  joinedAt: number;
  statusChangedAt: number | null;
  suspensionReason: string | null;
  isSelf: boolean;
};

/* ------------------------------------------------------------------ search */

type Cursor = { n: string; i: string };

function encodeCursor(c: Cursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify([c.n, c.i]));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(value: string): Cursor {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0))));
    if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "string" && typeof parsed[1] === "string") {
      return { n: parsed[0], i: parsed[1] };
    }
  } catch {
    // fall through
  }
  throw new ServiceError("VALIDATION_FAILED", "That list position isn't valid. Start the search again.", {
    cursor: ["Invalid cursor."],
  });
}

/** `%`, `_` and the escape character itself are literal in a search. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * Staff: search members by name or email, filter by role and status. Ordered
 * by name (case-insensitive) then id, with an opaque keyset cursor.
 */
export async function searchMembers(
  db: Db,
  actor: Actor,
  rawInput: Partial<MemberSearch> = {},
): Promise<{ items: MemberListItem[]; nextCursor: string | null }> {
  requireRole(actor, "staff");
  const input = parse(MemberSearch, rawInput);

  const nameNoCase = sql`${members.displayName} COLLATE NOCASE`;
  const conditions: SQL[] = [];
  if (input.q) {
    const pattern = likePattern(input.q);
    conditions.push(
      sql`(${members.displayName} LIKE ${pattern} ESCAPE '\\' OR ${members.email} LIKE ${pattern} ESCAPE '\\')`,
    );
  }
  if (input.role) conditions.push(eq(members.role, input.role));
  if (input.status) conditions.push(eq(members.status, input.status));
  if (input.cursor) {
    const c = decodeCursor(input.cursor);
    conditions.push(sql`(${nameNoCase} > ${c.n} OR (${nameNoCase} = ${c.n} AND ${members.id} > ${c.i}))`);
  }

  const rows = await db
    .select({
      id: members.id,
      displayName: members.displayName,
      email: members.email,
      role: members.role,
      status: members.status,
    })
    .from(members)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(nameNoCase), asc(members.id))
    .limit(input.limit + 1)
    .all();

  const items = rows.slice(0, input.limit);
  const last = items[items.length - 1];
  const nextCursor = rows.length > input.limit && last ? encodeCursor({ n: last.displayName, i: last.id }) : null;
  return { items, nextCursor };
}

/* --------------------------------------------------------------------- get */

async function readMember(db: Db, id: string) {
  return db
    .select({
      id: members.id,
      displayName: members.displayName,
      email: members.email,
      role: members.role,
      status: members.status,
      joinedAt: members.createdAt,
      statusChangedAt: members.statusChangedAt,
      suspensionReason: members.suspensionReason,
    })
    .from(members)
    .where(eq(members.id, id))
    .get();
}

const notFound = () => new ServiceError("NOT_FOUND", "That member doesn't exist.");

/** Staff: one member's profile, role and status. */
export async function getMember(db: Db, actor: Actor, rawId: string): Promise<MemberDetail> {
  requireRole(actor, "staff");
  const { id } = parse(MemberPatch.pick({ id: true }), { id: rawId });
  const row = await readMember(db, id);
  if (!row) throw notFound();
  return { ...row, isSelf: row.id === actor.memberId };
}

/* ------------------------------------------------------------------ update */

/**
 * Change a member's role and/or status (FR-03, Phase 1 §5.1):
 *
 * | Change                               | Who          | Error                         |
 * |--------------------------------------|--------------|-------------------------------|
 * | role                                 | admin        | FORBIDDEN_FIELD · LAST_ADMIN  |
 * | status of a `member`-role user       | staff, admin | —                             |
 * | status of staff/admin                | admin        | FORBIDDEN · LAST_ADMIN        |
 * | your own status                      | nobody       | CANNOT_SUSPEND_SELF           |
 * | your own role                        | admin        | LAST_ADMIN                    |
 *
 * One guarded UPDATE does the write, so the rules hold under concurrency: two
 * admins demoting each other at once can't both succeed. The guard re-checks,
 * inside the statement, that the actor is still allowed, that staff only change
 * `member`-role users, and that at least one active admin remains.
 */
export async function updateMember(
  db: Db,
  actor: Actor,
  rawInput: MemberPatch,
  now: number,
): Promise<MemberDetail> {
  requireRole(actor, "staff");
  const input = parse(MemberPatch, rawInput);
  const { id, role, status } = input;

  if (role === undefined && status === undefined) {
    throw new ServiceError("VALIDATION_FAILED", "Nothing to change.");
  }
  if (role !== undefined && actor.role !== "admin") {
    throw new ServiceError("FORBIDDEN_FIELD", "Only admins can change roles.", { role: ["Only admins can change roles."] });
  }
  if (status !== undefined && id === actor.memberId) {
    throw new ServiceError("CANNOT_SUSPEND_SELF", "You can't suspend or reactivate yourself.");
  }

  const target = await readMember(db, id);
  if (!target) throw notFound();
  const statusChanges = status !== undefined && status !== target.status;
  if (statusChanges && !canChangeStatusOf(actor, target.role)) {
    throw new ServiceError("FORBIDDEN", "Only admins can suspend or reactivate staff and admins.");
  }

  // Who must the actor still be when the statement runs?
  const needsAdmin = role !== undefined || (statusChanges && target.role !== "member");
  const allowedActorRoles = needsAdmin ? sql`('admin')` : sql`('admin','staff')`;
  // Staff may only change the status of users who are still `member`s.
  const staffTargetGuard = needsAdmin ? sql`1` : sql`role = 'member'`;
  const newRole = role ?? null;
  const newStatus = status ?? null;
  const reason = status === "suspended" ? (input.suspensionReason ?? null) : null;

  const [updated] = await batch(db, [
    sql`
      UPDATE members SET
        role = COALESCE(${newRole}, role),
        status = COALESCE(${newStatus}, status),
        status_changed_at = CASE WHEN ${newStatus} IS NOT NULL AND ${newStatus} <> status
                                 THEN ${now} ELSE status_changed_at END,
        status_changed_by_member_id = CASE WHEN ${newStatus} IS NOT NULL AND ${newStatus} <> status
                                           THEN ${actor.memberId} ELSE status_changed_by_member_id END,
        suspension_reason = CASE WHEN ${newStatus} = 'suspended' THEN ${reason}
                                 WHEN ${newStatus} = 'active' THEN NULL
                                 ELSE suspension_reason END,
        updated_at = ${now}
      WHERE id = ${id}
        AND EXISTS (SELECT 1 FROM members AS a
                    WHERE a.id = ${actor.memberId} AND a.status = 'active' AND a.role IN ${allowedActorRoles})
        AND ${staffTargetGuard}
        AND (
              (COALESCE(${newRole}, role) = 'admin' AND COALESCE(${newStatus}, status) = 'active')
           OR NOT (role = 'admin' AND status = 'active')
           OR (SELECT COUNT(*) FROM members AS o
               WHERE o.role = 'admin' AND o.status = 'active' AND o.id <> ${id}) >= 1
        )`,
    // FR-08: suspension ends all of the member's active sessions (Phase 4 §4.5),
    // only if this statement really suspended them.
    ...(newStatus === "suspended" && statusChanges
      ? [
          expireSessionsSql(now, { memberId: id }),
          endSessionsForAuthorizationSql(id, actor.memberId, now, "all",
            sql`EXISTS (SELECT 1 FROM "members" AS "t" WHERE "t"."id" = ${id} AND "t"."status" = 'suspended'
                  AND "t"."status_changed_at" = ${now} AND "t"."status_changed_by_member_id" = ${actor.memberId})`),
        ]
      : []),
    bumpVersion(db),
  ]);

  if (updated.meta.changes !== 1) {
    throw await explainRefusal(db, actor.memberId, id, needsAdmin);
  }
  const row = await readMember(db, id);
  if (!row) throw notFound();
  return { ...row, isSelf: row.id === actor.memberId };
}

/** The guarded UPDATE changed nothing: work out which rule stopped it. */
async function explainRefusal(db: Db, actorId: string, targetId: string, needsAdmin: boolean): Promise<ServiceError> {
  const [actorRow, target] = await Promise.all([readMember(db, actorId), readMember(db, targetId)]);
  if (!target) return notFound();
  if (!actorRow || actorRow.status !== "active") {
    return new ServiceError("FORBIDDEN", "Your access changed. Reload the page.");
  }
  if (needsAdmin ? actorRow.role !== "admin" : actorRow.role === "member") {
    return new ServiceError("FORBIDDEN", "Your access changed. Reload the page.");
  }
  if (!needsAdmin && target.role !== "member") {
    return new ServiceError("FORBIDDEN", "Only admins can suspend or reactivate staff and admins.");
  }
  return new ServiceError("LAST_ADMIN", "At least one active admin must remain. Make someone else an admin first.");
}
