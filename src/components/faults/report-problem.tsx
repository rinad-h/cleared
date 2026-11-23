"use client";

import { useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";
import { reportFault } from "@/actions/faults";
import { useHydrated } from "@/components/auth/use-hydrated";
import { useActionResult } from "@/components/catalog/use-action-result";
import { FieldError, FormMessage } from "@/components/forms/messages";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FAULT_DESCRIPTION_MAX, FAULT_DESCRIPTION_MIN } from "@/lib/schemas/faults";

/**
 * "Report a problem" on the pass (FR-12, Phase 5 §7.1): a bottom sheet with a
 * description and "take out of service". The `clientRequestId` is created
 * when the sheet opens, so a double-tap reports once. The action refreshes
 * the pass, so a take-out-of-service report shows OUT OF SERVICE at once.
 */
export function ReportProblem({ machineId, machineName }: { machineId: string; machineName: string }) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [length, setLength] = useState(0);
  const [pending, startTransition] = useTransition();
  const { error, fieldErrors, report, clear } = useActionResult();

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setRequestId(crypto.randomUUID());
          setLength(0);
        } else {
          clear();
        }
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        <Button type="button" variant="link" className="min-h-11 px-0" disabled={!hydrated}>
          <TriangleAlert aria-hidden="true" />
          Report a problem
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-md overflow-y-auto rounded-t-xl p-4">
        <SheetTitle>Report a problem</SheetTitle>
        <SheetDescription>{machineName}: staff see your report in the console.</SheetDescription>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await reportFault({
                machineId,
                description: String(form.get("description") ?? ""),
                takeOutOfService: form.get("takeOutOfService") === "on",
                clientRequestId: requestId,
              });
              if (report(result, "Thanks, staff can see this in the console.")) setOpen(false);
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="fault-description">What&apos;s wrong?</Label>
            <Textarea
              id="fault-description"
              name="description"
              required
              minLength={FAULT_DESCRIPTION_MIN}
              maxLength={FAULT_DESCRIPTION_MAX}
              rows={4}
              onChange={(e) => setLength(e.target.value.trim().length)}
              aria-describedby="fault-description-count fault-description-error"
              aria-invalid={fieldErrors?.description ? true : undefined}
            />
            <p id="fault-description-count" className="text-sm text-muted-foreground" aria-live="polite">
              {length < FAULT_DESCRIPTION_MIN
                ? `At least ${FAULT_DESCRIPTION_MIN} characters (${length} so far).`
                : `${length} / ${FAULT_DESCRIPTION_MAX}`}
            </p>
            <FieldError id="fault-description-error" errors={fieldErrors?.description} />
          </div>
          <div className="flex items-start gap-3">
            <input
              id="fault-take-out"
              name="takeOutOfService"
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-primary"
              aria-describedby="fault-take-out-help"
            />
            <div>
              <Label htmlFor="fault-take-out">Unsafe or not working: take out of service</Label>
              <p id="fault-take-out-help" className="text-sm text-muted-foreground">
                Everyone will see this machine as out of service until staff fix it.
              </p>
            </div>
          </div>
          <FormMessage error={error} />
          <Button type="submit" size="lg" className="min-h-11 w-full" disabled={pending || length < FAULT_DESCRIPTION_MIN}>
            {pending ? "Sending…" : "Submit report"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
