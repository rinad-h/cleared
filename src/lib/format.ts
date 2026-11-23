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

/** "2:41 PM" (session times on the pass and the board) */
export function formatTime(ms: number, timeZone: string): string {
  return formatter(timeZone, { hour: "numeric", minute: "2-digit" }).format(ms);
}

/** "2:41 PM" today, otherwise "Thu 2:41 PM" (estimates that may fall on another day). */
export function formatTimeOrDay(ms: number, now: number, timeZone: string): string {
  const day = formatter(timeZone, { year: "numeric", month: "numeric", day: "numeric" });
  if (day.format(ms) === day.format(now)) return formatTime(ms, timeZone);
  return formatter(timeZone, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(ms);
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

/* ------------------------------------------- date/time inputs (P5-27) */

/** The wall-clock parts of `ms` in `timeZone`. */
function zonedParts(ms: number, timeZone: string) {
  const parts = formatter(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ms);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** `ms` as a `<input type="datetime-local">` value ("2026-01-05T09:00") in the makerspace's time zone. */
export function toDateTimeLocal(ms: number, timeZone: string): string {
  const p = zonedParts(ms, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * A `datetime-local` value read as wall-clock time in `timeZone`, as UTC ms
 * (null if it isn't a valid value). In a DST gap the result is shifted by the
 * gap; in an overlap, the earlier instant wins.
 */
export function fromDateTimeLocal(value: string, timeZone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (Number.isNaN(wall)) return null;
  const offsetAt = (ms: number) => {
    const p = zonedParts(ms, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  };
  let guess = wall - offsetAt(wall);
  const second = wall - offsetAt(guess);
  if (second !== guess) guess = Math.min(guess, second);
  return guess;
}
