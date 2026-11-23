import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Printer } from "lucide-react";
import { Gate } from "@/components/gate";
import { MachineStatusBadge, RequirementChip, SupervisedChip } from "@/components/catalog/machine-chips";
import { Button } from "@/components/ui/button";
import { listMachines } from "@/data/machines";
import { listRooms } from "@/data/rooms";
import type { MachineView } from "@/server/services/machines";

export const metadata: Metadata = { title: "Machines" };

export default function ConsoleMachinesPage() {
  return (
    <Gate area="staff">
      <section aria-labelledby="page-title" className="max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
            Machines
          </h1>
          <Button asChild>
            <Link href="/console/machines/new" prefetch={false}>
              <Plus aria-hidden="true" />
              Add machine
            </Link>
          </Button>
        </div>
        <MachinesContent />
      </section>
    </Gate>
  );
}

async function MachinesContent() {
  const [machines, rooms] = await Promise.all([listMachines(), listRooms()]);
  if (rooms.length === 0) {
    return (
      <p className="rounded-md border px-4 py-6 text-center text-muted-foreground">
        Machines live in rooms.{" "}
        <Link href="/console/rooms" prefetch={false} className="font-medium text-foreground underline underline-offset-4">
          Add your first room
        </Link>{" "}
        first.
      </p>
    );
  }
  if (machines.length === 0) {
    return (
      <p className="rounded-md border px-4 py-6 text-center text-muted-foreground">
        No machines yet.{" "}
        <Link href="/console/machines/new" prefetch={false} className="font-medium text-foreground underline underline-offset-4">
          Add your first machine
        </Link>
        .
      </p>
    );
  }

  const byRoom = new Map<string, { name: string; machines: MachineView[] }>();
  for (const m of machines) {
    const group = byRoom.get(m.room.id) ?? { name: m.room.name, machines: [] };
    group.machines.push(m);
    byRoom.set(m.room.id, group);
  }

  // A plain GET form: tick machines and print their labels (works before JavaScript loads).
  return (
    <form action="/console/labels" method="get" className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline">
          <Printer aria-hidden="true" />
          Print selected labels
        </Button>
        <Button asChild variant="outline">
          <Link href="/console/labels" prefetch={false}>
            Print all labels
          </Link>
        </Button>
      </div>
      {[...byRoom.entries()].map(([roomId, group]) => (
        <div key={roomId} className="space-y-2">
          <h2 className="text-lg font-semibold">{group.name}</h2>
          <ul className="divide-y rounded-md border" aria-label={`Machines in ${group.name}`}>
            {group.machines.map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  name="ids"
                  value={m.id}
                  id={`select-${m.id}`}
                  aria-label={`Select ${m.name} for printing`}
                  className="mt-1 size-4 shrink-0 accent-primary"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/console/machines/${m.id}/edit`}
                      prefetch={false}
                      className="font-medium break-words underline-offset-4 hover:underline"
                    >
                      {m.name}
                    </Link>
                    <MachineStatusBadge status={m.status} />
                    {m.supervised ? <SupervisedChip /> : null}
                  </div>
                  {m.requirements.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5" aria-label="Required certifications">
                      {m.requirements.map((r) => (
                        <RequirementChip key={r.id} name={r.name} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No certification required</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </form>
  );
}
