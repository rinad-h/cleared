"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { regenerateJoinLink, updateSettings } from "@/actions/settings";
import { useHydrated } from "@/components/auth/use-hydrated";
import { FieldError, FormMessage } from "@/components/forms/messages";
import { TimeZoneField } from "@/components/forms/time-zone-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ActionResult } from "@/server/domain/errors";

export function SettingsForm({ name, timezone, timeZones }: { name: string; timezone: string; timeZones: string[] }) {
  const [state, submit, pending] = useActionState(
    async (_prev: ActionResult<unknown> | null, formData: FormData) => updateSettings(formData),
    null,
  );
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={submit} className="max-w-sm space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Makerspace name</Label>
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={name}
          aria-invalid={fieldErrors?.name ? true : undefined}
          aria-describedby={fieldErrors?.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" errors={fieldErrors?.name} />
      </div>
      <TimeZoneField timeZones={timeZones} defaultValue={timezone} errors={fieldErrors?.timezone} />
      <FormMessage
        error={state && !state.ok && !fieldErrors ? state.error : null}
        success={state?.ok ? "Settings saved." : null}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}

export function JoinLinkCard({ joinUrl }: { joinUrl: string }) {
  const hydrated = useHydrated();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <Label htmlFor="join-url">Current join link</Label>
      <Input id="join-url" readOnly value={joinUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono" />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!hydrated}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(joinUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              toast.error("Couldn't copy. Select the link and copy it.");
            }
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" disabled={!hydrated || pending}>
              <RefreshCw aria-hidden="true" />
              {pending ? "Regenerating…" : "Regenerate"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Regenerate the join link?</AlertDialogTitle>
            <AlertDialogDescription>
              The current link stops working immediately. Existing members aren&apos;t affected.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  startTransition(async () => {
                    const result = await regenerateJoinLink({});
                    if (result.ok) toast.success("New join link created. The old one no longer works.");
                    else toast.error(result.error);
                  })
                }
              >
                Regenerate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? "Join link copied" : ""}
      </p>
    </div>
  );
}
