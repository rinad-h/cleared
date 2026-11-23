import { z } from "zod";
import { hasControlCharsInText } from "@/server/domain/identity";

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

/** Trimmed text with a max length (no control characters but newline and tab); empty strings become undefined. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !hasControlCharsInText(v), "Remove the special characters.")
    .transform((s) => (s === "" ? undefined : s))
    .optional();

/**
 * Like `formArray()`, but "not sent" stays `undefined`, so a service can tell
 * "leave as is" from "clear all". A form that sends the field adds a hidden
 * input with an empty value (so zero selections still send the key); empty
 * values are dropped.
 */
export const optionalFormArray = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (value) =>
      value === undefined || value === null
        ? undefined
        : (Array.isArray(value) ? value : [value]).filter((v) => v !== ""),
    z.array(item).optional(),
  );

/**
 * An optional boolean from a form or JSON. Accepts true/false, "true"/"false",
 * "1"/"0" and "on" (a checked checkbox). A repeated key (a hidden "false"
 * followed by a checkbox) counts its last value. "" means "not sent".
 */
export const optionalBoolean = () =>
  z.preprocess((value) => {
    const v = Array.isArray(value) ? value[value.length - 1] : value;
    if (v === undefined || v === null || v === "") return undefined;
    if (v === true || v === "true" || v === "1" || v === "on") return true;
    if (v === false || v === "false" || v === "0") return false;
    return v;
  }, z.boolean().optional());
