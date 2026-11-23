// Phase 7 accessibility checks on the pages shell.spec.ts can't reach without
// data (P7-01, P7-05–P7-07): a real machine's pass, machine detail and its
// forms, a member's detail and the join page, with axe (WCAG 2.2 AA) at 320 and
// 1280 px; touch targets on the pass; reduced motion keeps the clock ticking.
import type { Browser } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ADMIN_STATE } from "./accounts";
import { expectAxeClean, expectNoHorizontalScroll, expectTouchTarget } from "./a11y-helpers";

const suffix = () => crypto.randomUUID().slice(0, 6);

type Paths = { pass: string; detail: string; member: string; join: string };
let paths: Paths | undefined;

/** One machine (no requirements, so the admin is cleared) and the admin's own member page. */
async function createData(browser: Browser): Promise<Paths> {
  const context = await browser.newContext({ storageState: ADMIN_STATE });
  const admin = await context.newPage();
  const room = `A11y Room ${suffix()}`;
  const machine = `A11y Printer ${suffix()}`;
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
  await admin.getByRole("link", { name: machine }).first().click();
  await expect(admin).toHaveURL(/\/console\/machines\/[0-9a-f-]{36}$/);
  const detail = new URL(admin.url()).pathname;

  await admin.goto("/console/machines");
  await admin.getByRole("checkbox", { name: `Select ${machine} for printing` }).check();
  await admin.getByRole("button", { name: "Print selected labels" }).click();
  const qr = admin.getByRole("img", { name: `QR code for ${machine}` });
  await expect(qr).toBeVisible();
  const pass = new URL((await qr.getAttribute("data-qr-value"))!).pathname;

  await admin.goto("/console/members");
  await admin.getByRole("link", { name: /Demo Admin/ }).first().click();
  await expect(admin).toHaveURL(/\/console\/members\/[0-9a-f-]{36}$/);
  const member = new URL(admin.url()).pathname;

  await admin.goto("/console/settings");
  const join = new URL(await admin.getByLabel("Current join link").inputValue()).pathname;
  await context.close();
  return { pass, detail, member, join };
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: ADMIN_STATE });

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  paths = await createData(browser);
});

const pages: [string, (p: Paths) => string][] = [
  ["machine pass", (p) => p.pass],
  ["machine detail", (p) => p.detail],
  ["edit machine", (p) => `${p.detail}/edit`],
  ["log service", (p) => `${p.detail}/service/new`],
  ["member detail", (p) => p.member],
  ["join page", (p) => p.join],
];

for (const width of [320, 1280]) {
  for (const [name, path] of pages) {
    test(`${name} at ${width} px: no horizontal scroll, axe clean`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path(paths!));
      await expect(page.locator("h1")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    });
  }
}

test("the pass at 320 px: primary actions are ≥ 44 px, the report dialog is axe clean and Esc closes it", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(paths!.pass);
  await expect(page.getByRole("status", { name: "Pass: Cleared" })).toBeVisible();
  const start = page.getByRole("button", { name: "Start session" });
  await expectTouchTarget(start, "Start session");
  const report = page.getByRole("button", { name: "Report a problem" });
  await expectTouchTarget(report, "Report a problem");
  await expectTouchTarget(page.getByText("1 h", { exact: true }), "1 h duration");

  const sheet = page.getByRole("dialog", { name: "Report a problem" });
  await expect(async () => {
    await report.click();
    await expect(sheet).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expectAxeClean(page);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(report).toBeFocused();
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the pass doesn't animate, and the clock still ticks", async ({ page }) => {
    await page.goto(paths!.pass);
    const clock = page.getByTestId("live-clock").locator("time");
    const first = await clock.getAttribute("datetime");
    await expect(clock).not.toHaveAttribute("datetime", first!, { timeout: 5_000 });
    const running = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running")
        .map((a) => {
          const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
          return `${a.constructor.name} ${(a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? ""} on <${el?.tagName.toLowerCase()} class="${el?.getAttribute("class") ?? ""}">`;
        }),
    );
    expect(running).toEqual([]);
  });
});

test("200% zoom (640 px wide at 2×): the pass and board don't scroll sideways", async ({ browser }) => {
  // 1280 px at 200% zoom lays out like a 640 px viewport with 2× pixels.
  const context = await browser.newContext({ storageState: ADMIN_STATE, viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  for (const path of [paths!.pass, "/machines", "/help"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
  await context.close();
});
