import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_STAFF } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy notice" };

const linkClass = "underline underline-offset-4";

const COLLECTED = [
  "Your name and email address, which you enter when you create an account.",
  "A hashed password. Cleared stores a one-way scrambled version used to check your password at sign-in, never the password itself.",
  "Sign-in sessions: when you signed in, and the IP address and browser your device reported. Recent sign-in attempts are also counted by IP address to slow down password guessing.",
  "Your membership: your role (member, staff or admin) and whether your access is active or suspended.",
  "Certifications: which ones staff signed you off for, when, by whom, when they expire, and any revocations.",
  "Machine sessions: when you started and finished using a machine, and the estimated end time you chose. These are self-reported.",
  "Fault reports you send, and the service records and checkups staff log for machines.",
] as const;

/** Privacy notice (P7-12, P7-62). Statically rendered: no session or database reads. */
export default function PrivacyPage() {
  return (
    <article aria-labelledby="page-title" className="space-y-8">
      <div className="space-y-2">
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          Privacy notice
        </h1>
        <p className="text-sm text-muted-foreground">
          What Cleared keeps about you, why, who handles it and for how long. This notice is for a classroom MVP
          and pilot, not legal advice; a real university pilot goes through the institution&apos;s own privacy
          review.
        </p>
      </div>

      <section aria-labelledby="collected" className="space-y-3">
        <h2 id="collected" className="text-lg font-semibold">
          What Cleared collects
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {COLLECTED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Cleared collects <strong>no</strong> photos and <strong>no</strong> student ID numbers.
        </p>
      </section>

      <section aria-labelledby="why" className="space-y-3">
        <h2 id="why" className="text-lg font-semibold">
          Why
        </h2>
        <p className="text-sm text-muted-foreground">
          To show you and staff whether you&apos;re cleared to use each machine, to show when machines are in use
          (est.) or out of service, to keep the makerspace&apos;s records of training, problems and repairs, and to
          keep your account secure. Your data isn&apos;t sold, used for advertising or shared beyond what&apos;s
          described here.
        </p>
      </section>

      <section aria-labelledby="who-sees" className="space-y-3">
        <h2 id="who-sees" className="text-lg font-semibold">
          Who can see it
        </h2>
        <p className="text-sm text-muted-foreground">
          Your makerspace&apos;s staff and admins can see your name, email, certifications, machine sessions and
          the problems you report. Other members see only that a machine is in use and when it&apos;s expected to
          be free, not who is using it. Your name is shown on your own pass, so staff can check it.
        </p>
      </section>

      <section aria-labelledby="processors" className="space-y-3">
        <h2 id="processors" className="text-lg font-semibold">
          Who processes it, and where
        </h2>
        <p className="text-sm text-muted-foreground">
          Cloudflare hosts Cleared and its database (Cloudflare Workers and D1). Data is stored in Cloudflare D1
          with a western-North-America location hint, so it&apos;s likely held in U.S. data centres;
          Cloudflare doesn&apos;t offer a Canadian jurisdiction for D1. Cleared sends no email, so no email
          provider sees your address. No other company receives your data.
        </p>
      </section>

      <section aria-labelledby="retention" className="space-y-3">
        <h2 id="retention" className="text-lg font-semibold">
          How long it&apos;s kept
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Machine sessions: 2 years.</li>
          <li>
            Certifications, fault reports and service records: for the life of the makerspace, because they&apos;re
            its safety and maintenance history.
          </li>
          <li>Expired sign-in sessions: deleted.</li>
          <li>Accounts that never joined the makerspace: deleted after 7 days.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          There are no automatic jobs: the admin runs these clean-ups by hand once a term. Backup copies are kept
          privately by the admin and deleted once they&apos;re past these periods.
        </p>
      </section>

      <section aria-labelledby="cookies" className="space-y-3">
        <h2 id="cookies" className="text-lg font-semibold">
          Cookies
        </h2>
        <p className="text-sm text-muted-foreground">
          Cleared uses only the sign-in cookies that keep you signed in. There are no tracking, advertising or
          analytics cookies. Your browser may also remember your filter choices on the machine list; that stays on
          your device.
        </p>
      </section>

      <section aria-labelledby="your-rights" className="space-y-3">
        <h2 id="your-rights" className="text-lg font-semibold">
          Seeing or deleting your data
        </h2>
        <p className="text-sm text-muted-foreground">
          To see what Cleared holds about you, correct it, or ask for it to be deleted, ask the makerspace staff.
          Some records, such as certifications and fault reports, may be kept as part of the makerspace&apos;s
          safety history.
        </p>
        <p className="text-sm text-muted-foreground">{CONTACT_STAFF}</p>
        <p className="text-sm text-muted-foreground">
          See also the{" "}
          <Link href="/terms" prefetch={false} className={linkClass}>
            Terms of use
          </Link>{" "}
          and{" "}
          <Link href="/help" prefetch={false} className={linkClass}>
            Help
          </Link>
          .
        </p>
      </section>
    </article>
  );
}
