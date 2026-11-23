// P1-53: a second account signs up from the join link and joins; the admin
// promotes them to staff, and they see the console. Plus regenerate and suspend.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ADMIN, ADMIN_STATE, MAKERSPACE_NAME, apiSignUp, fillSignUp, uniqueEmail } from "./accounts";

// One makerspace and one join link per run: "regenerate" would break the other
// tests' links if they ran at the same time.
test.describe.configure({ mode: "serial" });

async function currentJoinUrl(admin: Page): Promise<string> {
  await admin.goto("/console/settings");
  return admin.getByLabel("Current join link").inputValue();
}

async function openMember(admin: Page, email: string) {
  await admin.goto("/console/members");
  await admin.getByLabel("Search").fill(email);
  // The search is debounced: wait for it to land before clicking a result.
  await expect(admin).toHaveURL(/\?q=/);
  const row = admin.getByRole("link", { name: new RegExp(email.replace(/[.+]/g, "\\$&")) });
  await expect(row).toBeVisible();
  await row.click();
  await expect(admin).toHaveURL(/\/console\/members\/[0-9a-f-]{36}$/);
}

test("join from the link, get promoted to staff, see the console", async ({ browser }) => {
  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
  const joinUrl = await currentJoinUrl(admin);
  const joinPath = new URL(joinUrl).pathname;

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  const email = uniqueEmail("student");

  // Signed out → sign-in (with next) → "Create an account" → sign up → back on the join page.
  await student.goto(joinPath);
  await expect(student).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(joinPath)}$`));
  await student.getByRole("link", { name: "Create an account" }).click();
  await fillSignUp(student, "Sam Student", email, "student-password-1");
  await expect(student).toHaveURL(new RegExp(`${joinPath}$`));
  await expect(student.getByRole("heading", { level: 1, name: `Join ${MAKERSPACE_NAME}` })).toBeVisible();
  await student.getByRole("button", { name: "Join" }).click();
  await expect(student).toHaveURL(/\/machines$/);
  await expect(student.getByRole("heading", { level: 1, name: "Machines" })).toBeVisible();

  // A member doesn't get the console.
  await student.goto("/console");
  await expect(student.getByRole("heading", { level: 1, name: "Staff only" })).toBeVisible();

  // The admin promotes them to staff.
  await openMember(admin, email);
  await admin.getByRole("combobox", { name: "Role", exact: true }).selectOption("staff");
  await admin.getByRole("button", { name: "Save role" }).click();
  await expect(admin.getByText("Role saved.")).toBeVisible();

  // Staff now see the console switch and the console.
  await student.goto("/machines");
  await student.getByRole("link", { name: "Staff console" }).click();
  await expect(student).toHaveURL(/\/console$/);
  await expect(student.getByRole("heading", { level: 1, name: "Staff console" })).toBeVisible();
  // Staff don't get admin-only settings.
  await student.goto("/console/settings");
  await expect(student.getByRole("heading", { level: 1, name: "Admins only" })).toBeVisible();

  // Re-opening a join link as a member changes nothing.
  await student.goto(joinPath);
  await expect(student).toHaveURL(/\/machines$/);

  await adminContext.close();
  await studentContext.close();
});

test("a signed-in user without a membership sees the join prompt", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await apiSignUp(context, baseURL!, "Nora Nonmember", uniqueEmail("nonmember"), "nonmember-pass-1");
  const page = await context.newPage();
  await page.goto("/machines");
  await expect(page.getByRole("heading", { level: 1, name: "You aren't a member yet" })).toBeVisible();
  await expect(page.getByText("Ask staff for the join link.")).toBeVisible();
  await context.close();
});

test("regenerating the join link invalidates the old one", async ({ browser, baseURL }) => {
  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
  const oldPath = new URL(await currentJoinUrl(admin)).pathname;

  await admin.getByRole("button", { name: "Regenerate" }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Regenerate" }).click();
  await expect(admin.getByText("New join link created.")).toBeVisible();
  await expect(admin.getByLabel("Current join link")).not.toHaveValue(new RegExp(`${oldPath}$`));
  const newPath = new URL(await admin.getByLabel("Current join link").inputValue()).pathname;

  const context = await browser.newContext();
  await apiSignUp(context, baseURL!, "Late Joiner", uniqueEmail("late"), "late-joiner-pass-1");
  const page = await context.newPage();
  await page.goto(oldPath);
  await expect(page.getByRole("heading", { level: 1, name: "This join link isn't valid any more" })).toBeVisible();
  await page.goto(newPath);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page).toHaveURL(/\/machines$/);

  await adminContext.close();
  await context.close();
});

test("a suspended member is locked out until reactivated", async ({ browser, baseURL }) => {
  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
  const joinPath = new URL(await currentJoinUrl(admin)).pathname;

  const context = await browser.newContext();
  const email = uniqueEmail("suspend");
  await apiSignUp(context, baseURL!, "Susie Suspended", email, "suspend-pass-1");
  const page = await context.newPage();
  await page.goto(joinPath);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page).toHaveURL(/\/machines$/);

  await openMember(admin, email);
  await admin.getByLabel("Reason (optional, staff only)").fill("Left the guard off");
  await admin.getByRole("button", { name: "Suspend" }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Suspend" }).click();
  await expect(admin.getByText("Member suspended.")).toBeVisible();

  await page.goto("/machines");
  await expect(page.getByRole("heading", { level: 1, name: "Your access is suspended" })).toBeVisible();

  await admin.getByRole("button", { name: "Reactivate" }).click();
  await expect(admin.getByText("Access restored.")).toBeVisible();
  await page.goto("/machines");
  await expect(page.getByRole("heading", { level: 1, name: "Machines" })).toBeVisible();

  await adminContext.close();
  await context.close();
});

test("the last admin can't demote themselves", async ({ browser }) => {
  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
  await openMember(admin, ADMIN.email);
  await admin.getByRole("combobox", { name: "Role", exact: true }).selectOption("member");
  await admin.getByRole("button", { name: "Save role" }).click();
  await expect(admin.getByText(/At least one active admin must remain/).first()).toBeVisible();
  await adminContext.close();
});
