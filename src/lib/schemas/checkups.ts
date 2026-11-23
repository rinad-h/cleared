import { z } from "zod";
import { id, optionalBoolean } from "@/lib/validation";
import { hasControlChars, hasControlCharsInText } from "@/server/domain/identity";

/**
 * Phase 6 inputs (checkups, FR-16), shared by server actions (`parse()`),
 * services and the client forms. Pure: no server-only imports.
 * Lengths match the `CHECK`s in drizzle/0006_checkups.sql.
 */

export const CHECKUP_NAME_MIN = 2;
export const CHECKUP_NAME_MAX = 120;
export const CHECKUP_INTERVAL_MIN = 1;
export const CHECKUP_INTERVAL_MAX = 730;
export const CHECKUP_INSTRUCTIONS_MAX = 2000;
/** Interval presets on the form (days). */
export const CHECKUP_INTERVAL_PRESETS = [7, 14, 30, 90, 180, 365] as const;

const emptyToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

const CheckupName = z
  .string({ error: "Name the checkup." })
  .trim()
  .min(CHECKUP_NAME_MIN, `Use at least ${CHECKUP_NAME_MIN} characters.`)
  .max(CHECKUP_NAME_MAX, `Use at most ${CHECKUP_NAME_MAX} characters.`)
  .refine((v) => !hasControlChars(v), "Remove the special characters.");

const IntervalDays = z.coerce
  .number({ error: "Enter the interval in days." })
  .int("Use a whole number of days.")
  .min(CHECKUP_INTERVAL_MIN, `Use ${CHECKUP_INTERVAL_MIN} to ${CHECKUP_INTERVAL_MAX} days.`)
  .max(CHECKUP_INTERVAL_MAX, `Use ${CHECKUP_INTERVAL_MIN} to ${CHECKUP_INTERVAL_MAX} days.`);

/** "" clears the instructions (null); not sent stays undefined. */
const Instructions = z.preprocess(
  (v) => (v === "" ? null : v),
  z
    .string()
    .trim()
    .max(CHECKUP_INSTRUCTIONS_MAX, `Keep it under ${CHECKUP_INSTRUCTIONS_MAX} characters.`)
    .refine((v) => !hasControlCharsInText(v), "Remove the special characters.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
);

export const CreateCheckupInput = z.object({
  machineId: id,
  name: CheckupName,
  intervalDays: IntervalDays,
  instructions: Instructions,
});
export type CreateCheckupInput = z.input<typeof CreateCheckupInput>;

export const UpdateCheckupInput = z.object({
  checkupId: id,
  name: z.preprocess(emptyToUndefined, CheckupName.optional()),
  intervalDays: z.preprocess(emptyToUndefined, IntervalDays.optional()),
  instructions: Instructions,
  active: optionalBoolean(),
});
export type UpdateCheckupInput = z.input<typeof UpdateCheckupInput>;

export const MachineCheckupsInput = z.object({ machineId: id, includeInactive: optionalBoolean() });
export type MachineCheckupsInput = z.input<typeof MachineCheckupsInput>;

export const DUE_FILTERS = ["overdue", "soon", "all"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];
export const DueCheckupsInput = z.object({ due: z.enum(DUE_FILTERS).default("all") });
export type DueCheckupsInput = z.input<typeof DueCheckupsInput>;
