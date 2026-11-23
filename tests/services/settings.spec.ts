// P1-46: makerspace settings (admin only).
import { beforeEach, describe, expect, it } from "vitest";
import { getSettings, regenerateJoinLink, updateSettings } from "@/server/services/settings";
import { actors, createMakerspace, dataVersion, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { T0 } from "../helpers/time";

beforeEach(async () => {
  await resetIdentity();
  await createMakerspace({ joinToken: "old-token-000000000000" });
});

describe("settings", () => {
  it("admin only: staff and members get FORBIDDEN, non-members NOT_A_MEMBER, anonymous UNAUTHENTICATED", async () => {
    const cases = [
      [await actors.staff(), "FORBIDDEN"],
      [await actors.member(), "FORBIDDEN"],
      [await actors.nonMember(), "NOT_A_MEMBER"],
      [actors.anonymous(), "UNAUTHENTICATED"],
    ] as const;
    for (const [actor, code] of cases) {
      await expect(getSettings(testDb(), actor)).rejects.toMatchObject({ code });
      await expect(updateSettings(testDb(), actor, { name: "New" }, T0)).rejects.toMatchObject({ code });
      await expect(regenerateJoinLink(testDb(), actor, {}, T0)).rejects.toMatchObject({ code });
    }
    expect((await getSettings(testDb(), await actors.admin())).joinToken).toBe("old-token-000000000000");
  });

  it("an admin reads and updates the name and time zone; data_version increments", async () => {
    const admin = await actors.admin();
    const v0 = await dataVersion();
    await updateSettings(testDb(), admin, { name: "Renamed Space", timezone: "America/Toronto" }, T0 + 5);
    expect(await getSettings(testDb(), admin)).toMatchObject({
      name: "Renamed Space",
      timezone: "America/Toronto",
      dataVersion: v0 + 1,
    });
    await updateSettings(testDb(), admin, { timezone: "UTC" }, T0 + 6);
    expect(await getSettings(testDb(), admin)).toMatchObject({ name: "Renamed Space", timezone: "UTC" });
    expect(await dataVersion()).toBe(v0 + 2);
  });

  it("an invalid time zone or name → VALIDATION_FAILED, nothing changes", async () => {
    const admin = await actors.admin();
    const v0 = await dataVersion();
    await expect(updateSettings(testDb(), admin, { timezone: "Mars/Olympus" }, T0)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { timezone: expect.any(Array) },
    });
    await expect(updateSettings(testDb(), admin, { name: "x" }, T0)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { name: expect.any(Array) },
    });
    await expect(updateSettings(testDb(), admin, {}, T0)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await dataVersion()).toBe(v0);
  });

  it("regenerating the join link replaces the token, records when, and bumps data_version", async () => {
    const admin = await actors.admin();
    const v0 = await dataVersion();
    const { joinToken } = await regenerateJoinLink(testDb(), admin, {}, T0 + 99);
    expect(joinToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await getSettings(testDb(), admin)).toMatchObject({ joinToken, joinTokenRotatedAt: T0 + 99, dataVersion: v0 + 1 });
  });
});
