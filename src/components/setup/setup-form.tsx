"use client";

import { useActionState } from "react";
import { completeSetup } from "@/actions/setup";
import { FieldError, FormMessage } from "@/components/forms/messages";
import { TimeZoneField } from "@/components/forms/time-zone-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/server/domain/errors";

export function SetupForm({ timeZones, defaultTimeZone }: { timeZones: string[]; defaultTimeZone: string }) {
  const [state, submit, pending] = useActionState(
    async (_prev: ActionResult<unknown> | null, formData: FormData) => completeSetup(formData),
    null,
  );
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="makerspaceName">Makerspace name</Label>
        <Input
          id="makerspaceName"
          name="makerspaceName"
          required
          minLength={2}
          maxLength={80}
          placeholder="Demo Makerspace"
          aria-invalid={fieldErrors?.makerspaceName ? true : undefined}
          aria-describedby={fieldErrors?.makerspaceName ? "makerspaceName-error" : undefined}
        />
        <FieldError id="makerspaceName-error" errors={fieldErrors?.makerspaceName} />
      </div>
      <TimeZoneField timeZones={timeZones} defaultValue={defaultTimeZone} errors={fieldErrors?.timezone} />
      <FormMessage error={state && !state.ok && !fieldErrors ? state.error : null} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Setting up…" : "Finish setup"}
      </Button>
    </form>
  );
}
