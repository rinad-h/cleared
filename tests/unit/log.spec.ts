import { afterEach, describe, expect, it, vi } from "vitest";
import { errorDetails, isSensitiveKey, log, redact } from "@/server/log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log()", () => {
  it("writes one JSON line with level, event and fields", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("info", "session.started", { machineId: "m1", durationMin: 30 });
    expect(spy).toHaveBeenCalledOnce();
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({
      level: "info",
      event: "session.started",
      machineId: "m1",
      durationMin: 30,
    });
  });

  it("routes warn and error to console.warn / console.error", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    log("warn", "a");
    log("error", "b");
    expect(warn).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });

  it("never lets a field overwrite level or event", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("info", "email.webhook", { level: "error", event: "delivered" });
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ level: "info", event: "email.webhook" });
  });

  it("adds PII-free error details when an error is passed", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log("error", "action.failed", { code: "INTERNAL" }, new TypeError("bad value from sam@example.com"));
    const line = spy.mock.calls[0][0] as string;
    expect(JSON.parse(line).error.name).toBe("TypeError");
    expect(line).not.toContain("example.com");
  });
});

describe("redaction", () => {
  it.each([
    "email", "userEmail", "user_email", "displayName", "name", "token", "qrToken", "resetUrl",
    "url", "link", "message", "description", "ip", "userAgent", "apiKey", "password", "to", "pathname",
  ])("redacts %s", (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(["machineId", "memberId", "tokenCount", "noteId", "code", "durationMin", "context", "status", "emailCount"])(
    "keeps %s",
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    },
  );

  it("replaces sensitive values and keeps the rest", () => {
    expect(redact({ email: "a@b.c", machineId: "m1", token: null })).toEqual({
      email: "[redacted]",
      machineId: "m1",
      token: null,
    });
  });
});

describe("errorDetails()", () => {
  it("keeps names, stack frames, Drizzle SQL and D1 causes, but no messages or params", () => {
    const cause = new Error("D1_ERROR: UNIQUE constraint failed: user.email: SQLITE_CONSTRAINT");
    const err = Object.assign(new Error("Failed query: insert into user (email) values (?)\nparams: sam@example.com", { cause }), {
      name: "DrizzleQueryError",
      query: "insert into user (email) values (?)",
      params: ["sam@example.com"],
    });
    const details = errorDetails(err);
    expect(details).toMatchObject({
      name: "DrizzleQueryError",
      causeName: "Error",
      cause: cause.message,
      query: "insert into user (email) values (?)",
    });
    expect(JSON.stringify(details)).not.toContain("sam@example.com");
  });

  it("drops cause messages that aren't from D1/SQLite", () => {
    const err = new Error("x", { cause: new Error("fetch failed for https://api.example/reset?token=abc") });
    expect(errorDetails(err)).not.toHaveProperty("cause");
  });

  it("handles non-Error values", () => {
    expect(errorDetails("boom")).toEqual({ name: "string" });
  });
});
