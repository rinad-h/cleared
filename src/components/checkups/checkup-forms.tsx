"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { createCheckup, updateCheckup } from "@/actions/checkups";
import { useHydrated } from "@/components/auth/use-hydrated";
import { useActionResult } from "@/components/catalog/use-action-result";
import { FieldError, FormMessage } from "@/components/forms/messages";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CHECKUP_INSTRUCTIONS_MAX,
  CHECKUP_INTERVAL_MAX,
  CHECKUP_INTERVAL_MIN,
  CHECKUP_INTERVAL_PRESETS,
  CHECKUP_NAME_MAX,
  CHECKUP_NAME_MIN,
} from "@/lib/schemas/checkups";

export type CheckupRow = { id: string; name: string; intervalDays: number; instructions: string | null; active: boolean };

/**
 * Staff: add or edit a checkup on machine detail (FR-16). The interval is a
 * number of days, with preset buttons that fill the field. Uncontrolled inputs
 * (hydration-safe); the presets set the input's value directly.
 */
export function CheckupDialog({ machineId, checkup }: { machineId: string; checkup?: CheckupRow }) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { error, fieldErrors, report, clear } = useActionResult();
  const p = checkup ? `checkup-${checkup.id}` : "checkup-new";
  const describe = (name: string) => (fieldErrors?.[name] ? `${p}-${name}-error` : undefined);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) clear();
      }}
    >
      <DialogTrigger asChild>
        {checkup ? (
          <Button type="button" variant="outline" size="sm" disabled={!hydrated} aria-label={`Edit ${checkup.name}`}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={!hydrated}>
            <Plus aria-hidden="true" />
            Add checkup
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{checkup ? `Edit ${checkup.name}` : "Add checkup"}</DialogTitle>
        <DialogDescription>A recurring task. It&apos;s advisory: it never stops anyone using the machine.</DialogDescription>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            if (checkup) data.set("checkupId", checkup.id);
            else data.set("machineId", machineId);
            startTransition(async () => {
              const result = checkup ? await updateCheckup(data) : await createCheckup(data);
              if (report(result, checkup ? "Checkup saved." : "Checkup added.")) setOpen(false);
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`${p}-name`}>Name</Label>
            <Input
              id={`${p}-name`}
              name="name"
              required
              minLength={CHECKUP_NAME_MIN}
              maxLength={CHECKUP_NAME_MAX}
              placeholder="e.g. Clean the lens and mirrors"
              defaultValue={checkup?.name}
              aria-invalid={fieldErrors?.name ? true : undefined}
              aria-describedby={describe("name")}
            />
            <FieldError id={`${p}-name-error`} errors={fieldErrors?.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${p}-interval`}>Every (days)</Label>
            <Input
              id={`${p}-interval`}
              name="intervalDays"
              type="number"
              inputMode="numeric"
              required
              min={CHECKUP_INTERVAL_MIN}
              max={CHECKUP_INTERVAL_MAX}
              step={1}
              defaultValue={checkup?.intervalDays ?? 30}
              className="w-32"
              aria-invalid={fieldErrors?.intervalDays ? true : undefined}
              aria-describedby={describe("intervalDays")}
            />
            <div className="flex flex-wrap gap-2" role="group" aria-label="Common intervals">
              {CHECKUP_INTERVAL_PRESETS.map((days) => (
                <Button
                  key={days}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    const input = e.currentTarget.form?.elements.namedItem("intervalDays");
                    if (input instanceof HTMLInputElement) input.value = String(days);
                  }}
                >
                  {days} days
                </Button>
              ))}
            </div>
            <FieldError id={`${p}-intervalDays-error`} errors={fieldErrors?.intervalDays} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${p}-instructions`}>Instructions (optional)</Label>
            <Textarea
              id={`${p}-instructions`}
              name="instructions"
              rows={4}
              maxLength={CHECKUP_INSTRUCTIONS_MAX}
              defaultValue={checkup?.instructions ?? ""}
              aria-invalid={fieldErrors?.instructions ? true : undefined}
              aria-describedby={describe("instructions")}
            />
            <FieldError id={`${p}-instructions-error`} errors={fieldErrors?.instructions} />
          </div>
          <FormMessage error={error} />
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : checkup ? "Save" : "Add checkup"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Staff: deactivate (hide from the lists) or reactivate a checkup. */
export function CheckupActiveToggle({ checkup }: { checkup: CheckupRow }) {
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const { report } = useActionResult();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={!hydrated || pending}
      aria-label={`${checkup.active ? "Deactivate" : "Reactivate"} ${checkup.name}`}
      onClick={() =>
        startTransition(async () => {
          const result = await updateCheckup({ checkupId: checkup.id, active: !checkup.active });
          report(result, checkup.active ? "Checkup deactivated." : "Checkup reactivated.");
        })
      }
    >
      {checkup.active ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
