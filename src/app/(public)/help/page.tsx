import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge, type Status } from "@/components/status-badge";
import { LimitsList } from "@/components/legal/limits-list";
import { CONTACT_STAFF, WHAT_CLEARED_IS } from "@/lib/legal";

export const metadata: Metadata = { title: "Help" };

/** The statuses members see (checkup states are staff-only). */
const MEANINGS: Partial<Record<Status, string>> = {
  cleared: "You hold every certification this machine needs.",
  supervision: "You may use this machine only while a supervisor is present.",
  "not-cleared": "You're missing a certification for this machine. The pass lists what you need and links to the training.",
  available: "Nobody has started a session on the machine.",
  "in-use": "Someone has started a session. The free time shown is an estimate.",
  "out-of-service": "Don't use the machine until staff return it to service.",
};

const linkClass = "underline underline-offset-4";

/** Help (P7-10). Statically rendered: no session or database reads. */
export default function HelpPage() {
  return (
    <article aria-labelledby="page-title" className="space-y-8">
      <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
        Help
      </h1>

      <section aria-labelledby="what-it-is" className="space-y-3">
        <h2 id="what-it-is" className="text-lg font-semibold">
          What Cleared is
        </h2>
        <p className="text-sm text-muted-foreground">
          {WHAT_CLEARED_IS} It shows whether you&apos;re cleared to use a machine, lets you say when you&apos;re
          using one, and keeps the makerspace&apos;s records of certifications, problems and repairs.
        </p>
      </section>

      <section aria-labelledby="limits" className="space-y-3">
        <h2 id="limits" className="text-lg font-semibold">
          What it doesn&apos;t do
        </h2>
        <LimitsList />
      </section>

      <section aria-labelledby="how-to" className="space-y-3">
        <h2 id="how-to" className="text-lg font-semibold">
          How to use it
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Join once: open the join link staff give you and create an account with your email and a password.</li>
          <li>Scan the QR label on a machine with your phone&apos;s camera. Your pass for that machine opens.</li>
          <li>
            Read the pass: its colour, icon and word say whether you can use the machine, with your name and a live
            clock so staff can check it&apos;s current.
          </li>
          <li>
            If you&apos;re cleared, tap <strong>Start session</strong> and pick roughly how long you&apos;ll be. The
            time is an estimate that others see on the machine list.
          </li>
          <li>
            When you finish, tap <strong>Done</strong> so others know the machine is free.
          </li>
        </ol>
        <p className="text-sm text-muted-foreground">
          <strong>Something wrong with a machine?</strong> Tap <strong>Report a problem</strong> on its pass and
          describe what you see. If it&apos;s unsafe or not working, tick the box to take it out of service. Staff
          see every report in their console. In an emergency, follow your institution&apos;s procedures first.
        </p>
      </section>

      <section aria-labelledby="statuses" className="space-y-3">
        <h2 id="statuses" className="text-lg font-semibold">
          What the colours mean
        </h2>
        <p className="text-sm text-muted-foreground">Every status has a colour, an icon and a word.</p>
        <dl className="space-y-3">
          {(Object.keys(MEANINGS) as Status[]).map((status) => (
            <div key={status} className="space-y-1">
              <dt>
                <StatusBadge status={status} />
              </dt>
              <dd className="text-sm text-muted-foreground">{MEANINGS[status]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="password" className="space-y-3">
        <h2 id="password" className="text-lg font-semibold">
          Forgot your password?
        </h2>
        <p className="text-sm text-muted-foreground">
          Cleared sends no email, so there&apos;s no reset link. Ask staff to reset it: they&apos;ll give you a
          temporary password. Sign in with it, then choose a new one on your{" "}
          <Link href="/me/account" prefetch={false} className={linkClass}>
            Account page
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="contact" className="space-y-3">
        <h2 id="contact" className="text-lg font-semibold">
          Who to contact
        </h2>
        <p className="text-sm text-muted-foreground">{CONTACT_STAFF}</p>
        <p className="text-sm text-muted-foreground">
          See also the{" "}
          <Link href="/terms" prefetch={false} className={linkClass}>
            Terms of use
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" prefetch={false} className={linkClass}>
            Privacy notice
          </Link>
          .
        </p>
      </section>
    </article>
  );
}
