import {
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Every status is shown as colour + icon + word (PRD 8), never colour alone.
 * Colours come from the status tokens in globals.css.
 */
export const STATUSES = {
  cleared: {
    label: "Cleared",
    icon: ShieldCheck,
    className: "bg-status-cleared text-status-cleared-foreground",
  },
  supervision: {
    label: "Supervision required",
    icon: Eye,
    className: "bg-status-supervision text-status-supervision-foreground",
  },
  "not-cleared": {
    label: "Not cleared",
    icon: CircleX,
    className: "bg-status-not-cleared text-status-not-cleared-foreground",
  },
  "out-of-service": {
    label: "Out of service",
    icon: Wrench,
    className: "bg-status-out-of-service text-status-out-of-service-foreground",
  },
  "in-use": {
    label: "In use",
    icon: Clock,
    className: "bg-status-in-use text-status-in-use-foreground",
  },
  available: {
    label: "Available",
    icon: CircleCheck,
    className: "bg-status-cleared text-status-cleared-foreground",
  },
} as const satisfies Record<string, { label: string; icon: LucideIcon; className: string }>;

export type Status = keyof typeof STATUSES;

export function StatusBadge({
  status,
  label,
  size = "default",
  className,
}: {
  status: Status;
  /** Replaces the default word, e.g. "In use · est. free 3:10 pm". Must still name the status. */
  label?: string;
  size?: "default" | "lg";
  className?: string;
}) {
  const { label: defaultLabel, icon: Icon, className: tone } = STATUSES[status];
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        size === "lg" ? "px-4 py-2 text-lg" : "px-2.5 py-0.5 text-sm",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className={size === "lg" ? "size-6" : "size-4"} />
      {label ?? defaultLabel}
    </span>
  );
}
