// P1-45: suspension and reactivation (FR-03).
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { members } from "@/db/schema";
import { requireMember } from "@/server/authz";
import { getMember, searchMembers, updateMember } from "@/server/services/members";
import { getSettings, regenerateJoinLink, updateSettings } from "@/server/services/settings";
import { resolveActor } from "@/server/services/me";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { MIN, T0 } from "../helpers/time";

beforeEach(async () => {
  await resetIdentity();
  await createMakerspace();
});

const rowOf = (id: string) => testDb().select().from(members).where(eq(members.id, id)).get();

describe("suspension", () => {
  it("staff suspend a member (with reason) and reactivate them", async () => {
    const [staff, target] = await Promise.all([actors.staff(), actors.member()]);
    await updateMember(testDb(), staff, { id: target.memberId, status: "suspended", suspensionReason: "Unsafe use" }, T0);
    expect(await rowOf(target.memberId)).toMatchObject({
      status: "suspended",
      suspensionReason: "Unsafe use",
      statusChangedAt: T0,
      statusChangedByMemberId: staff.memberId,
    });

    await updateMember(testDb(), staff, { id: target.memberId, status: "active" }, T0 + MIN);
    expect(await rowOf(target.memberId)).toMatchObject({
      status: "active",
      suspensionReason: null,
      statusChangedAt: T0 + MIN,
    });
  });

  it("staff can't suspend staff or admins (FORBIDDEN)", async () => {
    const staff = await actors.staff();
    for (const target of [await actors.staff(), await actors.admin()]) {
      await expect(
        updateMember(testDb(), staff, { id: target.memberId, status: "suspended" }, T0),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await rowOf(target.memberId))?.status).toBe("active");
    }
  });

  it("an admin can suspend staff", async () => {
    const [admin, staff] = await Promise.all([actors.admin(), actors.staff()]);
    await expect(
      updateMember(testDb(), admin, { id: staff.memberId, status: "suspended" }, T0),
    ).resolves.toMatchObject({ status: "suspended" });
  });

  it("the last active admin can't be suspended: two admins suspending each other at once, exactly one succeeds", async () => {
    // With self-suspension refused, an admin can only become the last one to be
    // suspended through a race; the guard in the UPDATE settles it.
    const [a, b] = await Promise.all([actors.admin(), actors.admin()]);
    const results = await Promise.allSettled([
      updateMember(testDb(), a, { id: b.memberId, status: "suspended" }, T0),
      updateMember(testDb(), b, { id: a.memberId, status: "suspended" }, T0),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(["FORBIDDEN", "LAST_ADMIN"]).toContain(failed?.reason.code);
    const active = await testDb().select().from(members).where(eq(members.status, "active")).all();
    expect(active.filter((m) => m.role === "admin")).toHaveLength(1);
  });

  it("nobody can change their own status (CANNOT_SUSPEND_SELF)", async () => {
    for (const self of [await actors.admin(), await actors.staff()]) {
      await expect(
        updateMember(testDb(), self, { id: self.memberId, status: "suspended" }, T0),
      ).rejects.toMatchObject({ code: "CANNOT_SUSPEND_SELF" });
    }
  });

  it("a staff member who is demoted mid-request can no longer suspend (re-checked in the UPDATE)", async () => {
    const [admin, staff, target] = await Promise.all([actors.admin(), actors.staff(), actors.member()]);
    await updateMember(testDb(), admin, { id: staff.memberId, role: "member" }, T0);
    // `staff` still holds a stale actor that says "staff".
    await expect(
      updateMember(testDb(), staff, { id: target.memberId, status: "suspended" }, T0 + 1),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await rowOf(target.memberId))?.status).toBe("active");
  });

  it("a suspended actor gets SUSPENDED from every member service", async () => {
    const admin = await actors.admin();
    const other = await actors.member();
    await actors.admin(); // keep another active admin so the suspension is allowed
    await updateMember(testDb(), await actors.admin(), { id: admin.memberId, status: "suspended" }, T0);
    const suspended = await resolveActor(testDb(), { id: admin.userId, email: "a@example.test", name: "A" });
    expect(suspended).toMatchObject({ status: "suspended" });

    const calls = [
      () => searchMembers(testDb(), suspended, {}),
      () => getMember(testDb(), suspended, other.memberId),
      () => updateMember(testDb(), suspended, { id: other.memberId, status: "suspended" }, T0),
      () => getSettings(testDb(), suspended),
      () => updateSettings(testDb(), suspended, { name: "New name" }, T0),
      () => regenerateJoinLink(testDb(), suspended, {}, T0),
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: "SUSPENDED" });
    expect(() => requireMember(suspended)).toThrow(expect.objectContaining({ code: "SUSPENDED" }));
  });
});
