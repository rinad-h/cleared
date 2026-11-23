import "server-only";
import { cache } from "react";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { can } from "@/lib/permissions";
import * as faults from "@/server/services/faults";

/** Staff: the fault queue (FR-14). */
export async function getFaultQueue(machineId?: string) {
  const actor = await getActor(); // session first (dynamic access), then D1
  return faults.getFaultQueue(getDb(), actor, { machineId }, Date.now());
}

/** The console nav's open-fault count, read once per request; null for anyone who isn't active staff (layouts never gate). */
export const getOpenFaultCount = cache(async (): Promise<number | null> => {
  const actor = await getActor();
  if (!can(actor, "viewConsole")) return null;
  return faults.countOpenFaults(getDb(), actor);
});
