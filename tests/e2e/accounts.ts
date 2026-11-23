import type { BrowserContext, Page } from "@playwright/test";
import { join } from "node:path";

/**
 * Accounts shared by the E2E specs. The database is thrown away after every
 * run, so fixed credentials are fine. auth.spec.ts (the "setup" project, run
 * first) signs the admin up, completes Setup and ends on ADMIN_PASSWORD.
 */
export const MAKERSPACE_NAME = "Demo Makerspace";
export const ADMIN = {
  name: "Demo Admin",
  email: "admin@e2e.test",
  firstPassword: "first-password-1",
  password: "second-password-2",
};

/** Saved signed-in state of the admin, written by auth.spec.ts. */
export const ADMIN_STATE = join(process.env.E2E_STATE_DIR ?? "test-results/.e2e-state", "admin.json");

export const uniqueEmail = (label: string) => `${label}-${crypto.randomUUID().slice(0, 8)}@e2e.test`;

/** Sign in through Better Auth's API (same origin, so its CSRF check passes). Cookies land in the context. */
export async function apiSignIn(context: BrowserContext, baseURL: string, email: string, password: string) {
  const res = await context.request.post("/api/auth/sign-in/email", {
    data: { email, password },
    headers: { origin: baseURL },
  });
  if (!res.ok()) throw new Error(`sign-in failed: ${res.status()}`);
}

/** Sign up through Better Auth's API (auto sign-in). */
export async function apiSignUp(context: BrowserContext, baseURL: string, name: string, email: string, password: string) {
  const res = await context.request.post("/api/auth/sign-up/email", {
    data: { name, email, password },
    headers: { origin: baseURL },
  });
  if (!res.ok()) throw new Error(`sign-up failed: ${res.status()}`);
}

/** Fill and submit the sign-up form on the current page. */
export async function fillSignUp(page: Page, name: string, email: string, password: string) {
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}

/** Fill and submit the sign-in form on the current page. */
export async function fillSignIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
