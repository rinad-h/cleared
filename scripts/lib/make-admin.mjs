// Pure helpers for scripts/make-admin.ts (tested by tests/scripts/make-admin.test.mjs).

import { sqlString } from "./set-password.mjs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse `<email> [--local [--persist-to <dir>]]`. Returns `{ email, local, persistTo }`
 * or `{ error }`. `--persist-to` picks another local D1 state directory.
 */
export function parseArgs(argv) {
  let persistTo = null;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--persist-to") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) return { error: "--persist-to needs a directory" };
      persistTo = value;
      i++;
    } else rest.push(argv[i]);
  }
  const local = rest.includes("--local");
  const positional = rest.filter((a) => a !== "--local");
  const unknown = positional.filter((a) => a.startsWith("--"));
  if (unknown.length > 0) return { error: `Unknown option ${unknown[0]}` };
  if (persistTo && !local) return { error: "--persist-to is for the local database only (add --local)" };
  if (positional.length !== 1) return { error: "Expected one <email>" };
  const email = positional[0].trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return { error: "That isn't a valid email address" };
  return { email, local, persistTo };
}

/**
 * Make the member who signs in with `email` an active admin (the admin
 * lock-out fix). Reactivating a suspended member records the change like the
 * Members page does, with no actor (it was done from the command line).
 * Better Auth stores emails lowercased. `RETURNING id` gives the count
 * (local runs don't report `meta.changes`); data_version is bumped so open
 * pages refresh.
 */
export function buildSql({ email, now }) {
  if (!Number.isSafeInteger(now)) throw new Error("Bad timestamp");
  const userId = `(SELECT id FROM "user" WHERE email = ${sqlString(email)})`;
  return [
    `UPDATE members SET role = 'admin', status = 'active', ` +
      `status_changed_at = CASE WHEN status <> 'active' THEN ${now} ELSE status_changed_at END, ` +
      `status_changed_by_member_id = CASE WHEN status <> 'active' THEN NULL ELSE status_changed_by_member_id END, ` +
      `suspension_reason = NULL, updated_at = ${now} ` +
      `WHERE auth_user_id = ${userId} RETURNING id;`,
    `UPDATE settings SET data_version = data_version + 1 WHERE id = 'singleton';`,
  ].join("\n");
}
