-- Cleared: once-a-term retention purge (Phase 7 P7-55, P7-61; docs/runbook.md "Retention purge").
-- Run by an admin, never by the app (no background jobs):
--   npm run remote -- d1 execute cleared --remote --file scripts/sql/retention-purge.sql
-- Take a backup first (runbook "Back up"). Times are UTC milliseconds.
--
-- Kept for the life of the makerspace (audit value): members, grants, faults,
-- service records, checkups, machines. Removed here:
--   1. machine sessions that ended more than 2 years ago;
--   2. expired sign-in sessions and verification rows, and stale limiter rows;
--   3. accounts that signed up more than 7 days ago but never joined
--      (e.g. a mistyped or someone else's email address).

DELETE FROM machine_sessions
WHERE ended_at IS NOT NULL
  AND ended_at < (unixepoch('now') - 2 * 365 * 86400) * 1000;

DELETE FROM session WHERE expires_at < unixepoch('now') * 1000;
DELETE FROM verification WHERE expires_at < unixepoch('now') * 1000;
DELETE FROM rate_limit WHERE last_request < (unixepoch('now') - 86400) * 1000;

DELETE FROM session WHERE user_id IN (
  SELECT id FROM "user"
  WHERE created_at < (unixepoch('now') - 7 * 86400) * 1000
    AND id NOT IN (SELECT auth_user_id FROM members)
);
DELETE FROM account WHERE user_id IN (
  SELECT id FROM "user"
  WHERE created_at < (unixepoch('now') - 7 * 86400) * 1000
    AND id NOT IN (SELECT auth_user_id FROM members)
);
DELETE FROM "user"
WHERE created_at < (unixepoch('now') - 7 * 86400) * 1000
  AND id NOT IN (SELECT auth_user_id FROM members);
