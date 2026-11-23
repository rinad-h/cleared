// P1-41: first-run Setup (FR-01).
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { members, settings } from "@/db/schema";
import { completeSetup, isSetupComplete } from "@/server/services/setup";
import { actors, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { T0 } from "../helpers/time";

const INPUT = { makerspaceName: "Demo Makerspace", timezone: "America/Edmonton" };

beforeEach(() => resetIdentity());

describe("completeSetup", () => {
  it("refuses an anonymous caller (UNAUTHENTICATED)", async () => {
    await expect(completeSetup(testDb(), actors.anonymous(), INPUT, T0)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(await isSetupComplete(testDb())).toBe(false);
  });

  it("makes the first user admin and creates the settings row", async () => {
    const user = await actors.nonMember({ name: "Ada Admin" });
    const { memberId } = await completeSetup(testDb(), user, INPUT, T0);

    const member = await testDb().select().from(members).where(eq(members.id, memberId)).get();
    expect(member).toMatchObject({
      authUserId: user.userId,
      role: "admin",
      status: "active",
      displayName: "Ada Admin",
      email: user.email,
      createdAt: T0,
    });
    const row = await testDb().select().from(settings).get();
    expect(row).toMatchObject({ id: "singleton", name: "Demo Makerspace", timezone: "America/Edmonton" });
    expect(row?.memberJoinToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("refuses a second Setup (SETUP_ALREADY_DONE) and leaves the first one unchanged", async () => {
    await completeSetup(testDb(), await actors.nonMember(), INPUT, T0);
    const second = await actors.nonMember();
    await expect(
      completeSetup(testDb(), second, { makerspaceName: "Other", timezone: "UTC" }, T0 + 1),
    ).rejects.toMatchObject({ code: "SETUP_ALREADY_DONE" });

    expect(await testDb().select().from(members).all()).toHaveLength(1);
    expect((await testDb().select().from(settings).get())?.name).toBe("Demo Makerspace");
  });

  it("refuses a member re-running Setup", async () => {
    const user = await actors.nonMember();
    const { memberId } = await completeSetup(testDb(), user, INPUT, T0);
    const asMember = { kind: "member", memberId, userId: user.userId, role: "admin", status: "active", displayName: "x" } as const;
    await expect(completeSetup(testDb(), asMember, INPUT, T0)).rejects.toMatchObject({ code: "SETUP_ALREADY_DONE" });
  });

  it("two concurrent setups: exactly one succeeds", async () => {
    const [a, b] = await Promise.all([actors.nonMember(), actors.nonMember()]);
    const results = await Promise.allSettled([
      completeSetup(testDb(), a, { ...INPUT, makerspaceName: "Space A" }, T0),
      completeSetup(testDb(), b, { ...INPUT, makerspaceName: "Space B" }, T0),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toMatchObject({ code: "SETUP_ALREADY_DONE" });

    const admins = await testDb().select().from(members).all();
    expect(admins).toHaveLength(1);
    expect(admins[0].role).toBe("admin");
  });

  it("validates the input (name length, time zone)", async () => {
    const user = await actors.nonMember();
    await expect(
      completeSetup(testDb(), user, { makerspaceName: "A", timezone: "Mars/Olympus" }, T0),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { makerspaceName: expect.any(Array), timezone: expect.any(Array) },
    });
    expect(await isSetupComplete(testDb())).toBe(false);
  });

  it("cleans a display name that bypassed sign-up's checks", async () => {
    const user = await actors.nonMember({ name: `  Bad\u0007Name ${"x".repeat(100)}` });
    const { memberId } = await completeSetup(testDb(), user, INPUT, T0);
    const member = await testDb().select().from(members).where(eq(members.id, memberId)).get();
    expect(member?.displayName.startsWith("Bad Name x")).toBe(true);
    expect(member?.displayName).toHaveLength(80);
  });
});
