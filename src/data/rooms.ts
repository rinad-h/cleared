import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import * as rooms from "@/server/services/rooms";

export async function listRooms() {
  const actor = await getActor(); // session first (dynamic access), then D1
  return rooms.listRooms(getDb(), actor);
}
