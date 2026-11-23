import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSql, parseArgs } from "../../scripts/lib/make-admin.mjs";

test("parses <email> [--local [--persist-to <dir>]], lowercasing the email", () => {
  assert.deepEqual(parseArgs(["Ada@Example.Test"]), { email: "ada@example.test", local: false, persistTo: null });
  assert.deepEqual(parseArgs(["a@b.test", "--local"]), { email: "a@b.test", local: true, persistTo: null });
  assert.deepEqual(parseArgs(["--local", "--persist-to", "/tmp/x", "a@b.test"]), { email: "a@b.test", local: true, persistTo: "/tmp/x" });
});

test("rejects bad arguments", () => {
  assert.ok(parseArgs([]).error);
  assert.ok(parseArgs(["a@b.test", "c@d.test"]).error);
  assert.ok(parseArgs(["not-an-email"]).error);
  assert.ok(parseArgs(["a@b.test", "--remote"]).error);
  assert.ok(parseArgs(["a@b.test", "--persist-to", "/tmp/x"]).error, "--persist-to needs --local");
  assert.ok(parseArgs(["a@b.test", "--local", "--persist-to"]).error);
});

test("builds the UPDATE (role + status, RETURNING) and bumps data_version", () => {
  const sql = buildSql({ email: "o'brien@x.test", now: 1700000000000 });
  assert.match(sql, /^UPDATE members SET role = 'admin', status = 'active'/);
  assert.match(sql, /suspension_reason = NULL, updated_at = 1700000000000/);
  assert.match(sql, /WHERE auth_user_id = \(SELECT id FROM "user" WHERE email = 'o''brien@x\.test'\) RETURNING id;/);
  assert.match(sql, /UPDATE settings SET data_version = data_version \+ 1/);
  assert.throws(() => buildSql({ email: "a@b.test", now: Number.NaN }));
});

let sqlite = null;
try {
  sqlite = await import("node:sqlite");
} catch {
  // Node < 22.13 without --experimental-sqlite: skipped.
}

test("SQLite: reactivates a suspended member as admin; no match returns no rows", { skip: !sqlite }, () => {
  const db = new sqlite.DatabaseSync(":memory:");
  db.exec(`CREATE TABLE "user" (id TEXT PRIMARY KEY, email TEXT);
    CREATE TABLE settings (id TEXT PRIMARY KEY, data_version INTEGER);
    CREATE TABLE members (id TEXT PRIMARY KEY, auth_user_id TEXT, role TEXT, status TEXT, status_changed_at INTEGER,
      status_changed_by_member_id TEXT, suspension_reason TEXT, updated_at INTEGER);
    INSERT INTO "user" VALUES ('u1', 'staff@x.test'), ('u2', 'nomember@x.test');
    INSERT INTO settings VALUES ('singleton', 7);
    INSERT INTO members VALUES ('m1', 'u1', 'staff', 'suspended', 5, 'm9', 'left the lab open', 5);`);
  const [update, bump] = buildSql({ email: "staff@x.test", now: 100 }).split("\n");
  assert.deepEqual(db.prepare(update).all().map((r) => r.id), ["m1"]);
  db.exec(bump);
  assert.deepEqual(
    { ...db.prepare("SELECT role, status, status_changed_at, status_changed_by_member_id, suspension_reason FROM members").get() },
    { role: "admin", status: "active", status_changed_at: 100, status_changed_by_member_id: null, suspension_reason: null },
  );
  assert.equal(db.prepare("SELECT data_version FROM settings").get().data_version, 8);
  // Already active: the status change time stays.
  db.prepare(buildSql({ email: "staff@x.test", now: 200 }).split("\n")[0]).all();
  assert.equal(db.prepare("SELECT status_changed_at FROM members").get().status_changed_at, 100);
  assert.equal(db.prepare(buildSql({ email: "nomember@x.test", now: 1 }).split("\n")[0]).all().length, 0);
});
