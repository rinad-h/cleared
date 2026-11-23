import { z } from "zod";
import { hasControlChars } from "@/server/domain/identity";
import { id, optionalBoolean, optionalFormArray } from "@/lib/validation";

/**
 * Phase 2 input schemas (rooms, certifications, machines, labels), shared by
 * server actions (`parse()`), services and client forms. Pure: no server-only
 * imports, so forms can use them too.
 */

/** An empty form field means "not sent". */
const emptyToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

const plainText = (min: number, max: number, what: string) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `Enter a ${what}.` : `Use at least ${min} characters.`)
    .max(max, `Use at most ${max} characters.`)
    .refine((v) => !hasControlChars(v), "Remove the special characters.");

/* ------------------------------------------------------------------ rooms */

export const RoomName = plainText(1, 60, "room name");

export const RoomCreate = z.object({ name: RoomName });
export type RoomCreate = z.output<typeof RoomCreate>;

export const RoomUpdate = z.object({
  id,
  name: z.preprocess(emptyToUndefined, RoomName.optional()),
  sortOrder: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(10_000).optional()),
});
export type RoomUpdate = z.output<typeof RoomUpdate>;

export const RoomMove = z.object({ id, direction: z.enum(["up", "down"]) });
export type RoomMove = z.output<typeof RoomMove>;

/* --------------------------------------------------------- certifications */

export const CertificationName = plainText(2, 80, "certification name");

export const TRAINING_URL_MAX = 500;

/** http(s) only, ≤ 500 characters. "" clears it (null); not sent stays undefined. */
const TrainingUrl = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .trim()
    .max(TRAINING_URL_MAX, `Use at most ${TRAINING_URL_MAX} characters.`)
    .refine((v) => {
      try {
        const url = new URL(v);
        return (url.protocol === "https:" || url.protocol === "http:") && /^https?:\/\//i.test(v);
      } catch {
        return false;
      }
    }, "Enter a web address starting with https:// or http://.")
    .nullable()
    .optional(),
);

/** 1–120 months. "" or "never" means "never expires" (null); not sent stays undefined. */
const ValidityMonths = z.preprocess(
  (value) => (value === "" || value === "never" ? null : value),
  z.coerce
    .number({ error: "Enter a number of months." })
    .int("Enter a whole number of months.")
    .min(1, "Use 1 to 120 months.")
    .max(120, "Use 1 to 120 months.")
    .nullable()
    .optional(),
);

export const CertificationCreate = z.object({
  name: CertificationName,
  trainingUrl: TrainingUrl,
  validityMonths: ValidityMonths,
});
export type CertificationCreate = z.output<typeof CertificationCreate>;

export const CertificationUpdate = z.object({
  id,
  name: z.preprocess(emptyToUndefined, CertificationName.optional()),
  trainingUrl: TrainingUrl,
  validityMonths: ValidityMonths,
  active: optionalBoolean(),
});
export type CertificationUpdate = z.output<typeof CertificationUpdate>;

export const CertificationList = z.object({ includeInactive: optionalBoolean() });
export type CertificationList = z.output<typeof CertificationList>;

/* --------------------------------------------------------------- machines */

export const MachineName = plainText(1, 80, "machine name");
export const MAX_REQUIREMENTS = 20;

const TypicalSessionMinutes = z.coerce
  .number({ error: "Choose a session length." })
  .int("Choose a session length.")
  .min(15, "Use 15 to 240 minutes.")
  .max(240, "Use 15 to 240 minutes.");

const RequirementIds = optionalFormArray(id).refine(
  (ids) => ids === undefined || ids.length <= MAX_REQUIREMENTS,
  `Choose at most ${MAX_REQUIREMENTS} certifications.`,
).refine((ids) => ids === undefined || new Set(ids).size === ids.length, "Each certification can be chosen once.");

export const MachineCreate = z.object({
  name: MachineName,
  roomId: id,
  typicalSessionMinutes: z.preprocess(emptyToUndefined, TypicalSessionMinutes.optional()),
  // Admin only (the service rejects them from staff with FORBIDDEN_FIELD).
  supervised: optionalBoolean(),
  requirementIds: RequirementIds,
});
export type MachineCreate = z.output<typeof MachineCreate>;

export const MachineUpdate = z.object({
  id,
  name: z.preprocess(emptyToUndefined, MachineName.optional()),
  roomId: z.preprocess(emptyToUndefined, id.optional()),
  typicalSessionMinutes: z.preprocess(emptyToUndefined, TypicalSessionMinutes.optional()),
  // Admin only.
  supervised: optionalBoolean(),
  requirementIds: RequirementIds,
  retire: z.preprocess(
    (value) => (value === "true" || value === "1" ? true : emptyToUndefined(value)),
    z.literal(true).optional(),
  ),
});
export type MachineUpdate = z.output<typeof MachineUpdate>;

export const MachineList = z.object({
  roomId: z.preprocess(emptyToUndefined, id.optional()),
  includeRetired: optionalBoolean(),
});
export type MachineList = z.output<typeof MachineList>;

export const MachineId = z.object({ id });

/* ------------------------------------------------------- labels and QR */

export const MAX_LABEL_IDS = 200;

/** `?ids=a,b,c` on the label sheet (≤ 200). Missing or empty → every live machine. */
export const LabelSheetInput = z.object({
  machineIds: z.preprocess(
    (value) =>
      typeof value === "string" ? value.split(",").map((v) => v.trim()).filter(Boolean) : emptyToUndefined(value),
    z.array(id).max(MAX_LABEL_IDS, `Choose at most ${MAX_LABEL_IDS} machines.`).optional(),
  ),
});
export type LabelSheetInput = z.output<typeof LabelSheetInput>;

/** A QR token from a URL. Anything that isn't token-shaped is simply not recognized. */
export const QrTokenInput = z.object({ token: z.string().max(64) });
