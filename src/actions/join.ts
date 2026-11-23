"use server";

import { action } from "@/lib/server-action";
import { JoinInput } from "@/lib/schemas/identity";
import { joinMakerspace as joinService } from "@/server/services/join";

/** Join with the current join link. Already a member: nothing changes. */
export const joinMakerspace = action(
  JoinInput,
  (actor, input, now, db) => joinService(db, actor, input, now),
  { redirectTo: () => "/machines" },
);
