import Link from "next/link";
import { LayoutDashboard, Smartphone, UserRound } from "lucide-react";
import { getMe } from "@/data/me";
import { roleCan } from "@/lib/permissions";

const linkClass =
  "inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Header links for the signed-in user: the Member app ⇄ Staff console switch
 * (staff and admins, PRD 8) and the account page. Reads the session, so
 * layouts render it inside <Suspense>.
 */
export async function HeaderAccount({ side }: { side: "member" | "console" }) {
  const me = await getMe();
  const membership = me.membership;
  if (!me.user) return null;
  const showSwitch = membership?.status === "active" && roleCan(membership.role, "viewConsole");
  return (
    <nav aria-label="Account" className="flex items-center gap-1">
      {showSwitch && side === "member" ? (
        <Link href="/console" prefetch={false} className={linkClass}>
          <LayoutDashboard aria-hidden="true" className="size-4" />
          <span className="sr-only sm:not-sr-only">Staff console</span>
        </Link>
      ) : null}
      {showSwitch && side === "console" ? (
        <Link href="/machines" prefetch={false} className={`${linkClass} md:hidden`}>
          <Smartphone aria-hidden="true" className="size-4" />
          <span className="sr-only sm:not-sr-only">Member app</span>
        </Link>
      ) : null}
      <Link href="/me/account" prefetch={false} className={linkClass}>
        <UserRound aria-hidden="true" className="size-4" />
        <span className="sr-only sm:not-sr-only">Account</span>
      </Link>
    </nav>
  );
}
