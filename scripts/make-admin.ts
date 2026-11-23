/**
 * Admin lock-out fix (runbook "Admin lock-out", Phase 7 P7-77 / P7-86): makes
 * the member who signs in with <email> an active admin, so nobody hand-types
 * SQL against the live database.
 *
 *   npx tsx scripts/make-admin.ts <email>           the deployment
 *   npx tsx scripts/make-admin.ts <email> --local   your local D1
 *     (add --persist-to <dir> for another local D1 state directory)
 *
 * The person must already be a member (signed up and joined, or the Setup
 * admin). A suspended member is reactivated. Remote runs render
 * wrangler.deploy.jsonc from cleared.config.json first (the committed
 * wrangler.jsonc only has placeholders). The email is never printed.
 * Record the date and the reason in the runbook.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { buildSql, parseArgs } from "./lib/make-admin.mjs";
import { changedAccounts as returnedRows } from "./lib/set-password.mjs";

const require = createRequire(import.meta.url);

// Wrangler's JS entry, run with this Node binary (no npx.cmd on Windows), as in cf-typegen.mjs.
function wranglerBin(): string {
  const pkg = require.resolve("wrangler/package.json");
  return join(dirname(pkg), JSON.parse(readFileSync(pkg, "utf8")).bin.wrangler);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if ("error" in args) {
    console.error(`make-admin: ${args.error}`);
    console.error("Usage: npx tsx scripts/make-admin.ts <email> [--local [--persist-to <dir>]]");
    process.exit(2);
  }

  if (!args.local) {
    const render = spawnSync(process.execPath, ["scripts/render-wrangler.mjs"], { stdio: "inherit" });
    if (render.status !== 0) process.exit(render.status ?? 1);
  }

  const sql = buildSql({ email: args.email, now: Date.now() });
  const target = args.local
    ? ["--local", ...(args.persistTo ? ["--persist-to", args.persistTo] : [])]
    : ["--remote", "--config", "wrangler.deploy.jsonc"];
  const result = spawnSync(process.execPath, [wranglerBin(), "d1", "execute", "DB", ...target, "--json", "--command", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if ((result.status ?? 1) !== 0) {
    console.error("make-admin: wrangler d1 execute failed (see above). Nothing was changed.");
    process.exit(1);
  }

  if (returnedRows(result.stdout ?? "") === 0) {
    console.error(
      "make-admin: no member signs in with that email. Check the spelling; the person must have signed up " +
        "and joined the makerspace first.",
    );
    process.exit(1);
  }
  console.log(
    `The member is now an active admin ${args.local ? "in the local database" : "on the deployment"}. ` +
      "They may need to reload the page. Record the date and reason in the runbook.",
  );
}

try {
  main();
} catch (err: unknown) {
  console.error("make-admin: failed:", err instanceof Error ? `${err.name}: ${err.message}` : "error");
  process.exit(1);
}
