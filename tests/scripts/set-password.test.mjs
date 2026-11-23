import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSql, changedAccounts, parseArgs, sqlString } from "../../scripts/lib/set-password.mjs";

test("parses <email> <password> [--local], lowercasing the email", () => {
  assert.deepEqual(parseArgs(["Ada@Example.Test", "temp-pass-1"]), {
    email: "ada@example.test",
    password: "temp-pass-1",
    local: false,
  });
  assert.equal(parseArgs(["a@b.test", "temp-pass-1", "--local"]).local, true);
});

test("rejects bad arguments", () => {
  assert.ok(parseArgs([]).error);
  assert.ok(parseArgs(["a@b.test"]).error);
  assert.ok(parseArgs(["not-an-email", "temp-pass-1"]).error);
  assert.ok(parseArgs(["a@b.test", "short"]).error);
  assert.ok(parseArgs(["a@b.test", "x".repeat(129)]).error);
  assert.ok(parseArgs(["a@b.test", "temp-pass-1", "--remote"]).error);
});

test("quotes SQL strings safely", () => {
  assert.equal(sqlString("o'brien@x.test"), "'o''brien@x.test'");
  assert.throws(() => sqlString("a\u0000b"));
});

test("builds the UPDATE (credential account only) and signs the user out", () => {
  const sql = buildSql({ email: "o'brien@x.test", hash: "ab12:cd34", now: 1700000000000 });
  assert.match(sql, /^UPDATE account SET password = 'ab12:cd34', updated_at = 1700000000000 WHERE provider_id = 'credential'/);
  assert.match(sql, /RETURNING id;/);
  assert.match(sql, /email = 'o''brien@x\.test'/);
  assert.match(sql, /DELETE FROM session WHERE user_id = /);
  assert.throws(() => buildSql({ email: "a@b.test", hash: "x'; DROP TABLE user;--", now: 1 }));
});

test("reads the changed row count from wrangler's JSON", () => {
  const out = 'some banner\n[{"results":[{"id":"acc1"}],"success":true,"meta":{}},{"results":[],"meta":{}}]';
  assert.equal(changedAccounts(out), 1);
  assert.equal(changedAccounts('[{"results":[],"meta":{"duration":0}}]'), 0);
  assert.throws(() => changedAccounts("no json"));
  assert.throws(() => changedAccounts('[{"meta":{}}]'));
});
