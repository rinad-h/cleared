// P1-52: the first user signs up, runs Setup, signs out, fails and succeeds at
// signing in, changes their password and signs in with it. Runs first (the
// "setup" project) because Setup happens once per database; it leaves the
// admin's signed-in state for the other specs.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test } from "./fixtures";
import { ADMIN, ADMIN_STATE, MAKERSPACE_NAME, fillSignIn, fillSignUp } from "./accounts";

test.describe.configure({ mode: "serial" });
// Wrong passwords (401/400) and a duplicate sign-up (422) are tested on purpose;
// the browser logs those failed requests.
test.use({ allowedBrowserErrors: [/Failed to load resource: the server responded with a status of (400|401|422)/] });

test("sign up → setup → sign out → wrong password → sign in → change password → sign in again", async ({ page }) => {
  // Signed out: a protected page sends you to sign-in, keeping where you were going.
  await page.goto("/machines");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fmachines$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Forgot your password? Ask staff to reset it.")).toBeVisible();

  // Sign up (the link carries `next`); signed in straight away.
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/sign-up\?next=%2Fmachines$/);
  await fillSignUp(page, ADMIN.name, ADMIN.email, ADMIN.firstPassword);

  // No makerspace yet: the gate sends the first user to Setup. The warm-up
  // can't compile the signed-in board page, so its first visit compiles it here.
  await expect(page).toHaveURL(/\/setup$/, { timeout: 30_000 });
  await page.getByLabel("Makerspace name").fill(MAKERSPACE_NAME);
  await expect(page.getByLabel("Time zone")).toHaveValue("America/Edmonton");
  await page.getByRole("button", { name: "Finish setup" }).click();

  // The new admin lands on Settings with the join link.
  await expect(page).toHaveURL(/\/console\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Current join link")).toHaveValue(/\/join\/[A-Za-z0-9_-]{22}$/);

  // Setup is closed now.
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/machines$/);

  // Sign out from the account page.
  await page.goto("/me/account");
  await expect(page.getByText(ADMIN.email)).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByText(MAKERSPACE_NAME)).toBeVisible();

  // Wrong password: one generic message.
  await fillSignIn(page, ADMIN.email, "not-the-password");
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  // Unknown email: the same message.
  await page.getByLabel("Email").fill("nobody@e2e.test");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();

  // Right password.
  await fillSignIn(page, ADMIN.email, ADMIN.firstPassword);
  await expect(page).toHaveURL(/\/machines$/);
  await expect(page.getByRole("heading", { level: 1, name: "Machines" })).toBeVisible();

  // Change password (wrong current password first).
  await page.goto("/me/account");
  await page.getByLabel("Current password").fill("wrong-current-1");
  await page.getByLabel("New password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your current password is incorrect.")).toBeVisible();
  await page.getByLabel("Current password").fill(ADMIN.firstPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed.")).toBeVisible();

  // Sign out, then the old password fails and the new one works.
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await fillSignIn(page, ADMIN.email, ADMIN.firstPassword);
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await fillSignIn(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/machines$/);
});

test("sign-in honours a safe `next` and ignores an unsafe one", async ({ page }) => {
  await page.goto("/sign-in?next=%2F%2Fevil.example");
  await fillSignIn(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/machines$/);

  await page.goto("/sign-in?next=%2Fconsole%2Fmembers");
  // Already signed in: carried straight on.
  await expect(page).toHaveURL(/\/console\/members$/);
});

test("signing up with a registered email says so and links to sign-in", async ({ page }) => {
  await page.goto("/sign-up");
  await fillSignUp(page, "Someone Else", ADMIN.email, "another-password-3");
  await expect(page.getByText("An account with this email already exists.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in instead" })).toHaveAttribute(
    "href",
    /\/sign-in\?next=%2Fmachines&email=admin%40e2e\.test$/,
  );
});

test("save the admin's session and warm up the signed-in routes", async ({ page, context }) => {
  await page.goto("/sign-in");
  await fillSignIn(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/machines$/);
  // Compile each signed-in route once before the parallel specs start (cold dev server).
  for (const path of [
    "/machines",
    "/me/certifications",
    "/me/account",
    "/m/warm-up",
    "/console",
    "/console/members",
    "/console/settings",
    "/console/faults",
    "/console/certifications",
    "/console/rooms",
    "/console/machines",
    "/console/machines/new",
    "/console/labels",
    "/console/door-poster",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
  }
  mkdirSync(dirname(ADMIN_STATE), { recursive: true });
  await context.storageState({ path: ADMIN_STATE });
});
