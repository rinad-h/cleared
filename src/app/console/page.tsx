import type { Metadata } from "next";
import { Gate } from "@/components/gate";
import { SetupChecklist } from "@/components/catalog/setup-checklist";
import { getSetupProgress } from "@/data/machines";
import { getActor } from "@/lib/actor";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Staff console" };

export default function ConsoleHomePage() {
  return (
    <Gate area="staff">
      <section aria-labelledby="page-title" className="space-y-6">
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          Staff console
        </h1>
        <Checklist />
        <p className="text-sm text-muted-foreground">Faults, checkups and live machine status arrive in later phases.</p>
      </section>
    </Gate>
  );
}

async function Checklist() {
  const [actor, progress] = await Promise.all([getActor(), getSetupProgress()]);
  return <SetupChecklist {...progress} isAdmin={can(actor, "manageCertifications")} />;
}
