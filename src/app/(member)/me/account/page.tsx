import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ChangePasswordForm, SignOutEverywhere } from "@/components/account/account-forms";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { PageSkeleton } from "@/components/gate";
import { getMe } from "@/data/me";

export const metadata: Metadata = { title: "Account" };

const ROLE_LABEL = { admin: "Admin", staff: "Staff", member: "Member" } as const;

/**
 * Account: name and email (read-only), change password, sign out everywhere.
 * Open to anyone signed in, members or not, so a suspended or not-yet-joined
 * user can still change their password and sign out.
 */
export default function AccountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const me = await getMe();
  if (!me.user) redirect("/sign-in?next=/me/account");
  const name = me.membership?.displayName ?? me.user.name;
  return (
    <section aria-labelledby="page-title" className="space-y-8">
      <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
        Account
      </h1>
      <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted-foreground">Name</dt>
        <dd className="font-medium break-words">{name}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd className="font-medium break-all">{me.user.email}</dd>
        {me.membership ? (
          <>
            <dt className="text-muted-foreground">Role</dt>
            <dd className="font-medium">
              {ROLE_LABEL[me.membership.role]}
              {me.membership.status === "suspended" ? " (suspended)" : ""}
            </dd>
          </>
        ) : null}
      </dl>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Change password</h2>
        <ChangePasswordForm />
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Sign out</h2>
        <div className="flex flex-wrap gap-3">
          <SignOutButton />
          <SignOutEverywhere />
        </div>
        <p className="text-sm text-muted-foreground">
          &ldquo;Sign out everywhere&rdquo; ends your sessions on every device, including this one. Other devices can
          stay signed in for up to 5 minutes.
        </p>
      </div>
    </section>
  );
}
