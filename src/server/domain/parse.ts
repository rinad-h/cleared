import type { z } from "zod";
import { ServiceError, type FieldErrors } from "./errors";

/**
 * Input validation shared by server actions, route handlers and services.
 * Pure (no Next.js), so services can validate their own input as a backstop.
 */

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
 * Validate input (a `FormData` or a plain object) with Zod. Failures throw
 * `VALIDATION_FAILED` with per-field messages.
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
