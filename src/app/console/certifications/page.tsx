import type { Metadata } from "next";
import { CircleCheck, CircleSlash, ExternalLink } from "lucide-react";
import { Gate } from "@/components/gate";
import { CertificationActiveToggle, CertificationDialog } from "@/components/catalog/certification-forms";
import { listCertifications } from "@/data/certifications";

export const metadata: Metadata = { title: "Certifications" };

export default function ConsoleCertificationsPage() {
  return (
    <Gate area="admin">
      <section aria-labelledby="page-title" className="max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
            Certifications
          </h1>
          <CertificationDialog />
        </div>
        <CertificationsContent />
      </section>
    </Gate>
  );
}

function validity(months: number | null): string {
  if (months === null) return "Never expires";
  return months === 1 ? "1 month" : `${months} months`;
}

async function CertificationsContent() {
  const certs = await listCertifications({ includeInactive: true });
  if (certs.length === 0) {
    return (
      <p className="rounded-md border px-4 py-6 text-center text-muted-foreground">
        Add your first certification, e.g. <em>Laser cutter basics</em>.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-md border" aria-label="Certifications">
      {certs.map((cert) => (
        <li key={cert.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium break-words">{cert.name}</span>
              {cert.active ? (
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                  <CircleCheck aria-hidden="true" className="size-3" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground">
                  <CircleSlash aria-hidden="true" className="size-3" />
                  Inactive
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {validity(cert.validityMonths)} ·{" "}
              {cert.requiredByCount === 1 ? "Required by 1 machine" : `Required by ${cert.requiredByCount} machines`}
            </p>
            {cert.trainingUrl ? (
              <a
                href={cert.trainingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm break-all underline underline-offset-4"
              >
                Training link
                <ExternalLink aria-hidden="true" className="size-3" />
              </a>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            <CertificationDialog cert={cert} />
            <CertificationActiveToggle cert={cert} />
          </div>
        </li>
      ))}
    </ul>
  );
}
