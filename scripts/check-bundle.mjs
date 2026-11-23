#!/usr/bin/env node
// Repo and bundle guards (docs/phases/phase-0-foundation.md §3.8). Run by
// `npm run check` (by hand, before deploying) and by every deploy script after
// its build. Exits non-zero on any failure.
//
//   node scripts/check-bundle.mjs           repo checks + scan of the OpenNext build output
//   node scripts/check-bundle.mjs --repo    repo checks only (no build needed)
//
// P0-70  No secrets in the build output (client assets and the Worker).
// P0-71  No .env* files tracked or present (OpenNext embeds .env* from disk into the Worker).
// P0-72  ENABLE_SPIKES never in wrangler.jsonc; the dev-only env override never in the Worker.
// P0-73  The repo stays generic: placeholders only in committed config, no personal
//        values or database dumps committed.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseJsonc, stringValues } from "./lib/jsonc.mjs";

const root = process.cwd();
const repoOnly = process.argv.includes("--repo");
const failures = [];
const fail = (message) => failures.push(message);

/** Marker string that only exists inside the dev-only branch of src/lib/env.ts. */
const DEV_OVERRIDE_MARKER = "cleared:dev-env-overrides";
const PLACEHOLDER = /^<[a-z-]+>$/;
const UUID_OR_HEX32 = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b[0-9a-f]{32}\b/i;

// ---------------------------------------------------------------- repo checks

const gitFiles = (args) =>
  execFileSync("git", ["ls-files", "-z", ...args], { encoding: "utf8" }).split("\0").filter(Boolean);
const tracked = gitFiles([]);
// Files that `git add -A` would pick up: tracked plus untracked-but-not-ignored.
const committable = [...new Set([...tracked, ...gitFiles(["--others", "--exclude-standard"])])];

for (const file of committable) {
  const base = file.split("/").pop();
  if (/^\.env(\..+)?$/.test(base) && !base.endsWith(".example")) {
    fail(`${file}: .env files must not be committed (use .dev.vars locally, Worker secrets in Cloudflare)`);
  }
  if (/^\.dev\.vars(\..+)?$/.test(base) && base !== ".dev.vars.example") {
    fail(`${file}: .dev.vars must not be committed`);
  }
  if (/^(cleared\.config\.json|wrangler\.deploy\..+)$/.test(base)) {
    fail(`${file}: holds your deployment values and must not be committed`);
  }
  // drizzle/ holds migrations; scripts/sql/ holds the runbook's maintenance SQL (Phase 7).
  if (base.endsWith(".sql") && !file.startsWith("drizzle/") && !/^scripts\/sql\/[^/]+\.sql$/.test(file)) {
    fail(`${file}: SQL files outside drizzle/ and scripts/sql/ (e.g. database backups with personal data) must not be committed`);
  }
}

// P0-71: OpenNext copies .env, .env.local, .env.production… from disk into the
// Worker (.open-next/cloudflare/next-env.mjs), tracked or not.
for (const name of readdirSync(root)) {
  if (/^\.env(\..+)?$/.test(name) && !name.endsWith(".example")) {
    fail(`${name}: remove it. OpenNext embeds .env* files into the deployed Worker; use .dev.vars instead`);
  }
}

let wranglerConfig;
const wranglerText = readFileSync(join(root, "wrangler.jsonc"), "utf8");
try {
  wranglerConfig = parseJsonc(wranglerText);
} catch (err) {
  fail(`wrangler.jsonc: can't be parsed (${err.message})`);
}

if (wranglerConfig) {
  for (const placeholder of ["<your-subdomain>", "<database-id>"]) {
    if (![...stringValues(wranglerConfig)].some(([, v]) => v.includes(placeholder))) {
      fail(`wrangler.jsonc: placeholder ${placeholder} is missing; put your values in cleared.config.json instead`);
    }
  }
  for (const [path, value] of stringValues(wranglerConfig)) {
    if (value.includes(".workers.dev") && !value.includes("<your-subdomain>")) {
      fail(`wrangler.jsonc: ${path} = "${value}" must use the <your-subdomain> placeholder`);
    }
    if (UUID_OR_HEX32.test(value)) fail(`wrangler.jsonc: ${path} looks like a real id; keep placeholders only`);
  }
  const keys = JSON.stringify(wranglerConfig);
  if (/"account_id"\s*:/.test(keys)) {
    fail("wrangler.jsonc: account_id must not be committed; export CLOUDFLARE_ACCOUNT_ID in your shell instead");
  }
  // P0-72: spike routes are only switched on by a temporary Worker secret, never by committed config.
  if (keys.includes("ENABLE_SPIKES")) {
    fail("wrangler.jsonc: ENABLE_SPIKES must only be a temporary Worker secret (npm run remote -- secret put ENABLE_SPIKES)");
  }
}

const example = JSON.parse(readFileSync(join(root, "cleared.config.example.json"), "utf8"));
const exampleValues = [example.workersSubdomain, example.d1DatabaseId];
if (!exampleValues.every((v) => typeof v === "string" && PLACEHOLDER.test(v))) {
  fail("cleared.config.example.json: must keep placeholder values only; your values go in cleared.config.json");
}

// If you have personal values on this machine, make sure none of them appear in
// a file that `git add -A` would commit.
const personal = [];
if (existsSync(join(root, "cleared.config.json"))) {
  try {
    const own = JSON.parse(readFileSync(join(root, "cleared.config.json"), "utf8"));
    if (typeof own.workersSubdomain === "string" && !PLACEHOLDER.test(own.workersSubdomain)) {
      personal.push(`.${own.workersSubdomain}.workers.dev`);
    }
    if (typeof own.d1DatabaseId === "string" && UUID_OR_HEX32.test(own.d1DatabaseId)) personal.push(own.d1DatabaseId);
  } catch {
    // render-wrangler.mjs reports a malformed file when it's used.
  }
}
for (const value of personal) {
  let hits = "";
  try {
    hits = execFileSync("git", ["grep", "--untracked", "-l", "-F", "-e", value], { encoding: "utf8" }).trim();
  } catch {
    // git grep exits 1 when nothing matches.
  }
  for (const file of hits.split("\n").filter(Boolean)) {
    fail(`${file}: contains one of your deployment values from cleared.config.json; keep the repo generic`);
  }
}

// -------------------------------------------------------------- build checks

const SECRET_PATTERNS = [
  [/BETTER_AUTH_SECRET\s*[=:]\s*["']?[A-Za-z0-9+/=]{16,}/, "BETTER_AUTH_SECRET value"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "GitHub token"],
  [/CLOUDFLARE_API_TOKEN\s*[=:]\s*["']?[A-Za-z0-9_-]{30,}/, "Cloudflare API token"],
];
const TEXT_EXT = /\.(js|mjs|cjs|css|html|json|txt|map|svg|xml|webmanifest)$/i;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (TEXT_EXT.test(name)) yield path;
  }
}

/**
 * Real secret values known on this machine: secrets in .dev.vars, plus any the
 * deploy script passes in the environment. A bare value (no variable name next
 * to it) is how an inlined secret actually looks in a bundle.
 */
function knownSecretValues() {
  const values = new Set();
  const isSecretKey = (key) => /SECRET|KEY|TOKEN|PASSWORD/.test(key);
  const isPlaceholder = (v) => /replace-me|^unused|\.invalid$|^test$/.test(v);
  if (existsSync(join(root, ".dev.vars"))) {
    for (const line of readFileSync(join(root, ".dev.vars"), "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#\s]+)"?/);
      if (match && isSecretKey(match[1]) && match[2].length >= 12 && !isPlaceholder(match[2])) values.add(match[2]);
    }
  }
  for (const key of ["BETTER_AUTH_SECRET", "CLOUDFLARE_API_TOKEN"]) {
    const value = process.env[key];
    if (value && value.length >= 12 && !isPlaceholder(value)) values.add(value);
  }
  return [...values];
}

if (!repoOnly) {
  const out = join(root, ".open-next");
  const assets = join(out, "assets");
  if (!existsSync(assets)) {
    fail(".open-next/assets not found: run `npm run build:worker` first (or pass --repo)");
  } else {
    const secrets = knownSecretValues();
    let scanned = 0;
    for (const file of walk(out)) {
      scanned++;
      const rel = relative(root, file);
      const isClient = file.startsWith(assets);
      const content = readFileSync(file, "utf8");
      for (const secret of secrets) {
        if (content.includes(secret)) fail(`${rel}: contains a secret value from .dev.vars or your environment`);
      }
      if (isClient) {
        for (const [pattern, label] of SECRET_PATTERNS) {
          if (pattern.test(content)) fail(`${rel}: looks like a ${label}`);
        }
      }
      if (content.includes(DEV_OVERRIDE_MARKER)) {
        fail(`${rel}: the dev-only env override (src/lib/env.ts) reached the build; it must be removed as dead code`);
      }
    }

    const nextEnv = join(out, "cloudflare", "next-env.mjs");
    if (existsSync(nextEnv)) {
      const lines = readFileSync(nextEnv, "utf8").split("\n").filter((l) => l.trim() !== "");
      if (!lines.every((l) => /^export const \w+ = \{\};$/.test(l.trim()))) {
        fail(".open-next/cloudflare/next-env.mjs: .env* values were embedded into the Worker; remove the .env* files");
      }
    }
    console.log(`Scanned ${scanned} build output files.`);
  }
}

if (failures.length > 0) {
  console.error("Bundle/repo checks FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("Bundle/repo checks passed.");
