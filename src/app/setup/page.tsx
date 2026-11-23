import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CenteredLayout } from "@/components/layouts/centered";
import { SetupForm } from "@/components/setup/setup-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getMe } from "@/data/me";
import { DEFAULT_TIMEZONE, supportedTimeZones } from "@/server/domain/identity";

export const metadata: Metadata = { title: "Setup" };

/** First-run Setup: only while no makerspace exists. The first person to finish becomes admin. */
export default function SetupPage() {
  return (
    <CenteredLayout>
      <section aria-labelledby="page-title" className="space-y-6">
        <div className="space-y-1">
          <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
            Set up your makerspace
          </h1>
          <p className="text-muted-foreground">You&apos;ll be its first admin. This runs only once.</p>
        </div>
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <SetupBody />
        </Suspense>
      </section>
    </CenteredLayout>
  );
}

async function SetupBody() {
  const me = await getMe();
  if (!me.user) redirect("/sign-in?next=/setup");
  if (me.setupComplete) redirect("/machines");
  return <SetupForm timeZones={supportedTimeZones()} defaultTimeZone={DEFAULT_TIMEZONE} />;
}
