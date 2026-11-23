"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { endSession, extendSession, startSession } from "@/actions/sessions";
import { useHydrated } from "@/components/auth/use-hydrated";
import { FormMessage } from "@/components/forms/messages";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/server/domain/errors";
import { EXTEND_MINUTES, MAX_SESSION_MINUTES, MIN_SESSION_MINUTES } from "@/server/domain/sessions";

export type SessionControlsProps = {
  machineId: string;
  machineName: string;
  state: "none" | "mine" | "other";
  /** The viewer's own session (`mine`) or, for staff, someone else's (`other`). */
  sessionId: string | null;
  /** Formatted on the server in the makerspace's time zone. */
  startedLabel: string | null;
  endLabel: string | null;
  canStart: boolean;
  requiresSupervisionAck: boolean;
  durationOptions: readonly number[];
  defaultMinutes: number;
  canExtend: boolean;
  /** Own session already at 240 minutes. */
  atMax: boolean;
  canEnd: boolean;
  canStaffEnd: boolean;
};

/** Messages by code (Phase 4 §6.1); anything else shows the service's message. */
const MESSAGES: Partial<Record<string, string>> = {
  MACHINE_BUSY: "Someone just started a session on this machine.",
  CONFLICT_RETRY: "Please try again.",
  RATE_LIMITED: "Too many tries. Wait a minute and try again.",
};

const OTHER = "other";

/**
 * Session controls on the pass (Journey D): start with a duration, +15 min,
 * Done, and staff "End this session". Every button stays disabled until
 * React has loaded, so a tap can't submit before the handlers exist. The
 * server action refreshes the page, so the pass shows the new state.
 */
export function SessionControls(props: SessionControlsProps) {
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const report = (result: ActionResult<unknown>, success: string) => {
    if (result.ok) {
      setError(null);
      toast.success(success);
      return true;
    }
    const message = MESSAGES[result.code] ?? result.error;
    setError(message);
    toast.error(message);
    return false;
  };

  const run = (fn: () => Promise<boolean | void>) => startTransition(async () => void (await fn()));

  return (
    <section aria-labelledby="session-title" className="space-y-3 rounded-lg border p-4">
      <h2 id="session-title" className="text-lg font-semibold">
        {props.state === "mine" ? "Your session" : "Session"}
      </h2>
      <div aria-live="polite" className="space-y-3">
        {props.state === "mine" ? (
          <MySession {...props} hydrated={hydrated} pending={pending} run={run} report={report} />
        ) : props.state === "other" ? (
          <OtherSession {...props} hydrated={hydrated} pending={pending} run={run} report={report} />
        ) : props.canStart ? (
          <StartForm {...props} hydrated={hydrated} pending={pending} run={run} report={report} />
        ) : null}
        <FormMessage error={error} />
      </div>
    </section>
  );
}

type Inner = SessionControlsProps & {
  hydrated: boolean;
  pending: boolean;
  run: (fn: () => Promise<boolean | void>) => void;
  report: (result: ActionResult<unknown>, success: string) => boolean;
};

function StartForm({ machineId, requiresSupervisionAck, durationOptions, defaultMinutes, hydrated, pending, run, report }: Inner) {
  const options = [...new Set([...durationOptions, defaultMinutes])].sort((a, b) => a - b);
  const [choice, setChoice] = useState(String(defaultMinutes));
  const [acked, setAcked] = useState(false);
  // One id per start attempt: a double-tap or retry sends the same one, so one session is created.
  const requestId = useRef<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const minutes = choice === OTHER ? String(form.get("otherMinutes") ?? "") : choice;
        requestId.current ??= crypto.randomUUID();
        const clientRequestId = requestId.current;
        run(async () => {
          const result = await startSession({
            machineId,
            expectedMinutes: minutes,
            supervisionAcknowledged: acked,
            clientRequestId,
          });
          report(result, "Session started.");
          // Keep the id only for a retry of the same attempt.
          if (result.ok || result.code !== "CONFLICT_RETRY") requestId.current = null;
        });
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How long? (estimate)</legend>
        <div className="flex flex-wrap gap-2">
          {options.map((m) => (
            <Chip key={m} name="minutes" value={String(m)} checked={choice === String(m)} onChange={setChoice}>
              {m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60}`}
            </Chip>
          ))}
          <Chip name="minutes" value={OTHER} checked={choice === OTHER} onChange={setChoice}>
            Other…
          </Chip>
        </div>
        {choice === OTHER ? (
          <div className="space-y-1">
            <Label htmlFor="session-other-minutes">Minutes ({MIN_SESSION_MINUTES}–{MAX_SESSION_MINUTES})</Label>
            <Input
              id="session-other-minutes"
              name="otherMinutes"
              type="number"
              inputMode="numeric"
              min={MIN_SESSION_MINUTES}
              max={MAX_SESSION_MINUTES}
              step={5}
              defaultValue={defaultMinutes}
              required
              className="w-32"
            />
          </div>
        ) : null}
      </fieldset>

      {requiresSupervisionAck ? (
        <div className="flex items-start gap-3">
          <input
            id="session-supervisor"
            type="checkbox"
            checked={acked}
            onChange={(e) => setAcked(e.target.checked)}
            className="mt-1 size-5 accent-primary"
            aria-describedby="session-supervisor-help"
          />
          <div>
            <Label htmlFor="session-supervisor">A supervisor is present</Label>
            <p id="session-supervisor-help" className="text-sm text-muted-foreground">
              Recorded as self-reported.
            </p>
          </div>
        </div>
      ) : null}

      <Button type="submit" size="lg" className="min-h-11 w-full" disabled={!hydrated || pending || (requiresSupervisionAck && !acked)}>
        {pending ? "Starting…" : "Start session"}
      </Button>
    </form>
  );
}

function Chip({
  name,
  value,
  checked,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
        checked ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} className="sr-only" />
      {children}
    </label>
  );
}

function MySession({ sessionId, startedLabel, endLabel, canExtend, atMax, canEnd, hydrated, pending, run, report }: Inner) {
  return (
    <>
      <p className="text-lg" data-testid="session-summary">
        Started {startedLabel} · <strong>est.</strong> end {endLabel}
      </p>
      <div className="flex flex-wrap gap-2">
        {canExtend ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!hydrated || pending || !sessionId}
            onClick={() =>
              run(async () => {
                report(await extendSession({ sessionId: sessionId!, minutes: EXTEND_MINUTES }), "Extended by 15 minutes.");
              })
            }
          >
            +15 min
          </Button>
        ) : atMax ? (
          <p className="self-center text-sm text-muted-foreground">Maximum 4 hours.</p>
        ) : null}
        {canEnd ? (
          <Button
            type="button"
            className="min-h-11"
            disabled={!hydrated || pending || !sessionId}
            onClick={() =>
              run(async () => {
                report(await endSession({ sessionId: sessionId! }), "Session ended. Thanks!");
              })
            }
          >
            {pending ? "Saving…" : "Done"}
          </Button>
        ) : null}
      </div>
    </>
  );
}

function OtherSession({ sessionId, machineName, startedLabel, endLabel, canStaffEnd, hydrated, pending, run, report }: Inner) {
  return (
    <>
      <p className="text-lg" data-testid="session-summary">
        In use since {startedLabel} · <strong>est.</strong> free {endLabel}
      </p>
      {canStaffEnd && sessionId ? (
        <StaffEndDialog
          machineName={machineName}
          disabled={!hydrated || pending}
          onConfirm={() =>
            run(async () => {
              report(await endSession({ sessionId }), "Session ended.");
            })
          }
        />
      ) : null}
    </>
  );
}

/** Staff: end someone else's session, after a confirmation. Also used on the member page. */
export function StaffEndDialog({
  machineName,
  disabled,
  onConfirm,
  label = "End this session",
}: {
  machineName: string;
  disabled: boolean;
  onConfirm: () => void;
  label?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11" disabled={disabled}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>End the session on {machineName}?</AlertDialogTitle>
        <AlertDialogDescription>Only do this if the machine is actually free.</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>End session</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Staff on the member page: end one of the member's active sessions. */
export function EndSessionButton({ sessionId, machineName }: { sessionId: string; machineName: string }) {
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  return (
    <StaffEndDialog
      machineName={machineName}
      label="End session"
      disabled={!hydrated || pending}
      onConfirm={() =>
        startTransition(async () => {
          const result = await endSession({ sessionId });
          if (result.ok) toast.success("Session ended.");
          else toast.error(result.error);
        })
      }
    />
  );
}
