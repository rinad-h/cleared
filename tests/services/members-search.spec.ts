// Members list and detail (staff).
import { beforeEach, describe, expect, it } from "vitest";
import { getMember, searchMembers } from "@/server/services/members";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";

beforeEach(async () => {
  await resetIdentity();
  await createMakerspace();
});

describe("searchMembers", () => {
  it("staff and admins only", async () => {
    await expect(searchMembers(testDb(), await actors.member(), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(searchMembers(testDb(), await actors.nonMember(), {})).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
    await expect(searchMembers(testDb(), actors.anonymous(), {})).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("finds by name or email (case-insensitive), filters by role and status, sorts by name", async () => {
    const staff = await actors.staff({ name: "zed staff", email: "zed@example.test" });
    await actors.member({ name: "Alice Archer", email: "alice@example.test" });
    await actors.member({ name: "bob builder", email: "bob@shop.test", status: "suspended" });

    const all = await searchMembers(testDb(), staff, {});
    expect(all.items.map((m) => m.displayName)).toEqual(["Alice Archer", "bob builder", "zed staff"]);

    expect((await searchMembers(testDb(), staff, { q: "ALICE" })).items.map((m) => m.displayName)).toEqual(["Alice Archer"]);
    expect((await searchMembers(testDb(), staff, { q: "shop.test" })).items.map((m) => m.displayName)).toEqual(["bob builder"]);
    expect((await searchMembers(testDb(), staff, { status: "suspended" })).items).toHaveLength(1);
    expect((await searchMembers(testDb(), staff, { role: "staff" })).items.map((m) => m.id)).toEqual([staff.memberId]);
  });

  it("treats % and _ in the query literally", async () => {
    const staff = await actors.staff({ name: "Staff", email: "staff@example.test" });
    await actors.member({ name: "100% Sure", email: "sure@example.test" });
    await actors.member({ name: "Plain", email: "plain@example.test" });
    await actors.member({ name: "pin_code", email: "pin@example.test" });
    await actors.member({ name: "pinXcode", email: "pinx@example.test" });
    expect((await searchMembers(testDb(), staff, { q: "%" })).items.map((m) => m.displayName)).toEqual(["100% Sure"]);
    // Unescaped, `_` would match any character and find "pinXcode" too.
    expect((await searchMembers(testDb(), staff, { q: "pin_c" })).items.map((m) => m.displayName)).toEqual(["pin_code"]);
  });

  it("pages with an opaque cursor, without gaps or repeats", async () => {
    const staff = await actors.staff({ name: "Aaa Staff" });
    for (let i = 0; i < 7; i++) await actors.member({ name: `Member ${i}` });
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const { items, nextCursor } = await searchMembers(testDb(), staff, { limit: 3, cursor });
      seen.push(...items.map((m) => m.displayName));
      if (!nextCursor) break;
      cursor = nextCursor;
    }
    expect(seen).toEqual(["Aaa Staff", ...Array.from({ length: 7 }, (_, i) => `Member ${i}`)]);
  });

  it("rejects a forged cursor", async () => {
    const staff = await actors.staff();
    await expect(searchMembers(testDb(), staff, { cursor: "garbage!!" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});

describe("getMember", () => {
  it("returns the profile to staff, NOT_FOUND for an unknown id", async () => {
    const staff = await actors.staff();
    const m = await actors.member({ name: "Mia" });
    expect(await getMember(testDb(), staff, m.memberId)).toMatchObject({
      id: m.memberId,
      displayName: "Mia",
      role: "member",
      status: "active",
      isSelf: false,
    });
    expect(await getMember(testDb(), staff, staff.memberId)).toMatchObject({ isSelf: true });
    await expect(getMember(testDb(), staff, crypto.randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getMember(testDb(), await actors.member(), m.memberId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
