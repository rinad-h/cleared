"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import Link from "next/link";
import { FieldError, FormMessage } from "@/components/forms/messages";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GENERIC_AUTH_MESSAGE,
  isAlreadyRegistered,
  signUpErrorMessage,
  signUpWithRetry,
} from "@/lib/auth-client";
import { SignUpForm as SignUpSchema } from "@/lib/schemas/identity";
import { useHydrated } from "./use-hydrated";

type Errors = { name?: string[]; email?: string[]; password?: string[] };

export function SignUpForm({ next }: { next: string }) {
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});

  const signInHref = (email?: string) =>
    `/sign-in?next=${encodeURIComponent(next)}${email ? `&email=${encodeURIComponent(email)}` : ""}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = SignUpSchema.safeParse(data);
    setError(null);
    setExistingEmail(null);
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      const { result, retried } = await signUpWithRetry(parsed.data);
      if (!result.error) {
        window.location.assign(next);
        return;
      }
      if (isAlreadyRegistered(result.error)) {
        if (retried) {
          // A retry after a 503 got "already exists": the first attempt finished after all.
          window.location.assign(signInHref(parsed.data.email));
          return;
        }
        setExistingEmail(parsed.data.email);
      }
      setError(signUpErrorMessage(result.error));
      setPending(false);
    } catch {
      setError(GENERIC_AUTH_MESSAGE);
      setPending(false);
    }
  }

  return (
    <form method="post" noValidate onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          maxLength={80}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? "name-error name-hint" : "name-hint"}
        />
        <p id="name-hint" className="text-sm text-muted-foreground">
          Staff see this name on your pass.
        </p>
        <FieldError id="name-error" errors={fieldErrors.name} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
        />
        <FieldError id="email-error" errors={fieldErrors.email} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? "password-error password-hint" : "password-hint"}
        />
        <p id="password-hint" className="text-sm text-muted-foreground">
          At least 8 characters.
        </p>
        <FieldError id="password-error" errors={fieldErrors.password} />
      </div>
      <FormMessage error={error} />
      {existingEmail ? (
        <p className="text-sm">
          <Link href={signInHref(existingEmail)} prefetch={false} className="font-medium underline underline-offset-4">
            Sign in instead
          </Link>
        </p>
      ) : null}
      <Button type="submit" className="w-full" size="lg" disabled={!hydrated || pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-sm text-muted-foreground">
        Cleared keeps your name, email and machine-use records. It is a record-keeping tool, not a safety
        system:{" "}
        <Link href="/help" prefetch={false} className="underline underline-offset-4">
          see what it does and doesn&apos;t do
        </Link>
        .
      </p>
      <p className="text-sm">
        Already have an account?{" "}
        <Link href={signInHref()} prefetch={false} className="font-medium underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
