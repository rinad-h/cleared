import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import * as consoleHome from "@/server/services/console";

/** The console home's first render (the page), with the ETag the client polls with. */
export async function getConsole() {
  const actor = await getActor(); // session first (dynamic access), then D1
  const result = await consoleHome.getConsole(getDb(), actor, Date.now());
  if (result.notModified) throw new Error("unreachable: no If-None-Match was sent");
  return { console: result.console, etag: result.etag };
}
