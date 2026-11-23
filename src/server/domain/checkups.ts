/**
 * Recurring checkups (FR-16, Phase 6 §4.1). Pure: no I/O, `now` passed in.
 * Advisory only: nothing here affects passes, sessions or the member board.
 */

export const DAY_MS = 86_400_000;
/** A checkup is "due soon" this long before its due date. */
export const DUE_SOON_MS = 7 * DAY_MS;

export type CheckupState = "ok" | "due_soon" | "overdue";

export type CheckupTiming = {
  createdAt: number;
  intervalDays: number;
  /** The latest `performed_at` of a linked `scheduled_checkup` record (not the latest inserted). */
  lastDoneAt: number | null;
};

/** Latest linked record (or the checkup's creation) + the interval. */
export function nextDue({ createdAt, intervalDays, lastDoneAt }: CheckupTiming): number {
  return (lastDoneAt ?? createdAt) + intervalDays * DAY_MS;
}

export function checkupState(nextDueAt: number, now: number): CheckupState {
  if (nextDueAt <= now) return "overdue";
  if (nextDueAt <= now + DUE_SOON_MS) return "due_soon";
  return "ok";
}

/**
 * The next instant after `now` at which the checkup's state changes without a
 * write (it becomes "due soon", then "overdue"), or null once it is overdue.
 * Used for the console's ETag `validUntil`.
 */
export function nextBoundary(nextDueAt: number, now: number): number | null {
  const soon = nextDueAt - DUE_SOON_MS;
  if (soon > now) return soon;
  if (nextDueAt > now) return nextDueAt;
  return null;
}

/** Whole days a checkup is overdue by (0 on its due day). */
export function daysOverdue(nextDueAt: number, now: number): number {
  return Math.max(0, Math.floor((now - nextDueAt) / DAY_MS));
}
