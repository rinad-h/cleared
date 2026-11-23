import { z } from "zod";

/**
 * Shared Zod schemas, used by server actions (via `parse()`) and forms.
 * Phases add their input schemas here or in `src/server/schemas/*`.
 */

export const id = z.uuid();
export const clientRequestId = z.uuid();

/**
 * A form field that can repeat (checkboxes, multi-selects). FormData sends no
 * key for zero selections, a string for one and an array for several; this
 * always gives an array.
 */
export const formArray = <T extends z.ZodType>(item: T) =>
  z.preprocess((value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]), z.array(item));

/** Trimmed text with a max length; empty strings become undefined. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? undefined : s))
    .optional();
