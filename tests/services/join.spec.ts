// P1-43: joining with the join link (FR-02).
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { members } from "@/db/schema";
import { joinMakerspace, previewJoin } from "@/server/services/join";
import { regenerateJoinLink } from "@/server/services/settings";
import { actors, createMakerspace, dataVersion, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { T0 } from "../helpers/time";

beforeEach(() => resetIdentity());

describe("join", () => {
  it("a valid link makes a signed-in user a member (name and email copied from the user)", async () => {
    const { joinToken } = await createMakerspace();
    const u = await actors.nonMember({ name: "Jo Joiner", email: "jo@example.test" });
    const before = await dataVersion();

    const result = await joinMakerspace(testDb(), u, { token: joinToken }, T0);
    expect(result.joined).toBe(true);
    const row = await testDb().select().from(members).where(eq(members.id, result.memberId)).get();
    expect(row).toMatchObject({
      authUserId: u.userId,
      role: "member",
      status: "active",
      displayName: "Jo Joiner",
      email: "jo@example.test",
    });
    expect(await dataVersion()).toBe(before + 1);
  });

  it("an invalid link → INVALID_JOIN_LINK", async () => {
    await createMakerspace();
    const u = await actors.nonMember();
    await expect(joinMakerspace(testDb(), u, { token: "not-the-token" }, T0)).rejects.toMatchObject({
      code: "INVALID_JOIN_LINK",
    });
    expect(await testDb().select().from(members).all()).toHaveLength(0);
  });

  it("before Setup → SETUP_NOT_DONE", async () => {
    const u = await actors.nonMember();
    await expect(joinMakerspace(testDb(), u, { token: "anything" }, T0)).rejects.toMatchObject({
      code: "SETUP_NOT_DONE",
    });
  });

  it("anonymous → UNAUTHENTICATED", async () => {
    const { joinToken } = await createMakerspace();
    await expect(joinMakerspace(testDb(), actors.anonymous(), { token: joinToken }, T0)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("re-joining leaves role and status unchanged", async () => {
    const { joinToken } = await createMakerspace();
    for (const existing of [await actors.staff(), await actors.member({ status: "suspended" })]) {
      const result = await joinMakerspace(testDb(), existing, { token: joinToken }, T0 + 1000);
      expect(result).toEqual({ memberId: existing.memberId, joined: false });
      const row = await testDb().select().from(members).where(eq(members.id, existing.memberId)).get();
      expect(row).toMatchObject({ role: existing.role, status: existing.status, updatedAt: T0 });
    }
  });

  it("two concurrent joins by the same user create one membership", async () => {
    const { joinToken } = await createMakerspace();
    const u = await actors.nonMember();
    const results = await Promise.all([
      joinMakerspace(testDb(), u, { token: joinToken }, T0),
      joinMakerspace(testDb(), u, { token: joinToken }, T0),
    ]);
    expect(new Set(results.map((r) => r.memberId)).size).toBe(1);
    expect(await testDb().select().from(members).where(eq(members.authUserId, u.userId)).all()).toHaveLength(1);
  });

  it("regenerate → the old link stops working, the new one works", async () => {
    const { joinToken: oldToken } = await createMakerspace();
    const admin = await actors.admin();
    const { joinToken: newToken } = await regenerateJoinLink(testDb(), admin, {}, T0 + 1);
    expect(newToken).not.toBe(oldToken);

    const u = await actors.nonMember();
    await expect(joinMakerspace(testDb(), u, { token: oldToken }, T0 + 2)).rejects.toMatchObject({
      code: "INVALID_JOIN_LINK",
    });
    expect((await previewJoin(testDb(), u, { token: oldToken })).valid).toBe(false);
    expect(await previewJoin(testDb(), u, { token: newToken })).toEqual({
      valid: true,
      makerspaceName: "Demo Makerspace",
    });
    await expect(joinMakerspace(testDb(), u, { token: newToken }, T0 + 3)).resolves.toMatchObject({ joined: true });
  });

  it("preview reports a missing setup", async () => {
    const u = await actors.nonMember();
    expect(await previewJoin(testDb(), u, { token: "x" })).toEqual({ valid: false, reason: "setup-not-done" });
  });
});
