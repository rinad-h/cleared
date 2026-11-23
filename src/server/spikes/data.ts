import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "@/db";

/** TEMPORARY spike S2: five small sequential D1 queries, like the pass page will make. */
export async function loadPassLikeData(db: Db) {
  const results: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const row = await db.get<{ n: number }>(sql`SELECT ${i} AS n`);
    results.push(row?.n ?? 0);
  }
  return results;
}
