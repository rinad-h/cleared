import "server-only";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { certifications, grants, members } from "@/db/schema";
import { MemberDetailInput, RevokeInput, SignOffInput } from "@/lib/schemas/grants";
import { requireMember, requireRole } from "@/server/authz";
import { batch } from "@/server/batch";
import type { Actor, MemberActor } from "@/server/domain/actor";
import { ServiceError } from "@/server/domain/errors";
import { certState, validGrantSql, type CertState } from "@/server/domain/grants";
import { parse } from "@/server/domain/parse";
import { expireSessionsSql } from "@/server/domain/sessions";
import { expiryFor } from "@/server/domain/time";
import { endSessionsForAuthorizationSql } from "@/server/services/sessions";
import { SETTINGS_ID } from "@/server/version";

/* ------------------------------------------------------------------ types */

export type Grant = {
  id: string;
  memberId: string;
  certificationId: string;
  grantedByMemberId: string;
  grantedAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
  revokedByMemberId: string | null;
  revokeReason: string | null;
};

/** One certification as a member holds it (or doesn't): My certifications and the member detail page. */
export type CertificationRecord = {
  certification: { id: string; name: string; trainingUrl: string | null; validityMonths: number | null; active: boolean };
  state: CertState;
  /** The grant behind `state` (the best valid one, else the latest); null when `state` is none. */
  grantId: string | null;
  grantedAt: number | null;
  expiresAt: number | null;
  grantedByName: string | null;
  revokedAt: number | null;
  revokeReason: string | null;
};

/** A grant in the history list (staff only), with names. */
export type GrantHistoryItem = {
  id: string;
  certificationId: string;
  certificationName: string;
  grantedAt: number;
  expiresAt: number | null;
  grantedByName: string;
  revokedAt: number | null;
  revokedByName: string | null;
  revokeReason: string | null;
};

const grantColumns = {
  id: grants.id,
  memberId: grants.memberId,
  certificationId: grants.certificationId,
  grantedByMemberId: grants.grantedByMemberId,
  grantedAt: grants.grantedAt,
  expiresAt: grants.expiresAt,
  revokedAt: grants.revokedAt,
  revokedByMemberId: grants.revokedByMemberId,
  revokeReason: grants.revokeReason,
};

/* --------------------------------------------------------------- sign-off */

/** The actor is still an active staff member or admin when the statement runs. */
function actorStillStaff(actor: MemberActor) {
  return sql`EXISTS (SELECT 1 FROM "members" AS "actor"
    WHERE "actor"."id" = ${actor.memberId} AND "actor"."status" = 'active' AND "actor"."role" IN ('admin','staff'))`;
}

/**
 * Staff: sign a member off on a certification (FR-07). Idempotent on
 * `clientRequestId`: a replay returns the same grant with `created: false`;
 * the same id with a different member or certification is
 * `IDEMPOTENCY_MISMATCH`. Nobody signs themselves off (`SELF_SIGN_OFF`, with a
 * CHECK constraint as the backstop). The target must be an active member and
 * the certification active; both are re-checked inside the insert.
 * `expires_at = granted_at + validity_months` (clamped to month end).
 */
export async function signOff(
  db: Db,
  actor: Actor,
  rawInput: SignOffInput,
  now: number,
): Promise<{ grant: Grant; created: boolean }> {
  requireRole(actor, "staff");
  const input = parse(SignOffInput, rawInput);

  const replay = async () => {
    const existing = await db.select(grantColumns).from(grants).where(eq(grants.clientRequestId, input.clientRequestId)).get();
    if (!existing) return null;
    if (
      existing.memberId !== input.memberId ||
      existing.certificationId !== input.certificationId ||
      existing.grantedByMemberId !== actor.memberId
    ) {
      throw new ServiceError("IDEMPOTENCY_MISMATCH", "That request was already used for a different sign-off. Reload and try again.");
    }
    return { grant: existing, created: false };
  };

  if (input.memberId === actor.memberId) {
    throw new ServiceError("SELF_SIGN_OFF", "You can't sign yourself off. Ask another staff member.");
  }

  const [target, cert] = await db.batch([
    db.select({ status: members.status }).from(members).where(eq(members.id, input.memberId)),
    db
      .select({ active: certifications.active, validityMonths: certifications.validityMonths })
      .from(certifications)
      .where(eq(certifications.id, input.certificationId)),
  ]);
  const previous = await replay();
  if (previous) return previous;
  if (!target[0]) throw new ServiceError("NOT_FOUND", "That member doesn't exist.");
  if (target[0].status !== "active") {
    throw new ServiceError("MEMBER_SUSPENDED", "This member is suspended. Reactivate them before signing them off.");
  }
  if (!cert[0]) throw new ServiceError("NOT_FOUND", "That certification doesn't exist.");
  if (!cert[0].active) throw new ServiceError("CERT_INACTIVE", "This certification is inactive.");

  const validityMonths = cert[0].validityMonths;
  const id = crypto.randomUUID();
  const expiresAt = expiryFor(now, validityMonths);
  const [inserted] = await batch(db, [
    sql`INSERT INTO grants (id, member_id, certification_id, granted_by_member_id, granted_at, expires_at,
          client_request_id, created_at)
        SELECT ${id}, ${input.memberId}, ${input.certificationId}, ${actor.memberId}, ${now}, ${expiresAt},
          ${input.clientRequestId}, ${now}
        WHERE EXISTS (SELECT 1 FROM "members" WHERE "members"."id" = ${input.memberId} AND "members"."status" = 'active')
          AND EXISTS (SELECT 1 FROM "certifications" WHERE "certifications"."id" = ${input.certificationId}
                      AND "certifications"."active" = 1 AND "certifications"."validity_months" IS ${validityMonths})
          AND ${actorStillStaff(actor)}
        ON CONFLICT (client_request_id) DO NOTHING`,
    sql`UPDATE settings SET data_version = data_version + 1
        WHERE id = ${SETTINGS_ID} AND EXISTS (SELECT 1 FROM "grants" WHERE "grants"."id" = ${id})`,
  ]);

  if (inserted.meta.changes === 1) {
    const grant = await db.select(grantColumns).from(grants).where(eq(grants.id, id)).get();
    if (!grant) throw new ServiceError("CONFLICT_RETRY", "That sign-off couldn't be saved. Try again.");
    return { grant, created: true };
  }
  // Nothing inserted: a concurrent replay won, or a guard refused.
  const raced = await replay();
  if (raced) return raced;
  throw await explainSignOffRefusal(db, actor, input);
}

async function explainSignOffRefusal(db: Db, actor: MemberActor, input: SignOffInput): Promise<ServiceError> {
  const [actorRow, target, cert] = await db.batch([
    db.select({ status: members.status, role: members.role }).from(members).where(eq(members.id, actor.memberId)),
    db.select({ status: members.status }).from(members).where(eq(members.id, input.memberId)),
    db.select({ active: certifications.active }).from(certifications).where(eq(certifications.id, input.certificationId)),
  ]);
  if (!actorRow[0] || actorRow[0].status !== "active" || actorRow[0].role === "member") {
    return new ServiceError("FORBIDDEN", "Your access changed. Reload the page.");
  }
  if (!target[0]) return new ServiceError("NOT_FOUND", "That member doesn't exist.");
  if (target[0].status !== "active") {
    return new ServiceError("MEMBER_SUSPENDED", "This member is suspended. Reactivate them before signing them off.");
  }
  if (!cert[0]) return new ServiceError("NOT_FOUND", "That certification doesn't exist.");
  if (!cert[0].active) return new ServiceError("CERT_INACTIVE", "This certification is inactive.");
  return new ServiceError("CONFLICT_RETRY", "The certification changed while you were signing off. Try again.");
}

/* ----------------------------------------------------------------- revoke */

/**
 * Staff: revoke a member's certification (FR-08, grant side), with a reason.
 * Takes effect immediately: the next pass computation excludes it. Revokes
 * the given grant **and** any other still-valid grant of the same member for
 * the same certification (an early renewal leaves two), so "Revoke" always
 * leaves the member without that certification. Not your own (`SELF_REVOKE`);
 * not twice (`ALREADY_REVOKED`). In the same batch, the member's active
 * sessions on machines that require the certification end with
 * `authorization_removed` (FR-08, Phase 4 §4.5).
 */
export async function revokeGrant(
  db: Db,
  actor: Actor,
  rawInput: RevokeInput,
  now: number,
): Promise<{ revokedGrantIds: string[] }> {
  requireRole(actor, "staff");
  const input = parse(RevokeInput, rawInput);

  const grant = await db.select(grantColumns).from(grants).where(eq(grants.id, input.grantId)).get();
  if (!grant) throw new ServiceError("NOT_FOUND", "That certification record doesn't exist.");
  if (grant.memberId === actor.memberId) {
    throw new ServiceError("SELF_REVOKE", "You can't revoke your own certification. Ask another staff member.");
  }
  if (grant.revokedAt !== null) throw new ServiceError("ALREADY_REVOKED", "This certification was already revoked.");

  const [, updated] = await batch(db, [
    // 1. Close the member's expired-but-open sessions honestly (Phase 4 §4.5).
    expireSessionsSql(now, { memberId: grant.memberId }),
    // 2. Revoke.
    sql`UPDATE grants SET revoked_at = ${now}, revoked_by_member_id = ${actor.memberId}, revoke_reason = ${input.reason}
        WHERE member_id = ${grant.memberId} AND certification_id = ${grant.certificationId}
          AND member_id <> ${actor.memberId}
          AND revoked_at IS NULL
          AND (id = ${grant.id} OR ${validGrantSql(now)})
          AND EXISTS (SELECT 1 FROM "grants" AS "target" WHERE "target"."id" = ${grant.id} AND "target"."revoked_at" IS NULL)
          AND ${actorStillStaff(actor)}`,
    // 3. End active sessions on machines that need this certification, unless a
    //    valid grant still covers it (which is also what makes a refused revoke end nothing).
    endSessionsForAuthorizationSql(grant.memberId, actor.memberId, now, { certificationId: grant.certificationId },
      sql`NOT EXISTS (SELECT 1 FROM "grants" AS "still" WHERE "still"."member_id" = ${grant.memberId}
            AND "still"."certification_id" = ${grant.certificationId} AND ${validGrantSql(now, "still")})`),
    // 4. Guarded by our own write: a refused or lost revoke doesn't bump.
    sql`UPDATE settings SET data_version = data_version + 1
        WHERE id = ${SETTINGS_ID} AND EXISTS (SELECT 1 FROM "grants" WHERE "grants"."id" = ${grant.id}
          AND "grants"."revoked_at" = ${now} AND "grants"."revoked_by_member_id" = ${actor.memberId})`,
  ]);

  if (updated.meta.changes === 0) {
    const [again, actorRow] = await db.batch([
      db.select({ revokedAt: grants.revokedAt }).from(grants).where(eq(grants.id, grant.id)),
      db.select({ status: members.status, role: members.role }).from(members).where(eq(members.id, actor.memberId)),
    ]);
    if (again[0]?.revokedAt !== null && again[0]?.revokedAt !== undefined) {
      throw new ServiceError("ALREADY_REVOKED", "This certification was already revoked.");
    }
    if (!actorRow[0] || actorRow[0].status !== "active" || actorRow[0].role === "member") {
      throw new ServiceError("FORBIDDEN", "Your access changed. Reload the page.");
    }
    throw new ServiceError("CONFLICT_RETRY", "That change couldn't be saved. Try again.");
  }

  const revoked = await db
    .select({ id: grants.id })
    .from(grants)
    .where(and(eq(grants.memberId, grant.memberId), eq(grants.certificationId, grant.certificationId), eq(grants.revokedAt, now), eq(grants.revokedByMemberId, actor.memberId)))
    .all();
  return { revokedGrantIds: revoked.map((r) => r.id) };
}

/* ------------------------------------------------------------------ reads */

/**
 * Every active certification, plus inactive ones the member ever held, with
 * the member's state for each (FR-18). Two reads, sent as one batch.
 */
async function certificationRecords(
  db: Db,
  memberId: string,
  now: number,
): Promise<{ records: CertificationRecord[]; history: GrantHistoryItem[] }> {
  const [certRows, grantRows] = await Promise.all([
    db
      .select({
        id: certifications.id,
        name: certifications.name,
        trainingUrl: certifications.trainingUrl,
        validityMonths: certifications.validityMonths,
        active: certifications.active,
      })
      .from(certifications)
      .where(
        or(
          eq(certifications.active, true),
          sql`EXISTS (SELECT 1 FROM "grants" WHERE "grants"."certification_id" = "certifications"."id"
                AND "grants"."member_id" = ${memberId})`,
        ),
      )
      .orderBy(asc(sql`${certifications.name} COLLATE NOCASE`))
      .all(),
    db
      .select({
        id: grants.id,
        certificationId: grants.certificationId,
        certificationName: certifications.name,
        grantedAt: grants.grantedAt,
        expiresAt: grants.expiresAt,
        revokedAt: grants.revokedAt,
        revokeReason: grants.revokeReason,
        grantedByName: sql<string>`(SELECT "gb"."display_name" FROM "members" AS "gb"
          WHERE "gb"."id" = "grants"."granted_by_member_id")`,
        revokedByName: sql<string | null>`(SELECT "rb"."display_name" FROM "members" AS "rb"
          WHERE "rb"."id" = "grants"."revoked_by_member_id")`,
      })
      .from(grants)
      .innerJoin(certifications, eq(certifications.id, grants.certificationId))
      .where(eq(grants.memberId, memberId))
      .orderBy(desc(grants.grantedAt), desc(grants.id))
      .all(),
  ]);

  const byCert = new Map<string, typeof grantRows>();
  for (const g of grantRows) {
    const list = byCert.get(g.certificationId) ?? [];
    list.push(g);
    byCert.set(g.certificationId, list);
  }

  const records = certRows.map((cert): CertificationRecord => {
    const { state, grant } = certState(byCert.get(cert.id) ?? [], now);
    return {
      certification: cert,
      state,
      grantId: grant?.id ?? null,
      grantedAt: grant?.grantedAt ?? null,
      expiresAt: grant?.expiresAt ?? null,
      grantedByName: grant?.grantedByName ?? null,
      revokedAt: grant?.revokedAt ?? null,
      revokeReason: grant?.revokeReason ?? null,
    };
  });
  return { records, history: grantRows };
}

/** A member: their own certifications, with expiries, training links and revocation reasons (FR-18). */
export async function getMyCertifications(
  db: Db,
  actor: Actor,
  now: number,
): Promise<{ certifications: CertificationRecord[] }> {
  requireMember(actor);
  const { records } = await certificationRecords(db, actor.memberId, now);
  return { certifications: records };
}

/** Staff: a member's certifications and full grant history, with names (FR-18). */
export async function getMemberCertifications(
  db: Db,
  actor: Actor,
  rawInput: MemberDetailInput,
  now: number,
): Promise<{ certifications: CertificationRecord[]; history: GrantHistoryItem[] }> {
  requireRole(actor, "staff");
  const { memberId } = parse(MemberDetailInput, rawInput);
  const exists = await db.select({ id: members.id }).from(members).where(eq(members.id, memberId)).get();
  if (!exists) throw new ServiceError("NOT_FOUND", "That member doesn't exist.");
  const { records, history } = await certificationRecords(db, memberId, now);
  return { certifications: records, history };
}
