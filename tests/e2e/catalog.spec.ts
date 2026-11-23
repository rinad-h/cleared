// P2-51: an admin who signed up for real sets up the catalog at 375 px (room,
// certification, machine), opens the label sheet, the QR code renders, and
// the label's URL opens the machine's page (T01 partial). Then retire.
import { expect, test } from "./fixtures";
import { ADMIN_STATE, MAKERSPACE_NAME } from "./accounts";

test.use({ viewport: { width: 375, height: 740 }, storageState: ADMIN_STATE });

const suffix = () => crypto.randomUUID().slice(0, 6);

test("room → certification → machine → label → scan → retire", async ({ page, baseURL }) => {
  const room = `Laser Room ${suffix()}`;
  const cert = `Laser basics ${suffix()}`;
  const machine = `Laser cutter ${suffix()}`;

  // Room
  await page.goto("/console/rooms");
  await page.getByLabel("Room name").fill(room);
  await page.getByRole("button", { name: "Add room" }).click();
  await expect(page.getByRole("list", { name: "Rooms" }).getByText(room)).toBeVisible();

  // Certification (dialog)
  await page.goto("/console/certifications");
  await page.getByRole("button", { name: "Add certification" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(cert);
  await dialog.getByLabel("Valid for (months)").fill("12");
  await dialog.getByRole("button", { name: "Add certification" }).click();
  await expect(dialog).toBeHidden();
  const certRow = page.getByRole("list", { name: "Certifications" }).getByRole("listitem").filter({ hasText: cert });
  await expect(certRow).toContainText("12 months");
  await expect(certRow).toContainText("Required by 0 machines");

  // Machine with a requirement and supervision; then "add another" keeps the room.
  await page.goto("/console/machines/new");
  await page.getByLabel("Machine name").fill(machine);
  await page.getByRole("combobox", { name: "Room" }).selectOption({ label: room });
  await page.getByRole("switch", { name: "Supervision required" }).check();
  await page.getByRole("checkbox", { name: cert }).check();
  await page.getByRole("button", { name: "Add machine" }).click();
  await expect(page.getByText(`Saved ${machine}. Add another in ${room}`)).toBeVisible();
  await expect(page.getByLabel("Machine name")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Room" })).toHaveValue(/.+/);

  // The list groups it under its room with its chips.
  await page.goto("/console/machines");
  const row = page.getByRole("list", { name: `Machines in ${room}` }).getByRole("listitem").filter({ hasText: machine });
  await expect(row).toContainText("Supervised");
  await expect(row).toContainText(cert);
  await expect(row.locator("[data-status]")).toContainText("Available");

  // Deactivating the certification is refused and names the machine.
  await page.goto("/console/certifications");
  const refusedRow = page.getByRole("list", { name: "Certifications" }).getByRole("listitem").filter({ hasText: cert });
  await refusedRow.getByRole("button", { name: "Deactivate" }).click();
  await expect(refusedRow.getByText("1 machine still requires this certification")).toBeVisible();
  await expect(refusedRow.getByRole("link", { name: machine })).toBeVisible();

  // Print just this machine's label: the QR renders in the browser and points at PUBLIC_BASE_URL.
  await page.goto("/console/machines");
  await page.getByRole("checkbox", { name: `Select ${machine} for printing` }).check();
  await page.getByRole("button", { name: "Print selected labels" }).click();
  await expect(page).toHaveURL(/\/console\/labels\?ids=/);
  const qr = page.getByRole("img", { name: `QR code for ${machine}` });
  await expect(qr).toBeVisible();
  await expect(qr.locator("path")).toHaveAttribute("d", /^M/);
  await expect(page.getByRole("list", { name: "Labels" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("alert").filter({ hasText: "NOT THE REAL APP" })).toBeVisible();
  const url = (await qr.getAttribute("data-qr-value"))!;
  expect(url.startsWith(`${baseURL}/m/`)).toBe(true);
  await page.getByRole("combobox", { name: "Layout" }).selectOption("compact");
  await expect(qr).toHaveAttribute("width", "32mm");

  // "Scanning" the label opens the machine's page.
  const labelPath = new URL(url).pathname;
  await page.goto(labelPath);
  await expect(page.getByRole("heading", { level: 1, name: machine })).toBeVisible();
  await expect(page.getByText(MAKERSPACE_NAME)).toBeVisible();
  await expect(page.getByText(room)).toBeVisible();

  // Retire: type the name to confirm; the label then isn't recognized.
  await page.goto("/console/machines");
  await page.getByRole("link", { name: machine }).click();
  await expect(page.getByRole("heading", { level: 1, name: machine })).toBeVisible();
  await page.getByRole("button", { name: "Retire machine" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByRole("button", { name: "Retire" })).toBeDisabled();
  await confirm.getByLabel("Type the machine name to confirm").fill(machine);
  await confirm.getByRole("button", { name: "Retire" }).click();
  await expect(page).toHaveURL(/\/console\/machines$/);
  await page.goto(labelPath);
  await expect(page.getByRole("heading", { level: 1, name: "Label not recognized" })).toBeVisible();
});

test("signed out, a label sends you to sign-in and back to the machine", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/m/some-label-token");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fm%2Fsome-label-token$/);
  await context.close();
});
