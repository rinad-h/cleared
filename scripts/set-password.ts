/**
 * Admin password reset (technologies.md §6.6). Cleared sends no email, so a
 * forgotten password is reset here, on a laptop, after staff have confirmed in
 * person who the member is:
 *
 *   npx tsx scripts/set-password.ts <email> <temp-password>           the deployment
 *   npx tsx scripts/set-password.ts <email> <temp-password> --local   your local D1
 *
 * It hashes the password locally with Better Auth's `hashPassword` (no Worker
 * CPU), sets it on the member's email+password account and signs them out
 * everywhere. Tell the member the temporary password; they sign in and change
 * it on their Account page.
 *
 * Remote runs render wrangler.deploy.jsonc from cleared.config.json first (the
 * committed wrangler.jsonc only has placeholders). Nothing is logged except the
 * outcome: the email and password are never printed.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { hashPassword } from "better-auth/crypto";
import { buildSql, changedAccounts, parseArgs } from "./lib/set-password.mjs";

const require = createRequire(import.meta.url);

// Wrangler's JS entry, run with this Node binary (no npx.cmd on Windows), as in cf-typegen.mjs.
function wranglerBin(): string {
  const pkg = require.resolve("wrangler/package.json");
  return join(dirname(pkg), JSON.parse(readFileSync(pkg, "utf8")).bin.wrangler);
}

function wrangler(args: string[]): { status: number; stdout: string } {
  const bin = wranglerBin();
  const result = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if ("error" in args) {
    console.error(`set-password: ${args.error}`);
    console.error("Usage: npx tsx scripts/set-password.ts <email> <temp-password> [--local]");
    process.exit(2);
  }

  if (!args.local) {
    const render = spawnSync(process.execPath, ["scripts/render-wrangler.mjs"], { stdio: "inherit" });
    if (render.status !== 0) process.exit(render.status ?? 1);
  }

  const hash = await hashPassword(args.password);
  const sql = buildSql({ email: args.email, hash, now: Date.now() });
  const target = args.local ? ["--local"] : ["--remote", "--config", "wrangler.deploy.jsonc"];
  const result = wrangler(["d1", "execute", "DB", ...target, "--json", "--command", sql]);
  if (result.status !== 0) {
    console.error("set-password: wrangler d1 execute failed (see above). Nothing was changed.");
    process.exit(1);
  }

  const changed = changedAccounts(result.stdout);
  if (changed === 0) {
    console.error("set-password: no email + password account has that email. Check the spelling with the member.");
    process.exit(1);
  }
  console.log(
    `Password reset ${args.local ? "in the local database" : "on the deployment"}; the member was signed out everywhere.\n` +
      "Give them the temporary password in person and ask them to change it on their Account page.",
  );
}

main().catch((err: unknown) => {
  // The message can't contain the password (it never reaches an Error), so show it.
  console.error("set-password: failed:", err instanceof Error ? `${err.name}: ${err.message}` : "error");
  process.exit(1);
});
