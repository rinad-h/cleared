import { Suspense } from "react";
import type { Metadata } from "next";
import { SetupChecklist } from "@/components/catalog/setup-checklist";
import { ConsoleLive } from "@/components/console/console-live";
import { Gate } from "@/components/gate";
import { Skeleton } from "@/components/ui/skeleton";
import { getConsole } from "@/data/console";
import { getSetupProgress } from "@/data/machines";
import { getActor } from "@/lib/actor";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Staff console" };

/**
 * Console home (FR-17, Phase 6 §6): counts, sessions no longer authorized,
 * active sessions and out-of-service machines. The server renders the first
 * snapshot; `<ConsoleLive>` then polls the JSON route handler (not
 * `router.refresh()`, D5). Admins also see the setup checklist until it's done.
 */
export default function ConsoleHomePage() {
  return (
    <Gate area="staff">
      <section aria-labelledby="page-title" className="max-w-5xl space-y-6">
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          Staff console
        </h1>
        <Checklist />
        <Suspense fallback={<ConsoleSkeleton />}>
          <Live />
        </Suspense>
      </section>
    </Gate>
  );
}

async function Checklist() {
  const actor = await getActor();
  if (!can(actor, "manageCertifications")) return null; // admins only
  const progress = await getSetupProgress();
  return <SetupChecklist {...progress} isAdmin />;
}

async function Live() {
  const { console: data, etag } = await getConsole();
  return <ConsoleLive initial={data} etag={etag} />;
}

function ConsoleSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the console" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
