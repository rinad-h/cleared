// Phase 6 E2E: the console home shows a student's session (labelled
// self-reported) and staff end it from there; a checkup is added on machine
// detail, appears under Due soon, is logged from the Checkups page with the
// checkup pre-selected, then deactivated.
import { expect, test } from "./fixtures";
import { ADMIN_STATE, joinAs, uniqueEmail } from "./accounts";

const suffix = () => crypto.randomUUID().slice(0, 6);
const POLL = 40_000; // one 30 s poll plus slack

test("console home: active session → End session; checkups: add → due soon → log → deactivate", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const room = `Laser Room ${suffix()}`;
  const machine = `Laser ${suffix()}`;
  const checkup = `Clean the lens ${suffix()}`;

  const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
  const admin = await adminContext.newPage();
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

  // A student joins and starts a session.
  const { context: studentContext, page: student } = await joinAs(
    browser, admin, baseURL!, "Demo Student 1", uniqueEmail("console-student"), "console-pass-1",
  );
  await student.goto(labelPath);
  await student.getByText("1 h", { exact: true }).click();
  const start = student.getByRole("button", { name: "Start session" });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(student.getByTestId("session-summary")).toBeVisible();

  // The console home lists it, labelled self-reported; staff end it there.
  await admin.goto("/console");
  await expect(admin.getByText("Self-reported by members")).toBeVisible();
  const sessions = admin.getByRole("list", { name: "Active sessions" });
  const row = sessions.getByRole("listitem").filter({ hasText: machine });
  await expect(row).toContainText("Demo Student 1");
  await expect(row).toContainText(/est\. end \d{1,2}:\d{2}/);
  await row.getByRole("button", { name: "End session" }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "End session" }).click();
  await expect(admin.getByText("Session ended.")).toBeVisible();
  await expect(row).toHaveCount(0, { timeout: POLL });

  // Machine detail: add a weekly checkup (due within 7 days → Due soon).
  await admin.goto("/console/machines");
  await admin.getByRole("link", { name: machine }).click();
  await expect(admin.getByRole("heading", { level: 1, name: machine })).toBeVisible();
  await admin.getByRole("button", { name: "Add checkup" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Name").fill(checkup);
  await dialog.getByRole("button", { name: "7 days" }).click();
  await expect(dialog.getByLabel("Every (days)")).toHaveValue("7");
  await dialog.getByLabel("Instructions (optional)").fill("Wipe the lens with a lens tissue.");
  await dialog.getByRole("button", { name: "Add checkup" }).click();
  await expect(dialog).toBeHidden();
  const machineCheckups = admin.getByRole("list", { name: "Checkups on this machine" });
  const item = machineCheckups.getByRole("listitem").filter({ hasText: checkup });
  await expect(item).toContainText("Due soon");
  await expect(item).toContainText("every 7 days · never done");

  // The Checkups page lists it under Due soon; Log checkup pre-fills the form.
  await admin.goto("/console/checkups?tab=soon");
  const listed = admin.getByRole("list", { name: "Due soon checkups" }).getByRole("listitem").filter({ hasText: checkup });
  await expect(listed).toContainText(machine);
  await listed.getByRole("link", { name: "Log checkup" }).click();
  const form = admin.getByRole("form", { name: "Log service" });
  await expect(form.getByLabel("Which checkup?")).toHaveValue(/[0-9a-f-]{36}/);
  await expect(form.getByRole("note", { name: "Checkup instructions" })).toContainText("Wipe the lens");
  await form.getByLabel("What was done").fill("Cleaned the lens and the first mirror");
  await form.getByText("Passed", { exact: true }).click();
  const submit = form.getByRole("button", { name: "Log service" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(admin.getByText("Checkup logged.")).toBeVisible();
  await expect(item).toContainText(/last done \w{3} \d{1,2}, \d{4}/);
  await expect(admin.getByRole("list", { name: "Service history" })).toContainText("Cleaned the lens");

  // Deactivate: it leaves the lists and shows Inactive here.
  await item.getByRole("button", { name: `Deactivate ${checkup}` }).click();
  await expect(item).toContainText("Inactive");
  await admin.goto("/console/checkups?tab=all");
  await expect(admin.getByText(checkup)).toHaveCount(0);

  await Promise.all([adminContext.close(), studentContext.close()]);
});
