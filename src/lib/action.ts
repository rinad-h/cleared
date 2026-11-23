import { unstable_rethrow } from "next/navigation";
import { log } from "@/server/log";
import { toActionError, type ActionResult } from "@/server/domain/errors";

export type { ActionResult } from "@/server/domain/errors";
export { parse } from "@/server/domain/parse";

/**
 * Run a server action body and turn failures into an `ActionResult`.
 * `redirect()` / `notFound()` are rethrown so Next.js can handle them.
 */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    unstable_rethrow(err);
    const result = toActionError(err);
    if (result.code === "INTERNAL" || result.code === "DAILY_LIMIT") {
      log("error", "action.failed", { code: result.code }, err);
    }
    return result;
  }
}
