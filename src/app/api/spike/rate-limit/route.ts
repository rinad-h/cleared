import { connection } from "next/server";
import { getEnv } from "@/lib/env";
import { spikesEnabled } from "@/server/spikes/guard";

/**
 * TEMPORARY spike S3: does the Workers Rate Limiting binding deploy and limit on Free?
 * Calls RL_ACTIONS.limit() 25 times with one key (limit is 20 per 60 s).
 * Expected: about 20 allowed, the rest blocked (counters are per location, best-effort).
 */
export async function GET(): Promise<Response> {
  await connection();
  if (!spikesEnabled()) return new Response("Not found", { status: 404 });

  const env = getEnv();
  let allowed = 0;
  let blocked = 0;
  for (let i = 0; i < 25; i++) {
    const { success } = await env.RL_ACTIONS.limit({ key: "spike" });
    if (success) allowed++;
    else blocked++;
  }
  return Response.json({ allowed, blocked }, { headers: { "Cache-Control": "no-store" } });
}
