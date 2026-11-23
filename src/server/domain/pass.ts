import type { Role } from "./enums";
import { bestGrant, certState, type GrantRow } from "./grants";

/**
 * The machine pass engine (Phase 3 §4.3, FR-09). Pure: no I/O, `now` passed in.
 * Reused by the status board and session start (Phase 4).
 */

export type Viewer =
  /** Signed in, no membership. */
  | { kind: "none" }
  | { kind: "member"; memberId: string; role: Role; status: "active" | "suspended"; displayName: string };

export type PassRequirement = { id: string; name: string; trainingUrl: string | null };

export interface PassInput {
  now: number;
  machine: { status: "available" | "out_of_service"; supervised: boolean };
  requirements: readonly PassRequirement[];
  viewer: Viewer;
  /** The viewer's grants for the required certifications (all of them, revoked and expired too). */
  grants: readonly GrantRow[];
}

export type MissingCert = PassRequirement & {
  /** Why it's missing: the latest grant's state. */
  state: "never" | "expired" | "revoked";
  /** When it expired or was revoked. */
  since: number | null;
};

export type PassStatus = "OUT_OF_SERVICE" | "NOT_CLEARED" | "SUPERVISION_REQUIRED" | "CLEARED";
export type NotClearedReason = "not_member" | "suspended" | "missing_certifications";

export type PassResult = {
  status: PassStatus;
  notClearedReason?: NotClearedReason;
  /** Empty unless `notClearedReason` is `missing_certifications`. */
  missing: MissingCert[];
  /** The earliest expiry among the required certifications' best grants (null: none expire, or not certified). */
  earliestExpiry: number | null;
  /** Active member holding every requirement; ignores out-of-service and supervision (the board's ✔/✖). */
  certifiedForMachine: boolean;
};

/**
 * Precedence, top to bottom:
 * 1. out of service → OUT_OF_SERVICE (even for non-members)
 * 2. no membership → NOT_CLEARED (not_member)
 * 3. suspended → NOT_CLEARED (suspended)
 * 4. a requirement without a valid grant → NOT_CLEARED (missing_certifications, each listed)
 * 5. supervised machine and role `member` → SUPERVISION_REQUIRED
 * 6. otherwise → CLEARED
 * Being staff is never a bypass for missing certifications.
 */
export function computePass({ now, machine, requirements, viewer, grants }: PassInput): PassResult {
  const byCert = new Map<string, GrantRow[]>();
  for (const g of grants) {
    const list = byCert.get(g.certificationId) ?? [];
    list.push(g);
    byCert.set(g.certificationId, list);
  }

  const missing: MissingCert[] = [];
  let earliestExpiry: number | null = null;
  for (const req of requirements) {
    const held = byCert.get(req.id) ?? [];
    const best = bestGrant(held, now);
    if (best) {
      if (best.expiresAt !== null && (earliestExpiry === null || best.expiresAt < earliestExpiry)) {
        earliestExpiry = best.expiresAt;
      }
      continue;
    }
    const { state, since } = certState(held, now);
    missing.push({ ...req, state: state === "revoked" ? "revoked" : state === "expired" ? "expired" : "never", since });
  }

  const activeMember = viewer.kind === "member" && viewer.status === "active";
  const certifiedForMachine = activeMember && missing.length === 0;
  const expiry = certifiedForMachine ? earliestExpiry : null;
  const base = { missing: [] as MissingCert[], earliestExpiry: expiry, certifiedForMachine };

  if (machine.status === "out_of_service") return { ...base, status: "OUT_OF_SERVICE" };
  if (viewer.kind !== "member") return { ...base, status: "NOT_CLEARED", notClearedReason: "not_member" };
  if (viewer.status !== "active") return { ...base, status: "NOT_CLEARED", notClearedReason: "suspended" };
  if (missing.length > 0) {
    return { ...base, status: "NOT_CLEARED", notClearedReason: "missing_certifications", missing };
  }
  if (machine.supervised && viewer.role === "member") return { ...base, status: "SUPERVISION_REQUIRED" };
  return { ...base, status: "CLEARED" };
}
