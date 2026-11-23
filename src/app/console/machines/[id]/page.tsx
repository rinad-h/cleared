import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ClipboardPen, MapPin, Pencil } from "lucide-react";
import { MachineStatusBadge, RequirementChip, SupervisedChip } from "@/components/catalog/machine-chips";
import { CheckupActiveToggle, CheckupDialog } from "@/components/checkups/checkup-forms";
import { CheckupBadge, dueText, intervalText, lastDoneText } from "@/components/checkups/checkup-parts";
import { FaultCard } from "@/components/faults/fault-card";
import { FlashToast } from "@/components/flash-toast";
import { Gate } from "@/components/gate";
import { ServiceHistory } from "@/components/machines/service-history";
import { StatusPanel } from "@/components/machines/status-panel";
import { EndSessionButton } from "@/components/pass/session-controls";
import { Button } from "@/components/ui/button";
import { getMachineDetail } from "@/data/machines";
import { formatDateTime, formatTimeOrDay, toDateTimeLocal } from "@/lib/format";
import type { OutOfServiceReason, SessionEndReason } from "@/server/domain/enums";
import { ServiceError } from "@/server/domain/errors";

export const metadata: Metadata = { title: "Machine" };

const OOS_REASONS: Record<OutOfServiceReason, string> = {
  issue_reported: "issue reported",
  maintenance: "maintenance",
  other: "other",
};

const END_REASONS: Record<SessionEndReason, string> = {
  user: "ended",
  staff: "ended by staff",
  expired: "ended automatically (time up)",
  machine_down: "ended: machine out of service",
  authorization_removed: "ended: certification removed",
};

const FLASH: Record<string, string> = {
  available: "Logged. Machine is now Available.",
  out_of_service: "Logged. Machine is still out of service.",
  correction: "Correction logged.",
  checkup: "Checkup logged.",
};

/** Machine detail (Phase 5 §7.2, PRD 8.2): status controls, open faults, sessions and the service history. */
export default function MachineDetailPage({ params, searchParams }: PageProps<"/console/machines/[id]">) {
  return (
    <Gate area="staff">
      <MachineDetail params={params} searchParams={searchParams} />
    </Gate>
  );
}

async function MachineDetail({ params, searchParams }: Pick<PageProps<"/console/machines/[id]">, "params" | "searchParams">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const logged = typeof query.logged === "string" ? query.logged : undefined;

  let detail;
  try {
    detail = await getMachineDetail(id, cursor);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "VALIDATION_FAILED")) notFound();
    throw err;
  }
  const { machine, timezone: tz, serverNow: now } = detail;
  const oos = machine.outOfService;

  return (
    <section aria-labelledby="page-title" className="max-w-4xl space-y-8">
      <FlashToast message={logged ? (FLASH[logged] ?? null) : null} param="logged" />
      <div className="space-y-3">
        <Link
          href="/console/machines"
          prefetch={false}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Machines
        </Link>
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight break-words">
          {machine.name}
        </h1>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin aria-hidden="true" className="size-4" />
          {machine.room.name}
        </p>
        <div className="flex flex-wrap items-center gap-2" data-testid="machine-status">
          <MachineStatusBadge status={machine.status} />
          {machine.supervised ? <SupervisedChip /> : null}
          {machine.requirements.map((r) => (
            <RequirementChip key={r.id} name={r.name} />
          ))}
        </div>
        {oos ? (
          <div className="space-y-0.5 text-sm" data-testid="out-of-service-details">
            <p>
              Since {formatDateTime(oos.since, tz)} · {OOS_REASONS[oos.reason]}
            </p>
            {oos.note ? <p className="break-words">&ldquo;{oos.note}&rdquo;</p> : null}
            {oos.expectedBackAt ? <p>Expected back {formatTimeOrDay(oos.expectedBackAt, now, tz)} (estimate)</p> : null}
          </div>
        ) : null}
        {machine.status !== "retired" ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild>
              <Link href={`/console/machines/${machine.id}/service/new`} prefetch={false}>
                <ClipboardPen aria-hidden="true" />
                Log service
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/console/machines/${machine.id}/edit`} prefetch={false}>
                <Pencil aria-hidden="true" />
                Edit machine
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <StatusPanel
        machineId={machine.id}
        status={machine.status}
        timeZone={tz}
        note={oos?.note ?? null}
        expectedBackLocal={oos?.expectedBackAt ? toDateTimeLocal(oos.expectedBackAt, tz) : null}
        nowLocal={toDateTimeLocal(now, tz)}
        blocked={detail.blockingFaultIds.length > 0}
      />

      <section aria-labelledby="faults-title" className="space-y-3">
        <h2 id="faults-title" className="text-lg font-semibold">
          Open faults
        </h2>
        {detail.openFaults.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open faults.</p>
        ) : (
          <ul aria-label="Open faults on this machine" className="space-y-3">
            {detail.openFaults.map((f) => (
              <li key={f.id}>
                <FaultCard fault={f} showMachine={false} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="checkups-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="checkups-title" className="text-lg font-semibold">
            Checkups
          </h2>
          {machine.status !== "retired" ? <CheckupDialog machineId={machine.id} /> : null}
        </div>
        <p className="text-sm text-muted-foreground">Advisory: a checkup never stops anyone using the machine.</p>
        {detail.checkups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recurring checkups.</p>
        ) : (
          <ul aria-label="Checkups on this machine" className="divide-y rounded-lg border">
            {detail.checkups.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckupBadge state={c.state} active={c.active} />
                    <span className="font-medium break-words">{c.name}</span>
                  </div>
                  <p className="text-muted-foreground">
                    {intervalText(c.intervalDays)} · {lastDoneText(c.lastDoneAt, tz)}
                    {c.active ? ` · ${dueText(c.nextDueAt, now, tz)}` : ""}
                  </p>
                  {c.instructions ? <p className="whitespace-pre-line break-words text-muted-foreground">{c.instructions}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {c.active && machine.status !== "retired" ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/console/machines/${machine.id}/service/new?checkupId=${c.id}`} prefetch={false}>
                        Log checkup
                      </Link>
                    </Button>
                  ) : null}
                  <CheckupDialog machineId={machine.id} checkup={c} />
                  <CheckupActiveToggle checkup={c} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="active-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="active-title" className="text-lg font-semibold">
            Active session
          </h2>
          <p className="text-sm text-muted-foreground">Self-reported by members</p>
        </div>
        {detail.activeSession ? (
          <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              <span className="font-medium">{detail.activeSession.member.displayName}</span> · since{" "}
              {formatTimeOrDay(detail.activeSession.startedAt, now, tz)} · est. end{" "}
              {formatTimeOrDay(detail.activeSession.expectedEndAt, now, tz)}
            </p>
            <EndSessionButton sessionId={detail.activeSession.id} machineName={machine.name} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recorded session right now.</p>
        )}
      </section>

      <section aria-labelledby="history" className="space-y-3">
        <h2 id="history" className="text-lg font-semibold">
          Service history
        </h2>
        <ServiceHistory machineId={machine.id} history={detail.serviceHistory} timeZone={tz} cursor={cursor} />
      </section>

      <section aria-labelledby="sessions-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="sessions-title" className="text-lg font-semibold">
            Recent sessions
          </h2>
          <p className="text-sm text-muted-foreground">Self-reported by members</p>
        </div>
        {detail.recentSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions yet.</p>
        ) : (
          <ul aria-label="Recent sessions" className="divide-y rounded-lg border">
            {detail.recentSessions.map((s) => (
              <li key={s.id} className="p-3 text-sm">
                <Link href={`/console/members/${s.member.id}`} prefetch={false} className="font-medium underline-offset-4 hover:underline">
                  {s.member.displayName}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {formatDateTime(s.startedAt, tz)} ·{" "}
                  {s.active
                    ? `in progress, est. end ${formatTimeOrDay(s.expectedEndAt, now, tz)}`
                    : `${s.endReason ? END_REASONS[s.endReason] : "ended"} ${formatTimeOrDay(s.endedAt ?? s.expectedEndAt, s.startedAt, tz)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
