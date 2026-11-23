import { connection } from "next/server";
import { getDb } from "@/db";
import { getEnv } from "@/lib/env";
import { log } from "@/server/log";
import { toActionError, toHttp } from "@/server/domain/errors";
import { checkDatabase } from "@/server/services/health";

/**
 * GET /api/health: deploy smoke test. scripts/smoke-test.sh (run by every
 * deploy script) checks that `version` is the version that was just built.
 * Also used by error.tsx to detect the daily-limit state (503 DAILY_LIMIT).
 */
export async function GET(): Promise<Response> {
  await connection(); // always dynamic: never prerendered at build time
  try {
    await checkDatabase(getDb());
    return Response.json(
      {
        status: "ok",
        version: process.env.BUILD_SHA ?? "unknown",
        environment: getEnv().ENVIRONMENT,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const response = toHttp(err);
    log("error", "health.failed", { code: toActionError(err).code }, err);
    return response;
  }
}
