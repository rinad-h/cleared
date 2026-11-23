import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "@/db/schema";
import type { Db } from "@/db";

/** Drizzle client on this test file's isolated local D1 (migrations already applied). */
export function testDb(): Db {
  return drizzle(env.DB, { schema });
}
