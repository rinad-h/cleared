import type { Metadata } from "next";
import { StatusBadge, STATUSES, type Status } from "@/components/status-badge";

export const metadata: Metadata = { title: "Help" };

const MEANINGS: Record<Status, string> = {
  cleared: "You hold every certification this machine needs.",
  supervision: "You may use this machine only while a supervisor is present.",
  "not-cleared": "You're missing a certification for this machine.",
  available: "Nobody is using the machine right now.",
  "in-use": "Someone has started a session. Times shown are estimates.",
  "out-of-service": "Don't use the machine until staff return it to service.",
};

/** Static help page. The full help text and terms arrive in Phase 7. */
export default function HelpPage() {
  return (
    <section aria-labelledby="page-title" className="space-y-6">
      <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
        Help
      </h1>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">What the statuses mean</h2>
        <dl className="space-y-3">
          {(Object.keys(STATUSES) as Status[]).map((status) => (
            <div key={status} className="space-y-1">
              <dt>
                <StatusBadge status={status} />
              </dt>
              <dd className="text-sm text-muted-foreground">{MEANINGS[status]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
