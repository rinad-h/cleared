import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import * as certifications from "@/server/services/certifications";
import * as grants from "@/server/services/grants";
import * as sessions from "@/server/services/sessions";

export async function listCertifications(input: { includeInactive?: boolean } = {}) {
  const actor = await getActor(); // session first (dynamic access), then D1
  return certifications.listCertifications(getDb(), actor, input);
}

/** The signed-in member's own certifications and last 10 sessions (FR-18). */
export async function getMyCertifications() {
  const actor = await getActor();
  const db = getDb();
  const now = Date.now();
  const [certs, recent] = await Promise.all([
    grants.getMyCertifications(db, actor, now),
    sessions.getMyRecentSessions(db, actor, now),
  ]);
  return { ...certs, ...recent, now };
}
