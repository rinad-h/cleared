import type { Metadata } from "next";
import Link from "next/link";
import { LimitsList } from "@/components/legal/limits-list";
import { CONTACT_STAFF, WHAT_CLEARED_IS } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of use" };

const linkClass = "underline underline-offset-4";

/** Terms of use (P7-11). Statically rendered: no session or database reads. */
export default function TermsPage() {
  return (
    <article aria-labelledby="page-title" className="space-y-8">
      <div className="space-y-2">
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          Terms of use
        </h1>
        <p className="text-sm text-muted-foreground">
          By creating an account or using Cleared, you agree to these terms.
        </p>
      </div>

      <section aria-labelledby="what-it-is" className="space-y-3">
        <h2 id="what-it-is" className="text-lg font-semibold">
          What Cleared is
        </h2>
        <p className="text-sm text-muted-foreground">
          {WHAT_CLEARED_IS} A pass helps you and staff decide; it never replaces the makerspace&apos;s own rules,
          training or supervision.
        </p>
      </section>

      <section aria-labelledby="limits" className="space-y-3">
        <h2 id="limits" className="text-lg font-semibold">
          What it doesn&apos;t do
        </h2>
        <LimitsList />
      </section>

      <section aria-labelledby="acceptable-use" className="space-y-3">
        <h2 id="acceptable-use" className="text-lg font-semibold">
          Acceptable use
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Use only your own account. Don&apos;t share your account or password, and don&apos;t show someone else your pass as theirs.</li>
          <li>Record sessions and report problems honestly: start a session only when you&apos;re using the machine, tap Done when you finish, and describe faults as you see them.</li>
          <li>Don&apos;t misuse labels: don&apos;t move, copy, cover or swap a machine&apos;s QR label. Tell staff if one is missing or damaged.</li>
          <li>Don&apos;t try to get around a Not cleared, Supervision required or Out of service status, or to break, overload or test the security of Cleared.</li>
          <li>Staff may suspend an account that breaks these terms.</li>
        </ul>
      </section>

      <section aria-labelledby="as-is" className="space-y-3">
        <h2 id="as-is" className="text-lg font-semibold">
          Provided as is
        </h2>
        <p className="text-sm text-muted-foreground">
          Cleared is a classroom MVP used for a pilot. It&apos;s provided as is, without any guarantee that it&apos;s
          available, correct or complete. It may be unavailable at times, for example when it&apos;s over its free
          daily limit. Always follow the makerspace&apos;s rules and staff instructions, whatever a pass says.
        </p>
      </section>

      <section aria-labelledby="contact" className="space-y-3">
        <h2 id="contact" className="text-lg font-semibold">
          Questions
        </h2>
        <p className="text-sm text-muted-foreground">{CONTACT_STAFF}</p>
        <p className="text-sm text-muted-foreground">
          How Cleared handles your data: see the{" "}
          <Link href="/privacy" prefetch={false} className={linkClass}>
            Privacy notice
          </Link>
          . How to use it: see{" "}
          <Link href="/help" prefetch={false} className={linkClass}>
            Help
          </Link>
          .
        </p>
      </section>
    </article>
  );
}
