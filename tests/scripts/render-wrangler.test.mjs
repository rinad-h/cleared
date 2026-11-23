import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { parseJsonc, stringValues } from "../../scripts/lib/jsonc.mjs";
import { UUID_A, UUID_B, sandbox } from "./helpers.mjs";

let box;
beforeEach(() => {
  box = sandbox();
});
afterEach(() => box.cleanup());

const config = (overrides = {}) => JSON.stringify({ workersSubdomain: "acme", d1DatabaseId: UUID_A, ...overrides });
const rendered = () => parseJsonc(readFileSync(join(box.dir, "wrangler.deploy.jsonc"), "utf8"));

test("fills in the database id and the URLs", () => {
  box.write("cleared.config.json", config());
  const { code } = box.run("render-wrangler.mjs");
  assert.equal(code, 0);
  const out = rendered();
  assert.equal(out.d1_databases[0].database_id, UUID_A);
  assert.equal(out.vars.PUBLIC_BASE_URL, "https://cleared.acme.workers.dev");
  assert.equal(out.vars.BETTER_AUTH_URL, "https://cleared.acme.workers.dev");
  assert.equal(out.env, undefined);
  for (const [path, value] of stringValues(out)) assert.doesNotMatch(value, /<[a-z-]+>/, path);
});

test("--url prints the URL without writing the file", () => {
  box.write("cleared.config.json", config());
  const { code, out } = box.run("render-wrangler.mjs", ["--url"]);
  assert.equal(code, 0);
  assert.equal(out.trim(), "https://cleared.acme.workers.dev");
  assert.throws(() => readFileSync(join(box.dir, "wrangler.deploy.jsonc")));
});

test("environment variables win over the file", () => {
  box.write("cleared.config.json", config());
  assert.equal(box.run("render-wrangler.mjs", [], { D1_DATABASE_ID: UUID_B }).code, 0);
  assert.equal(rendered().d1_databases[0].database_id, UUID_B);
});

test("works from environment variables alone", () => {
  const env = { WORKERS_SUBDOMAIN: "acme", D1_DATABASE_ID: UUID_A };
  assert.equal(box.run("render-wrangler.mjs", [], env).code, 0);
});

for (const [name, file, message] of [
  ["missing config", null, /missing deployment values: workersSubdomain, d1DatabaseId/],
  ["a missing database id", JSON.stringify({ workersSubdomain: "acme" }), /missing deployment values: d1DatabaseId/],
  ["a full hostname as the subdomain", config({ workersSubdomain: "acme.workers.dev" }), /just the label/],
  ["a non-UUID database id", config({ d1DatabaseId: "abc" }), /doesn't look like a D1 database id/],
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

test("fails if the template brings back an environment", () => {
  box.write("cleared.config.json", config());
  const template = readFileSync(join(box.dir, "wrangler.jsonc"), "utf8").replace(
    '"workers_dev": true,',
    '"workers_dev": true, "env": { "staging": { "name": "cleared-staging" } },',
  );
  box.write("wrangler.jsonc", template);
  const { code, out } = box.run("render-wrangler.mjs");
  assert.equal(code, 1);
  assert.match(out, /single deployment/);
});

test("fails if the template loses a placeholder", () => {
  box.write("cleared.config.json", config());
  box.write("wrangler.jsonc", readFileSync(join(box.dir, "wrangler.jsonc"), "utf8").replace("<database-id>", UUID_B));
  const { code, out } = box.run("render-wrangler.mjs");
  assert.equal(code, 1);
  assert.match(out, /no longer contains <database-id>/);
});

test("fails instead of hanging on an unterminated comment", () => {
  box.write("cleared.config.json", config());
  box.write("wrangler.jsonc", readFileSync(join(box.dir, "wrangler.jsonc"), "utf8") + "\n/* oops");
  const { code, out } = box.run("render-wrangler.mjs");
  assert.equal(code, 1);
  assert.match(out, /unterminated/);
});
