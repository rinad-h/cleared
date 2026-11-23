"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import Link from "next/link";
import { FieldError, FormMessage } from "@/components/forms/messages";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GENERIC_AUTH_MESSAGE, signInErrorMessage, signInWithRetry } from "@/lib/auth-client";
import { SignInForm as SignInSchema } from "@/lib/schemas/identity";
import { useHydrated } from "./use-hydrated";

type Errors = { email?: string[]; password?: string[] };

export function SignInForm({ next, defaultEmail }: { next: string; defaultEmail?: string }) {
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = SignInSchema.safeParse(data);
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      setError(null);
      return;
    }
    setFieldErrors({});
    setError(null);
    setPending(true);
    try {
      const { result } = await signInWithRetry(parsed.data);
      if (result.error) {
        setError(signInErrorMessage(result.error));
        setPending(false);
        return;
      }
      window.location.assign(next);
    } catch {
      setError(GENERIC_AUTH_MESSAGE);
      setPending(false);
    }
  }

  const signUpHref = `/sign-up?next=${encodeURIComponent(next)}`;

  return (
    <form method="post" noValidate onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={defaultEmail}
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
          autoComplete="current-password"
          required
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
        />
        <FieldError id="password-error" errors={fieldErrors.password} />
      </div>
      <FormMessage error={error} />
      <Button type="submit" className="w-full" size="lg" disabled={!hydrated || pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-sm text-muted-foreground">Forgot your password? Ask staff to reset it.</p>
      <p className="text-sm">
        New here?{" "}
        <Link href={signUpHref} prefetch={false} className="font-medium underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}
