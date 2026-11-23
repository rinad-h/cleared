import { CircleCheck, CircleSlash } from "lucide-react";
import type { MemberStatus, Role } from "@/server/domain/enums";

export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", staff: "Staff", member: "Member" };
export const STATUS_LABELS: Record<MemberStatus, string> = { active: "Active", suspended: "Suspended" };

/** Membership status as icon + word (never colour alone). Not a machine status, so not a `StatusBadge`. */
export function MemberStatusLabel({ status }: { status: MemberStatus }) {
  const Icon = status === "active" ? CircleCheck : CircleSlash;
  return (
    <span data-member-status={status} className="inline-flex items-center gap-1 text-sm">
      <Icon aria-hidden="true" className="size-4" />
      {STATUS_LABELS[status]}
    </span>
  );
}
