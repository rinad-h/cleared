"use server";

import { action } from "@/lib/server-action";
import { CreateCheckupInput, UpdateCheckupInput } from "@/lib/schemas/checkups";
import * as checkups from "@/server/services/checkups";

/** Checkup actions (FR-16). Each refreshes the page in the same response. */

export const createCheckup = action(CreateCheckupInput, (actor, input, now, db) =>
  checkups.createCheckup(db, actor, input, now),
);

/** Edit, deactivate (`active: false`) or reactivate. */
export const updateCheckup = action(UpdateCheckupInput, (actor, input, now, db) =>
  checkups.updateCheckup(db, actor, input, now),
);
