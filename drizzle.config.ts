import { defineConfig } from "drizzle-kit";

// drizzle-kit only generates SQL here; Wrangler applies it (`npm run db:migrate`).
// Review every generated file against drizzle/README.md before applying it.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
