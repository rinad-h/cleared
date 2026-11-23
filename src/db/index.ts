import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Db = DrizzleD1Database<typeof schema>;

/** Drizzle client bound to this request's D1 binding. Cheap: create it per request. */
export function getDb(): Db {
  return drizzle(getCloudflareContext().env.DB, { schema });
}
