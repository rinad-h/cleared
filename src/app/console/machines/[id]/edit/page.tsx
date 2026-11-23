import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Printer } from "lucide-react";
import { Gate } from "@/components/gate";
import { MachineStatusBadge } from "@/components/catalog/machine-chips";
import { MachineForm, RetireMachine } from "@/components/catalog/machine-form";
import { Button } from "@/components/ui/button";
import { listCertifications } from "@/data/certifications";
import { getMachine } from "@/data/machines";
import { listRooms } from "@/data/rooms";
import { getActor } from "@/lib/actor";
import { can } from "@/lib/permissions";
import { ServiceError } from "@/server/domain/errors";

export const metadata: Metadata = { title: "Edit machine" };

export default function EditMachinePage({ params }: PageProps<"/console/machines/[id]/edit">) {
  return (
    <Gate area="staff">
      <EditMachine params={params} />
    </Gate>
  );
}

async function EditMachine({ params }: Pick<PageProps<"/console/machines/[id]/edit">, "params">) {
  const { id } = await params;
  const actor = await getActor();
  const isAdmin = can(actor, "manageCertifications");
  let machine;
  try {
    machine = await getMachine(id);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "VALIDATION_FAILED")) notFound();
    throw err;
  }
  const [rooms, certifications] = await Promise.all([
    listRooms(),
    isAdmin ? listCertifications() : Promise.resolve([]),
  ]);
  // Current requirements stay listed even if one were inactive.
  const certOptions = [
    ...certifications.map(({ id, name }) => ({ id, name })),
    ...machine.requirements.filter((r) => !certifications.some((c) => c.id === r.id)),
  ];

  return (
    <section aria-labelledby="page-title" className="space-y-8">
      <div className="space-y-2">
        <Link
          href="/console/machines"
          prefetch={false}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Machines
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 id="page-title" className="text-2xl font-semibold tracking-tight break-words">
            {machine.name}
          </h1>
          <MachineStatusBadge status={machine.status} />
        </div>
        <p className="text-sm text-muted-foreground">{machine.room.name}</p>
      </div>

      {machine.status === "retired" ? (
        <p className="max-w-xl rounded-md border px-4 py-3 text-sm">
          This machine is retired. It can&apos;t be edited, and its label shows &ldquo;label not recognized&rdquo;.
        </p>
      ) : (
        <>
          <MachineForm
            machine={{
              id: machine.id,
              name: machine.name,
              roomId: machine.room.id,
              typicalSessionMinutes: machine.typicalSessionMinutes,
              supervised: machine.supervised,
              requirementIds: machine.requirements.map((r) => r.id),
            }}
            rooms={rooms.map(({ id, name }) => ({ id, name }))}
            certifications={certOptions}
            isAdmin={isAdmin}
          />
          <div className="max-w-xl space-y-3">
            <h2 className="text-lg font-semibold">Label</h2>
            <p className="text-sm text-muted-foreground">
              The QR code stays the same when you rename or move the machine, so printed labels keep working.
            </p>
            <Button asChild variant="outline">
              <Link href={`/console/labels?ids=${machine.id}`} prefetch={false}>
                <Printer aria-hidden="true" />
                Print this label
              </Link>
            </Button>
          </div>
          {isAdmin ? (
            <div className="max-w-xl space-y-3 rounded-md border border-destructive/40 p-4">
              <h2 className="text-lg font-semibold">Danger zone</h2>
              <p className="text-sm text-muted-foreground">
                Retire a machine that has left the makerspace. Its history is kept.
              </p>
              <RetireMachine id={machine.id} name={machine.name} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
