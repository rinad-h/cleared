// P1-44: role changes and the last-admin rule (FR-03).
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { members } from "@/db/schema";
import { updateMember } from "@/server/services/members";
import { actors, createMakerspace, dataVersion, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { T0 } from "../helpers/time";

beforeEach(async () => {
  await resetIdentity();
  await createMakerspace();
});

const roleOf = async (id: string) =>
  (await testDb().select({ role: members.role }).from(members).where(eq(members.id, id)).get())?.role;

describe("roles", () => {
  it("staff can't change roles (FORBIDDEN_FIELD), not even with a status change in the same request", async () => {
    const [staff, target] = await Promise.all([actors.staff(), actors.member()]);
    await expect(updateMember(testDb(), staff, { id: target.memberId, role: "staff" }, T0)).rejects.toMatchObject({
      code: "FORBIDDEN_FIELD",
    });
    await expect(
      updateMember(testDb(), staff, { id: target.memberId, role: "admin", status: "suspended" }, T0),
    ).rejects.toMatchObject({ code: "FORBIDDEN_FIELD" });
    expect(await roleOf(target.memberId)).toBe("member");
  });

  it("members can't change anything (FORBIDDEN)", async () => {
    const [m, target] = await Promise.all([actors.member(), actors.member()]);
    await expect(updateMember(testDb(), m, { id: target.memberId, status: "suspended" }, T0)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("an admin can promote and demote, and each change bumps data_version", async () => {
    const [admin, target] = await Promise.all([actors.admin(), actors.member()]);
    const v0 = await dataVersion();
    await expect(updateMember(testDb(), admin, { id: target.memberId, role: "staff" }, T0)).resolves.toMatchObject({
      role: "staff",
    });
    await updateMember(testDb(), admin, { id: target.memberId, role: "admin" }, T0 + 1);
    expect(await roleOf(target.memberId)).toBe("admin");
    await updateMember(testDb(), admin, { id: target.memberId, role: "member" }, T0 + 2);
    expect(await roleOf(target.memberId)).toBe("member");
    expect(await dataVersion()).toBe(v0 + 3);
  });

  it("the last active admin can't demote themselves (LAST_ADMIN)", async () => {
    const admin = await actors.admin();
    await expect(updateMember(testDb(), admin, { id: admin.memberId, role: "staff" }, T0)).rejects.toMatchObject({
      code: "LAST_ADMIN",
    });
    expect(await roleOf(admin.memberId)).toBe("admin");
  });

  it("a suspended admin doesn't count as an active admin", async () => {
    const admin = await actors.admin();
    await actors.admin({ status: "suspended" });
    await expect(updateMember(testDb(), admin, { id: admin.memberId, role: "member" }, T0)).rejects.toMatchObject({
      code: "LAST_ADMIN",
    });
  });

  it("an admin can demote themselves while another active admin remains", async () => {
    const [a, _b] = await Promise.all([actors.admin(), actors.admin()]);
    await expect(updateMember(testDb(), a, { id: a.memberId, role: "staff" }, T0)).resolves.toMatchObject({
      role: "staff",
    });
  });

  it("two admins demoting each other at the same time: exactly one succeeds", async () => {
    const [a, b] = await Promise.all([actors.admin(), actors.admin()]);
    const results = await Promise.allSettled([
      updateMember(testDb(), a, { id: b.memberId, role: "member" }, T0),
      updateMember(testDb(), b, { id: a.memberId, role: "member" }, T0),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    // The loser is either no longer an admin (FORBIDDEN) or would leave no admin (LAST_ADMIN).
    expect(["FORBIDDEN", "LAST_ADMIN"]).toContain(failed?.reason.code);

    const admins = await testDb().select().from(members).where(eq(members.role, "admin")).all();
    expect(admins).toHaveLength(1);
  });

  it("an unknown member → NOT_FOUND; a malformed id → VALIDATION_FAILED", async () => {
    const admin = await actors.admin();
    await expect(
      updateMember(testDb(), admin, { id: crypto.randomUUID(), role: "staff" }, T0),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateMember(testDb(), admin, { id: "nope", role: "staff" }, T0)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("an empty change → VALIDATION_FAILED", async () => {
    const [admin, target] = await Promise.all([actors.admin(), actors.member()]);
    await expect(updateMember(testDb(), admin, { id: target.memberId }, T0)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});
