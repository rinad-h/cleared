import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import * as join from "@/server/services/join";

export async function getJoinPreview(token: string): Promise<join.JoinPreview> {
  const actor = await getActor(); // session first (dynamic access), then D1
  return join.previewJoin(getDb(), actor, { token });
}
