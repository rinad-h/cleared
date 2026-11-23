import { createAuthClient } from "better-auth/react";

/**
 * Better Auth's browser client. Same origin as the app, so no `baseURL`.
 * Use `signUpWithRetry` / `signInWithRetry` for those two flows.
 */
export const authClient = createAuthClient();

export type AuthError = { status: number; code?: string; message?: string };
export type AuthResult = { error: AuthError | null };

export const BUSY_RETRY_DELAYS_MS = [300, 800] as const;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retry a sign-up or sign-in that got **503**: under a burst, password hashing
 * can go over the Worker CPU limit and Cloudflare answers 503 (Error 1102)
 * before the handler writes anything (Phase 1 §4.1, P1-12). At most two
 * retries (~300 ms, then ~800 ms). Never retries 4xx (wrong password, rate
 * limited, already registered) or other statuses.
 *
 * `retried` tells sign-up that an "already exists" answer may come from its own
 * first attempt, which finished after all.
 */
export async function withBusyRetry<T extends AuthResult>(
  call: () => Promise<T>,
  options: { delays?: readonly number[]; wait?: (ms: number) => Promise<void> } = {},
): Promise<{ result: T; retried: boolean }> {
  const delays = options.delays ?? BUSY_RETRY_DELAYS_MS;
  const wait = options.wait ?? sleep;
  let result = await call();
  let attempt = 0;
  while (result.error?.status === 503 && attempt < delays.length) {
    await wait(delays[attempt]);
    attempt++;
    result = await call();
  }
  return { result, retried: attempt > 0 };
}

export function signUpWithRetry(input: { name: string; email: string; password: string }) {
  return withBusyRetry(() => authClient.signUp.email(input));
}

export function signInWithRetry(input: { email: string; password: string }) {
  return withBusyRetry(() => authClient.signIn.email(input));
}

export const BUSY_MESSAGE = "Cleared is busy, try again.";
export const GENERIC_AUTH_MESSAGE = "Something went wrong. Try again.";

/** The message shown for a failed sign-in. One generic message for a wrong email or password (Phase 1 D5). */
export function signInErrorMessage(error: AuthError): string {
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (error.status === 503) return BUSY_MESSAGE;
  if (error.status === 401 || error.status === 400 || error.status === 403) return "Email or password is incorrect.";
  return GENERIC_AUTH_MESSAGE;
}

export function isAlreadyRegistered(error: AuthError): boolean {
  return error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" || error.code === "USER_ALREADY_EXISTS";
}

/** The message shown for a failed sign-up. */
export function signUpErrorMessage(error: AuthError): string {
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (error.status === 503) return BUSY_MESSAGE;
  if (isAlreadyRegistered(error)) return "An account with this email already exists.";
  if (error.code === "PASSWORD_TOO_SHORT") return "Use at least 8 characters.";
  if (error.code === "PASSWORD_TOO_LONG") return "Use at most 128 characters.";
  if (error.code === "INVALID_EMAIL") return "Enter a valid email address.";
  if (error.status === 400 && error.message) return "Check your name, email and password.";
  return GENERIC_AUTH_MESSAGE;
}
