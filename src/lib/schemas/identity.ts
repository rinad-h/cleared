import { z } from "zod";
import { MEMBER_STATUSES, ROLES } from "@/server/domain/enums";
import { DISPLAY_NAME_MAX, hasControlChars, isSupportedTimeZone } from "@/server/domain/identity";
import { id, optionalText } from "@/lib/validation";

/**
 * Phase 1 input schemas, shared by server actions (`parse()`) and client forms.
 * Pure: no server-only imports.
 */

/** An empty form field means "not sent". */
const emptyToUndefined = (value: unknown) => (value === "" || value === null ? undefined : value);

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const DisplayName = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(DISPLAY_NAME_MAX, `Use at most ${DISPLAY_NAME_MAX} characters.`)
  .refine((v) => !hasControlChars(v), "Remove the special characters from your name.");

export const Email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));

/** At least 8 characters, at most 128; no composition rules (NIST SP 800-63B). */
export const NewPassword = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);

/** Client-side checks mirroring Better Auth's (and the display-name rule in src/lib/auth.ts). */
export const SignUpForm = z.object({
  name: DisplayName,
  email: Email,
  password: NewPassword,
});

export const SignInForm = z.object({
  email: Email,
  password: z.string().min(1, "Enter your password."),
});

export const ChangePasswordForm = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: NewPassword,
});

export const MakerspaceName = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(80, "Use at most 80 characters.")
  .refine((v) => !hasControlChars(v), "Remove the special characters.");

export const TimeZone = z
  .string()
  .trim()
  .refine(isSupportedTimeZone, "Choose a time zone from the list.");

export const SetupInput = z.object({
  makerspaceName: MakerspaceName,
  timezone: TimeZone,
});
export type SetupInput = z.output<typeof SetupInput>;

export const JoinToken = z.string().trim().min(1).max(64);

export const JoinInput = z.object({ token: JoinToken });
export type JoinInput = z.output<typeof JoinInput>;

export const SettingsPatch = z.object({
  name: z.preprocess(emptyToUndefined, MakerspaceName.optional()),
  timezone: z.preprocess(emptyToUndefined, TimeZone.optional()),
});
export type SettingsPatch = z.output<typeof SettingsPatch>;

export const NoInput = z.object({});

export const MemberPatch = z.object({
  id,
  role: z.preprocess(emptyToUndefined, z.enum(ROLES).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(MEMBER_STATUSES).optional()),
  suspensionReason: optionalText(300),
});
export type MemberPatch = z.output<typeof MemberPatch>;

export const MEMBER_PAGE_SIZE = 50;

export const MemberSearch = z.object({
  q: optionalText(80),
  role: z.preprocess(emptyToUndefined, z.enum(ROLES).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(MEMBER_STATUSES).optional()),
  cursor: z.preprocess(emptyToUndefined, z.string().max(400).optional()),
  limit: z.coerce.number().int().min(1).max(200).default(MEMBER_PAGE_SIZE),
});
export type MemberSearch = z.output<typeof MemberSearch>;
