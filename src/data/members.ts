import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import type { MemberSearch } from "@/lib/schemas/identity";
import * as members from "@/server/services/members";

export async function searchMembers(input: Partial<MemberSearch>) {
  const actor = await getActor(); // session first (dynamic access), then D1
  return members.searchMembers(getDb(), actor, input);
}

export async function getMember(id: string) {
  const actor = await getActor();
  return members.getMember(getDb(), actor, id);
}
