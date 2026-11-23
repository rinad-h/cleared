// P5-40: the PRD 5.1 minimum demo, end to end (T01). Three browser contexts
// with real accounts (admin from Setup, a staff member and a student who join):
// admin creates a machine and its label → student scans: NOT CLEARED → staff
// signs off → CLEARED → student starts 60 min, the board shows In use →
// student reports a problem that takes it out of service, the board shows
// Out of service · issue reported → staff work the fault queue and log a
// repair that returns it to service → the board shows Available and machine
// detail shows the repair.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ADMIN_STATE, joinAs, uniqueEmail } from "./accounts";

const suffix = () => crypto.randomUUID().slice(0, 6);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const POLL = 40_000; // one 30 s board poll plus slack

async function openMember(page: Page, email: string) {
  await page.goto("/console/members");
  await page.getByLabel("Search").fill(email);
  await expect(page).toHaveURL(/\?q=/);
  await page.getByRole("link", { name: new RegExp(escape(email)) }).click();
  await expect(page).toHaveURL(/\/console\/members\/[0-9a-f-]{36}$/);
}

test("PRD 5.1 minimum demo: label → pass → sign-off → session → fault → service → available", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const room = `Wood Shop ${suffix()}`;
  const cert = `Bandsaw basics ${suffix()}`;
  const machine = `Bandsaw ${suffix()}`;
  const description = "Blade wandering, burning smell";

  // Step 1: the admin (from Setup) adds a room, a certification and a machine requiring it.
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
  await certDialog.getByLabel("Training link (optional)").fill("https://training.example.test/bandsaw");
  await certDialog.getByRole("button", { name: "Add certification" }).click();
  await expect(certDialog).toBeHidden();
  await admin.goto("/console/machines/new");
  await admin.getByLabel("Machine name").fill(machine);
  await admin.getByRole("combobox", { name: "Room" }).selectOption({ label: room });
  await admin.getByRole("checkbox", { name: cert }).check();
  await admin.getByRole("button", { name: "Add machine" }).click();
  await expect(admin.getByText(`Saved ${machine}.`, { exact: false })).toBeVisible();

  // Step 2: the printable label.
  await admin.goto("/console/machines");
  await admin.getByRole("checkbox", { name: `Select ${machine} for printing` }).check();
  await admin.getByRole("button", { name: "Print selected labels" }).click();
  const qr = admin.getByRole("img", { name: `QR code for ${machine}` });
  await expect(qr).toBeVisible();
  const labelPath = new URL((await qr.getAttribute("data-qr-value"))!).pathname;

  // A staff member and a student join; the admin promotes the staff member.
  const studentEmail = uniqueEmail("demo-student");
  const staffEmail = uniqueEmail("demo-staff");
  const { context: studentContext, page: student } = await joinAs(browser, admin, baseURL!, "Demo Student 1", studentEmail, "minimum-demo-pass-1");
  const { context: staffContext, page: staff } = await joinAs(browser, admin, baseURL!, "Demo Staff 1", staffEmail, "minimum-demo-pass-1");
  await openMember(admin, staffEmail);
  await admin.getByRole("combobox", { name: "Role", exact: true }).selectOption("staff");
  await admin.getByRole("button", { name: "Save role" }).click();
  await expect(admin.getByText("Role saved.")).toBeVisible();

  // Steps 3–4: the student scans → NOT CLEARED with the certification and its training link.
  await student.goto(labelPath);
  await expect(student.getByRole("status", { name: "Pass: Not cleared" })).toBeVisible();
  await expect(student.getByRole("list", { name: "Missing certifications" })).toContainText(cert);

  // Step 5: staff sign the student off.
  await openMember(staff, studentEmail);
  await staff.getByRole("button", { name: `Sign off: ${cert}` }).click();
  await staff.getByRole("dialog").getByRole("button", { name: "Confirm sign-off" }).click();
  await expect(staff.getByText(`Signed off: ${cert}`)).toBeVisible();

  // Step 6: scan again → CLEARED.
  await student.goto(labelPath);
  await expect(student.getByRole("status", { name: "Pass: Cleared" })).toBeVisible();

  // A board in another browser.
  const board = await adminContext.newPage();
  await board.goto("/machines");
  const tile = board.getByRole("article", { name: new RegExp(`^${escape(machine)},`) });
  await expect(tile).toHaveAttribute("data-state", "available");

  // Step 7: the student starts a 60-minute session → the board shows In use with an estimate.
  await student.getByText("1 h", { exact: true }).click();
  const start = student.getByRole("button", { name: "Start session" });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(student.getByTestId("session-summary")).toContainText(/Started .* · est\. end /);
  await expect(tile).toHaveAttribute("data-state", "in_use", { timeout: POLL });
  await expect(tile).toContainText(/est\. free \d{1,2}:\d{2}/);

  // Step 8: the student reports a problem that takes the machine out of service.
  await student.getByRole("button", { name: "Report a problem" }).click();
  const sheet = student.getByRole("dialog", { name: "Report a problem" });
  await sheet.getByLabel("What's wrong?").fill(description);
  await sheet.getByRole("checkbox", { name: /take out of service/ }).check();
  await sheet.getByRole("button", { name: "Submit report" }).click();
  await expect(sheet).toBeHidden();
  await expect(student.getByText("Thanks, staff can see this in the console.")).toBeVisible();
  await expect(student.getByRole("status", { name: "Pass: Out of service" })).toBeVisible();
  await expect(student.getByTestId("out-of-service-details")).toContainText(/since .* · issue reported/);
  await expect(student.getByRole("button", { name: "Start session" })).toHaveCount(0);

  // The board shows Out of service with the time reported, never the description or reporter.
  await expect(tile).toHaveAttribute("data-state", "out_of_service", { timeout: POLL });
  await expect(tile).toContainText(/since \d{1,2}:\d{2}.* · issue reported/);
  await expect(tile).not.toContainText(description);
  await expect(tile).not.toContainText("Demo Student 1");

  // Step 9: staff see the fault in the queue and log a repair that returns the machine to service.
  await staff.goto("/console/faults");
  const card = staff.getByRole("article", { name: new RegExp(`^Fault on ${escape(machine)},`) });
  await expect(card).toContainText(description);
  await expect(card).toContainText("Demo Student 1");
  await expect(card).toContainText("Took it out of service");

  // Return to service is blocked until a service record resolves the fault.
  await card.getByRole("link", { name: "Open machine" }).click();
  await expect(staff.getByRole("heading", { level: 1, name: machine })).toBeVisible();
  await expect(staff.getByRole("button", { name: "Return to service" })).toBeDisabled();
  await expect(staff.getByText("Resolve open out-of-service faults by logging a service record.")).toBeVisible();

  await staff.goto("/console/faults");
  await card.getByRole("link", { name: "Log service" }).click();
  await expect(staff.getByRole("heading", { level: 1, name: "Log service" })).toBeVisible();
  const form = staff.getByRole("form", { name: "Log service" });
  await expect(form.getByRole("checkbox", { name: new RegExp(escape(description)) })).toBeChecked();
  await form.getByText("Repair", { exact: true }).click();
  await form.getByLabel("What was done").fill("Replaced the blade and realigned the guides");
  await form.getByText("Returned to service", { exact: true }).click();
  const submit = form.getByRole("button", { name: "Log service" });
  await expect(submit).toBeEnabled();
  await submit.click();

  // Machine detail: Available, and the service history shows the repair.
  await expect(staff).toHaveURL(new RegExp(`/console/machines/[0-9a-f-]{36}`));
  await expect(staff.getByText("Logged. Machine is now Available.")).toBeVisible();
  await expect(staff.getByTestId("machine-status")).toContainText("Available");
  const history = staff.getByRole("list", { name: "Service history" });
  await expect(history).toContainText("Repair");
  await expect(history).toContainText("Replaced the blade and realigned the guides");
  await expect(history).toContainText("By Demo Staff 1");
  await expect(history).toContainText("Returned to service");
  await expect(history).toContainText(description);
  await expect(staff.getByText("No open faults.")).toBeVisible();

  // Step 10: the board shows Available again.
  await expect(tile).toHaveAttribute("data-state", "available", { timeout: POLL });
  await student.goto(labelPath);
  await expect(student.getByRole("status", { name: "Pass: Cleared" })).toBeVisible();

  await Promise.all([adminContext.close(), studentContext.close(), staffContext.close()]);
});
