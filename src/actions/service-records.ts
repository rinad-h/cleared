"use server";

import { action } from "@/lib/server-action";
import { LogServiceInput } from "@/lib/schemas/faults";
import * as records from "@/server/services/service-records";

/**
 * Log a service record (FR-15), then go to machine detail, which shows a
 * toast from `?logged=<status>`. There is deliberately no edit or delete
 * action: the history is append-only (T08 #7 lists this module's exports).
 */
export const logServiceRecord = action(
  LogServiceInput,
  async (actor, input, now, db) => {
    const result = await records.logServiceRecord(db, actor, input, now);
    return { ...result, machineId: input.machineId, correction: Boolean(input.correctsRecordId) };
  },
  {
    redirectTo: (r) =>
      `/console/machines/${r.machineId}?logged=${r.correction ? "correction" : r.machineStatus}`,
  },
);
