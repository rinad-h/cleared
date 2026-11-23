import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleSlash, ShieldAlert, UserRoundX } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMe } from "@/data/me";

/**
 * `signed-in` only needs an account (the machine pass, which shows non-members
 * and suspended members their own NOT CLEARED pass instead of a gate card).
 */
export type GateArea = "signed-in" | "member" | "staff" | "admin";

/**
 * Page-level access gate (Phase 1 §6), rendered by every signed-in page. Pages
 * run it themselves because layouts don't re-render on client navigation. It
 * brings its own `<Suspense>`: a group-level loading.tsx doesn't cover a
 * navigation between sibling pages (e.g. /me/certifications → /me/account),
 * which dev's instant-navigation check reports. It only decides what to
 * *show*: every service checks the actor again.
 *
 *  anonymous                    → /sign-in (proxy.ts normally caught this)
 *  setup not done               → /setup
 *  signed in, no membership     → "No membership"
 *  member, suspended            → "Suspended"
 *  staff area, role member      → "Staff only"
 *  admin area, not admin        → "Admins only"
 */
export function Gate({ area, children }: { area: GateArea; children: ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <GateCheck area={area}>{children}</GateCheck>
    </Suspense>
  );
}

/** Loading state for a gated page. */
export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

async function GateCheck({ area, children }: { area: GateArea; children: ReactNode }) {
  const me = await getMe();
  if (!me.user) redirect("/sign-in");
  if (!me.setupComplete) redirect("/setup");
  if (area === "signed-in") return children;
  if (!me.membership) return <NoMembershipGate email={me.user.email} />;
  if (me.membership.status !== "active") return <SuspendedGate />;
  if (area === "staff" && me.membership.role === "member") return <RoleGate admins={false} />;
  if (area === "admin" && me.membership.role !== "admin") return <RoleGate admins />;
  return children;
}

function GateCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShieldAlert;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-md space-y-4 py-6">
      <Icon aria-hidden="true" className="size-8 text-muted-foreground" />
      <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      {children}
    </section>
  );
}

export function NoMembershipGate({ email }: { email: string }) {
  return (
    <GateCard icon={UserRoundX} title="You aren't a member yet">
      <p className="text-muted-foreground">
        You&apos;re signed in as <span className="font-medium break-all text-foreground">{email}</span> but
        aren&apos;t a member of this makerspace. Ask staff for the join link.
      </p>
      <SignOutButton />
    </GateCard>
  );
}

export function SuspendedGate() {
  return (
    <GateCard icon={CircleSlash} title="Your access is suspended">
      <p className="text-muted-foreground">Contact staff.</p>
      <SignOutButton />
    </GateCard>
  );
}

function RoleGate({ admins }: { admins: boolean }) {
  return (
    <GateCard icon={ShieldAlert} title={admins ? "Admins only" : "Staff only"}>
      <p className="text-muted-foreground">
        {admins ? "Only admins can open this page." : "This part of Cleared is for staff."}
      </p>
      <Button asChild variant="outline">
        <Link href={admins ? "/console" : "/machines"} prefetch={false}>
          {admins ? "Back to the console" : "Go to the member app"}
        </Link>
      </Button>
    </GateCard>
  );
}
