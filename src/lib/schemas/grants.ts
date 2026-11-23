import { z } from "zod";
import { hasControlChars } from "@/server/domain/identity";
import { clientRequestId, id } from "@/lib/validation";

/**
 * Phase 3 input schemas (sign-off, revoke, member detail), shared by server
 * actions (`parse()`), services and client forms. Pure: no server-only imports.
 */

export const SignOffInput = z.object({
  memberId: id,
  certificationId: id,
  /** Created when the dialog opens, so a double-tap or retry sends the same one. */
  clientRequestId,
});
export type SignOffInput = z.output<typeof SignOffInput>;

export const REVOKE_REASON_MIN = 3;
export const REVOKE_REASON_MAX = 300;

export const RevokeInput = z.object({
  grantId: id,
  reason: z
    .string({ error: "Enter a reason." })
    .trim()
    .min(REVOKE_REASON_MIN, `Use at least ${REVOKE_REASON_MIN} characters.`)
    .max(REVOKE_REASON_MAX, `Use at most ${REVOKE_REASON_MAX} characters.`)
    .refine((v) => !hasControlChars(v), "Remove the special characters."),
});
export type RevokeInput = z.output<typeof RevokeInput>;

export const MemberDetailInput = z.object({ memberId: id });
export type MemberDetailInput = z.output<typeof MemberDetailInput>;
