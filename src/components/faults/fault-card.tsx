import Link from "next/link";
import { ClipboardPen, TriangleAlert, Wrench } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import type { FaultItem } from "@/server/services/faults";

/** "5 min", "2 h", "3 days" */
export function formatAge(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/**
 * One open fault (staff only: the description and reporter are never shown
 * to members or on the board). Used by the fault queue and machine detail.
 */
export function FaultCard({ fault, showMachine = true }: { fault: FaultItem; showMachine?: boolean }) {
  const label = `Fault on ${fault.machine.name}, reported ${formatAge(fault.ageMinutes)}`;
  return (
    <article aria-label={label} className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        {showMachine ? (
          <h3 className="font-semibold break-words">
            {fault.machine.name}
            <span className="font-normal text-muted-foreground"> · {fault.machine.roomName}</span>
          </h3>
        ) : null}
        {fault.tookOutOfService ? (
          <StatusBadge status="out-of-service" label="Took it out of service" />
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm">
            <TriangleAlert aria-hidden="true" className="size-4" />
            Still usable
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Reported {formatAge(fault.ageMinutes)} by {fault.reporter.displayName}
        {fault.otherOpenOnMachine > 0
          ? ` · ${fault.otherOpenOnMachine} other open ${fault.otherOpenOnMachine === 1 ? "report" : "reports"} on this machine`
          : ""}
      </p>
      <p className="break-words whitespace-pre-line">{fault.description}</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={`/console/machines/${fault.machine.id}/service/new?faultIds=${fault.id}`} prefetch={false}>
            <ClipboardPen aria-hidden="true" />
            Log service
          </Link>
        </Button>
        {showMachine ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/console/machines/${fault.machine.id}`} prefetch={false}>
              <Wrench aria-hidden="true" />
              Open machine
            </Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}
