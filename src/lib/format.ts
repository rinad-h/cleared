/**
 * Date and time formatting in the makerspace's time zone (docs/phases/README.md
 * §4.4). Pure: server and client components both use it.
 */

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    cache.set(key, f);
  }
  return f;
}

/** "Mar 3, 2027" */
export function formatDate(ms: number, timeZone: string): string {
  return formatter(timeZone, { month: "short", day: "numeric", year: "numeric" }).format(ms);
}

/** "Mar 3, 2027, 2:41 PM" */
export function formatDateTime(ms: number, timeZone: string): string {
  return formatter(timeZone, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(ms);
}

/** "2:41:07 PM" (the pass clock) */
export function formatClock(ms: number, timeZone: string): string {
  return formatter(timeZone, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(ms);
}

/** "Sun, Nov 22" */
export function formatWeekday(ms: number, timeZone: string): string {
  return formatter(timeZone, { weekday: "short", month: "short", day: "numeric" }).format(ms);
}

/** Whole days from `now` until `ms`, rounded up (0 when past). */
export function daysUntil(ms: number, now: number): number {
  return Math.max(0, Math.ceil((ms - now) / 86_400_000));
}
