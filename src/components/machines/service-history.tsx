import Link from "next/link";
import { CircleCheck, CircleX, Wrench } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ServiceOutcome } from "@/server/domain/enums";
import type { ServiceHistoryPage } from "@/server/services/service-records";
import { OUTCOME_LABELS, SERVICE_TYPE_LABELS } from "./labels";

/** Outcome as colour + icon + word. */
function OutcomeChip({ outcome }: { outcome: ServiceOutcome }) {
  if (outcome === "returned_to_service") return <StatusBadge status="available" label={OUTCOME_LABELS[outcome]} />;
  if (outcome === "still_out_of_service") return <StatusBadge status="out-of-service" label={OUTCOME_LABELS[outcome]} />;
  const Icon = outcome === "passed" ? CircleCheck : CircleX;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium">
      <Icon aria-hidden="true" className="size-4" />
      {OUTCOME_LABELS[outcome]}
    </span>
  );
}

/**
 * The service history on machine detail (FR-15): newest first; who (or
 * "Vendor: X (logged by Y)"), type, work done, parts, minutes, outcome,
 * linked faults and correction links. Append-only: corrections are new records.
 */
export function ServiceHistory({
  machineId,
  history,
  timeZone,
  cursor,
}: {
  machineId: string;
  history: ServiceHistoryPage;
  timeZone: string;
  /** Set when this isn't the first page. */
  cursor?: string;
}) {
  if (history.items.length === 0) {
    return <p className="text-sm text-muted-foreground">No service records yet.</p>;
  }
  return (
    <div className="space-y-3">
      {cursor ? (
        <p className="text-sm">
          <Link href={`/console/machines/${machineId}#history`} prefetch={false} className="underline underline-offset-4">
            Back to the newest records
          </Link>
        </p>
      ) : null}
      <ol aria-label="Service history" className="space-y-3">
        {history.items.map((r) => (
          <li key={r.id} id={`record-${r.id}`} className="space-y-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Wrench aria-hidden="true" className="size-4 text-muted-foreground" />
              <span className="font-semibold">{SERVICE_TYPE_LABELS[r.type]}</span>
              <span className="text-sm text-muted-foreground">{formatDateTime(r.performedAt, timeZone)}</span>
              <OutcomeChip outcome={r.outcome} />
            </div>
            <p className="text-sm text-muted-foreground">
              {r.performedBy
                ? r.performedBy.id === r.loggedBy.id
                  ? `By ${r.performedBy.displayName}`
                  : `By ${r.performedBy.displayName} (logged by ${r.loggedBy.displayName})`
                : `Vendor: ${r.externalTechnician} (logged by ${r.loggedBy.displayName})`}
            </p>
            <p className="break-words whitespace-pre-line">{r.workDone}</p>
            {r.partsUsed || r.minutesSpent ? (
              <p className="text-sm text-muted-foreground">
                {r.partsUsed ? `Parts: ${r.partsUsed}` : null}
                {r.partsUsed && r.minutesSpent ? " · " : null}
                {r.minutesSpent ? `${r.minutesSpent} min` : null}
              </p>
            ) : null}
            {r.linkedFaults.length > 0 ? (
              <div className="text-sm">
                <p className="font-medium">Resolved {r.linkedFaults.length === 1 ? "fault" : "faults"}:</p>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {r.linkedFaults.map((f) => (
                    <li key={f.id} className="break-words">
                      {f.description} ({formatDate(f.reportedAt, timeZone)})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {r.corrects ? (
              <p className="text-sm">
                Corrects{" "}
                <a href={`#record-${r.corrects.id}`} className="underline underline-offset-4">
                  record of {formatDate(r.corrects.performedAt, timeZone)}
                </a>
              </p>
            ) : null}
            {r.correctedBy.map((c) => (
              <p key={c.id} className="text-sm">
                Corrected by{" "}
                <a href={`#record-${c.id}`} className="underline underline-offset-4">
                  record of {formatDate(c.performedAt, timeZone)}
                </a>
              </p>
            ))}
            {r.corrects === null ? (
              <p className="text-sm">
                <Link
                  href={`/console/machines/${machineId}/service/new?corrects=${r.id}`}
                  prefetch={false}
                  className="underline underline-offset-4"
                >
                  Correct this record
                </Link>
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      {history.nextCursor ? (
        <p>
          <Link
            href={`/console/machines/${machineId}?cursor=${encodeURIComponent(history.nextCursor)}#history`}
            prefetch={false}
            className="text-sm font-medium underline underline-offset-4"
          >
            Load more
          </Link>
        </p>
      ) : null}
    </div>
  );
}
