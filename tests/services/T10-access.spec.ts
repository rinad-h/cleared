// PRD T10 (Phase 1 part): FR-01–FR-03 and Section 9, at the service layer.
// Phase 2 adds the catalog parts (rooms, machines, certifications).
import { beforeEach, describe, expect, it } from "vitest";
import { joinMakerspace } from "@/server/services/join";
import { getMember, searchMembers, updateMember } from "@/server/services/members";
import { getSettings, regenerateJoinLink, updateSettings } from "@/server/services/settings";
import { completeSetup } from "@/server/services/setup";
import { actors, createMakerspace, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { T0 } from "../helpers/time";

beforeEach(() => resetIdentity());

const db = () => testDb();

describe("T10 — access control (Phase 1)", () => {
  it("signed out → UNAUTHENTICATED (401) on every service", async () => {
    await createMakerspace();
    const anon = actors.anonymous();
    const id = crypto.randomUUID();
    const calls = [
      () => completeSetup(db(), anon, { makerspaceName: "X Space", timezone: "UTC" }, T0),
      () => joinMakerspace(db(), anon, { token: "t" }, T0),
      () => searchMembers(db(), anon, {}),
      () => getMember(db(), anon, id),
      () => updateMember(db(), anon, { id, status: "suspended" }, T0),
      () => getSettings(db(), anon),
      () => updateSettings(db(), anon, { name: "New" }, T0),
      () => regenerateJoinLink(db(), anon, {}, T0),
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("members → FORBIDDEN (403) on console services", async () => {
    await createMakerspace();
    const m = await actors.member();
    const other = await actors.member();
    const calls = [
      () => searchMembers(db(), m, {}),
      () => getMember(db(), m, other.memberId),
      () => updateMember(db(), m, { id: other.memberId, status: "suspended" }, T0),
      () => getSettings(db(), m),
    ];
    for (const call of calls) await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("staff → 403 on admin-only fields (FORBIDDEN_FIELD) and admin-only services (FORBIDDEN)", async () => {
    await createMakerspace();
    const staff = await actors.staff();
    const m = await actors.member();
    await expect(updateMember(db(), staff, { id: m.memberId, role: "admin" }, T0)).rejects.toMatchObject({
      code: "FORBIDDEN_FIELD",
    });
    await expect(getSettings(db(), staff)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateSettings(db(), staff, { name: "New" }, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(regenerateJoinLink(db(), staff, {}, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("staff can suspend members but not staff or admins", async () => {
    await createMakerspace();
    const staff = await actors.staff();
    const [m, s, a] = await Promise.all([actors.member(), actors.staff(), actors.admin()]);
    await expect(updateMember(db(), staff, { id: m.memberId, status: "suspended" }, T0)).resolves.toMatchObject({
      status: "suspended",
    });
    for (const target of [s, a]) {
      await expect(updateMember(db(), staff, { id: target.memberId, status: "suspended" }, T0)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  });

  it("the last admin can't be demoted", async () => {
    await createMakerspace();
    const admin = await actors.admin();
    await expect(updateMember(db(), admin, { id: admin.memberId, role: "member" }, T0)).rejects.toMatchObject({
      code: "LAST_ADMIN",
    });
  });

  it("a regenerated join link invalidates the old one", async () => {
    const { joinToken } = await createMakerspace();
    await regenerateJoinLink(db(), await actors.admin(), {}, T0);
    await expect(joinMakerspace(db(), await actors.nonMember(), { token: joinToken }, T0)).rejects.toMatchObject({
      code: "INVALID_JOIN_LINK",
    });
  });

  it("setup can't be rerun", async () => {
    await completeSetup(db(), await actors.nonMember(), { makerspaceName: "First", timezone: "UTC" }, T0);
    await expect(
      completeSetup(db(), await actors.nonMember(), { makerspaceName: "Second", timezone: "UTC" }, T0),
    ).rejects.toMatchObject({ code: "SETUP_ALREADY_DONE" });
  });
});
