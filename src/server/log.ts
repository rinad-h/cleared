import "server-only";

/**
 * Structured logging to Workers Logs: one JSON line per event.
 *
 * Never log emails, names, passwords, tokens, cookies, URLs or free text
 * (fault descriptions, notes, raw error messages). Log ids, codes and counts.
 * Keys that look sensitive are redacted as a backstop, word by word:
 * `qrToken`, `resetUrl`, `displayName` and `user_email` are redacted;
 * `machineId`, `tokenCount` and `noteId` are kept (ids, counts and codes are safe).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, string | number | boolean | null | undefined>;

const SENSITIVE_WORDS = new Set([
  "email", "emails", "name", "names", "password", "passwd", "secret", "secrets",
  "token", "tokens", "cookie", "cookies", "authorization", "auth", "session",
  "description", "note", "notes", "text", "comment", "comments", "message", "msg", "body",
  "phone", "address", "recipient", "to", "url", "urls", "link", "links", "href",
  "path", "pathname", "query", "ip", "agent", "key", "keys", "otp", "hash",
]);
/** A final word that makes a key safe whatever comes before it (an id or a number). */
const SAFE_LAST_WORDS = new Set(["id", "ids", "count", "total", "code", "codes", "kind", "type", "status", "ms", "at", "length", "size"]);

/** Split camelCase / snake_case / kebab-case keys into lowercase words. */
function words(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export function isSensitiveKey(key: string): boolean {
  const parts = words(key);
  if (parts.length > 0 && SAFE_LAST_WORDS.has(parts[parts.length - 1])) return false;
  return parts.some((w) => SENSITIVE_WORDS.has(w));
}

export function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = isSensitiveKey(key) && value != null ? "[redacted]" : value;
  }
  return out;
}

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

/**
 * Diagnostics for an unexpected error that contain no personal data: the error
 * names, the top stack frames (code locations only, not the message line), the
 * SQL of a failed Drizzle query (not its params), and a D1/SQLite cause message
 * (those name tables and columns, not values).
 */
export function errorDetails(err: unknown): Record<string, string> {
  if (!(err instanceof Error)) return { name: typeof err };
  const details: Record<string, string> = { name: err.name };
  const cause = err.cause instanceof Error ? err.cause : undefined;
  if (cause) {
    details.causeName = cause.name;
    if (/^D1_ERROR|SQLITE_|constraint failed/i.test(cause.message)) details.cause = truncate(cause.message, 300);
  }
  const query = (err as { query?: unknown }).query;
  if (typeof query === "string") details.query = truncate(query, 300);
  const frames = err.stack
    ?.split("\n")
    .filter((line) => /^\s+at /.test(line))
    .slice(0, 3)
    .map((line) => line.trim());
  if (frames && frames.length > 0) details.stack = frames.join(" | ");
  return details;
}

/** Log one event. Pass `err` for unexpected errors; it's reduced to `errorDetails()`. */
export function log(level: LogLevel, event: string, fields: LogFields = {}, err?: unknown): void {
  const line = JSON.stringify({
    ...redact(fields),
    ...(err !== undefined ? { error: errorDetails(err) } : {}),
    level,
    event,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
