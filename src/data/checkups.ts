import "server-only";
import { cache } from "react";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { can } from "@/lib/permissions";
import type { DueFilter } from "@/lib/schemas/checkups";
import * as checkups from "@/server/services/checkups";
import { getMakerspace } from "@/server/services/me";

/** Staff: checkups across machines (the Checkups page), with the time zone and `now` they were computed for. */
export async function listDueCheckups(due: DueFilter) {
  const actor = await getActor(); // session first (dynamic access), then D1
  const now = Date.now();
  const db = getDb();
  const [items, makerspace] = await Promise.all([checkups.listDueCheckups(db, actor, { due }, now), getMakerspace(db)]);
  return { items, now, timezone: makerspace?.timezone ?? "UTC" };
}

/** Staff: one machine's active checkups (the log-service form). */
export async function listMachineCheckups(machineId: string) {
  const actor = await getActor();
  return checkups.listMachineCheckups(getDb(), actor, { machineId }, Date.now());
}

/** The console nav's overdue-checkup count, read once per request; null for anyone who isn't active staff. */
export const getOverdueCheckupCount = cache(async (): Promise<number | null> => {
  const actor = await getActor();
  if (!can(actor, "viewConsole")) return null;
  return (await checkups.countDueCheckups(getDb(), actor, Date.now())).overdue;
});
