import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { UUID_A, UUID_B, sandbox } from "./helpers.mjs";

let box;
beforeEach(() => {
  box = sandbox();
  box.write(".open-next/assets/app.js", "console.log('hello')");
  box.write(".open-next/server-functions/default/index.mjs", "export default {}");
  box.write(".open-next/cloudflare/next-env.mjs", "export const production = {};\nexport const development = {};\n");
});
afterEach(() => box.cleanup());

const check = (args = [], env = {}) => box.run("check-bundle.mjs", args, env);
const wrangler = () => readFileSync(join(box.dir, "wrangler.jsonc"), "utf8");

test("a clean repo and build pass", () => {
  const { code, out } = check();
  assert.equal(code, 0, out);
});

const cases = [
  ["a Brevo key in client assets", () => box.write(".open-next/assets/a.js", "k='xkeysib-abcdefghijklmnop'"), /Brevo API key/],
  ["a tracked .env.local", () => { box.write(".env.local", "X=1"); box.track(".env.local"); }, /\.env/],
  ["an untracked .env on disk", () => box.write(".env", "X=1"), /OpenNext embeds/],
  ["a tracked .dev.vars", () => { box.write(".dev.vars", "X=1"); box.track(".dev.vars"); }, /\.dev\.vars must not be committed/],
  ["a committable cleared.config.json", () => box.write("sub/cleared.config.json", "{}"), /deployment values/],
  ["a database dump outside drizzle/", () => box.write("backup-2026-01-01.sql", "INSERT ..."), /SQL files outside drizzle/],
  ["a real database id in wrangler.jsonc", () => box.write("wrangler.jsonc", wrangler().replace("<prod-database-id>", UUID_A)), /real id|placeholder <prod-database-id>/],
  ["a real subdomain in wrangler.jsonc", () => box.write("wrangler.jsonc", wrangler().replaceAll("<your-subdomain>", "acme")), /<your-subdomain>/],
  ["an account_id in wrangler.jsonc", () => box.write("wrangler.jsonc", wrangler().replace('"workers_dev": true,', '"workers_dev": true, "account_id": "abc",')), /account_id/],
  ["ENABLE_DEV_OUTBOX in wrangler.jsonc", () => box.write("wrangler.jsonc", wrangler().replace('"EMAIL_DAILY_CAP": "280"', '"EMAIL_DAILY_CAP": "280", "ENABLE_DEV_OUTBOX": "1"')), /ENABLE_DEV_OUTBOX/],
  ["the dev-only env override in the Worker", () => box.write(".open-next/server-functions/default/index.mjs", "throw new Error('cleared:dev-env-overrides must only run')"), /dev-only env override/],
  ["embedded .env values", () => box.write(".open-next/cloudflare/next-env.mjs", 'export const production = {"SECRET":"x"};'), /next-env\.mjs/],
  ["your subdomain in a committable file", () => {
    box.write("cleared.config.json", JSON.stringify({ workersSubdomain: "acme", d1: { production: UUID_A, staging: UUID_B } }));
    box.write("docs/notes.md", "see https://cleared.acme.workers.dev");
  }, /deployment values from cleared\.config\.json/],
];

for (const [name, plant, message] of cases) {
  test(`fails on ${name}`, () => {
    plant();
    const { code, out } = check();
    assert.equal(code, 1, out);
    assert.match(out, message);
  });
}

test("finds a bare secret value from .dev.vars anywhere in the build", () => {
  box.write(".dev.vars", "BETTER_AUTH_SECRET=Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5\nBREVO_API_KEY=unused-in-development\n");
  box.write(".open-next/server-functions/default/index.mjs", 'const s="Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5";');
  const { code, out } = check();
  assert.equal(code, 1);
  assert.match(out, /secret value/);
});

test("finds a secret passed in the environment (first deploys)", () => {
  box.write(".open-next/assets/a.js", 'const s="real-brevo-key-value-123";');
  const { code } = check([], { BREVO_API_KEY: "real-brevo-key-value-123" });
  assert.equal(code, 1);
});

test("--repo skips the build scan", () => {
  box.write(".open-next/assets/a.js", "k='xkeysib-abcdefghijklmnop'");
  assert.equal(check(["--repo"]).code, 0);
});
