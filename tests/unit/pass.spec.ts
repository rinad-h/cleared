// T02 (table-driven, pure): computePass precedence, grant validity, addMonthsUtc.
import { describe, expect, it } from "vitest";
import { bestGrant, certState, isGrantValid, latestGrant, type GrantRow } from "@/server/domain/grants";
import { computePass, type PassInput, type Viewer } from "@/server/domain/pass";
import { addMonthsUtc, expiryFor } from "@/server/domain/time";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const DAY = 86_400_000;
const A = { id: "cert-a", name: "Laser basics", trainingUrl: "https://example.test/a" };
const B = { id: "cert-b", name: "Lathe basics", trainingUrl: null };

const member = (over: Partial<Extract<Viewer, { kind: "member" }>> = {}): Viewer => ({
  kind: "member",
  memberId: "m1",
  role: "member",
  status: "active",
  displayName: "Demo Student 1",
  ...over,
});

let n = 0;
const grant = (certificationId: string, over: Partial<GrantRow> = {}): GrantRow => ({
  id: `g${++n}`,
  certificationId,
  grantedAt: NOW - 10 * DAY,
  expiresAt: null,
  revokedAt: null,
  ...over,
});

const pass = (over: Partial<PassInput>) =>
  computePass({
    now: NOW,
    machine: { status: "available", supervised: false },
    requirements: [A],
    viewer: member(),
    grants: [],
    ...over,
  });

describe("computePass precedence (FR-09)", () => {
  const cases: [string, Partial<PassInput>, { status: string; reason?: string; missing?: string[] }][] = [
    ["no grant → missing A", {}, { status: "NOT_CLEARED", reason: "missing_certifications", missing: ["cert-a"] }],
    ["valid A → cleared", { grants: [grant("cert-a")] }, { status: "CLEARED" }],
    ["A + B, only A → missing B", { requirements: [A, B], grants: [grant("cert-a")] }, { status: "NOT_CLEARED", missing: ["cert-b"] }],
    ["no requirements → cleared", { requirements: [] }, { status: "CLEARED" }],
    ["no requirements, supervised member → supervision", { requirements: [], machine: { status: "available", supervised: true } }, { status: "SUPERVISION_REQUIRED" }],
    ["supervised, member with certs", { machine: { status: "available", supervised: true }, grants: [grant("cert-a")] }, { status: "SUPERVISION_REQUIRED" }],
    ["supervised, staff with certs", { machine: { status: "available", supervised: true }, viewer: member({ role: "staff" }), grants: [grant("cert-a")] }, { status: "CLEARED" }],
    ["supervised, admin with certs", { machine: { status: "available", supervised: true }, viewer: member({ role: "admin" }), grants: [grant("cert-a")] }, { status: "CLEARED" }],
    ["supervised, staff without certs", { machine: { status: "available", supervised: true }, viewer: member({ role: "staff" }) }, { status: "NOT_CLEARED", reason: "missing_certifications" }],
    ["non-member", { viewer: { kind: "none" } }, { status: "NOT_CLEARED", reason: "not_member" }],
    ["suspended with all certs", { viewer: member({ status: "suspended" }), grants: [grant("cert-a")] }, { status: "NOT_CLEARED", reason: "suspended" }],
    ["out of service, member", { machine: { status: "out_of_service", supervised: false } }, { status: "OUT_OF_SERVICE" }],
    ["out of service, non-member", { machine: { status: "out_of_service", supervised: true }, viewer: { kind: "none" } }, { status: "OUT_OF_SERVICE" }],
    ["out of service, suspended", { machine: { status: "out_of_service", supervised: false }, viewer: member({ status: "suspended" }) }, { status: "OUT_OF_SERVICE" }],
  ];
  it.each(cases)("%s", (_name, input, expected) => {
    const result = pass(input);
    expect(result.status).toBe(expected.status);
    if (expected.reason) expect(result.notClearedReason).toBe(expected.reason);
    if (expected.missing) expect(result.missing.map((m) => m.id)).toEqual(expected.missing);
    if (result.notClearedReason !== "missing_certifications") expect(result.missing).toEqual([]);
  });

  it("lists each missing certification with its training link and why", () => {
    const result = pass({
      requirements: [A, B],
      grants: [grant("cert-a", { expiresAt: NOW - 1 }), grant("cert-b", { revokedAt: NOW - DAY })],
    });
    expect(result.missing).toEqual([
      { ...A, state: "expired", since: NOW - 1 },
      { ...B, state: "revoked", since: NOW - DAY },
    ]);
  });

  it("earliestExpiry is the earlier best-grant expiry; null when nothing expires or not certified", () => {
    const g = [grant("cert-a", { expiresAt: NOW + 90 * DAY }), grant("cert-b", { expiresAt: NOW + 30 * DAY })];
    expect(pass({ requirements: [A, B], grants: g }).earliestExpiry).toBe(NOW + 30 * DAY);
    expect(pass({ grants: [grant("cert-a")] }).earliestExpiry).toBeNull();
    expect(pass({ requirements: [A, B], grants: [g[0]!] }).earliestExpiry).toBeNull();
  });

  it("the best grant wins: a revoked grant next to a newer valid one is cleared", () => {
    const result = pass({ grants: [grant("cert-a", { revokedAt: NOW - DAY }), grant("cert-a", { grantedAt: NOW - DAY, expiresAt: NOW + DAY })] });
    expect(result).toMatchObject({ status: "CLEARED", earliestExpiry: NOW + DAY });
  });

  it("expires at exactly now → not valid; 1 ms later → valid", () => {
    expect(pass({ grants: [grant("cert-a", { expiresAt: NOW })] }).status).toBe("NOT_CLEARED");
    expect(pass({ grants: [grant("cert-a", { expiresAt: NOW + 1 })] }).status).toBe("CLEARED");
  });

  it("certifiedForMachine ignores out-of-service and supervision, but needs an active member", () => {
    const certs = { grants: [grant("cert-a")] };
    expect(pass({ ...certs, machine: { status: "out_of_service", supervised: true } }).certifiedForMachine).toBe(true);
    expect(pass({ ...certs, machine: { status: "available", supervised: true } }).certifiedForMachine).toBe(true);
    expect(pass({}).certifiedForMachine).toBe(false);
    expect(pass({ ...certs, viewer: member({ status: "suspended" }) }).certifiedForMachine).toBe(false);
    expect(pass({ viewer: { kind: "none" }, requirements: [] }).certifiedForMachine).toBe(false);
  });

  it("ignores grants for certifications the machine doesn't require", () => {
    expect(pass({ grants: [grant("cert-b")] }).status).toBe("NOT_CLEARED");
  });
});

describe("grant rules", () => {
  it("isGrantValid: revoked or expired is invalid", () => {
    expect(isGrantValid({ expiresAt: null, revokedAt: null }, NOW)).toBe(true);
    expect(isGrantValid({ expiresAt: NOW + 1, revokedAt: null }, NOW)).toBe(true);
    expect(isGrantValid({ expiresAt: NOW, revokedAt: null }, NOW)).toBe(false);
    expect(isGrantValid({ expiresAt: null, revokedAt: NOW - 1 }, NOW)).toBe(false);
  });

  it("bestGrant prefers never-expiring, then the latest expiry", () => {
    const soon = grant("c", { expiresAt: NOW + DAY });
    const later = grant("c", { expiresAt: NOW + 2 * DAY });
    const never = grant("c");
    expect(bestGrant([soon, later], NOW)).toBe(later);
    expect(bestGrant([soon, never, later], NOW)).toBe(never);
    expect(bestGrant([grant("c", { revokedAt: NOW })], NOW)).toBeNull();
  });

  it("latestGrant and certState", () => {
    const old = grant("c", { grantedAt: NOW - 100 * DAY, expiresAt: NOW - 50 * DAY });
    const revoked = grant("c", { grantedAt: NOW - 40 * DAY, revokedAt: NOW - 5 * DAY });
    expect(latestGrant([old, revoked])).toBe(revoked);
    expect(certState([old, revoked], NOW)).toMatchObject({ state: "revoked", since: NOW - 5 * DAY });
    expect(certState([old], NOW)).toMatchObject({ state: "expired", since: NOW - 50 * DAY });
    expect(certState([], NOW)).toEqual({ state: "none", grant: null, since: null });
    expect(certState([grant("c", { expiresAt: NOW + 30 * DAY })], NOW).state).toBe("expiring_soon");
    expect(certState([grant("c", { expiresAt: NOW + 31 * DAY })], NOW).state).toBe("valid");
    expect(certState([grant("c")], NOW).state).toBe("valid");
  });
});

describe("addMonthsUtc (T03 #13)", () => {
  const at = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min);
  it.each([
    ["Jan 31 + 1 → Feb 28", at(2027, 1, 31, 15, 30), 1, at(2027, 2, 28, 15, 30)],
    ["leap year: 2028-01-31 + 1 → Feb 29", at(2028, 1, 31), 1, at(2028, 2, 29)],
    ["Dec + 1 → Jan next year", at(2026, 12, 15, 9), 1, at(2027, 1, 15, 9)],
    ["Mar 31 + 1 → Apr 30", at(2026, 3, 31), 1, at(2026, 4, 30)],
    ["Feb 29 + 12 → Feb 28", at(2028, 2, 29), 12, at(2029, 2, 28)],
    ["120 months", at(2026, 1, 5, 16), 120, at(2036, 1, 5, 16)],
    ["Nov 30 + 3 → Feb 28", at(2026, 11, 30), 3, at(2027, 2, 28)],
  ])("%s", (_name, from, months, expected) => {
    expect(addMonthsUtc(from, months)).toBe(expected);
  });

  it("expiryFor: null validity never expires", () => {
    expect(expiryFor(NOW, null)).toBeNull();
    expect(expiryFor(NOW, 12)).toBe(addMonthsUtc(NOW, 12));
  });
});
