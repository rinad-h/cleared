import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import * as pass from "@/server/services/pass";

/** The page a QR label opens: one batch of indexed reads (hot path, keep it small). */
export async function getMachineByToken(token: string) {
  const actor = await getActor(); // session first (dynamic access), then D1
  return pass.getMachineByToken(getDb(), actor, { token }, Date.now());
}
