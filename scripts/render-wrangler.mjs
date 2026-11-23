#!/usr/bin/env node
// Renders wrangler.deploy.jsonc (git-ignored) from the committed wrangler.jsonc,
// which keeps placeholders only, plus YOUR deployment values from:
//
//   - cleared.config.json (git-ignored; copy cleared.config.example.json), or
//   - environment variables WORKERS_SUBDOMAIN, D1_PRODUCTION_ID, D1_STAGING_ID,
//     which win over the file (handy for a one-off deploy from another machine).
//
// Every remote command (deploys, remote migrations, `npm run remote -- …`)
// runs with `--config wrangler.deploy.jsonc`.
//
//   node scripts/render-wrangler.mjs                    write wrangler.deploy.jsonc
//   node scripts/render-wrangler.mjs --url staging      only print that environment's base URL
//   node scripts/render-wrangler.mjs --url=production

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonc } from "./lib/jsonc.mjs";

const root = process.cwd();
const TEMPLATE = join(root, "wrangler.jsonc");
const OUTPUT = join(root, "wrangler.deploy.jsonc");
const CONFIG = join(root, "cleared.config.json");

const PLACEHOLDERS = {
  subdomain: "<your-subdomain>",
  production: "<prod-database-id>",
  staging: "<staging-database-id>",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message) {
  console.error(`render-wrangler: ${message}`);
  process.exit(1);
}

function readConfigFile() {
  if (!existsSync(CONFIG)) return {};
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(CONFIG, "utf8"));
  } catch (err) {
    fail(`cleared.config.json is not valid JSON (${err.message})`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail("cleared.config.json must be an object like cleared.config.example.json");
  }
  if (parsed.d1 !== undefined && (!parsed.d1 || typeof parsed.d1 !== "object")) {
    fail('cleared.config.json: "d1" must be an object with "production" and "staging"');
  }
  return parsed;
}

function loadValues() {
  const file = readConfigFile();
  const values = {
    subdomain: process.env.WORKERS_SUBDOMAIN || file.workersSubdomain,
    production: process.env.D1_PRODUCTION_ID || file.d1?.production,
    staging: process.env.D1_STAGING_ID || file.d1?.staging,
  };

  const missing = Object.entries(values)
    .filter(([key, value]) => typeof value !== "string" || value === "" || value === PLACEHOLDERS[key])
    .map(([key]) => key);
  if (missing.length > 0) {
    fail(
      `missing deployment values: ${missing.join(", ")}.\n` +
        "  cp cleared.config.example.json cleared.config.json and fill it in\n" +
        "  (or set WORKERS_SUBDOMAIN, D1_PRODUCTION_ID, D1_STAGING_ID in the environment).\n" +
        "  See docs/setup-and-deploy.md §7.",
    );
  }

  // A workers.dev account subdomain is a single DNS label.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(values.subdomain)) {
    fail(`workersSubdomain "${values.subdomain}" should be just the label, e.g. "my-makerspace" (no dots, no https://)`);
  }
  for (const env of ["production", "staging"]) {
    if (!UUID.test(values[env])) fail(`d1.${env} "${values[env]}" doesn't look like a D1 database id (a UUID)`);
  }
  if (values.production.toLowerCase() === values.staging.toLowerCase()) {
    fail("d1.production and d1.staging must be different databases");
  }
  return values;
}

function parseUrlArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--url") return argv[i + 1] ?? "";
    if (argv[i].startsWith("--url=")) return argv[i].slice("--url=".length);
  }
  return null;
}

const template = readFileSync(TEMPLATE, "utf8");
for (const placeholder of Object.values(PLACEHOLDERS)) {
  if (!template.includes(placeholder)) {
    fail(`wrangler.jsonc no longer contains ${placeholder}. Keep the committed file generic (placeholders only).`);
  }
}

const values = loadValues();
const renderedBody = template
  .replaceAll(PLACEHOLDERS.subdomain, values.subdomain)
  .replaceAll(PLACEHOLDERS.production, values.production)
  .replaceAll(PLACEHOLDERS.staging, values.staging);

let parsed;
try {
  parsed = parseJsonc(renderedBody);
} catch (err) {
  fail(`wrangler.jsonc could not be parsed (${err.message})`);
}

// The production id must land in the top-level database and the staging id in
// env.staging; a template edit that swaps them would point staging at production.
const prodDb = parsed.d1_databases?.[0]?.database_id;
const stagingDb = parsed.env?.staging?.d1_databases?.[0]?.database_id;
if (prodDb !== values.production || stagingDb !== values.staging) {
  fail(
    "wrangler.jsonc must use <prod-database-id> in the top-level d1_databases and " +
      "<staging-database-id> in env.staging.d1_databases",
  );
}

const urlTarget = parseUrlArg(process.argv.slice(2));
if (urlTarget !== null) {
  const vars = urlTarget === "production" ? parsed.vars : urlTarget === "staging" ? parsed.env?.staging?.vars : null;
  if (!vars?.PUBLIC_BASE_URL) fail('--url needs "production" or "staging"');
  console.log(vars.PUBLIC_BASE_URL);
} else {
  writeFileSync(
    OUTPUT,
    "// GENERATED by scripts/render-wrangler.mjs from wrangler.jsonc + your deployment values.\n" +
      "// Git-ignored. Don't edit or commit: change wrangler.jsonc or cleared.config.json instead.\n" +
      renderedBody,
  );
  console.error("render-wrangler: wrote wrangler.deploy.jsonc");
}
