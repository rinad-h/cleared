"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { FieldError, FormMessage } from "@/components/forms/messages";
import { PasswordInput } from "@/components/forms/password-input";
import { useHydrated } from "@/components/auth/use-hydrated";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authClient, BUSY_MESSAGE, GENERIC_AUTH_MESSAGE } from "@/lib/auth-client";
import { ChangePasswordForm as ChangePasswordSchema } from "@/lib/schemas/identity";

type Errors = { currentPassword?: string[]; newPassword?: string[] };

/** Change password; other sessions are signed out (`revokeOtherSessions`). */
export function ChangePasswordForm() {
  const hydrated = useHydrated();
  const form = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const parsed = ChangePasswordSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      const { error: authError } = await authClient.changePassword({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      });
      if (!authError) {
        form.current?.reset();
        setSuccess("Password changed. Your other devices are signed out.");
      } else if (authError.status === 400 || authError.status === 401) {
        setFieldErrors({ currentPassword: ["Your current password is incorrect."] });
      } else if (authError.status === 429) {
        setError("Too many attempts. Wait a minute and try again.");
      } else if (authError.status === 503) {
        setError(BUSY_MESSAGE);
      } else {
        setError(GENERIC_AUTH_MESSAGE);
      }
    } catch {
      setError(GENERIC_AUTH_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={form} method="post" noValidate onSubmit={onSubmit} className="max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Current password</Label>
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          required
          aria-invalid={fieldErrors.currentPassword ? true : undefined}
          aria-describedby={fieldErrors.currentPassword ? "currentPassword-error" : undefined}
        />
        <FieldError id="currentPassword-error" errors={fieldErrors.currentPassword} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">New password</Label>
        <PasswordInput
          id="newPassword"
          name="newPassword"
          autoComplete="new-password"
          required
          aria-invalid={fieldErrors.newPassword ? true : undefined}
          aria-describedby={fieldErrors.newPassword ? "newPassword-error newPassword-hint" : "newPassword-hint"}
        />
        <p id="newPassword-hint" className="text-sm text-muted-foreground">
          At least 8 characters.
        </p>
        <FieldError id="newPassword-error" errors={fieldErrors.newPassword} />
      </div>
      <FormMessage error={error} success={success} />
      <Button type="submit" disabled={!hydrated || pending}>
        {pending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}

/** Ends every session of this account, then goes to sign-in. */
export function SignOutEverywhere() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={!hydrated || pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const { error: authError } = await authClient.revokeSessions();
            if (authError) {
              setError(GENERIC_AUTH_MESSAGE);
              setPending(false);
              return;
            }
            await authClient.signOut().catch(() => undefined);
            router.replace("/sign-in");
            router.refresh();
          } catch {
            setError(GENERIC_AUTH_MESSAGE);
            setPending(false);
          }
        }}
      >
        {pending ? "Signing out…" : "Sign out everywhere"}
      </Button>
      <FormMessage error={error} />
    </div>
  );
}
