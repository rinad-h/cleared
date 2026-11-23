import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import * as machines from "@/server/services/machines";

/** The page a QR label opens: one indexed read (hot path, keep it small). */
export async function getMachineByToken(token: string) {
  const actor = await getActor(); // session first (dynamic access), then D1
  return machines.getMachineByToken(getDb(), actor, { token });
}
