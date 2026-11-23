"use server";

import { action } from "@/lib/server-action";
import { MachineIdInput, SetOutOfServiceInput, UpdateOutageInput } from "@/lib/schemas/faults";
import * as status from "@/server/services/machine-status";

/** Staff status controls on machine detail (FR-13). Each refreshes the page. */

export const setMachineOutOfService = action(SetOutOfServiceInput, (actor, input, now, db) =>
  status.setMachineOutOfService(db, actor, input, now),
);

export const updateOutageDetails = action(UpdateOutageInput, (actor, input, now, db) =>
  status.updateOutageDetails(db, actor, input, now),
);

/** Refused with `OPEN_OOS_FAULT` (and the fault ids) while a fault that took the machine out is open. */
export const returnMachineToService = action(MachineIdInput, (actor, input, now, db) =>
  status.returnMachineToService(db, actor, input, now),
);
