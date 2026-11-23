import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { formatAge } from "@/components/faults/fault-card";
import { Gate } from "@/components/gate";
import { ServiceForm } from "@/components/machines/service-form";
import { getMachineDetail, getServiceRecord, listStaff } from "@/data/machines";
import { getActor } from "@/lib/actor";
import { formatDate, toDateTimeLocal } from "@/lib/format";
import { ServiceError } from "@/server/domain/errors";

export const metadata: Metadata = { title: "Log service" };

/** Log service (FR-15, Phase 5 §7.2), or correct a record with `?corrects=<id>`. `?faultIds=` pre-links faults. */
export default function LogServicePage({ params, searchParams }: PageProps<"/console/machines/[id]/service/new">) {
  return (
    <Gate area="staff">
      <LogService params={params} searchParams={searchParams} />
    </Gate>
  );
}

const asList = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : v.split(","));

async function LogService({
  params,
  searchParams,
}: Pick<PageProps<"/console/machines/[id]/service/new">, "params" | "searchParams">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const correctsId = typeof query.corrects === "string" ? query.corrects : undefined;

  let detail, original, staff;
  try {
    [detail, original, staff] = await Promise.all([
      getMachineDetail(id),
      correctsId ? getServiceRecord(id, correctsId) : Promise.resolve(null),
      listStaff(),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "VALIDATION_FAILED")) notFound();
    throw err;
  }
  if (detail.machine.status === "retired" || (original && original.correctsRecordId !== null)) notFound();

  const actor = await getActor();
  const me = actor.kind === "member" ? { id: actor.memberId, displayName: actor.displayName } : null;
  if (!me) notFound();
  const tz = detail.timezone;

  return (
    <section aria-labelledby="page-title" className="space-y-6">
      <div className="space-y-2">
        <Link
          href={`/console/machines/${id}`}
          prefetch={false}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {detail.machine.name}
        </Link>
        <h1 id="page-title" className="text-2xl font-semibold tracking-tight break-words">
          {original ? "Correct a service record" : "Log service"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {detail.machine.name} · {detail.machine.room.name}
        </p>
      </div>
      <ServiceForm
        machineId={id}
        timeZone={tz}
        nowLocal={toDateTimeLocal(detail.serverNow, tz)}
        me={me}
        staff={staff.filter((s) => s.id !== me.id)}
        faults={
          original
            ? []
            : detail.openFaults.map((f) => ({
                id: f.id,
                tookOutOfService: f.tookOutOfService,
                label: `${f.tookOutOfService ? "Out of service: " : ""}${f.description} (${formatAge(f.ageMinutes)}, ${f.reporter.displayName})`,
              }))
        }
        preselectedFaultIds={asList(query.faultIds)}
        correction={
          original
            ? {
                id: original.id,
                performedOnLabel: formatDate(original.performedAt, tz),
                performedAtLocal: toDateTimeLocal(original.performedAt, tz),
                performedByMemberId: original.performedByMemberId,
                externalTechnician: original.externalTechnician,
                type: original.type,
                workDone: original.workDone,
                partsUsed: original.partsUsed,
                minutesSpent: original.minutesSpent,
                outcome: original.outcome,
              }
            : null
        }
      />
    </section>
  );
}
