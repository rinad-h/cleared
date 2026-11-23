import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import * as certifications from "@/server/services/certifications";

export async function listCertifications(input: { includeInactive?: boolean } = {}) {
  const actor = await getActor(); // session first (dynamic access), then D1
  return certifications.listCertifications(getDb(), actor, input);
}
