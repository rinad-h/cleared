/**
 * Service errors shared by server actions, pages and route handlers
 * (docs/phases/README.md §4.3). Pure module: no Next.js, no database.
 */

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "FORBIDDEN_FIELD",
  "NOT_A_MEMBER",
  "SUSPENDED",
  "NOT_FOUND",
  "MACHINE_BUSY",
  "MACHINE_RETIRED",
  "MACHINE_OUT_OF_SERVICE",
  "OPEN_OOS_FAULT",
  "SETUP_ALREADY_DONE",
  "SETUP_NOT_DONE",
  "INVALID_JOIN_LINK",
  "LAST_ADMIN",
  "CANNOT_SUSPEND_SELF",
  "CONFLICT_RETRY",
  "RATE_LIMITED",
  "DAILY_LIMIT",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type FieldErrors = Record<string, string[] | undefined>;

export class ServiceError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: FieldErrors;

  constructor(code: ErrorCode, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: ErrorCode; fieldErrors?: FieldErrors };

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Try again.";
export const DAILY_LIMIT_MESSAGE =
  "Cleared is over its free daily limit. It's back after the daily reset (00:00 UTC).";

/**
 * D1 reports a used-up daily free quota only through the error message
 * (e.g. "D1_ERROR: Your account has exceeded D1's free tier daily row read
 * limit"), so it is matched by text. The match must name D1's row read/write
 * limit, or D1 together with a daily limit/quota: other "daily limit" messages
 * (another service's quota) are different problems.
 */
function isD1DailyLimitMessage(message: string): boolean {
  if (/daily[\s_-]*(row[\s_-]*)?(read|write)[\s_-]*limit/i.test(message)) return true;
  if (/\brows?[\s_-]*(read|written)\b[^.]*\bdaily\b/i.test(message)) return true;
  return /\bD1(_ERROR)?\b/.test(message) && /\bdaily\b/i.test(message) && /\b(limit|quota)\b/i.test(message);
}

/**
 * Drizzle wraps D1 errors as "Failed query: <sql> params: <values>". That text
 * includes what users typed, so it is never matched; only the wrapped causes are.
 */
function isQueryWrapper(err: Error): boolean {
  return err.name === "DrizzleQueryError" || err.message.startsWith("Failed query:");
}

export function isDailyLimitError(err: unknown): boolean {
  if (err instanceof ServiceError) return err.code === "DAILY_LIMIT";
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth++) {
    if (current instanceof Error) {
      if (!isQueryWrapper(current) && isD1DailyLimitMessage(current.message)) return true;
      current = current.cause;
    } else {
      return depth === 0 && isD1DailyLimitMessage(String(current));
    }
  }
  return false;
}

/** Map any thrown value to a safe `ActionResult` failure. Never leaks stack traces or raw messages. */
export function toActionError(err: unknown): Extract<ActionResult<never>, { ok: false }> {
  if (err instanceof ServiceError) {
    return {
      ok: false,
      error: err.message,
      code: err.code,
      ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
    };
  }
  if (isDailyLimitError(err)) {
    return { ok: false, error: DAILY_LIMIT_MESSAGE, code: "DAILY_LIMIT" };
  }
  return { ok: false, error: GENERIC_ERROR_MESSAGE, code: "INTERNAL" };
}

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  FORBIDDEN_FIELD: 403,
  NOT_A_MEMBER: 403,
  SUSPENDED: 403,
  NOT_FOUND: 404,
  MACHINE_BUSY: 409,
  MACHINE_RETIRED: 409,
  MACHINE_OUT_OF_SERVICE: 409,
  OPEN_OOS_FAULT: 409,
  SETUP_ALREADY_DONE: 409,
  SETUP_NOT_DONE: 409,
  INVALID_JOIN_LINK: 404,
  LAST_ADMIN: 409,
  CANNOT_SUSPEND_SELF: 403,
  CONFLICT_RETRY: 409,
  RATE_LIMITED: 429,
  DAILY_LIMIT: 503,
  INTERNAL: 500,
};

export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS[code];
}

/** For route handlers: a JSON error response with the matching HTTP status. */
export function toHttp(err: unknown): Response {
  const { error, code, fieldErrors } = toActionError(err);
  return Response.json(
    { error, code, ...(fieldErrors ? { fieldErrors } : {}) },
    { status: httpStatusFor(code), headers: { "Cache-Control": "no-store" } },
  );
}
