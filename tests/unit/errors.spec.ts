import { afterEach, describe, expect, it, vi } from "vitest";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { parse, run } from "@/lib/action";
import { formArray } from "@/lib/validation";
import {
  DAILY_LIMIT_MESSAGE,
  ERROR_CODES,
  GENERIC_ERROR_MESSAGE,
  ServiceError,
  httpStatusFor,
  isDailyLimitError,
  toActionError,
  toHttp,
  type ErrorCode,
} from "@/server/domain/errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toActionError", () => {
  it("maps a ServiceError to an ActionResult with its code, message and field errors", () => {
    const err = new ServiceError("VALIDATION_FAILED", "Check the highlighted fields.", {
      name: ["Required"],
    });
    expect(toActionError(err)).toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      error: "Check the highlighted fields.",
      fieldErrors: { name: ["Required"] },
    });
  });

  it("omits fieldErrors when the ServiceError has none", () => {
    expect(toActionError(new ServiceError("NOT_FOUND", "Machine not found."))).toEqual({
      ok: false,
      code: "NOT_FOUND",
      error: "Machine not found.",
    });
  });

  it.each([
    "D1_ERROR: Exceeded daily row read limit",
    "D1_ERROR: Your account has exceeded D1's free tier daily row read limit",
    "Your account has exceeded the daily limit for D1",
    "D1 DB is over its free daily limit",
    "daily_write_limit reached",
  ])("maps a D1 daily-limit error to DAILY_LIMIT: %s", (message) => {
    const err = new Error(message);
    expect(isDailyLimitError(err)).toBe(true);
    expect(toActionError(err)).toEqual({ ok: false, code: "DAILY_LIMIT", error: DAILY_LIMIT_MESSAGE });
  });

  it("detects a daily-limit error wrapped as a cause (Drizzle wraps D1 errors)", () => {
    const err = new Error("Failed query: select 1", { cause: new Error("Exceeded daily row read limit") });
    expect(toActionError(err).code).toBe("DAILY_LIMIT");
  });

  it("maps unknown errors to a generic message without leaking details", () => {
    const err = new Error("SQLITE_CONSTRAINT: UNIQUE constraint failed: user.email (secret@example.com)");
    const result = toActionError(err);
    expect(result).toEqual({ ok: false, code: "INTERNAL", error: GENERIC_ERROR_MESSAGE });
    expect(JSON.stringify(result)).not.toContain("example.com");
    expect(JSON.stringify(result)).not.toContain("SQLITE");
  });

  it("handles thrown non-Error values", () => {
    expect(toActionError("boom")).toEqual({ ok: false, code: "INTERNAL", error: GENERIC_ERROR_MESSAGE });
    expect(toActionError(undefined).code).toBe("INTERNAL");
  });

  it("finds a daily-limit error several causes deep", () => {
    const d1 = new Error("D1_ERROR: Exceeded daily row read limit");
    const err = new Error("service failed", { cause: new Error("Failed query: select 1", { cause: d1 }) });
    expect(isDailyLimitError(err)).toBe(true);
  });

  it.each([
    "too many SQL variables",
    "Too many API requests by single worker invocation",
    "Upstream API: you have exceeded your daily request limit",
    "QUOTA exceeded: daily quota reached",
    "Worker exceeded CPU time limit",
  ])("doesn't treat other limits as the D1 daily limit: %s", (message) => {
    expect(isDailyLimitError(new Error(message))).toBe(false);
  });

  it("never matches the SQL params Drizzle puts in its message (user text)", () => {
    const wrapper = new Error(
      "Failed query: insert into faults (description) values (?)\nparams: The D1 laser exceeded its daily limit",
      { cause: new Error("D1_ERROR: CHECK constraint failed: faults.severity") },
    );
    wrapper.name = "DrizzleQueryError";
    expect(isDailyLimitError(wrapper)).toBe(false);
    expect(toActionError(wrapper).code).toBe("INTERNAL");
  });
});

describe("run()", () => {
  it("wraps a successful result", async () => {
    await expect(run(async () => 42)).resolves.toEqual({ ok: true, data: 42 });
  });

  it("returns the ServiceError as an ActionResult", async () => {
    const result = await run(async () => {
      throw new ServiceError("LAST_ADMIN", "At least one admin must remain.");
    });
    expect(result).toEqual({ ok: false, code: "LAST_ADMIN", error: "At least one admin must remain." });
  });

  it("returns a generic message for unknown errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await run(async () => {
      throw new TypeError("cannot read properties of undefined");
    });
    expect(result).toEqual({ ok: false, code: "INTERNAL", error: GENERIC_ERROR_MESSAGE });
  });

  it("rethrows redirect() so Next.js can redirect", async () => {
    const err = await run(async () => redirect("/machines")).catch((e: unknown) => e);
    expect((err as { digest?: string }).digest).toMatch(/^NEXT_REDIRECT/);
  });

  it("rethrows notFound() so Next.js can render the 404 page", async () => {
    const err = await run(async () => notFound()).catch((e: unknown) => e);
    expect((err as { digest?: string }).digest).toMatch(/^NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it("logs unexpected errors once, without the error message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(async () => {
      throw new Error("UNIQUE constraint failed for secret@example.com");
    });
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    expect(JSON.parse(line)).toMatchObject({ level: "error", event: "action.failed", code: "INTERNAL", error: { name: "Error" } });
    expect(line).not.toContain("example.com");
  });

  it("doesn't log expected ServiceErrors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await run(async () => {
      throw new ServiceError("NOT_FOUND", "Machine not found.");
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("parse()", () => {
  const Schema = z.object({ name: z.string().trim().min(1, "Enter a name"), count: z.coerce.number().int() });

  it("returns parsed data from FormData", () => {
    const form = new FormData();
    form.set("name", "  Laser  ");
    form.set("count", "3");
    form.set("$ACTION_ID_abc", "");
    expect(parse(Schema, form)).toEqual({ name: "Laser", count: 3 });
  });

  it("skips every Next.js $ACTION_ field", () => {
    const form = new FormData();
    form.set("name", "Laser");
    form.set("count", "1");
    form.set("$ACTION_REF_1", "");
    form.set("$ACTION_KEY", "k");
    expect(parse(Schema, form)).toEqual({ name: "Laser", count: 1 });
  });

  describe("repeating fields with formArray()", () => {
    const Certs = z.object({ certs: formArray(z.string()) });
    const form = (...values: string[]) => {
      const f = new FormData();
      for (const v of values) f.append("certs", v);
      return f;
    };

    it.each([
      [[], []],
      [["a"], ["a"]],
      [["a", "b"], ["a", "b"]],
    ])("%j selected → %j", (values, expected) => {
      expect(parse(Certs, form(...values))).toEqual({ certs: expected });
    });
  });

  it("reports nested fields by path and root errors as _form", () => {
    const Nested = z.object({ a: z.object({ b: z.string() }) }).refine(() => false, "Not allowed");
    try {
      parse(Nested, { a: {} });
      expect.unreachable();
    } catch (err) {
      expect((err as ServiceError).fieldErrors?.["a.b"]).toHaveLength(1);
    }
    try {
      parse(Nested, { a: { b: "x" } });
      expect.unreachable();
    } catch (err) {
      expect((err as ServiceError).fieldErrors?._form).toEqual(["Not allowed"]);
    }
  });

  it("throws VALIDATION_FAILED with per-field errors", () => {
    try {
      parse(Schema, { name: "", count: "x" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      const e = err as ServiceError;
      expect(e.code).toBe("VALIDATION_FAILED");
      expect(e.fieldErrors?.name).toEqual(["Enter a name"]);
      expect(e.fieldErrors?.count).toHaveLength(1);
    }
  });
});

describe("error details", () => {
  it("carries safe details (CERT_IN_USE machines) into the ActionResult and the HTTP body", async () => {
    const machines = [{ id: "m1", name: "Laser cutter" }];
    const err = new ServiceError("CERT_IN_USE", "1 machine still requires this certification.", undefined, { machines });
    expect(toActionError(err)).toEqual({
      ok: false,
      code: "CERT_IN_USE",
      error: "1 machine still requires this certification.",
      details: { machines },
    });
    const res = toHttp(err);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "CERT_IN_USE", details: { machines } });
  });
});

describe("HTTP mapping", () => {
  // docs/phases/README.md §4.3. Every code must be listed here, so a new code needs a decision.
  const EXPECTED: Record<ErrorCode, number> = {
    VALIDATION_FAILED: 400,
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    FORBIDDEN_FIELD: 403,
    NOT_A_MEMBER: 403,
    SUSPENDED: 403,
    NOT_FOUND: 404,
    NAME_TAKEN: 409,
    CERT_INACTIVE: 409,
    CERT_IN_USE: 409,
    MACHINE_BUSY: 409,
    MACHINE_RETIRED: 409,
    MACHINE_OUT_OF_SERVICE: 409,
    OPEN_OOS_FAULT: 409,
    SETUP_ALREADY_DONE: 409,
    SETUP_NOT_DONE: 409,
    INVALID_JOIN_LINK: 404,
    LAST_ADMIN: 409,
    CANNOT_SUSPEND_SELF: 403,
    SELF_SIGN_OFF: 403,
    SELF_REVOKE: 403,
    MEMBER_SUSPENDED: 409,
    ALREADY_REVOKED: 409,
    IDEMPOTENCY_MISMATCH: 409,
    NOT_CLEARED: 403,
    SUPERVISION_ACK_REQUIRED: 409,
    ALREADY_IN_SESSION: 409,
    PASS_CHANGED: 409,
    SESSION_ENDED: 409,
    SESSION_AT_MAX: 409,
    CONFLICT_RETRY: 409,
    RATE_LIMITED: 429,
    DAILY_LIMIT: 503,
    INTERNAL: 500,
  };

  it("covers exactly the defined error codes", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ERROR_CODES].sort());
  });

  it.each(Object.entries(EXPECTED))("%s → %i", (code, status) => {
    expect(httpStatusFor(code as ErrorCode)).toBe(status);
  });

  it("toHttp maps the D1 daily limit to 503 DAILY_LIMIT (error.tsx relies on it)", async () => {
    const res = toHttp(new Error("D1_ERROR: Exceeded daily row read limit"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: "DAILY_LIMIT", error: DAILY_LIMIT_MESSAGE });
  });

  it("toHttp includes field errors", async () => {
    const res = toHttp(new ServiceError("VALIDATION_FAILED", "Check the fields.", { name: ["Required"] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      code: "VALIDATION_FAILED",
      error: "Check the fields.",
      fieldErrors: { name: ["Required"] },
    });
  });

  it("toHttp returns a JSON body with the code and no stack", async () => {
    const res = toHttp(new Error("internal detail"));
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ code: "INTERNAL", error: GENERIC_ERROR_MESSAGE });
  });
});
