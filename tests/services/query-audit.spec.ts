// Phase 7 P7-40 (index audit) and P7-42 (rows read/written per operation).
//
// Every hot service runs on a recording D1 wrapper with demo-sized data at 10
// and 60 machines. Each SQL statement it sends is re-run as EXPLAIN QUERY PLAN:
// a full SCAN of a table that grows with use (machine_sessions, grants, faults,
// service_records, Better Auth's session) fails the test. Small tables (rooms,
// machines, machine_requirements, certifications, checkups, settings) may be
// scanned. Rows read/written come from D1's `meta` (the same counters the free
// plan bills) and are printed as a table; record them in technologies.md §13.1.
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import type { MemberActor } from "@/server/domain/actor";
import { getStatusBoard } from "@/server/services/board";
import { listDueCheckups, createCheckup } from "@/server/services/checkups";
import { getConsole } from "@/server/services/console";
import { getFaultQueue, reportFault } from "@/server/services/faults";
import { getMemberCertifications, getMyCertifications, signOff } from "@/server/services/grants";
import { getMachineDetail } from "@/server/services/machine-detail";
import { getMember, searchMembers } from "@/server/services/members";
import { getMachineByToken } from "@/server/services/pass";
import { getServiceHistory, logServiceRecord } from "@/server/services/service-records";
import { endSession, getMemberSessions, startSession } from "@/server/services/sessions";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed, type SeededCert, type SeededMachine } from "../helpers/seed";
import { DAY, HOUR, MIN, T0 } from "../helpers/time";

/** Tables that grow with use (PRD P7-40): never scanned in full. */
const GROWING = ["machine_sessions", "grants", "faults", "service_records", "session"];

type Stmt = { sql: string; params: unknown[] };
type Op = { stmts: Stmt[]; rowsRead: number; rowsWritten: number; unmeasured: number };

const isRead = (sql: string) => /^\s*(select|with)\b/i.test(sql);

/** A D1 binding that records each statement and adds up its `meta`. */
function recordingDb(op: Op): Db {
  const d1 = env.DB;
  const note = (s: Stmt, meta: D1Meta | undefined) => {
    op.stmts.push(s);
    op.rowsRead += meta?.rows_read ?? 0;
    op.rowsWritten += meta?.rows_written ?? 0;
  };
  class Rec {
    constructor(
      readonly real: D1PreparedStatement,
      readonly sql: string,
      readonly params: unknown[],
    ) {}
    bind(...params: unknown[]) {
      return new Rec(this.real.bind(...params), this.sql, params);
    }
    async all() {
      const res = await this.real.all();
      note(this, res.meta);
      return res;
    }
    async run() {
      const res = await this.real.run();
      note(this, res.meta);
      return res;
    }
    // first() and raw() return no meta: a read is measured by running it again
    // with all(); a write through them (INSERT … RETURNING) is only counted.
    async first(col?: string) {
      const res = col === undefined ? await this.real.first() : await this.real.first(col);
      await this.measure();
      return res;
    }
    async raw(options?: { columnNames?: boolean }) {
      const res = await this.real.raw(options as { columnNames: true });
      await this.measure();
      return res;
    }
    private async measure() {
      if (isRead(this.sql)) note(this, (await this.real.all()).meta);
      else {
        op.stmts.push(this);
        op.unmeasured++;
      }
    }
  }
  const client = {
    prepare: (sql: string) => new Rec(d1.prepare(sql), sql, []),
    batch: async (stmts: Rec[]) => {
      const res = await d1.batch(stmts.map((s) => s.real));
      res.forEach((r, i) => note(stmts[i], r.meta));
      return res;
    },
    exec: (sql: string) => d1.exec(sql),
    dump: () => d1.dump(),
  };
  return drizzle(client as unknown as D1Database, { schema }) as Db;
}

let partialIndexes: Set<string> | undefined;

/**
 * Partial indexes (`… WHERE ended_at IS NULL`, `… WHERE status = 'open'`) only
 * hold rows that are open right now, so walking one doesn't grow with history.
 */
async function getPartialIndexes(): Promise<Set<string>> {
  partialIndexes ??= new Set(
    (
      await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND sql LIKE '% WHERE %'`).all<{ name: string }>()
    ).results.map((r) => r.name),
  );
  return partialIndexes;
}

/** EXPLAIN QUERY PLAN lines that scan a growing table in full. */
async function fullScans(s: Stmt): Promise<string[]> {
  const partial = await getPartialIndexes();
  const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${s.sql}`)
    .bind(...s.params)
    .all<{ detail: string }>();
  return plan.results
    .map((r) => r.detail)
    .filter((detail) => {
      const m = /^SCAN (\S+)(?: AS \S+)?(?: USING (?:COVERING )?INDEX (\S+))?/.exec(detail);
      if (!m) return false;
      const table = m[1].replace(/"/g, "");
      // A scan of a full (covering) index is still a pass over every row.
      return GROWING.includes(table) && !(m[2] && partial.has(m[2]));
    });
}

type Fixture = {
  admin: MemberActor;
  staff: MemberActor;
  student: MemberActor;
  other: MemberActor;
  machines: SeededMachine[];
  certs: SeededCert[];
  sessionId: string;
};

/**
 * A makerspace after a busy term: `machineCount` machines over 4 rooms,
 * 4 certifications, 120 members with grants, 15 sessions per machine of
 * history, a few open faults, 8 service records and 1 checkup per machine.
 */
async function load(machineCount: number): Promise<Fixture> {
  const db = testDb();
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
  const admin = await actors.admin({ name: "Demo Admin" });
  const staff = await actors.staff({ name: "Demo Staff 1" });
  const people: MemberActor[] = [];
  for (let i = 0; i < 120; i++) people.push(await actors.member({ name: `Demo Student ${i + 1}` }));
  const [student, other] = people;
  const rooms = await Promise.all([0, 1, 2, 3].map((i) => seed.room({ name: `Demo Room ${i}`, sortOrder: i })));
  const certs = await Promise.all([12, 12, null, 6].map((months) => seed.cert({ validityMonths: months })));
  const machines: SeededMachine[] = [];
  for (let i = 0; i < machineCount; i++) {
    machines.push(
      await seed.machine({ room: rooms[i % 4], requires: [certs[i % 4]], supervised: i % 10 === 9, name: `Demo Machine ${i + 1}` }),
    );
  }
  for (const [i, p] of people.entries()) {
    for (const [j, c] of certs.entries()) {
      if ((i + j) % 3 !== 0) await seed.grant(p, c, { by: staff, grantedAt: T0 - 200 * DAY, expiresAt: c.validityMonths ? T0 + (i % 50) * DAY : null });
    }
  }
  for (const [i, m] of machines.entries()) {
    for (let k = 0; k < 15; k++) {
      const start = T0 - (k + 1) * DAY + i * MIN;
      await seed.session(people[(i + k) % people.length], m, { startedAt: start, minutes: 60, endedAt: start + 50 * MIN });
    }
    if (i % 3 === 0) {
      await createCheckup(db, staff, { machineId: m.id, name: "Weekly check", intervalDays: 7 }, T0 - 30 * DAY);
    }
  }
  // History through the services (faults and service records have triggers and guards).
  for (const [i, m] of machines.entries()) {
    for (let k = 0; k < 8; k++) {
      await logServiceRecord(
        db,
        staff,
        { machineId: m.id, type: "cleaning", workDone: "Cleaned and inspected", outcome: "passed", clientRequestId: crypto.randomUUID() },
        T0 - (k + 1) * 7 * DAY + i * MIN,
        { sleep: async () => {} },
      );
    }
    if (i % 5 === 0) {
      await reportFault(
        db,
        people[i % people.length],
        { machineId: m.id, description: "Makes a grinding noise", takeOutOfService: i % 10 === 0, clientRequestId: crypto.randomUUID() },
        T0 - HOUR,
        { sleep: async () => {} },
      );
    }
  }
  // A few machines in use right now.
  let sessionId = "";
  for (const [i, m] of machines.entries()) {
    if (i % 4 === 2) {
      const s = await seed.session(people[(i * 7) % people.length], m, { startedAt: T0 - 20 * MIN, minutes: 60 });
      if (!sessionId) sessionId = s.id;
    }
  }
  return { admin, staff, student, other, machines, certs, sessionId };
}

type Case = { name: string; run: (db: Db, f: Fixture) => Promise<unknown> };

const opts = { sleep: async () => {} };

/** The hot paths: pages (their service reads), route handlers and actions. */
const CASES: Case[] = [
  { name: "page /m/[token] (pass)", run: (db, f) => getMachineByToken(db, f.student, { token: f.machines[1].qrToken }, T0) },
  { name: "page /machines + GET /api/status-board 200", run: (db, f) => getStatusBoard(db, f.student, T0) },
  {
    name: "GET /api/status-board 304",
    run: async (db, f) => {
      const { etag } = await getStatusBoard(testDb(), f.student, T0);
      const res = await getStatusBoard(db, f.student, T0, etag);
      expect(res.notModified).toBe(true);
    },
  },
  {
    name: "GET /api/console 304",
    run: async (db, f) => {
      const { etag } = await getConsole(testDb(), f.staff, T0);
      const res = await getConsole(db, f.staff, T0, etag);
      expect(res.notModified).toBe(true);
    },
  },
  { name: "page /me/certifications", run: (db, f) => getMyCertifications(db, f.student, T0) },
  { name: "page /console + GET /api/console 200", run: (db, f) => getConsole(db, f.staff, T0) },
  { name: "page /console/faults", run: (db, f) => getFaultQueue(db, f.staff, {}, T0) },
  { name: "page /console/checkups", run: (db, f) => listDueCheckups(db, f.staff, { due: "all" }, T0) },
  { name: "page /console/machines/[id] (detail)", run: (db, f) => getMachineDetail(db, f.staff, { machineId: f.machines[0].id }, T0) },
  { name: "service history page", run: (db, f) => getServiceHistory(db, f.staff, { machineId: f.machines[0].id }) },
  { name: "page /console/members (list)", run: (db, f) => searchMembers(db, f.staff, {}) },
  { name: "page /console/members (search)", run: (db, f) => searchMembers(db, f.staff, { q: "Student 4" }) },
  {
    name: "page /console/members/[id]",
    run: async (db, f) => {
      await getMember(db, f.staff, f.student.memberId);
      await getMemberCertifications(db, f.staff, { memberId: f.student.memberId }, T0);
      await getMemberSessions(db, f.staff, { memberId: f.student.memberId }, T0);
    },
  },
  {
    name: "action start session",
    run: (db, f) => startSession(db, f.other, { machineId: f.machines[3].id, clientRequestId: crypto.randomUUID() }, T0, opts),
  },
  { name: "action end session", run: (db, f) => endSession(db, f.staff, { sessionId: f.sessionId }, T0) },
  {
    name: "action report fault",
    run: (db, f) =>
      reportFault(db, f.student, { machineId: f.machines[1].id, description: "Loose belt", takeOutOfService: false, clientRequestId: crypto.randomUUID() }, T0, opts),
  },
  {
    name: "action sign off",
    run: (db, f) => signOff(db, f.staff, { memberId: f.other.memberId, certificationId: f.certs[0].id, clientRequestId: crypto.randomUUID() }, T0),
  },
  {
    name: "action log service",
    run: (db, f) =>
      logServiceRecord(
        db,
        f.staff,
        { machineId: f.machines[5].id, type: "repair", workDone: "Replaced the belt", outcome: "passed", clientRequestId: crypto.randomUUID() },
        T0,
        opts,
      ),
  },
];

for (const machineCount of [10, 60]) {
  describe(`query audit at ${machineCount} machines`, () => {
    let f: Fixture;
    const results: { name: string; statements: number; rowsRead: number; rowsWritten: number }[] = [];

    beforeAll(async () => {
      f = await load(machineCount);
    }, 120_000);

    for (const c of CASES) {
      it(`${c.name}: no full scan of a growing table`, async () => {
        const op: Op = { stmts: [], rowsRead: 0, rowsWritten: 0, unmeasured: 0 };
        await c.run(recordingDb(op), f).catch((err: unknown) => {
          // A business refusal still ran its queries; the plan is what matters here.
          if (!(err instanceof Error && "code" in err)) throw err;
        });
        expect(op.stmts.length, "statements recorded").toBeGreaterThan(0);
        const scans: string[] = [];
        for (const s of op.stmts) {
          for (const line of await fullScans(s)) scans.push(`${line}  ←  ${s.sql.slice(0, 160)}`);
        }
        expect(scans).toEqual([]);
        results.push({ name: c.name, statements: op.stmts.length, rowsRead: op.rowsRead, rowsWritten: op.rowsWritten });
      });
    }

    it("prints rows read/written per operation", () => {
      console.log(
        [`\nRows per operation at ${machineCount} machines (120 members, ${machineCount * 15} past sessions):`]
          .concat(results.map((r) => `  ${r.name.padEnd(48)} stmts ${String(r.statements).padStart(3)}  read ${String(r.rowsRead).padStart(6)}  written ${String(r.rowsWritten).padStart(3)}`))
          .join("\n"),
      );
      expect(results.length).toBe(CASES.length);
    });
  });
}

describe("query audit: Better Auth and other single lookups", () => {
  it("session lookup by token and account by user use indexes", async () => {
    for (const sql of [
      `SELECT * FROM "session" WHERE "token" = ?`,
      `SELECT * FROM "account" WHERE "user_id" = ?`,
      `SELECT * FROM "user" WHERE "email" = ?`,
      `SELECT * FROM "members" WHERE "auth_user_id" = ?`,
    ]) {
      expect(await fullScans({ sql, params: ["x"] }), sql).toEqual([]);
    }
  });

});
