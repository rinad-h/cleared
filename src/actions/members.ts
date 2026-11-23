"use server";

import { action } from "@/lib/server-action";
import { MemberPatch } from "@/lib/schemas/identity";
import * as members from "@/server/services/members";

/** Role and status changes; the per-field rules live in the service. */
export const updateMember = action(MemberPatch, async (actor, input, now, db) => {
  await members.updateMember(db, actor, input, now);
});
