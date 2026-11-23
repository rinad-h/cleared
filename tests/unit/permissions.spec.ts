import { describe, expect, it } from "vitest";
import { can, canChangeStatusOf, PERMISSIONS, roleCan, type Permission } from "@/lib/permissions";
import type { Actor } from "@/server/domain/actor";
import type { Role } from "@/server/domain/enums";

// PRD Section 9, row by row: [admin, staff, member].
const MATRIX: Record<Permission, [boolean, boolean, boolean]> = {
  useMemberApp: [true, true, true],
  viewConsole: [true, true, false],
  signOff: [true, true, false],
  manageMachineOps: [true, true, false],
  manageCatalogBasics: [true, true, false],
  suspendMembers: [true, true, false],
  manageCertifications: [true, false, false],
  changeRoles: [true, false, false],
  suspendStaff: [true, false, false],
  manageSettings: [true, false, false],
};

const member = (role: Role, status: "active" | "suspended" = "active"): Actor => ({
  kind: "member",
  memberId: "m",
  userId: "u",
  role,
  status,
  displayName: "X",
});

describe("permission matrix (PRD Section 9)", () => {
  it("lists exactly the matrix rows", () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(Object.keys(MATRIX).sort());
  });

  it.each(Object.entries(MATRIX))("%s", (permission, [admin, staff, m]) => {
    expect(roleCan("admin", permission as Permission)).toBe(admin);
    expect(roleCan("staff", permission as Permission)).toBe(staff);
    expect(roleCan("member", permission as Permission)).toBe(m);
  });

  it("only active members have any permission", () => {
    for (const permission of Object.keys(MATRIX) as Permission[]) {
      expect(can({ kind: "anonymous" }, permission)).toBe(false);
      expect(can({ kind: "user", userId: "u", email: "e", name: "n" }, permission)).toBe(false);
      expect(can(member("admin", "suspended"), permission)).toBe(false);
    }
  });

  it("status changes: staff only for member-role users, admins for everyone", () => {
    expect(canChangeStatusOf(member("staff"), "member")).toBe(true);
    expect(canChangeStatusOf(member("staff"), "staff")).toBe(false);
    expect(canChangeStatusOf(member("staff"), "admin")).toBe(false);
    expect(canChangeStatusOf(member("admin"), "admin")).toBe(true);
    expect(canChangeStatusOf(member("member"), "member")).toBe(false);
  });
});
