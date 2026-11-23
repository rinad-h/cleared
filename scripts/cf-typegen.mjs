#!/usr/bin/env node
// `npm run cf-typegen`: regenerate cloudflare-env.d.ts from wrangler.jsonc.
// `node scripts/cf-typegen.mjs --check`: fail if cloudflare-env.d.ts is stale (used by `npm run check`).
//
// Wrangler types the self-referencing service binding from the built Worker
// (.open-next/worker.js) when it exists, so the output would differ between a
// machine that has built and one that hasn't. Generating from a temporary copy
// of the config without "main" makes the output the same everywhere.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const TEMP_CONFIG = ".wrangler.types.jsonc";
const OUTPUT = "cloudflare-env.d.ts";
const check = process.argv.includes("--check");
const target = check ? ".cloudflare-env.check.d.ts" : OUTPUT;

// Run Wrangler's JS entry with this Node binary: spawning `npx` needs a shell on
// Windows (npx.cmd), which execFileSync doesn't use.
const require = createRequire(import.meta.url);
const wranglerPkg = require.resolve("wrangler/package.json");
const wranglerBin = join(dirname(wranglerPkg), JSON.parse(readFileSync(wranglerPkg, "utf8")).bin.wrangler);

const config = readFileSync("wrangler.jsonc", "utf8");
const withoutMain = config.replace(/^\s*"main":\s*"[^"]*",\s*\r?\n/m, "");
if (withoutMain === config) {
  console.error('cf-typegen: couldn\'t find the "main" line in wrangler.jsonc');
  process.exit(1);
}

writeFileSync(TEMP_CONFIG, withoutMain);
try {
  execFileSync(
    process.execPath,
    [wranglerBin, "types", `--config=${TEMP_CONFIG}`, "--env-interface=CloudflareEnv", "--strict-vars=false", target],
    { stdio: check ? ["ignore", "ignore", "inherit"] : "inherit" },
  );
} finally {
  rmSync(TEMP_CONFIG, { force: true });
}

if (check) {
  // Normalise line endings, and drop the header lines up to the hash: they name
  // the output file, which differs between the check copy and the real file.
  const body = (file) =>
    existsSync(file)
      ? readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/^[^\n]*\n[^\n]*?\(hash: /, "")
      : null;
  const fresh = body(target);
  const current = body(OUTPUT);
  rmSync(target, { force: true });
  if (fresh === null) {
    console.error("cf-typegen: wrangler produced no output");
    process.exit(1);
  }
  if (fresh !== current) {
    console.error(`${OUTPUT} is stale: run \`npm run cf-typegen\` and commit the result.`);
    process.exit(1);
  }
  console.log(`${OUTPUT} is up to date.`);
}
