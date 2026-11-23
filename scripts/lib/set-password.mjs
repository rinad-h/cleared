// Pure helpers for scripts/set-password.ts (tested by tests/scripts/set-password.test.mjs).

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse `<email> <temp-password> [--local]`. Returns `{ email, password, local }` or `{ error }`. */
export function parseArgs(argv) {
  const local = argv.includes("--local");
  const positional = argv.filter((a) => a !== "--local");
  const unknown = positional.filter((a) => a.startsWith("--"));
  if (unknown.length > 0) return { error: `Unknown option ${unknown[0]}` };
  if (positional.length !== 2) return { error: "Expected <email> <temp-password>" };
  const email = positional[0].trim().toLowerCase();
  const password = positional[1];
  if (!EMAIL.test(email) || email.length > 254) return { error: "That isn't a valid email address" };
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return { error: `The temporary password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters` };
  }
  return { email, password, local };
}

/** A SQL string literal ('' doubles a quote). Rejects NUL, which D1 can't take in a literal. */
export function sqlString(value) {
  if (value.includes("\u0000")) throw new Error("NUL character in SQL value");
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Set the credential password for `email`, and sign that user out everywhere
 * (whoever was using the account must sign in again with the new password).
 * Better Auth stores emails lowercased.
 */
export function buildSql({ email, hash, now }) {
  if (!/^[0-9a-f]+:[0-9a-f]+$/.test(hash)) throw new Error("Unexpected password hash format");
  if (!Number.isSafeInteger(now)) throw new Error("Bad timestamp");
  const userId = `(SELECT id FROM "user" WHERE email = ${sqlString(email)})`;
  return [
    `UPDATE account SET password = ${sqlString(hash)}, updated_at = ${now} WHERE provider_id = 'credential' AND user_id = ${userId} RETURNING id;`,
    `DELETE FROM session WHERE user_id = ${userId};`,
  ].join("\n");
}

/**
 * How many account rows the UPDATE changed, from `wrangler d1 execute --json`
 * output: the rows its `RETURNING id` gave back (local runs don't report
 * `meta.changes`).
 */
export function changedAccounts(jsonText) {
  const start = jsonText.indexOf("[");
  if (start === -1) throw new Error("No JSON in wrangler's output");
  const results = JSON.parse(jsonText.slice(start));
  const rows = Array.isArray(results) ? results[0]?.results : undefined;
  if (!Array.isArray(rows)) throw new Error("Unexpected wrangler output");
  return rows.length;
}
