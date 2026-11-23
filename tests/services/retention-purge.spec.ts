// P7-55 / P7-61: the once-a-term purge in scripts/sql/retention-purge.sql
// (run by hand from the runbook) removes only what the retention rule says.
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import purgeSql from "../../scripts/sql/retention-purge.sql?raw";
import { account, session, user } from "@/db/auth-schema";
import { grants, machineSessions } from "@/db/schema";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed } from "../helpers/seed";
import { DAY, HOUR } from "../helpers/time";

const db = () => testDb();

/** The file's statements (comments dropped), run as one D1 batch like `d1 execute --file`. */
async function runPurge() {
  const statements = purgeSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
}

const ids = async (table: typeof user | typeof session | typeof account) =>
  (await db().select({ id: table.id }).from(table).all()).map((r) => r.id).sort();

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
});

describe("retention purge", () => {
  it("removes machine sessions that ended over 2 years ago and keeps the rest", async () => {
    const now = Date.now();
    const staff = await actors.staff();
    const student = await actors.member();
    const machine = await seed.machine();
    const cert = await seed.cert();
    await seed.grant(student, cert, { by: staff, grantedAt: now - 3 * 365 * DAY });
    const old = await seed.session(student, machine, { startedAt: now - 3 * 365 * DAY, endedAt: now - 3 * 365 * DAY + HOUR });
    const recent = await seed.session(student, machine, { startedAt: now - 365 * DAY, endedAt: now - 365 * DAY + HOUR });
    const open = await seed.session(student, machine, { startedAt: now - 3 * 365 * DAY });

    await runPurge();

    const left = (await db().select({ id: machineSessions.id }).from(machineSessions).all()).map((r) => r.id);
    expect(left).not.toContain(old.id);
    expect(left).toEqual(expect.arrayContaining([recent.id, open.id]));
    expect(await db().select().from(grants).all()).toHaveLength(1);
  });

  it("removes expired sign-in sessions and accounts older than 7 days that never joined", async () => {
    const now = Date.now();
    const member = await actors.member(); // created long ago, but joined
    const neverJoined = await actors.nonMember(); // created at T0, long ago
    const fresh = await actors.nonMember();
    await db().update(user).set({ createdAt: new Date(now - DAY) }).where(eq(user.id, fresh.userId));
    const at = new Date(now);
    const sessionRow = (id: string, userId: string, expiresAt: number) => ({
      id,
      userId,
      token: `token-${id}`,
      expiresAt: new Date(expiresAt),
      createdAt: at,
      updatedAt: at,
    });
    await db()
      .insert(session)
      .values([
        sessionRow("s-member-live", member.userId, now + DAY),
        sessionRow("s-member-expired", member.userId, now - DAY),
        sessionRow("s-never-joined", neverJoined.userId, now + DAY),
        sessionRow("s-fresh", fresh.userId, now + DAY),
      ]);
    const accountRow = (id: string, userId: string) => ({ id, userId, accountId: userId, providerId: "credential", password: "x", createdAt: at, updatedAt: at });
    await db()
      .insert(account)
      .values([accountRow("a-member", member.userId), accountRow("a-never-joined", neverJoined.userId), accountRow("a-fresh", fresh.userId)]);

    await runPurge();

    expect(await ids(user)).toEqual([member.userId, fresh.userId].sort());
    expect(await ids(session)).toEqual(["s-fresh", "s-member-live"]);
    expect(await ids(account)).toEqual(["a-fresh", "a-member"]);
  });
});
