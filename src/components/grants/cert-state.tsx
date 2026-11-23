import { Ban, CircleCheck, CircleDashed, CircleX, Clock, type LucideIcon } from "lucide-react";
import type { CertState } from "@/server/domain/grants";

export const CERT_STATES: Record<CertState, { label: string; icon: LucideIcon; className: string }> = {
  valid: { label: "Valid", icon: CircleCheck, className: "bg-status-cleared text-status-cleared-foreground" },
  expiring_soon: { label: "Expiring soon", icon: Clock, className: "bg-status-supervision text-status-supervision-foreground" },
  expired: { label: "Expired", icon: CircleX, className: "bg-status-not-cleared text-status-not-cleared-foreground" },
  revoked: { label: "Revoked", icon: Ban, className: "bg-status-not-cleared text-status-not-cleared-foreground" },
  none: { label: "Not yet", icon: CircleDashed, className: "bg-muted text-foreground" },
};

/** A member's state for one certification: colour + icon + word (PRD 8). Not a machine status, so not a `StatusBadge`. */
export function CertStateChip({ state }: { state: CertState }) {
  const { label, icon: Icon, className } = CERT_STATES[state];
  return (
    <span
      data-cert-state={state}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium whitespace-nowrap ${className}`}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </span>
  );
}
