import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";
import { FaultCard } from "@/components/faults/fault-card";
import { Gate } from "@/components/gate";
import { getFaultQueue } from "@/data/faults";

export const metadata: Metadata = { title: "Faults" };

/** The fault queue (FR-14, Phase 5 §7.2): out-of-service faults first, then oldest. */
export default function ConsoleFaultsPage() {
  return (
    <Gate area="staff">
      <section aria-labelledby="page-title" className="max-w-3xl space-y-6">
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
          Faults
        </h1>
        <FaultQueue />
      </section>
    </Gate>
  );
}

async function FaultQueue() {
  const { items } = await getFaultQueue();
  return items.length === 0 ? (
    <p className="flex items-center gap-2 rounded-md border px-4 py-6 text-muted-foreground">
      <CircleCheck aria-hidden="true" className="size-5" />
      No open faults
    </p>
  ) : (
    <ul aria-label="Open faults" className="space-y-3">
      {items.map((f) => (
        <li key={f.id}>
          <FaultCard fault={f} />
        </li>
      ))}
    </ul>
  );
}
