"use server";

import { action } from "@/lib/server-action";
import { ReportFaultInput } from "@/lib/schemas/faults";
import * as faults from "@/server/services/faults";

/**
 * Report a problem from the pass (FR-12). Refreshes the pass in the same
 * response, so a take-out-of-service report shows OUT OF SERVICE at once.
 * Idempotent on `clientRequestId`.
 */
export const reportFault = action(ReportFaultInput, async (actor, input, now, db) => {
  const { faultId, tookOutOfService } = await faults.reportFault(db, actor, input, now);
  return { faultId, tookOutOfService };
});
