import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEXT,
  hasControlChars,
  isSupportedTimeZone,
  joinUrl,
  newToken,
  safeNext,
  toDisplayName,
} from "@/server/domain/identity";
import { DisplayName, SignUpForm } from "@/lib/schemas/identity";

describe("safeNext (P1-49)", () => {
  it.each([
    "//evil.com",
    "//evil.com/machines",
    "https://evil.com",
    "http://evil.com/m/abc",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,hi",
    "/\\evil.com",
    "\\\\evil.com",
    "/m/abc\\..\\x",
    "machines",
    "",
    "/ok\u0000",
    "/ok\nLocation: x",
  ])("%j → the default", (value) => {
    expect(safeNext(value)).toBe(DEFAULT_NEXT);
  });

  it("missing → the default", () => {
    expect(safeNext(undefined)).toBe("/machines");
    expect(safeNext(null)).toBe("/machines");
  });

  it.each([
    ["/m/abc123", "/m/abc123"],
    ["/join/tok_en-1", "/join/tok_en-1"],
    ["/console/members?q=ann", "/console/members?q=ann"],
    ["/machines#top", "/machines#top"],
  ])("keeps a same-site path: %s", (value, expected) => {
    expect(safeNext(value)).toBe(expected);
  });

  it("normalises dot segments without leaving the site", () => {
    expect(safeNext("/m/../../console")).toBe("/console");
  });
});

describe("tokens", () => {
  it("are 128-bit base64url (22 chars) and unique", () => {
    const tokens = new Set(Array.from({ length: 200 }, newToken));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

describe("joinUrl", () => {
  it("builds from the public base URL", () => {
    expect(joinUrl("https://cleared.example.workers.dev", "abc")).toBe("https://cleared.example.workers.dev/join/abc");
    expect(joinUrl("https://cleared.example.workers.dev/", "a/b")).toBe("https://cleared.example.workers.dev/join/a%2Fb");
  });
});

describe("display names", () => {
  it("detects control and bidi characters", () => {
    expect(hasControlChars("Ada Lovelace")).toBe(false);
    expect(hasControlChars("Zoë Ñúñez 李")).toBe(false);
    expect(hasControlChars("A\u0007B")).toBe(true);
    expect(hasControlChars("evil‮gnp.exe")).toBe(true);
    expect(hasControlChars("line break")).toBe(true);
  });

  it("DisplayName trims and enforces 1–80 characters without control characters", () => {
    expect(DisplayName.parse("  Ada  ")).toBe("Ada");
    expect(DisplayName.safeParse("   ").success).toBe(false);
    expect(DisplayName.safeParse("x".repeat(81)).success).toBe(false);
    expect(DisplayName.safeParse("x".repeat(80)).success).toBe(true);
    expect(DisplayName.safeParse("A\u0000B").success).toBe(false);
  });

  it("toDisplayName cleans, cuts and falls back to the email's local part", () => {
    expect(toDisplayName("  Ada\u0007  Lovelace ", "a@x.test")).toBe("Ada Lovelace");
    expect(toDisplayName("", "grace@x.test")).toBe("grace");
    expect(toDisplayName("‮", "@x.test")).toBe("Member");
    expect(Array.from(toDisplayName("😀".repeat(100), "a@x.test"))).toHaveLength(80);
  });

  it("SignUpForm mirrors Better Auth's password limits (8–128) and lowercases the email", () => {
    expect(SignUpForm.safeParse({ name: "A", email: "a@b.test", password: "1234567" }).success).toBe(false);
    expect(SignUpForm.safeParse({ name: "A", email: "a@b.test", password: "x".repeat(129) }).success).toBe(false);
    expect(SignUpForm.parse({ name: "A", email: " A@B.Test ", password: "12345678" }).email).toBe("a@b.test");
  });
});

describe("time zones", () => {
  it("accepts IANA zones the runtime knows, and UTC", () => {
    expect(isSupportedTimeZone("America/Edmonton")).toBe(true);
    expect(isSupportedTimeZone("UTC")).toBe(true);
    expect(isSupportedTimeZone("Mars/Olympus")).toBe(false);
    expect(isSupportedTimeZone("")).toBe(false);
  });
});
