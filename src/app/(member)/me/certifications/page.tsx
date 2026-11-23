import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { Gate } from "@/components/gate";
import { CertStateChip } from "@/components/grants/cert-state";
import { SessionList } from "@/components/sessions/session-list";
import { getMyCertifications } from "@/data/certifications";
import { getMakerspace } from "@/data/me";
import { formatDate } from "@/lib/format";
import type { CertificationRecord } from "@/server/services/grants";

export const metadata: Metadata = { title: "My certifications" };

export default function MyCertificationsPage() {
  return (
    <Gate area="member">
      <MyCertifications />
    </Gate>
  );
}

async function MyCertifications() {
  const [{ certifications, recentSessions, now }, makerspace] = await Promise.all([getMyCertifications(), getMakerspace()]);
  const tz = makerspace?.timezone ?? "UTC";
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-2xl space-y-4 py-2">
      <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
        My certifications
      </h1>
      {certifications.length === 0 ? (
        <p className="text-muted-foreground">This makerspace hasn&apos;t set up any certifications yet.</p>
      ) : (
        <ul aria-label="My certifications" className="space-y-3">
          {certifications.map((r) => (
            <CertCard key={r.certification.id} record={r} tz={tz} />
          ))}
        </ul>
      )}
      <div className="space-y-1 pt-4">
        <h2 className="text-lg font-semibold">Recent sessions</h2>
        <p className="text-sm text-muted-foreground">Self-reported: the sessions you started on machine passes.</p>
      </div>
      <SessionList sessions={recentSessions} now={now} timeZone={tz} label="Recent sessions" />
    </section>
  );
}

function CertCard({ record: r, tz }: { record: CertificationRecord; tz: string }) {
  const { certification: cert } = r;
  const needsSignOff = r.state === "none" || r.state === "expired" || r.state === "revoked";
  return (
    <li className="space-y-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold break-words">{cert.name}</h2>
        <CertStateChip state={r.state} />
      </div>
      <div className="space-y-0.5 text-sm text-muted-foreground">
        {r.state === "valid" || r.state === "expiring_soon" ? (
          <p>{r.expiresAt === null ? "Never expires" : `Valid until ${formatDate(r.expiresAt, tz)}`}</p>
        ) : null}
        {r.state === "expired" && r.expiresAt !== null ? <p>Expired {formatDate(r.expiresAt, tz)}</p> : null}
        {r.state === "revoked" && r.revokedAt !== null ? (
          <p className="break-words">
            Revoked {formatDate(r.revokedAt, tz)}
            {r.revokeReason ? `: ${r.revokeReason}` : ""}
          </p>
        ) : null}
        {r.grantedAt !== null && r.grantedByName ? (
          <p>
            Signed off by {r.grantedByName}, {formatDate(r.grantedAt, tz)}
          </p>
        ) : null}
        {r.state === "none" && cert.validityMonths !== null ? (
          <p>Valid for {cert.validityMonths} {cert.validityMonths === 1 ? "month" : "months"} after sign-off</p>
        ) : null}
      </div>
      {cert.trainingUrl ? (
        <a
          href={cert.trainingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Open training
          <ExternalLink aria-hidden="true" className="size-4" />
          <span className="sr-only">for {cert.name} (opens in a new tab)</span>
        </a>
      ) : null}
      {needsSignOff && cert.active ? (
        <p className="text-sm">Ask staff to sign you off after training.</p>
      ) : null}
    </li>
  );
}
