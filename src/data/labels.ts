import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { getEnv } from "@/lib/env";
import * as labels from "@/server/services/labels";

/** Label and poster URLs come from PUBLIC_BASE_URL via getEnv() only (AGENTS.md rules 6 and 12). */
function site(): labels.Site {
  const env = getEnv();
  return { publicBaseUrl: env.PUBLIC_BASE_URL, environment: env.ENVIRONMENT };
}

export async function getLabelSheet(input: { machineIds?: string | string[] } = {}) {
  const actor = await getActor(); // session first (dynamic access), then D1
  return labels.getLabelSheet(getDb(), actor, input, Date.now(), site());
}

export async function getDoorPoster() {
  const actor = await getActor();
  return labels.getDoorPoster(getDb(), actor, site());
}
