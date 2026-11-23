import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

/** The Drizzle client plus the raw D1 binding (`$client`, used by `batch()` in src/server/batch.ts). */
export type Db = DrizzleD1Database<typeof schema> & { $client: D1Database };

/** Drizzle client bound to this request's D1 binding. Cheap: create it per request. */
export function getDb(): Db {
  return drizzle(getCloudflareContext().env.DB, { schema });
}
