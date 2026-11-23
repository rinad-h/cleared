"use server";

import { action } from "@/lib/server-action";
import { RevokeInput, SignOffInput } from "@/lib/schemas/grants";
import * as grants from "@/server/services/grants";

/** Idempotent on `clientRequestId`; a replay returns `created: false` (the UI shows the same success). */
export const signOff = action(SignOffInput, async (actor, input, now, db) => {
  const { created } = await grants.signOff(db, actor, input, now);
  return { created };
});

export const revokeGrant = action(RevokeInput, async (actor, input, now, db) => {
  const { revokedGrantIds } = await grants.revokeGrant(db, actor, input, now);
  return { revoked: revokedGrantIds.length };
});
