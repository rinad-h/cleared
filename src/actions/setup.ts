"use server";

import { action } from "@/lib/server-action";
import { SetupInput } from "@/lib/schemas/identity";
import { completeSetup as completeSetupService } from "@/server/services/setup";

/** First-run Setup; the caller becomes admin and lands on Settings (join link). */
export const completeSetup = action(
  SetupInput,
  (actor, input, now, db) => completeSetupService(db, actor, input, now),
  { redirectTo: () => "/console/settings" },
);
