/**
 * Calendar arithmetic in UTC. Pure: no I/O, no clock (callers pass `now`).
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `ms` plus `months` calendar months in UTC, keeping the time of day and
 * clamping to the last day of the target month: Jan 31 + 1 month = Feb 28
 * (Feb 29 in a leap year). Phase 3 §4.2.
 */
export function addMonthsUtc(ms: number, months: number): number {
  const d = new Date(ms);
  const total = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(
    year,
    month,
    Math.min(d.getUTCDate(), lastDay),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}

/** A grant's expiry: `granted_at + validity_months`, or null when the certification never expires. */
export function expiryFor(grantedAt: number, validityMonths: number | null): number | null {
  return validityMonths === null ? null : addMonthsUtc(grantedAt, validityMonths);
}
