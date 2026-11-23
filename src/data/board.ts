import "server-only";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import * as board from "@/server/services/board";

/** The status board's first render (the page), with the ETag the client polls with. */
export async function getStatusBoard() {
  const actor = await getActor(); // session first (dynamic access), then D1
  const result = await board.getStatusBoard(getDb(), actor, Date.now());
  if (result.notModified) throw new Error("unreachable: no If-None-Match was sent");
  return { board: result.board, etag: result.etag };
}
