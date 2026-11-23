import "server-only";

/**
 * Machine write-token compare-and-swap helper (technologies.md §12.2):
 * read the machine's `write_token`, decide, then write one `db.batch()` whose
 * first statement swaps the token and whose later statements are guarded by it.
 * Retries up to 3 times, then throws `CONFLICT_RETRY`.
 *
 * Phase 0 stub. Implemented in Phase 2 (machines table) and used from Phase 4.
 */
export {};
