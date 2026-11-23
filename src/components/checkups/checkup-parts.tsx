import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { daysOverdue, type CheckupState } from "@/server/domain/checkups";

/** A checkup's state as colour + icon + word. */
export function CheckupBadge({ state, active = true }: { state: CheckupState; active?: boolean }) {
  if (!active) return <StatusBadge status="inactive" />;
  return <StatusBadge status={state === "overdue" ? "overdue" : state === "due_soon" ? "due-soon" : "on-schedule"} />;
}

/** "every 14 days" */
export function intervalText(days: number): string {
  return days === 1 ? "every day" : `every ${days} days`;
}

/** "due Nov 4, 2026", "due today" or "overdue by 3 days" (dates in the makerspace's time zone). */
export function dueText(nextDueAt: number, now: number, timeZone: string): string {
  if (nextDueAt > now) return `due ${formatDate(nextDueAt, timeZone)}`;
  const days = daysOverdue(nextDueAt, now);
  return days === 0 ? "due today" : `overdue by ${days} day${days === 1 ? "" : "s"}`;
}

/** "last done Oct 21, 2026" or "never done" */
export function lastDoneText(lastDoneAt: number | null, timeZone: string): string {
  return lastDoneAt === null ? "never done" : `last done ${formatDate(lastDoneAt, timeZone)}`;
}
