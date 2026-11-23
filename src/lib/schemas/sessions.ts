import { z } from "zod";
import { clientRequestId, id, optionalBoolean } from "@/lib/validation";
import {
  EXTEND_MINUTES,
  MAX_EXTEND_MINUTES,
  MAX_SESSION_MINUTES,
  MIN_EXTEND_MINUTES,
  MIN_SESSION_MINUTES,
} from "@/server/domain/sessions";

/**
 * Phase 4 session inputs, shared by server actions (`parse()`), services and
 * the pass's session controls. Pure: no server-only imports.
 */

/** A whole number of minutes from a form ("60") or JSON (60); "" means "not sent". */
const minutes = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null ? undefined : typeof v === "string" ? Number(v) : v),
    z
      .number({ error: "Enter a number of minutes." })
      .int("Use whole minutes.")
      .min(min, `Use at least ${min} minutes.`)
      .max(max, `Use at most ${max} minutes.`)
      .optional(),
  );

export const StartSessionInput = z.object({
  machineId: id,
  /** Default: the machine's typical session length. */
  expectedMinutes: minutes(MIN_SESSION_MINUTES, MAX_SESSION_MINUTES),
  /** "A supervisor is present" (self-reported), needed when the pass says SUPERVISION REQUIRED. */
  supervisionAcknowledged: optionalBoolean(),
  /** Created when the controls mount, so a double-tap starts one session. */
  clientRequestId,
});
export type StartSessionInput = z.input<typeof StartSessionInput>;

export const ExtendSessionInput = z.object({
  sessionId: id,
  minutes: minutes(MIN_EXTEND_MINUTES, MAX_EXTEND_MINUTES).transform((v) => v ?? EXTEND_MINUTES),
});
export type ExtendSessionInput = z.input<typeof ExtendSessionInput>;

export const EndSessionInput = z.object({ sessionId: id });
export type EndSessionInput = z.input<typeof EndSessionInput>;
