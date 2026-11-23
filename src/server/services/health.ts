import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "@/db";

/** Deploy smoke test: proves the Worker can reach D1. Reads no table rows. */
export async function checkDatabase(db: Db): Promise<{ database: "ok" }> {
  const row = await db.get<{ ok: number }>(sql`SELECT 1 AS ok`);
  if (row?.ok !== 1) throw new Error("Unexpected health query result");
  return { database: "ok" };
}
