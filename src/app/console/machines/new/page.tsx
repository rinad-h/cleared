import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Gate } from "@/components/gate";
import { MachineForm } from "@/components/catalog/machine-form";
import { listCertifications } from "@/data/certifications";
import { listRooms } from "@/data/rooms";
import { getActor } from "@/lib/actor";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Add machine" };

export default function NewMachinePage({ searchParams }: PageProps<"/console/machines/new">) {
  return (
    <Gate area="staff">
      <section aria-labelledby="page-title" className="space-y-6">
        <div className="space-y-2">
          <Link
            href="/console/machines"
            prefetch={false}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            Machines
          </Link>
          <h1 id="page-title" className="text-2xl font-semibold tracking-tight">
            Add machine
          </h1>
        </div>
        <NewMachineForm searchParams={searchParams} />
      </section>
    </Gate>
  );
}

async function NewMachineForm({ searchParams }: Pick<PageProps<"/console/machines/new">, "searchParams">) {
  const actor = await getActor();
  const isAdmin = can(actor, "manageCertifications");
  const [rooms, certifications, params] = await Promise.all([
    listRooms(),
    isAdmin ? listCertifications() : Promise.resolve([]),
    searchParams,
  ]);
  const room = Array.isArray(params.room) ? params.room[0] : params.room;
  return (
    <MachineForm
      rooms={rooms.map(({ id, name }) => ({ id, name }))}
      certifications={certifications.map(({ id, name }) => ({ id, name }))}
      isAdmin={isAdmin}
      defaultRoomId={rooms.some((r) => r.id === room) ? room : undefined}
    />
  );
}
