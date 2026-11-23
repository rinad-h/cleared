"use client";

import { useState, useTransition } from "react";
import { returnMachineToService, setMachineOutOfService, updateOutageDetails } from "@/actions/machine-status";
import { useHydrated } from "@/components/auth/use-hydrated";
import { useActionResult } from "@/components/catalog/use-action-result";
import { FieldError, FormMessage } from "@/components/forms/messages";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fromDateTimeLocal } from "@/lib/format";
import { STATUS_NOTE_MAX } from "@/lib/schemas/faults";
import type { MachineStatus } from "@/server/domain/enums";

export type StatusPanelProps = {
  machineId: string;
  status: MachineStatus;
  timeZone: string;
  /** Current outage details as `datetime-local` / text (formatted on the server). */
  note: string | null;
  expectedBackLocal: string | null;
  /** `datetime-local` min: now, in the makerspace's time zone. */
  nowLocal: string;
  /** Open faults that took it out of service: "Return to service" is blocked. */
  blocked: boolean;
};

/**
 * Staff status controls on machine detail (FR-13, Phase 5 §7.2): set out of
 * service, edit the note / expected-back time, and return to service (blocked
 * while an out-of-service fault is open). Times are entered in the
 * makerspace's time zone and sent as UTC ms.
 */
export function StatusPanel(props: StatusPanelProps) {
  if (props.status === "retired") return null;
  return props.status === "available" ? <SetOutForm {...props} /> : <OutageForm {...props} />;
}

function OutageFields({
  idPrefix,
  note,
  expectedBackLocal,
  nowLocal,
  fieldErrors,
}: {
  idPrefix: string;
  note: string | null;
  expectedBackLocal: string | null;
  nowLocal: string;
  fieldErrors?: Record<string, string[] | undefined>;
}) {
  const [length, setLength] = useState(note?.length ?? 0);
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-note`}>Public note (optional)</Label>
        <Input
          id={`${idPrefix}-note`}
          name="note"
          defaultValue={note ?? ""}
          maxLength={STATUS_NOTE_MAX}
          onChange={(e) => setLength(e.target.value.length)}
          aria-describedby={`${idPrefix}-note-count ${idPrefix}-note-error`}
        />
        <p id={`${idPrefix}-note-count`} className="text-sm text-muted-foreground">
          {length} / {STATUS_NOTE_MAX}. Members see this on the board and the pass.
        </p>
        <FieldError id={`${idPrefix}-note-error`} errors={fieldErrors?.note} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-back`}>Expected back (optional)</Label>
        <Input
          id={`${idPrefix}-back`}
          name="expectedBackLocal"
          type="datetime-local"
          defaultValue={expectedBackLocal ?? ""}
          min={nowLocal}
          className="w-auto"
          aria-describedby={`${idPrefix}-back-error`}
        />
        <FieldError id={`${idPrefix}-back-error`} errors={fieldErrors?.expectedBackAt} />
      </div>
    </>
  );
}

function readOutage(form: FormData, timeZone: string) {
  const local = String(form.get("expectedBackLocal") ?? "");
  return {
    note: String(form.get("note") ?? ""),
    expectedBackAt: local ? (fromDateTimeLocal(local, timeZone) ?? "") : "",
  };
}

function SetOutForm({ machineId, timeZone, nowLocal }: StatusPanelProps) {
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const { error, fieldErrors, report } = useActionResult();
  return (
    <form
      aria-label="Set out of service"
      className="max-w-xl space-y-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const reason = String(form.get("reason") ?? "maintenance");
        startTransition(async () => {
          report(
            await setMachineOutOfService({ machineId, reason, ...readOutage(form, timeZone) }),
            "Machine is now out of service.",
          );
        });
      }}
    >
      <h2 className="text-lg font-semibold">Set out of service</h2>
      <div className="space-y-2">
        <Label htmlFor="oos-reason">Reason</Label>
        <NativeSelect id="oos-reason" name="reason" defaultValue="maintenance">
          <option value="maintenance">Maintenance</option>
          <option value="other">Other</option>
        </NativeSelect>
      </div>
      <OutageFields idPrefix="oos" note={null} expectedBackLocal={null} nowLocal={nowLocal} fieldErrors={fieldErrors} />
      <FormMessage error={error} />
      <Button type="submit" variant="destructive" disabled={!hydrated || pending}>
        {pending ? "Saving…" : "Set out of service"}
      </Button>
      <p className="text-sm text-muted-foreground">Any active session on this machine ends.</p>
    </form>
  );
}

function OutageForm({ machineId, timeZone, note, expectedBackLocal, nowLocal, blocked }: StatusPanelProps) {
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const { error, fieldErrors, report } = useActionResult();
  const returning = useActionResult();
  return (
    <div className="max-w-xl space-y-4 rounded-lg border p-4">
      <form
        aria-label="Out-of-service details"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          startTransition(async () => {
            report(await updateOutageDetails({ machineId, ...readOutage(form, timeZone) }), "Details saved.");
          });
        }}
      >
        <h2 className="text-lg font-semibold">Out-of-service details</h2>
        <OutageFields
          idPrefix="outage"
          note={note}
          expectedBackLocal={expectedBackLocal}
          nowLocal={nowLocal}
          fieldErrors={fieldErrors}
        />
        <FormMessage error={error} />
        <Button type="submit" variant="outline" disabled={!hydrated || pending}>
          Save details
        </Button>
      </form>
      <div className="space-y-2 border-t pt-4">
        <Button
          type="button"
          disabled={!hydrated || pending || blocked}
          aria-describedby={blocked ? "return-blocked" : undefined}
          onClick={() =>
            startTransition(async () => {
              returning.report(await returnMachineToService({ machineId }), "Machine is back in service.");
            })
          }
        >
          Return to service
        </Button>
        {blocked ? (
          <p id="return-blocked" className="text-sm text-muted-foreground">
            Resolve open out-of-service faults by logging a service record.
          </p>
        ) : null}
        <FormMessage error={returning.error} />
      </div>
    </div>
  );
}
