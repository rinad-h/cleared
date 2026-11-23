import { ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { StatusBadge, type Status } from "@/components/status-badge";
import { daysUntil, formatDate, formatDateTime, formatTimeOrDay } from "@/lib/format";
import type { OutOfServiceReason } from "@/server/domain/enums";
import { EXPIRING_SOON_DAYS } from "@/server/domain/grants";
import type { MissingCert, PassStatus } from "@/server/domain/pass";
import type { MachineByToken } from "@/server/services/pass";
import { LiveClock } from "./live-clock";
import { SessionControls } from "./session-controls";

type Recognized = Extract<MachineByToken, { recognized: true }>;

const STATUS_OF: Record<PassStatus, Status> = {
  CLEARED: "cleared",
  SUPERVISION_REQUIRED: "supervision",
  NOT_CLEARED: "not-cleared",
  OUT_OF_SERVICE: "out-of-service",
};

const SPOKEN: Record<PassStatus, string> = {
  CLEARED: "Cleared",
  SUPERVISION_REQUIRED: "Supervision required",
  NOT_CLEARED: "Not cleared",
  OUT_OF_SERVICE: "Out of service",
};

const OOS_REASONS: Record<OutOfServiceReason, string> = {
  issue_reported: "Issue reported",
  maintenance: "Maintenance",
  other: "Other",
};

/**
 * The machine pass (Phase 3 §6.1): colour + icon + WORD in a full-width block,
 * the viewer's name, the machine, a live clock, and what to do next. Server
 * component; only the clock runs in the browser.
 */
export function PassCard({ data }: { data: Recognized }) {
  const { pass, machine, viewer, makerspace, serverNow } = data;
  const tz = makerspace.timezone;
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{makerspace.name}</p>

      <div role="status" aria-live="polite" aria-label={`Pass: ${SPOKEN[pass.status]}`}>
        <StatusBadge status={STATUS_OF[pass.status]} size="block" />
      </div>

      <div className="space-y-1">
        <p className="text-2xl font-semibold break-words" data-testid="pass-viewer">
          {viewer.displayName}
        </p>
        <h1 id="page-title" className="text-xl font-medium break-words">
          {machine.name}
        </h1>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin aria-hidden="true" className="size-4" />
          {machine.roomName}
        </p>
      </div>

      <LiveClock serverNow={new Date(serverNow).toISOString()} timeZone={tz} />

      <PassBody data={data} />

      <SessionPanel data={data} />
    </div>
  );
}

/**
 * The session part of the pass (Phase 4 §6.1). Times are formatted here, on
 * the server, so the browser renders exactly the same text.
 */
function SessionPanel({ data }: { data: Recognized }) {
  const { currentSession: session, actions, machine, makerspace, serverNow } = data;
  const tz = makerspace.timezone;
  const show =
    session.state === "mine" || (session.state === "other" && data.pass.status !== "OUT_OF_SERVICE") || actions.canStart;
  if (!show) return null;
  const label = (ms: number | null) => (ms === null ? null : formatTimeOrDay(ms, serverNow, tz));
  return (
    <SessionControls
      machineId={machine.id}
      machineName={machine.name}
      state={session.state}
      sessionId={session.state === "mine" ? session.id : actions.otherSessionId}
      startedLabel={label(session.startedAt)}
      endLabel={label(session.expectedEndAt)}
      canStart={actions.canStart}
      requiresSupervisionAck={actions.requiresSupervisionAck}
      durationOptions={actions.durationOptions}
      defaultMinutes={actions.defaultMinutes}
      canExtend={actions.canExtend}
      atMax={session.state === "mine" && session.expectedEndAt !== null && session.expectedEndAt >= (session.maxEndAt ?? Infinity)}
      canEnd={actions.canEnd}
      canStaffEnd={actions.canStaffEnd}
    />
  );
}

function ExpiryLine({ earliestExpiry, now, tz }: { earliestExpiry: number | null; now: number; tz: string }) {
  if (earliestExpiry === null) return null;
  const days = daysUntil(earliestExpiry, now);
  return (
    <div className="space-y-1">
      <p className="text-lg">Certified until {formatDate(earliestExpiry, tz)}</p>
      {days <= EXPIRING_SOON_DAYS ? (
        <p className="text-sm text-muted-foreground">
          Expires in {days === 1 ? "1 day" : `${days} days`}. Ask staff to renew it.
        </p>
      ) : null}
    </div>
  );
}

function PassBody({ data }: { data: Recognized }) {
  const { pass, machine, makerspace, serverNow } = data;
  const tz = makerspace.timezone;
  switch (pass.status) {
    case "CLEARED":
      return <ExpiryLine earliestExpiry={pass.earliestExpiry} now={serverNow} tz={tz} />;
    case "SUPERVISION_REQUIRED":
      return (
        <div className="space-y-3">
          <p className="text-lg font-medium">A staff member must be present while you use this machine.</p>
          <ExpiryLine earliestExpiry={pass.earliestExpiry} now={serverNow} tz={tz} />
        </div>
      );
    case "OUT_OF_SERVICE": {
      const oos = machine.outOfService;
      return (
        <div className="space-y-1 text-lg">
          <p className="font-medium">This machine can&apos;t be used right now.</p>
          {oos ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base">
              <dt className="text-muted-foreground">Since</dt>
              <dd>{formatDateTime(oos.since, tz)}</dd>
              <dt className="text-muted-foreground">Reason</dt>
              <dd>{OOS_REASONS[oos.reason]}</dd>
              {oos.note ? (
                <>
                  <dt className="text-muted-foreground">Note</dt>
                  <dd className="break-words">{oos.note}</dd>
                </>
              ) : null}
              {oos.expectedBackAt ? (
                <>
                  <dt className="text-muted-foreground">Expected back</dt>
                  <dd>{formatDateTime(oos.expectedBackAt, tz)} (estimate)</dd>
                </>
              ) : null}
            </dl>
          ) : null}
        </div>
      );
    }
    case "NOT_CLEARED":
      if (pass.notClearedReason === "not_member") {
        return (
          <p className="text-lg">
            You&apos;re not a member of {makerspace.name} yet. Ask staff for the join link.
          </p>
        );
      }
      if (pass.notClearedReason === "suspended") {
        return <p className="text-lg">Your access is suspended. Contact staff.</p>;
      }
      return <MissingCertList missing={pass.missing} tz={tz} />;
  }
}

function missingState(cert: MissingCert, tz: string): string {
  if (cert.state === "expired") return cert.since ? `Expired ${formatDate(cert.since, tz)}` : "Expired";
  if (cert.state === "revoked") return "Revoked";
  return "Not yet certified";
}

/** "You need:" each missing certification, why, and its training link. */
function MissingCertList({ missing, tz }: { missing: MissingCert[]; tz: string }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">You need:</h2>
      <ul className="space-y-3" aria-label="Missing certifications">
        {missing.map((cert) => (
          <li key={cert.id} className="space-y-2 rounded-lg border p-4">
            <p className="font-semibold break-words">{cert.name}</p>
            <p className="text-sm text-muted-foreground">{missingState(cert, tz)}</p>
            {cert.trainingUrl ? (
              <a
                href={cert.trainingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Open training
                <ExternalLink aria-hidden="true" className="size-4" />
                <span className="sr-only">for {cert.name} (opens in a new tab)</span>
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">After training, ask staff to sign you off.</p>
      <p className="text-sm">
        <Link href="/me/certifications" prefetch={false} className="underline underline-offset-4">
          My certifications
        </Link>
      </p>
    </div>
  );
}
