import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { checkDatabase } from "@/server/services/health";
import { testDb } from "../helpers/db";

describe("health service", () => {
  it("answers SELECT 1 from the local D1", async () => {
    await expect(checkDatabase(testDb())).resolves.toEqual({ database: "ok" });
  });

  it("runs against a database with the baseline migration applied", async () => {
    const tables = await testDb().all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'`,
    );
    expect(tables).toEqual([{ name: "app_meta" }]);
  });
});
