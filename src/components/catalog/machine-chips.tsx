import { Award, Eye } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { MachineStatus } from "@/server/domain/enums";

/** Machine status as colour + icon + word (always <StatusBadge>). */
export function MachineStatusBadge({ status }: { status: MachineStatus }) {
  if (status === "out_of_service") return <StatusBadge status="out-of-service" />;
  if (status === "retired") return <StatusBadge status="out-of-service" label="Retired" />;
  return <StatusBadge status="available" />;
}

export function SupervisedChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium">
      <Eye aria-hidden="true" className="size-3" />
      Supervised
    </span>
  );
}

export function RequirementChip({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
      <Award aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}
