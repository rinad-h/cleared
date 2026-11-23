import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { toHttp } from "@/server/domain/errors";
import { log } from "@/server/log";
import { getStatusBoard } from "@/server/services/board";

/**
 * `GET /api/status-board`: the board as JSON for `<StatusBoard>`'s 30 s poll
 * (Phase 4 §4.7). Honours `If-None-Match` with a 304 that costs about one row
 * read. 401 signed out, 403 not an active member, 503 over the daily limit.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await getActor();
    const result = await getStatusBoard(getDb(), actor, Date.now(), request.headers.get("if-none-match"));
    const headers = { ETag: result.etag, "Cache-Control": "private, no-store" };
    if (result.notModified) return new Response(null, { status: 304, headers });
    return Response.json(result.board, { headers });
  } catch (err) {
    const res = toHttp(err);
    if (res.status >= 500) log("error", "board.poll_failed", { status: res.status }, err);
    return res;
  }
}
