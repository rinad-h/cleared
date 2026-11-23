import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import type { MemberSearch } from "@/lib/schemas/identity";
import * as grants from "@/server/services/grants";
import * as members from "@/server/services/members";
import * as sessions from "@/server/services/sessions";

export async function searchMembers(input: Partial<MemberSearch>) {
  const actor = await getActor(); // session first (dynamic access), then D1
  return members.searchMembers(getDb(), actor, input);
}

export async function getMember(id: string) {
  const actor = await getActor();
  return members.getMember(getDb(), actor, id);
}

/** Staff: the member's profile plus certifications and grant history (Phase 3 §5). */
export async function getMemberDetail(id: string) {
  const actor = await getActor();
  const db = getDb();
  const member = await members.getMember(db, actor, id);
  const now = Date.now();
  const [certs, memberSessions] = await Promise.all([
    grants.getMemberCertifications(db, actor, { memberId: member.id }, now),
    sessions.getMemberSessions(db, actor, { memberId: member.id }, now),
  ]);
  return { ...member, ...certs, ...memberSessions, now };
}
