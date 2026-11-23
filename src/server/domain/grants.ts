import { sql, type SQL } from "drizzle-orm";
import { DAY_MS } from "./time";

/**
 * Grant validity (Phase 3 §4.1). Pure: no I/O. The same rule exists as SQL
 * (`validGrantSql()`) for guarded statements; a test checks they agree.
 */

/** The grant columns the rules need. */
export type GrantRow = {
  id: string;
  certificationId: string;
  grantedAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
};

/** "Expiring soon" means within this many days (PRD 8.1, My certifications). */
export const EXPIRING_SOON_DAYS = 30;

/** Valid at `now`: not revoked, and never expires or expires after `now`. */
export function isGrantValid(grant: Pick<GrantRow, "expiresAt" | "revokedAt">, now: number): boolean {
  return grant.revokedAt === null && (grant.expiresAt === null || grant.expiresAt > now);
}

/**
 * SQL for "this grant row is valid at `now`". `alias` is the grants table's
 * name or alias in the surrounding query (fully qualified, AGENTS.md rule 10).
 */
export function validGrantSql(now: number, alias = "grants"): SQL {
  const t = sql.identifier(alias);
  return sql`(${t}."revoked_at" IS NULL AND (${t}."expires_at" IS NULL OR ${t}."expires_at" > ${now}))`;
}

/** Later expiry is better; null (never expires) is best. */
function laterExpiry(a: number | null, b: number | null): boolean {
  if (a === null) return b !== null;
  return b !== null && a > b;
}

/** The valid grant with the latest expiry (null = never = best), or null if none is valid. */
export function bestGrant<G extends GrantRow>(grants: readonly G[], now: number): G | null {
  let best: G | null = null;
  for (const g of grants) {
    if (!isGrantValid(g, now)) continue;
    if (best === null || laterExpiry(g.expiresAt, best.expiresAt)) best = g;
  }
  return best;
}

/** The most recently granted row (ties broken by id, so the answer is stable). */
export function latestGrant<G extends GrantRow>(grants: readonly G[]): G | null {
  let latest: G | null = null;
  for (const g of grants) {
    if (latest === null || g.grantedAt > latest.grantedAt || (g.grantedAt === latest.grantedAt && g.id > latest.id)) {
      latest = g;
    }
  }
  return latest;
}

export type CertState = "valid" | "expiring_soon" | "expired" | "revoked" | "none";

/**
 * One certification's state for a member, from all their grants for it:
 * the best valid grant decides valid / expiring_soon; otherwise the latest
 * grant decides expired / revoked; no grants → none.
 */
export function certState<G extends GrantRow>(
  grants: readonly G[],
  now: number,
): { state: CertState; grant: G | null; since: number | null } {
  const best = bestGrant(grants, now);
  if (best) {
    const soon = best.expiresAt !== null && best.expiresAt - now <= EXPIRING_SOON_DAYS * DAY_MS;
    return { state: soon ? "expiring_soon" : "valid", grant: best, since: null };
  }
  const latest = latestGrant(grants);
  if (!latest) return { state: "none", grant: null, since: null };
  if (latest.revokedAt !== null) return { state: "revoked", grant: latest, since: latest.revokedAt };
  return { state: "expired", grant: latest, since: latest.expiresAt };
}
