import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { toHttp } from "@/server/domain/errors";
import { log } from "@/server/log";
import { getConsole } from "@/server/services/console";

/**
 * `GET /api/console`: the console home as JSON for `<ConsoleLive>`'s 30 s poll
 * (Phase 6 §4.3). Honours `If-None-Match` with a 304 that costs about one row
 * read. 401 signed out, 403 not active staff, 503 over the daily limit.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await getActor();
    const result = await getConsole(getDb(), actor, Date.now(), request.headers.get("if-none-match"));
    const headers = { ETag: result.etag, "Cache-Control": "private, no-store" };
    if (result.notModified) return new Response(null, { status: 304, headers });
    return Response.json(result.console, { headers });
  } catch (err) {
    const res = toHttp(err);
    if (res.status >= 500) log("error", "console.poll_failed", { status: res.status }, err);
    return res;
  }
}
