"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Info } from "lucide-react";
import { logServiceRecord } from "@/actions/service-records";
import { useHydrated } from "@/components/auth/use-hydrated";
import { FieldError, FormMessage } from "@/components/forms/messages";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fromDateTimeLocal } from "@/lib/format";
import { PARTS_USED_MAX, WORK_DONE_MAX, WORK_DONE_MIN } from "@/lib/schemas/faults";
import { cn } from "@/lib/utils";
import { SERVICE_OUTCOMES, SERVICE_TYPES, type ServiceOutcome, type ServiceType } from "@/server/domain/enums";
import type { ActionResult } from "@/server/domain/errors";
import { OUTCOME_LABELS, SERVICE_TYPE_LABELS } from "./labels";

export type ServiceFormFault = { id: string; label: string; tookOutOfService: boolean };
export type ServiceFormCheckup = { id: string; name: string; instructions: string | null; dueLabel: string };

export type ServiceFormProps = {
  machineId: string;
  timeZone: string;
  /** `datetime-local` max (future dates disabled): now in the makerspace's time zone. */
  nowLocal: string;
  me: { id: string; displayName: string };
  /** Other active staff and admins. */
  staff: { id: string; displayName: string }[];
  /** Open faults on this machine (none in correction mode). */
  faults: ServiceFormFault[];
  /** Pre-ticked from `?faultIds=`. */
  preselectedFaultIds: string[];
  /** This machine's active checkups (none in correction mode). */
  checkups: ServiceFormCheckup[];
  /** From `?checkupId=` ("Log checkup"): starts as a scheduled checkup for it. */
  preselectedCheckupId: string | null;
  /** Correction mode: the record being corrected, pre-filled. */
  correction: {
    id: string;
    performedOnLabel: string;
    performedAtLocal: string;
    performedByMemberId: string | null;
    externalTechnician: string | null;
    type: ServiceType;
    workDone: string;
    partsUsed: string | null;
    minutesSpent: number | null;
    outcome: ServiceOutcome;
  } | null;
};

/** Outcomes the form suggests first for each type (the service accepts any, D7). */
const SUGGESTED: Record<ServiceType, readonly ServiceOutcome[]> = {
  repair: ["returned_to_service", "still_out_of_service"],
  scheduled_checkup: ["passed", "issues_found"],
  inspection: ["passed", "issues_found"],
  cleaning: ["passed", "issues_found"],
  calibration: ["passed", "issues_found"],
  other: SERVICE_OUTCOMES,
};

type Who = "me" | "staff" | "external";

/**
 * Log service (FR-15, Phase 5 §7.2): phone-first, aiming at ≤ 60 s. Posts to
 * `logServiceRecord`, which redirects to machine detail on success. The
 * `clientRequestId` is created on the first submit and kept for retries, so a
 * double-tap logs one record.
 */
export function ServiceForm(props: ServiceFormProps) {
  const { machineId, timeZone, nowLocal, me, staff, faults, preselectedFaultIds, checkups, correction } = props;
  const preselectedCheckup = checkups.find((c) => c.id === props.preselectedCheckupId) ?? null;
  const hydrated = useHydrated();
  const [state, dispatch, pending] = useActionState(
    async (_prev: ActionResult<unknown> | null, payload: Record<string, unknown>) => logServiceRecord(payload),
    null,
  );
  const requestId = useRef<string | null>(null);

  const [when, setWhen] = useState<"now" | "earlier">(correction ? "earlier" : "now");
  const initialWho: Who = correction
    ? correction.externalTechnician
      ? "external"
      : correction.performedByMemberId && correction.performedByMemberId !== me.id
        ? "staff"
        : "me"
    : "me";
  const [who, setWho] = useState<Who>(initialWho);
  const [type, setType] = useState<ServiceType>(correction?.type ?? (preselectedCheckup ? "scheduled_checkup" : "repair"));
  const [checkupId, setCheckupId] = useState<string>(preselectedCheckup?.id ?? "");
  const linkedCheckup = type === "scheduled_checkup" ? (checkups.find((c) => c.id === checkupId) ?? null) : null;
  const [outcome, setOutcome] = useState<ServiceOutcome | null>(correction?.outcome ?? null);
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(preselectedFaultIds.filter((id) => faults.some((f) => f.id === id))),
  );

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const error = state && !state.ok && !state.fieldErrors ? state.error : null;
  const stillBlocking = faults.filter((f) => f.tookOutOfService && !ticked.has(f.id)).length;
  const suggested = SUGGESTED[type];
  const outcomes = [...suggested, ...SERVICE_OUTCOMES.filter((o) => !suggested.includes(o))];

  return (
    <form
      aria-label={correction ? "Correct a service record" : "Log service"}
      className="max-w-xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const local = String(form.get("performedAtLocal") ?? "");
        const performedAt = when === "earlier" && local ? (fromDateTimeLocal(local, timeZone) ?? "") : "";
        requestId.current ??= crypto.randomUUID();
        const payload: Record<string, unknown> = {
          machineId,
          performedAt,
          performedByMemberId: who === "staff" ? String(form.get("performedByMemberId") ?? "") : who === "me" ? me.id : "",
          externalTechnician: who === "external" ? String(form.get("externalTechnician") ?? "") : "",
          type,
          workDone: String(form.get("workDone") ?? ""),
          partsUsed: String(form.get("partsUsed") ?? ""),
          minutesSpent: String(form.get("minutesSpent") ?? ""),
          faultIds: [...ticked],
          checkupId: linkedCheckup?.id ?? "",
          outcome: outcome ?? "",
          correctsRecordId: correction?.id ?? "",
          clientRequestId: requestId.current,
        };
        startTransition(() => dispatch(payload));
      }}
    >
      {correction ? (
        <p className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm" role="note">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          This adds a new record that corrects the one from {correction.performedOnLabel}. The original stays in the
          history.
        </p>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">When</legend>
        <div className="flex flex-wrap gap-2">
          <Chip name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")}>
            Now
          </Chip>
          <Chip name="when" value="earlier" checked={when === "earlier"} onChange={() => setWhen("earlier")}>
            Earlier…
          </Chip>
        </div>
        {when === "earlier" ? (
          <div className="space-y-1">
            <Label htmlFor="service-performed-at">Date and time</Label>
            <Input
              id="service-performed-at"
              name="performedAtLocal"
              type="datetime-local"
              required
              max={nowLocal}
              defaultValue={correction?.performedAtLocal ?? nowLocal}
              className="w-auto"
              aria-describedby="service-performed-at-error"
            />
          </div>
        ) : null}
        <FieldError id="service-performed-at-error" errors={fieldErrors?.performedAt} />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who did the work</legend>
        <div className="flex flex-wrap gap-2">
          <Chip name="who" value="me" checked={who === "me"} onChange={() => setWho("me")}>
            Me
          </Chip>
          <Chip name="who" value="staff" checked={who === "staff"} onChange={() => setWho("staff")} disabled={staff.length === 0}>
            Other staff
          </Chip>
          <Chip name="who" value="external" checked={who === "external"} onChange={() => setWho("external")}>
            External technician
          </Chip>
        </div>
        {who === "staff" ? (
          <div className="space-y-1">
            <Label htmlFor="service-performer">Staff member</Label>
            <NativeSelect
              id="service-performer"
              name="performedByMemberId"
              defaultValue={correction?.performedByMemberId ?? staff[0]?.id}
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : who === "external" ? (
          <div className="space-y-1">
            <Label htmlFor="service-external">Technician or company</Label>
            <Input
              id="service-external"
              name="externalTechnician"
              required
              minLength={2}
              maxLength={120}
              defaultValue={correction?.externalTechnician ?? ""}
              aria-describedby="service-external-error"
            />
            <FieldError id="service-external-error" errors={fieldErrors?.externalTechnician} />
          </div>
        ) : null}
        <FieldError id="service-performer-error" errors={fieldErrors?.performedByMemberId} />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Type</legend>
        <div className="flex flex-wrap gap-2">
          {SERVICE_TYPES.map((t) => (
            <Chip key={t} name="type" value={t} checked={type === t} onChange={() => setType(t)}>
              {SERVICE_TYPE_LABELS[t]}
            </Chip>
          ))}
        </div>
      </fieldset>

      {!correction && type === "scheduled_checkup" && checkups.length > 0 ? (
        <div className="space-y-2">
          <Label htmlFor="service-checkup">Which checkup?</Label>
          <NativeSelect
            id="service-checkup"
            value={checkupId}
            onChange={(e) => setCheckupId(e.target.value)}
            aria-describedby="service-checkup-error"
          >
            <option value="">None (not a recurring checkup)</option>
            {checkups.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.dueLabel})
              </option>
            ))}
          </NativeSelect>
          {linkedCheckup?.instructions ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm" role="note" aria-label="Checkup instructions">
              <p className="font-medium">Instructions</p>
              <p className="whitespace-pre-line break-words text-muted-foreground">{linkedCheckup.instructions}</p>
            </div>
          ) : null}
          <FieldError id="service-checkup-error" errors={fieldErrors?.checkupId} />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="service-work-done">What was done</Label>
        <Textarea
          id="service-work-done"
          name="workDone"
          required
          minLength={WORK_DONE_MIN}
          maxLength={WORK_DONE_MAX}
          rows={4}
          defaultValue={correction?.workDone ?? ""}
          aria-describedby="service-work-done-error"
          aria-invalid={fieldErrors?.workDone ? true : undefined}
        />
        <FieldError id="service-work-done-error" errors={fieldErrors?.workDone} />
      </div>

      {!correction && faults.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Faults this resolves</legend>
          <ul className="space-y-2">
            {faults.map((f) => (
              <li key={f.id} className="flex items-start gap-3">
                <input
                  id={`fault-${f.id}`}
                  type="checkbox"
                  checked={ticked.has(f.id)}
                  onChange={(e) =>
                    setTicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(f.id);
                      else next.delete(f.id);
                      return next;
                    })
                  }
                  className="mt-1 size-5 shrink-0 accent-primary"
                />
                <Label htmlFor={`fault-${f.id}`} className="font-normal break-words">
                  {f.label}
                </Label>
              </li>
            ))}
          </ul>
          <FieldError id="service-faults-error" errors={fieldErrors?.faultIds} />
        </fieldset>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Outcome</legend>
        <div className="flex flex-wrap gap-2">
          {outcomes.map((o) => (
            <Chip key={o} name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} muted={!suggested.includes(o)}>
              {OUTCOME_LABELS[o]}
            </Chip>
          ))}
        </div>
        {outcome === "returned_to_service" && !correction && stillBlocking > 0 ? (
          <p className="text-sm text-muted-foreground" role="note">
            Machine stays out of service: another fault is still open.
          </p>
        ) : null}
        {correction ? (
          <p className="text-sm text-muted-foreground">A correction never changes the machine&apos;s status.</p>
        ) : null}
        <FieldError id="service-outcome-error" errors={fieldErrors?.outcome} />
      </fieldset>

      <details className="space-y-3 rounded-md border p-3" open={Boolean(correction?.partsUsed || correction?.minutesSpent)}>
        <summary className="cursor-pointer text-sm font-medium">More details</summary>
        <div className="space-y-1 pt-3">
          <Label htmlFor="service-parts">Parts used (optional)</Label>
          <Input id="service-parts" name="partsUsed" maxLength={PARTS_USED_MAX} defaultValue={correction?.partsUsed ?? ""} />
          <FieldError id="service-parts-error" errors={fieldErrors?.partsUsed} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="service-minutes">Minutes spent (optional)</Label>
          <Input
            id="service-minutes"
            name="minutesSpent"
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            defaultValue={correction?.minutesSpent ?? ""}
            className="w-32"
          />
          <FieldError id="service-minutes-error" errors={fieldErrors?.minutesSpent} />
        </div>
      </details>

      <FormMessage error={error} />
      <Button type="submit" size="lg" className="min-h-11 w-full sm:w-auto" disabled={!hydrated || pending || outcome === null}>
        {pending ? "Saving…" : correction ? "Save correction" : "Log service"}
      </Button>
    </form>
  );
}

function Chip({
  name,
  value,
  checked,
  onChange,
  disabled,
  muted,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        checked ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
        muted && !checked ? "border-dashed text-muted-foreground" : null,
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} className="sr-only" />
      {children}
    </label>
  );
}
