// P1-42: the actor states getActor() produces, and how the guards treat them.
import { beforeEach, describe, expect, it } from "vitest";
import { requireMember, requireRole, requireUser } from "@/server/authz";
import { getMe, resolveActor } from "@/server/services/me";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";

beforeEach(() => resetIdentity());

const sessionOf = (a: { userId: string }, email = "x@example.test", name = "X") => ({ id: a.userId, email, name });

describe("resolveActor (getActor's session → Actor step)", () => {
  it("no session → anonymous", async () => {
    expect(await resolveActor(testDb(), null)).toEqual({ kind: "anonymous" });
  });

  it("signed in without a membership → user", async () => {
    const u = await actors.nonMember({ name: "Nina", email: "nina@example.test" });
    expect(await resolveActor(testDb(), { id: u.userId, email: u.email, name: u.name })).toEqual({
      kind: "user",
      userId: u.userId,
      email: "nina@example.test",
      name: "Nina",
    });
  });

  it("member → member actor with role and status from the members row", async () => {
    const m = await actors.staff();
    expect(await resolveActor(testDb(), sessionOf(m))).toEqual(m);
  });

  it("suspended member → member actor with status suspended", async () => {
    const m = await actors.member({ status: "suspended" });
    expect(await resolveActor(testDb(), sessionOf(m))).toMatchObject({ kind: "member", status: "suspended" });
  });
});

describe("guards", () => {
  it("anonymous: every guard → UNAUTHENTICATED", () => {
    const a = actors.anonymous();
    expect(() => requireUser(a)).toThrow(expect.objectContaining({ code: "UNAUTHENTICATED" }));
    expect(() => requireMember(a)).toThrow(expect.objectContaining({ code: "UNAUTHENTICATED" }));
    expect(() => requireRole(a, "staff")).toThrow(expect.objectContaining({ code: "UNAUTHENTICATED" }));
  });

  it("user without membership: requireUser passes, requireMember → NOT_A_MEMBER", async () => {
    const u = await actors.nonMember();
    expect(() => requireUser(u)).not.toThrow();
    expect(() => requireMember(u)).toThrow(expect.objectContaining({ code: "NOT_A_MEMBER" }));
  });

  it("suspended member → SUSPENDED, whatever the role", async () => {
    const admin = await actors.admin({ status: "suspended" });
    expect(() => requireMember(admin)).toThrow(expect.objectContaining({ code: "SUSPENDED" }));
    expect(() => requireRole(admin, "admin")).toThrow(expect.objectContaining({ code: "SUSPENDED" }));
  });

  it("roles: member < staff < admin", async () => {
    const [m, s, a] = await Promise.all([actors.member(), actors.staff(), actors.admin()]);
    expect(() => requireRole(m, "staff")).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => requireRole(s, "staff")).not.toThrow();
    expect(() => requireRole(s, "admin")).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
    expect(() => requireRole(a, "staff")).not.toThrow();
    expect(() => requireRole(a, "admin")).not.toThrow();
  });
});

describe("getMe", () => {
  it("reports setup state and membership", async () => {
    expect(await getMe(testDb(), actors.anonymous(), null)).toEqual({
      user: null,
      setupComplete: false,
      makerspace: null,
      membership: null,
    });
    await createMakerspace({ name: "Demo Makerspace" });
    const u = await actors.nonMember();
    const asUser = await getMe(testDb(), u, { id: u.userId, email: u.email, name: u.name });
    expect(asUser).toMatchObject({ setupComplete: true, makerspace: { name: "Demo Makerspace" }, membership: null });

    const m = await actors.staff();
    const asMember = await getMe(testDb(), m, sessionOf(m, "s@example.test"));
    expect(asMember.membership).toMatchObject({ id: m.memberId, role: "staff", status: "active" });
  });
});
