"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, RefreshCw, TriangleAlert, WifiOff, Wrench, type LucideIcon } from "lucide-react";
import { EndSessionButton } from "@/components/pass/session-controls";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { usePoll } from "@/components/use-poll";
import { formatTime, formatTimeOrDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConsoleData } from "@/server/domain/console";
import type { OutOfServiceReason } from "@/server/domain/enums";

const OOS_REASONS: Record<OutOfServiceReason, string> = {
  issue_reported: "issue reported",
  maintenance: "maintenance",
  other: "other",
};

const MISSING_STATE = { never: "not held", expired: "expired", revoked: "revoked" } as const;

/** After this long without a successful check, the header says it's not updating. */
const STALE_MS = 2 * 60_000;

/**
 * The console home's live part (FR-17, Phase 6 §6). Starts from the
 * server-rendered snapshot and polls `GET /api/console` every 30 s with its
 * ETag (an unchanged console costs a 304), only while the tab is visible.
 * Times are formatted in the browser (they re-render on polls), so time text
 * has `suppressHydrationWarning`.
 */
export function ConsoleLive({ initial, etag }: { initial: ConsoleData; etag: string }) {
  const { data, error, lastUpdated, refresh } = usePoll<ConsoleData>("/api/console", {
    initialData: initial,
    initialEtag: etag,
  });
  const c = data ?? initial;
  const tz = c.timezone;
  const now = useNow(15_000);
  const lastSuccess = lastUpdated?.getTime() ?? Date.parse(initial.generatedAt);
  const stale = now - lastSuccess > STALE_MS;
  const time = (iso: string) => formatTimeOrDay(Date.parse(iso), now, tz);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-end gap-x-4">
        <p className="text-sm text-muted-foreground" aria-live="off">
          Updated <time suppressHydrationWarning>{formatTime(lastSuccess, tz)}</time>
        </p>
      </div>

      {error?.status === 503 ? (
        <Banner icon={TriangleAlert}>
          Cleared is over its free daily limit. The console is back after the daily reset (00:00 UTC).
        </Banner>
      ) : error && (error.status === 401 || error.status === 403) ? (
        <Banner icon={TriangleAlert}>
          Your access changed. <a href="/console" className="underline underline-offset-4">Reload the page</a>.
        </Banner>
      ) : stale ? (
        <Banner icon={WifiOff}>
          Not updating. Check your connection.{" "}
          <Button type="button" size="sm" variant="outline" onClick={refresh} className="ml-1">
            <RefreshCw aria-hidden="true" />
            Retry
          </Button>
        </Banner>
      ) : null}

      <ul aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CountCard
          href="/console/faults"
          icon={TriangleAlert}
          label="Open faults"
          count={c.counts.openFaults}
          detail={c.counts.outOfServiceFaults > 0 ? `${c.counts.outOfServiceFaults} took a machine out` : null}
          alert={c.counts.openFaults > 0}
        />
        <CountCard
          href="#out-of-service"
          icon={Wrench}
          label="Out of service"
          count={c.outOfServiceMachines.length}
          alert={c.outOfServiceMachines.length > 0}
        />
        <CountCard
          href="/console/checkups?tab=soon"
          icon={ClipboardCheck}
          label="Checkups due soon"
          detail="Advisory"
          count={c.counts.checkupsDueSoon}
        />
        <CountCard
          href="/console/checkups?tab=overdue"
          icon={ClipboardCheck}
          label="Checkups overdue"
          detail="Advisory"
          count={c.counts.checkupsOverdue}
          alert={c.counts.checkupsOverdue > 0}
        />
      </ul>

      {c.noLongerAuthorized.length > 0 ? (
        <section
          aria-labelledby="unauthorized-title"
          className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50"
        >
          <h2 id="unauthorized-title" className="flex items-center gap-2 text-lg font-semibold">
            <TriangleAlert aria-hidden="true" className="size-5" />
            No longer authorized
          </h2>
          <p className="text-sm">These sessions are still running, but the member no longer holds every certification the machine requires.</p>
          <ul aria-label="Sessions no longer authorized" className="space-y-2">
            {c.noLongerAuthorized.map((s) => (
              <li
                key={s.sessionId}
                className="flex flex-col gap-2 rounded-md border border-amber-300 bg-background p-3 text-foreground sm:flex-row sm:items-center sm:justify-between dark:border-amber-700"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-medium break-words">
                    <Link href={`/console/members/${s.member.id}`} prefetch={false} className="underline-offset-4 hover:underline">
                      {s.member.displayName}
                    </Link>{" "}
                    on {s.machine.name}
                  </p>
                  <p className="text-muted-foreground" suppressHydrationWarning>
                    {s.missing
                      .map((m) => `${m.name} ${MISSING_STATE[m.state]}${m.since ? ` ${time(m.since)}` : ""}`)
                      .join(" · ")}
                  </p>
                </div>
                <EndSessionButton sessionId={s.sessionId} machineName={s.machine.name} onEnded={refresh} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="sessions-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="sessions-title" className="text-lg font-semibold">
            Active sessions
          </h2>
          <p className="text-sm text-muted-foreground">Self-reported by members</p>
        </div>
        {c.activeSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recorded sessions right now.</p>
        ) : (
          <ul aria-label="Active sessions" className="divide-y rounded-lg border">
            {c.activeSessions.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="break-words">
                    <Link href={`/console/members/${s.member.id}`} prefetch={false} className="font-medium underline-offset-4 hover:underline">
                      {s.member.displayName}
                    </Link>{" "}
                    ·{" "}
                    <Link href={`/console/machines/${s.machine.id}`} prefetch={false} className="underline-offset-4 hover:underline">
                      {s.machine.name}
                    </Link>{" "}
                    <span className="text-muted-foreground">({s.machine.roomName})</span>
                  </p>
                  <p className="text-muted-foreground" suppressHydrationWarning>
                    since {time(s.startedAt)} · est. end {time(s.expectedEndAt)}
                    {s.supervisionAcknowledged ? " · supervision acknowledged" : ""}
                  </p>
                </div>
                <EndSessionButton sessionId={s.id} machineName={s.machine.name} onEnded={refresh} />
              </li>
            ))}
          </ul>
        )}
        {c.activeSessionsTruncated ? (
          <p className="text-sm text-muted-foreground">Showing the {c.activeSessions.length} most recent sessions.</p>
        ) : null}
      </section>

      <section aria-labelledby="out-of-service" className="scroll-mt-20 space-y-3">
        <h2 id="out-of-service" className="text-lg font-semibold">
          Out of service
        </h2>
        {c.outOfServiceMachines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every machine is in service.</p>
        ) : (
          <ul aria-label="Machines out of service" className="divide-y rounded-lg border">
            {c.outOfServiceMachines.map((m) => (
              <li key={m.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status="out-of-service" />
                  <Link href={`/console/machines/${m.id}`} prefetch={false} className="font-medium break-words underline-offset-4 hover:underline">
                    {m.name}
                  </Link>
                  <span className="text-muted-foreground">({m.roomName})</span>
                </div>
                <p className="text-muted-foreground" suppressHydrationWarning>
                  Since {time(m.since)} · {OOS_REASONS[m.reason]}
                  {m.openFaultCount > 0 ? ` · ${m.openFaultCount} open fault${m.openFaultCount === 1 ? "" : "s"}` : ""}
                  {m.expectedBackAt ? ` · expected back ${time(m.expectedBackAt)} (estimate)` : ""}
                </p>
                {m.note ? <p className="break-words">&ldquo;{m.note}&rdquo;</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CountCard({
  href,
  icon: Icon,
  label,
  count,
  detail,
  alert = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  count: number;
  detail?: string | null;
  alert?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        prefetch={false}
        className={cn(
          "flex h-full flex-col gap-1 rounded-lg border p-3 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
          alert && count > 0 ? "border-amber-400 dark:border-amber-600" : null,
        )}
      >
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
          {label}
        </span>
        <span className="text-3xl font-semibold tabular-nums" data-testid={`count-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          {count}
        </span>
        {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
      </Link>
    </li>
  );
}

function Banner({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
