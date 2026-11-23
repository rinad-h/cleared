import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import * as certifications from "@/server/services/certifications";
import * as grants from "@/server/services/grants";

export async function listCertifications(input: { includeInactive?: boolean } = {}) {
  const actor = await getActor(); // session first (dynamic access), then D1
  return certifications.listCertifications(getDb(), actor, input);
}

/** The signed-in member's own certifications (FR-18). */
export async function getMyCertifications() {
  const actor = await getActor();
  return grants.getMyCertifications(getDb(), actor, Date.now());
}
