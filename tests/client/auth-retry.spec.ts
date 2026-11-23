// P1-51: sign-up/sign-in retry a 503 at most twice, and never retry 4xx.
import { describe, expect, it, vi } from "vitest";
import {
  BUSY_MESSAGE,
  signInErrorMessage,
  signUpErrorMessage,
  withBusyRetry,
  type AuthResult,
} from "@/lib/auth-client";

const ok: AuthResult = { error: null };
const err = (status: number, code?: string): AuthResult => ({ error: { status, code } });

function sequence(...results: AuthResult[]) {
  const call = vi.fn(async () => results[Math.min(call.mock.calls.length - 1, results.length - 1)]);
  return call;
}

const noWait = () => Promise.resolve();

describe("withBusyRetry", () => {
  it("a 503 followed by success: retried once, with the first back-off", async () => {
    const call = sequence(err(503), ok);
    const wait = vi.fn(noWait);
    const { result, retried } = await withBusyRetry(call, { wait });
    expect(result).toBe(ok);
    expect(retried).toBe(true);
    expect(call).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(300);
  });

  it("503 three times: two retries (~300 ms, ~800 ms), then the busy message", async () => {
    const call = sequence(err(503), err(503), err(503), ok);
    const wait = vi.fn(noWait);
    const { result } = await withBusyRetry(call, { wait });
    expect(call).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[300], [800]]);
    expect(result.error?.status).toBe(503);
    expect(signInErrorMessage(result.error!)).toBe(BUSY_MESSAGE);
    expect(signUpErrorMessage(result.error!)).toBe(BUSY_MESSAGE);
  });

  it.each([400, 401, 403, 422, 429, 500, 502])("never retries %i", async (status) => {
    const call = sequence(err(status), ok);
    const { result, retried } = await withBusyRetry(call, { wait: noWait });
    expect(call).toHaveBeenCalledTimes(1);
    expect(retried).toBe(false);
    expect(result.error?.status).toBe(status);
  });

  it("success needs no retry", async () => {
    const call = sequence(ok);
    expect(await withBusyRetry(call, { wait: noWait })).toEqual({ result: ok, retried: false });
  });

  it("uses real timers by default (short back-off)", async () => {
    vi.useFakeTimers();
    try {
      const call = sequence(err(503), ok);
      const promise = withBusyRetry(call);
      await vi.advanceTimersByTimeAsync(300);
      expect((await promise).result).toBe(ok);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("messages", () => {
  it("sign-in: one generic message for a wrong email or password", () => {
    expect(signInErrorMessage({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })).toBe("Email or password is incorrect.");
    expect(signInErrorMessage({ status: 429 })).toMatch(/Too many attempts/);
  });

  it("sign-up: says an account exists", () => {
    expect(signUpErrorMessage({ status: 422, code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" })).toMatch(/already exists/);
  });
});
