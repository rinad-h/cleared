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

const LIMITS = [
  "It doesn't verify that you're at the machine. A scan proves a signed-in account opened the machine page, not that the person is standing there. Sessions are self-reported.",
  "\u201cIn use\u201d and estimated free times are self-reported estimates. A machine may free up early, run over, or be in use without a recorded session.",
  "It doesn't verify supervision. \u201cSupervision required\u201d shows a requirement; it doesn't confirm a supervisor is present.",
  "It can't stop a machine. Out of service and Not cleared are displays and records; they don't cut power.",
  "Its records are only as accurate as staff keep them. A missed revocation or a wrong sign-off gives a wrong pass.",
  "Screenshots and shared phones are made harder (live clock, name on the pass), not prevented.",
  "Supervisors remain responsible for physical safety rules. Emergencies and injuries follow your institution's procedures, not Cleared.",
];

/** Static help page (no session reads). The full help text and terms arrive in Phase 7. */
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
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Your account</h2>
        <p className="text-sm text-muted-foreground">
          Sign in with your email and password. To join the makerspace, open the join link staff give you. Forgot
          your password? Ask staff to reset it: they&apos;ll give you a temporary password, which you then change on
          your Account page.
        </p>
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">What Cleared does not do</h2>
        <p className="text-sm text-muted-foreground">
          Cleared is a decision-support and record-keeping tool, not a safety system or an access-control system.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {LIMITS.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
