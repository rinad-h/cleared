import "server-only";

/**
 * True if `err` (or an error it wraps) is SQLite's "UNIQUE constraint failed"
 * for one of `targets`: `table.column` (what SQLite reports, also for a
 * `COLLATE NOCASE` index on a column) or an index name (pure expression
 * indexes report `index '…'`). Only D1's own message is
 * matched, never Drizzle's "Failed query: …" wrapper (it contains user input).
 */
export function isUniqueViolation(err: unknown, ...targets: string[]): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const wrapper = current.name === "DrizzleQueryError" || current.message.startsWith("Failed query:");
    if (!wrapper && current.message.includes("UNIQUE constraint failed")) {
      return targets.some((t) => current instanceof Error && current.message.includes(t));
    }
    current = current.cause;
  }
  return false;
}
