// Phase 4 E2E (demo step 7): a student starts a 60-min session on the pass; a
// second browser on /machines sees "In use · est. free" within one poll; the
// student taps Done; the board shows Available again.
import { expect, test } from "./fixtures";
import { ADMIN_STATE, joinAs, uniqueEmail } from "./accounts";

const suffix = () => crypto.randomUUID().slice(0, 6);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const POLL = 40_000; // one 30 s poll plus slack

test("start a session on the pass → board shows In use → Done → Available", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const room = `Print Lab ${suffix()}`;
  const machine = `3D printer ${suffix()}`;

  // The admin adds a machine with no requirements (everyone is cleared).
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

  // A student joins (lands on the board) and sees the machine as available.
  const { context: studentContext, page: student } = await joinAs(
    browser, admin, baseURL!, "Demo Student 1", uniqueEmail("student"), "sessions-pass-1",
  );
  const studentTile = student.getByRole("article", { name: new RegExp(`^${escape(machine)}, available, you're cleared$`) });
  await expect(studentTile).toBeVisible();

  // A second browser watches the board.
  const board = await adminContext.newPage();
  await board.goto("/machines");
  const tile = board.getByRole("article", { name: new RegExp(`^${escape(machine)},`) });
  await expect(tile).toHaveAttribute("data-state", "available");
  await expect(board.getByText(/^Updated /)).toBeVisible();

  // Step 7: the student scans the label and starts a 60-minute session.
  await student.goto(labelPath);
  await expect(student.getByRole("status", { name: "Pass: Cleared" })).toBeVisible();
  await student.getByText("1 h", { exact: true }).click();
  const startButton = student.getByRole("button", { name: "Start session" });
  await expect(startButton).toBeEnabled();
  await startButton.click();
  await expect(student.getByTestId("session-summary")).toContainText(/Started .* · est\. end /);
  await expect(student.getByRole("button", { name: "Done" })).toBeVisible();
  await expect(student.getByRole("button", { name: "+15 min" })).toBeVisible();

  // The board picks it up within one poll, with an estimate and no identity.
  await expect(tile).toHaveAttribute("data-state", "in_use", { timeout: POLL });
  await expect(tile).toContainText("In use"); // shown uppercase by CSS
  await expect(tile).toContainText(/est\. free \d{1,2}:\d{2}/);
  await expect(tile).not.toContainText("Demo Student 1");

  // The admin's own pass shows the machine in use and offers the staff end.
  const adminPass = await adminContext.newPage();
  await adminPass.goto(labelPath);
  await expect(adminPass.getByTestId("session-summary")).toContainText(/In use since .* · est\. free /);
  await expect(adminPass.getByRole("button", { name: "End this session" })).toBeVisible();
  await expect(adminPass.getByRole("button", { name: "Start session" })).toHaveCount(0);
  await adminPass.close();

  // The student taps Done → the board shows Available again.
  await student.getByRole("button", { name: "Done" }).click();
  await expect(student.getByRole("button", { name: "Start session" })).toBeVisible();
  await expect(tile).toHaveAttribute("data-state", "available", { timeout: POLL });

  // My certifications lists the session.
  await student.goto("/me/certifications");
  await expect(student.getByRole("list", { name: "Recent sessions" })).toContainText(machine);

  await Promise.all([adminContext.close(), studentContext.close()]);
});
