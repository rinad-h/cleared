import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { parseJsonc, stringValues } from "../../scripts/lib/jsonc.mjs";
import { UUID_A, UUID_B, UUID_C, sandbox } from "./helpers.mjs";

let box;
beforeEach(() => {
  box = sandbox();
});
afterEach(() => box.cleanup());

const config = (overrides = {}) =>
  JSON.stringify({ workersSubdomain: "acme", d1: { production: UUID_A, staging: UUID_B }, ...overrides });
const rendered = () => parseJsonc(readFileSync(join(box.dir, "wrangler.deploy.jsonc"), "utf8"));

test("puts the production id in the top-level database and the staging id under env.staging", () => {
  box.write("cleared.config.json", config());
  const { code } = box.run("render-wrangler.mjs");
  assert.equal(code, 0);
  const out = rendered();
  assert.equal(out.d1_databases[0].database_id, UUID_A);
  assert.equal(out.env.staging.d1_databases[0].database_id, UUID_B);
  assert.equal(out.vars.PUBLIC_BASE_URL, "https://cleared.acme.workers.dev");
  assert.equal(out.env.staging.vars.BETTER_AUTH_URL, "https://cleared-staging.acme.workers.dev");
  for (const [path, value] of stringValues(out)) assert.doesNotMatch(value, /<[a-z-]+>/, path);
});

test("--url prints the URL without writing the file; --url= works too", () => {
  box.write("cleared.config.json", config());
  const staging = box.run("render-wrangler.mjs", ["--url", "staging"]);
  assert.equal(staging.out.trim(), "https://cleared-staging.acme.workers.dev");
  const production = box.run("render-wrangler.mjs", ["--url=production"]);
  assert.equal(production.out.trim(), "https://cleared.acme.workers.dev");
  assert.throws(() => readFileSync(join(box.dir, "wrangler.deploy.jsonc")));
});

test("environment variables win over the file", () => {
  box.write("cleared.config.json", config());
  assert.equal(box.run("render-wrangler.mjs", [], { D1_STAGING_ID: UUID_C }).code, 0);
  assert.equal(rendered().env.staging.d1_databases[0].database_id, UUID_C);
});

test("works from environment variables alone", () => {
  const env = { WORKERS_SUBDOMAIN: "acme", D1_PRODUCTION_ID: UUID_A, D1_STAGING_ID: UUID_B };
  assert.equal(box.run("render-wrangler.mjs", [], env).code, 0);
});

for (const [name, file, message] of [
  ["missing config", null, /missing deployment values/],
  ["a full hostname as the subdomain", config({ workersSubdomain: "acme.workers.dev" }), /just the label/],
  ["a non-UUID database id", config({ d1: { production: "abc", staging: UUID_B } }), /doesn't look like a D1 database id/],
  ["the same database twice", config({ d1: { production: UUID_A, staging: UUID_A } }), /must be different/],
  ["invalid JSON", "{ nope", /not valid JSON/],
  ["null", "null", /must be an object/],
]) {
  test(`fails clearly on ${name}`, () => {
    if (file !== null) box.write("cleared.config.json", file);
    const { code, out } = box.run("render-wrangler.mjs");
    assert.equal(code, 1);
    assert.match(out, message);
  });
}

test("fails if the template swaps the production and staging placeholders", () => {
  box.write("cleared.config.json", config());
  const template = readFileSync(join(box.dir, "wrangler.jsonc"), "utf8")
    .replace("<prod-database-id>", "__P__")
    .replace("<staging-database-id>", "<prod-database-id>")
    .replace("__P__", "<staging-database-id>");
  box.write("wrangler.jsonc", template);
  const { code, out } = box.run("render-wrangler.mjs");
  assert.equal(code, 1);
  assert.match(out, /top-level d1_databases/);
});

test("fails instead of hanging on an unterminated comment", () => {
  box.write("cleared.config.json", config());
  box.write("wrangler.jsonc", readFileSync(join(box.dir, "wrangler.jsonc"), "utf8") + "\n/* oops");
  const { code, out } = box.run("render-wrangler.mjs");
  assert.equal(code, 1);
  assert.match(out, /unterminated/);
});
