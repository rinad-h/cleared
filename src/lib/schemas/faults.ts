import { z } from "zod";
import { clientRequestId, id, optionalBoolean, optionalFormArray } from "@/lib/validation";
import { SERVICE_OUTCOMES, SERVICE_TYPES, STAFF_OUT_OF_SERVICE_REASONS } from "@/server/domain/enums";

/**
 * Phase 5 inputs (faults, out-of-service, service records), shared by server
 * actions (`parse()`), services and the client forms. Pure: no server-only imports.
 */

export const FAULT_DESCRIPTION_MIN = 10;
export const FAULT_DESCRIPTION_MAX = 1000;
export const STATUS_NOTE_MAX = 200;
export const WORK_DONE_MIN = 10;
export const WORK_DONE_MAX = 2000;
export const PARTS_USED_MAX = 500;
export const EXTERNAL_TECH_MIN = 2;
export const EXTERNAL_TECH_MAX = 120;
export const MAX_LINKED_FAULTS = 20;
export const HISTORY_PAGE_MAX = 50;
export const HISTORY_PAGE_DEFAULT = 20;

/** Trimmed text that may be blank ("" → undefined), with a max length and a message. */
const blankable = (max: number, message: string) =>
  z.preprocess(
    (v) => (v === null ? undefined : v),
    z
      .string()
      .trim()
      .max(max, message)
      .transform((s) => (s === "" ? undefined : s))
      .optional(),
  );

/** An instant as UTC ms, from a form ("1767628800000") or JSON; "" means "not sent". */
const instant = z.preprocess(
  (v) => (v === "" || v === null ? undefined : typeof v === "string" ? Number(v) : v),
  z.number({ error: "Pick a date and time." }).int("Pick a date and time.").positive("Pick a date and time.").optional(),
);

/** A whole number from a form or JSON; "" means "not sent". */
const optionalInt = (min: number, max: number, label: string) =>
  z.preprocess(
    (v) => (v === "" || v === null ? undefined : typeof v === "string" ? Number(v) : v),
    z
      .number({ error: `Enter ${label} as a number.` })
      .int(`Use a whole number.`)
      .min(min, `Use at least ${min}.`)
      .max(max, `Use at most ${max}.`)
      .optional(),
  );

/* ----------------------------------------------------------------- faults */

export const ReportFaultInput = z.object({
  machineId: id,
  description: z
    .string({ error: "Describe the problem." })
    .trim()
    .min(FAULT_DESCRIPTION_MIN, `Describe the problem in at least ${FAULT_DESCRIPTION_MIN} characters.`)
    .max(FAULT_DESCRIPTION_MAX, `Keep it under ${FAULT_DESCRIPTION_MAX} characters.`),
  /** "Unsafe or not working: take out of service". */
  takeOutOfService: optionalBoolean().transform((v) => v === true),
  /** Created when the sheet opens, so a double-tap reports once. */
  clientRequestId,
});
export type ReportFaultInput = z.input<typeof ReportFaultInput>;

export const FaultQueueInput = z.object({ machineId: id.optional() });
export type FaultQueueInput = z.input<typeof FaultQueueInput>;

/* --------------------------------------------------------- machine status */

const statusNote = blankable(STATUS_NOTE_MAX, `Keep the note under ${STATUS_NOTE_MAX} characters.`);

export const SetOutOfServiceInput = z.object({
  machineId: id,
  reason: z.enum(STAFF_OUT_OF_SERVICE_REASONS, { error: "Choose a reason." }),
  note: statusNote,
  expectedBackAt: instant,
});
export type SetOutOfServiceInput = z.input<typeof SetOutOfServiceInput>;

/** Replaces both details: a blank field clears it. */
export const UpdateOutageInput = z.object({
  machineId: id,
  note: statusNote,
  expectedBackAt: instant,
});
export type UpdateOutageInput = z.input<typeof UpdateOutageInput>;

export const MachineIdInput = z.object({ machineId: id });
export type MachineIdInput = z.input<typeof MachineIdInput>;

/* -------------------------------------------------------- service records */

export const LogServiceInput = z
  .object({
    machineId: id,
    /** Default: now. */
    performedAt: instant,
    /** Default: the actor (unless `externalTechnician`). */
    performedByMemberId: z.preprocess((v) => (v === "" || v === null ? undefined : v), id.optional()),
    externalTechnician: z.preprocess(
      (v) => (v === null ? undefined : v),
      z
        .string()
        .trim()
        .transform((s) => (s === "" ? undefined : s))
        .pipe(
          z
            .string()
            .min(EXTERNAL_TECH_MIN, `Use at least ${EXTERNAL_TECH_MIN} characters.`)
            .max(EXTERNAL_TECH_MAX, `Keep it under ${EXTERNAL_TECH_MAX} characters.`)
            .optional(),
        )
        .optional(),
    ),
    type: z.enum(SERVICE_TYPES, { error: "Choose a type." }),
    workDone: z
      .string({ error: "Describe what was done." })
      .trim()
      .min(WORK_DONE_MIN, `Describe what was done in at least ${WORK_DONE_MIN} characters.`)
      .max(WORK_DONE_MAX, `Keep it under ${WORK_DONE_MAX} characters.`),
    partsUsed: blankable(PARTS_USED_MAX, `Keep it under ${PARTS_USED_MAX} characters.`),
    minutesSpent: optionalInt(1, 10_000, "the minutes"),
    faultIds: optionalFormArray(id).refine((v) => v === undefined || v.length <= MAX_LINKED_FAULTS, {
      message: `Link at most ${MAX_LINKED_FAULTS} faults.`,
    }),
    checkupId: z.preprocess((v) => (v === "" || v === null ? undefined : v), id.optional()),
    outcome: z.enum(SERVICE_OUTCOMES, { error: "Choose an outcome." }),
    correctsRecordId: z.preprocess((v) => (v === "" || v === null ? undefined : v), id.optional()),
    /** Created when the form opens; a replay returns the existing record. */
    clientRequestId,
  })
  .superRefine((v, ctx) => {
    if (v.performedByMemberId && v.externalTechnician) {
      ctx.addIssue({
        code: "custom",
        path: ["externalTechnician"],
        message: "Choose a staff member or an external technician, not both.",
      });
    }
  });
export type LogServiceInput = z.input<typeof LogServiceInput>;

export const ServiceHistoryInput = z.object({
  machineId: id,
  /** Opaque: `<performedAt>.<id>` of the last record on the previous page. */
  cursor: z
    .string()
    .regex(/^\d{1,16}\.[0-9a-f-]{36}$/, "That page link isn't valid.")
    .optional(),
  limit: optionalInt(1, HISTORY_PAGE_MAX, "the page size"),
});
export type ServiceHistoryInput = z.input<typeof ServiceHistoryInput>;
