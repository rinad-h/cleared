import "server-only";
import { is, SQL } from "drizzle-orm";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import type { Db } from "@/db";

const dialect = new SQLiteAsyncDialect();

/** A raw `sql` template, or a Drizzle query builder (insert/update/delete/select). */
export type Batchable = SQL | { toSQL(): { sql: string; params: unknown[] } };

/**
 * One atomic D1 batch (AGENTS.md rule 8) that can mix raw `sql` statements and
 * query builders. Returns D1's results in order (`meta.changes` tells a guarded
 * statement's outcome).
 *
 * Why not `db.batch()`: in drizzle-orm 0.45, a raw ``db.run(sql`…`)`` with bound
 * parameters crashes inside `db.batch()` (it calls `.stmt.bind` on a query that
 * has no prepared statement). Guarded INSERT … SELECT and UPDATE statements
 * need raw SQL, so mutation batches go through here.
 */
export async function batch(db: Db, items: readonly Batchable[]): Promise<D1Result[]> {
  const statements = items.map((item) => {
    const query = is(item, SQL) ? dialect.sqlToQuery(item) : item.toSQL();
    return db.$client.prepare(query.sql).bind(...query.params);
  });
  return db.$client.batch(statements);
}
