// P3-43: demo steps 4–6. A student and a staff member sign up for real (the
// admin promotes the staff member); the student scans → NOT CLEARED with the
// missing certification and its training link → staff signs them off → scan
// again → CLEARED. Then staff revoke it → NOT CLEARED (revoked), and My
// certifications shows it.
import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ADMIN_STATE, apiSignUp, uniqueEmail } from "./accounts";

const suffix = () => crypto.randomUUID().slice(0, 6);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Join through the current join link. join.spec.ts may regenerate the link
 * while this runs, so a refused link is re-read once more.
 */
async function joinAs(browser: Browser, admin: Page, baseURL: string, name: string, email: string) {
  const context = await browser.newContext({ viewport: { width: 375, height: 740 } });
  await apiSignUp(context, baseURL, name, email, "pass-signoff-pass-1");
  const page = await context.newPage();
  for (let attempt = 0; attempt < 3; attempt++) {
    await admin.goto("/console/settings");
    const joinPath = new URL(await admin.getByLabel("Current join link").inputValue()).pathname;
    await page.goto(joinPath);
    const join = page.getByRole("button", { name: "Join" });
    const invalid = page.getByRole("heading", { level: 1, name: "This join link isn't valid any more" });
    await expect(join.or(invalid)).toBeVisible();
    if (await join.isVisible()) {
      await join.click();
      await expect(page).toHaveURL(/\/machines$/);
      return { context, page };
    }
  }
  throw new Error("could not join");
}

async function openMember(page: Page, email: string) {
  await page.goto("/console/members");
  await page.getByLabel("Search").fill(email);
  await expect(page).toHaveURL(/\?q=/);
  await page.getByRole("link", { name: new RegExp(escape(email)) }).click();
  await expect(page).toHaveURL(/\/console\/members\/[0-9a-f-]{36}$/);
}

test("scan → NOT CLEARED → staff sign-off → CLEARED → revoke → NOT CLEARED", async ({ browser, baseURL }) => {
  const cert = `Laser basics ${suffix()}`;
  const room = `Laser Room ${suffix()}`;
  const machine = `Laser cutter ${suffix()}`;
  const trainingUrl = "https://training.example.test/laser";

  // The admin sets up a room, a certification with a training link and a machine requiring it.
  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
  await admin.goto("/console/rooms");
  await admin.getByLabel("Room name").fill(room);
  await admin.getByRole("button", { name: "Add room" }).click();
  await expect(admin.getByRole("list", { name: "Rooms" }).getByText(room)).toBeVisible();

  await admin.goto("/console/certifications");
  await admin.getByRole("button", { name: "Add certification" }).click();
  const certDialog = admin.getByRole("dialog");
  await certDialog.getByLabel("Name").fill(cert);
  await certDialog.getByLabel("Training link (optional)").fill(trainingUrl);
  await certDialog.getByLabel("Valid for (months)").fill("12");
  await certDialog.getByRole("button", { name: "Add certification" }).click();
  await expect(certDialog).toBeHidden();

  await admin.goto("/console/machines/new");
  await admin.getByLabel("Machine name").fill(machine);
  await admin.getByRole("combobox", { name: "Room" }).selectOption({ label: room });
  await admin.getByRole("checkbox", { name: cert }).check();
  await admin.getByRole("button", { name: "Add machine" }).click();
  await expect(admin.getByText(`Saved ${machine}.`, { exact: false })).toBeVisible();

  // The machine's label URL, from the label sheet.
  await admin.goto("/console/machines");
  await admin.getByRole("checkbox", { name: `Select ${machine} for printing` }).check();
  await admin.getByRole("button", { name: "Print selected labels" }).click();
  const qr = admin.getByRole("img", { name: `QR code for ${machine}` });
  await expect(qr).toBeVisible();
  const labelPath = new URL((await qr.getAttribute("data-qr-value"))!).pathname;

  // Two real accounts join; the admin promotes one to staff.
  const studentEmail = uniqueEmail("student");
  const staffEmail = uniqueEmail("staff");
  const { context: studentContext, page: student } = await joinAs(browser, admin, baseURL!, "Demo Student 1", studentEmail);
  const { context: staffContext, page: staff } = await joinAs(browser, admin, baseURL!, "Demo Staff 1", staffEmail);
  await openMember(admin, staffEmail);
  await admin.getByRole("combobox", { name: "Role", exact: true }).selectOption("staff");
  await admin.getByRole("button", { name: "Save role" }).click();
  await expect(admin.getByText("Role saved.")).toBeVisible();

  // Step 4: the student scans → NOT CLEARED, listing the certification and its training link.
  await student.goto(labelPath);
  await expect(student.getByRole("status", { name: "Pass: Not cleared" })).toBeVisible();
  await expect(student.getByRole("heading", { level: 1, name: machine })).toBeVisible();
  await expect(student.getByTestId("pass-viewer")).toHaveText("Demo Student 1");
  const missing = student.getByRole("list", { name: "Missing certifications" }).getByRole("listitem");
  await expect(missing).toHaveCount(1);
  await expect(missing).toContainText(cert);
  await expect(missing).toContainText("Not yet certified");
  await expect(missing.getByRole("link", { name: /Open training/ })).toHaveAttribute("href", trainingUrl);
  await expect(student.getByText("After training, ask staff to sign you off.")).toBeVisible();
  // The live clock ticks.
  const clock = student.getByTestId("live-clock").locator("time");
  const first = await clock.textContent();
  await expect(clock).not.toHaveText(first!, { timeout: 5_000 });

  // Step 5: staff sign them off from the member page.
  await openMember(staff, studentEmail);
  await staff.getByRole("button", { name: `Sign off: ${cert}` }).click();
  const signOffDialog = staff.getByRole("dialog");
  await expect(signOffDialog.getByText(/Expires .* \(12 months\)\./)).toBeVisible();
  await signOffDialog.getByRole("button", { name: "Confirm sign-off" }).click();
  await expect(staff.getByText(`Signed off: ${cert}`)).toBeVisible();
  await expect(signOffDialog).toBeHidden();
  const row = staff.getByRole("list", { name: "Certifications" }).getByRole("listitem").filter({ hasText: cert });
  await expect(row.locator("[data-cert-state]")).toHaveText("Valid");
  await expect(row).toContainText("Signed off by Demo Staff 1");

  // Step 6: scan again → CLEARED with the expiry.
  await student.goto(labelPath);
  await expect(student.getByRole("status", { name: "Pass: Cleared" })).toBeVisible();
  await expect(student.getByText(/Certified until/)).toBeVisible();

  // Revoke → NOT CLEARED (revoked) on the very next scan.
  await row.getByRole("button", { name: `Revoke: ${cert}` }).click();
  const revokeDialog = staff.getByRole("dialog");
  await revokeDialog.getByLabel("Reason").fill("Skipped the safety check");
  await revokeDialog.getByRole("button", { name: "Revoke" }).click();
  await expect(staff.getByText(`Revoked: ${cert}`)).toBeVisible();
  await expect(row.locator("[data-cert-state]")).toHaveText("Revoked");
  await staff.getByText(/^History/).click();
  await expect(staff.getByRole("list", { name: "Certification history" })).toContainText("Skipped the safety check");

  await student.goto(labelPath);
  await expect(student.getByRole("status", { name: "Pass: Not cleared" })).toBeVisible();
  await expect(student.getByRole("list", { name: "Missing certifications" })).toContainText("Revoked");

  // My certifications shows the revoked certification and its training link.
  await student.getByRole("link", { name: "My certifications" }).first().click();
  await expect(student.getByRole("heading", { level: 1, name: "My certifications" })).toBeVisible();
  const card = student.getByRole("list", { name: "My certifications" }).getByRole("listitem").filter({ hasText: cert });
  await expect(card.locator("[data-cert-state]")).toHaveText("Revoked");
  await expect(card).toContainText("Ask staff to sign you off after training.");

  // Nobody signs themselves off: no controls on your own page.
  await staff.goto("/console/members");
  await openMember(staff, staffEmail);
  await expect(staff.getByRole("button", { name: /^Sign off/ })).toHaveCount(0);

  await Promise.all([adminContext.close(), studentContext.close(), staffContext.close()]);
});

test("a signed-in non-member scanning a label sees NOT CLEARED with the join prompt", async ({ browser, baseURL }) => {
  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
  const room = `Wood Shop ${suffix()}`;
  const machine = `Band saw ${suffix()}`;
  await admin.goto("/console/rooms");
  await admin.getByLabel("Room name").fill(room);
  await admin.getByRole("button", { name: "Add room" }).click();
  await expect(admin.getByRole("list", { name: "Rooms" }).getByText(room)).toBeVisible();
  await admin.goto("/console/machines/new");
  await admin.getByLabel("Machine name").fill(machine);
  await admin.getByRole("combobox", { name: "Room" }).selectOption({ label: room });
  await admin.getByRole("button", { name: "Add machine" }).click();
  await expect(admin.getByText(`Saved ${machine}.`, { exact: false })).toBeVisible();
  await admin.goto("/console/machines");
  await admin.getByRole("checkbox", { name: `Select ${machine} for printing` }).check();
  await admin.getByRole("button", { name: "Print selected labels" }).click();
  const qr = admin.getByRole("img", { name: `QR code for ${machine}` });
  await expect(qr).toBeVisible();
  const labelPath = new URL((await qr.getAttribute("data-qr-value"))!).pathname;

  // The admin themselves: no requirements → CLEARED.
  await admin.goto(labelPath);
  await expect(admin.getByRole("status", { name: "Pass: Cleared" })).toBeVisible();

  const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
  await apiSignUp(context, baseURL!, "Nora Visitor", uniqueEmail("visitor"), "visitor-pass-1");
  const page = await context.newPage();
  await page.goto(labelPath);
  await expect(page.getByRole("status", { name: "Pass: Not cleared" })).toBeVisible();
  await expect(page.getByTestId("pass-viewer")).toHaveText("Nora Visitor");
  await expect(page.getByText(/not a member of .* yet\. Ask staff for the join link\./)).toBeVisible();

  await Promise.all([adminContext.close(), context.close()]);
});
