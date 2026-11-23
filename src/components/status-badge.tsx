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
  /** `block`: the machine pass's full-width status block, readable from 1–2 m. */
  size?: "default" | "lg" | "block";
  className?: string;
}) {
  const { label: defaultLabel, icon: Icon, className: tone } = STATUSES[status];
  return (
    <span
      data-status={status}
      className={cn(
        size === "block"
          ? "flex w-full items-center gap-3 rounded-xl px-4 py-6 text-[clamp(1.5rem,8vw,2.75rem)] leading-none font-extrabold tracking-tight uppercase sm:gap-4 sm:px-5"
          : "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        size === "lg" ? "px-4 py-2 text-lg" : size === "default" ? "px-2.5 py-0.5 text-sm" : null,
        tone,
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={size === "block" ? "size-10 shrink-0 sm:size-12" : size === "lg" ? "size-6" : "size-4"}
      />
      {size === "block" ? <span className="min-w-0 [overflow-wrap:anywhere]">{label ?? defaultLabel}</span> : (label ?? defaultLabel)}
    </span>
  );
}
