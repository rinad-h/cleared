import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { log } from "@/server/log";
import {
  ServiceError,
  toActionError,
  type ActionResult,
  type FieldErrors,
} from "@/server/domain/errors";

export type { ActionResult } from "@/server/domain/errors";

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

function formDataToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue; // Next.js internals
    const values = formData.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}

/**
 * Validate action input (a `FormData` or a plain object) with Zod. Failures
 * throw `VALIDATION_FAILED` with per-field messages.
 *
 * A form key sent once becomes a string and a key sent several times becomes
 * an array, so fields that can repeat (checkboxes, multi-selects) must use
 * `formArray()` from `@/lib/validation`, which also accepts zero or one value.
 */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const data = input instanceof FormData ? formDataToObject(input) : input;
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  throw new ServiceError("VALIDATION_FAILED", "Check the highlighted fields.", fieldErrors);
}
