import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import * as machineDetail from "@/server/services/machine-detail";
import * as machines from "@/server/services/machines";
import * as serviceRecords from "@/server/services/service-records";
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

export async function getMachineDetail(machineId: string, cursor?: string) {
  const actor = await getActor();
  return machineDetail.getMachineDetail(getDb(), actor, { machineId, cursor }, Date.now());
}

export async function listStaff() {
  const actor = await getActor();
  return machineDetail.listStaff(getDb(), actor);
}

export async function getServiceRecord(machineId: string, recordId: string) {
  const actor = await getActor();
  return serviceRecords.getServiceRecord(getDb(), actor, { machineId, recordId });
}
