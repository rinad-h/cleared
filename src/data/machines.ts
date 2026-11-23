import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import * as machines from "@/server/services/machines";
import { getSetupProgress as setupProgress } from "@/server/services/setup-progress";

export async function listMachines(input: { roomId?: string; includeRetired?: boolean } = {}) {
  const actor = await getActor(); // session first (dynamic access), then D1
  return machines.listMachines(getDb(), actor, input);
}

export async function getMachine(id: string) {
  const actor = await getActor();
  return machines.getMachine(getDb(), actor, { id });
}

export async function getSetupProgress() {
  const actor = await getActor();
  return setupProgress(getDb(), actor);
}
