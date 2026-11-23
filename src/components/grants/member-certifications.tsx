import { CertStateChip } from "@/components/grants/cert-state";
import { RevokeDialog, SignOffDialog, type SignOffCert } from "@/components/grants/grant-dialogs";
import { formatDate, formatDateTime } from "@/lib/format";
import type { CertificationRecord, GrantHistoryItem } from "@/server/services/grants";

/**
 * Console member detail: certifications × this member, sign-off and revoke,
 * and the full history (Phase 3 §6.2). Controls are hidden on your own page
 * (the service refuses anyway) and sign-off is hidden for suspended members.
 */
export function MemberCertifications({
  member,
  certifications,
  history,
  canSignOff,
  canRevoke,
  timeZone,
}: {
  member: { id: string; displayName: string };
  certifications: CertificationRecord[];
  history: GrantHistoryItem[];
  canSignOff: boolean;
  canRevoke: boolean;
  timeZone: string;
}) {
  const signable: SignOffCert[] = certifications
    .filter((r) => r.certification.active)
    .map((r) => ({ id: r.certification.id, name: r.certification.name, validityMonths: r.certification.validityMonths }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Certifications</h2>
        {canSignOff && signable.length > 0 ? (
          <SignOffDialog memberId={member.id} memberName={member.displayName} certifications={signable} timeZone={timeZone} />
        ) : null}
      </div>

      {certifications.length === 0 ? (
        <p className="text-sm text-muted-foreground">No certifications exist yet. An admin adds them under Certifications.</p>
      ) : (
        <ul aria-label="Certifications" className="divide-y rounded-lg border">
          {certifications.map((r) => {
            const { certification: cert } = r;
            const held = r.state === "valid" || r.state === "expiring_soon";
            const signOffLabel = r.state === "expiring_soon" || r.state === "expired" ? "Renew" : "Sign off";
            return (
              <li key={cert.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium break-words">
                    {cert.name}
                    {!cert.active ? <span className="ml-2 text-sm font-normal text-muted-foreground">(inactive)</span> : null}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <CertStateChip state={r.state} />
                    {held ? (
                      <span>{r.expiresAt === null ? "Never expires" : `Expires ${formatDate(r.expiresAt, timeZone)}`}</span>
                    ) : null}
                    {r.state === "expired" && r.expiresAt !== null ? <span>Expired {formatDate(r.expiresAt, timeZone)}</span> : null}
                    {r.state === "revoked" && r.revokedAt !== null ? <span>Revoked {formatDate(r.revokedAt, timeZone)}</span> : null}
                    {r.grantedAt !== null && r.grantedByName ? (
                      <span>
                        Signed off by {r.grantedByName}, {formatDate(r.grantedAt, timeZone)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {canSignOff && cert.active && r.state !== "valid" ? (
                    <SignOffDialog
                      memberId={member.id}
                      memberName={member.displayName}
                      certifications={signable}
                      certificationId={cert.id}
                      label={signOffLabel}
                      timeZone={timeZone}
                    />
                  ) : null}
                  {canRevoke && held && r.grantId ? (
                    <RevokeDialog grantId={r.grantId} memberName={member.displayName} certificationName={cert.name} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer font-medium">History ({history.length})</summary>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No sign-offs yet.</p>
        ) : (
          <ol aria-label="Certification history" className="mt-3 space-y-3">
            {history.map((h) => (
              <li key={h.id} className="space-y-0.5 text-sm">
                <p className="font-medium break-words">{h.certificationName}</p>
                <p className="text-muted-foreground">
                  Signed off by {h.grantedByName}, {formatDateTime(h.grantedAt, timeZone)} ·{" "}
                  {h.expiresAt === null ? "never expires" : `expires ${formatDate(h.expiresAt, timeZone)}`}
                </p>
                {h.revokedAt !== null ? (
                  <p className="break-words text-muted-foreground">
                    Revoked by {h.revokedByName ?? "staff"}, {formatDateTime(h.revokedAt, timeZone)}
                    {h.revokeReason ? `: ${h.revokeReason}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  );
}
