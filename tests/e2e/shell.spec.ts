import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ADMIN_STATE } from "./accounts";

// Signed-in pages (viewed as the admin that auth.spec.ts created).
const MEMBER_PAGES = ["/machines", "/me/certifications", "/me/account", "/m/example-token"];
const CONSOLE_PAGES = [
  "/console",
  "/console/faults",
  "/console/members",
  "/console/settings",
  "/console/rooms",
  "/console/certifications",
  "/console/machines",
  "/console/machines/new",
  "/console/labels",
  "/console/door-poster",
];
// Pages anyone can open.
const PUBLIC_PAGES = ["/help", "/terms", "/privacy", "/sign-in", "/sign-up"];
// Signed-in areas: proxy.ts sends signed-out visitors to sign-in.
const PROTECTED_PATHS = ["/machines", "/m/example-token", "/me/account", "/console", "/console/members", "/setup", "/join/example-token"];
const WIDTHS = [320, 375];

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page scrolls horizontally").toBeLessThanOrEqual(0);
}

async function expectAxeClean(page: Page) {
  // A button fading from disabled (50% opacity) to enabled after hydration
  // can be sampled mid-transition and fail colour contrast under load.
  // Settle every transition so axe sees final colours.
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

test("health route reports ok, the E2E environment and this checkout's version", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({
    status: "ok",
    environment: "test",
    version: process.env.E2E_EXPECTED_VERSION,
  });
});

test("root redirects temporarily (307) to the machine list, which asks a signed-out visitor to sign in", async ({ page, request }) => {
  const res = await request.get("/", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(new URL(res.headers()["location"], "http://x").pathname).toBe("/machines");
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fmachines$/);
});

test("the Phase 0 spike routes are gone", async ({ request }) => {
  for (const path of ["/api/spike/hash", "/api/spike/rate-limit", "/spike/pass", "/spike/board"]) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404);
  }
});

test.describe("signed out", () => {
  for (const path of PROTECTED_PATHS) {
    test(`${path} redirects to sign-in with next`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      const location = new URL(res.headers()["location"], "http://x");
      expect(location.pathname).toBe("/sign-in");
      expect(location.searchParams.get("next")).toBe(path);
    });
  }

  for (const width of WIDTHS) {
    for (const path of PUBLIC_PAGES) {
      test(`${path} at ${width} px renders without horizontal scroll and passes axe`, async ({ page }) => {
        await page.setViewportSize({ width, height: 740 });
        await page.goto(path);
        await expect(page.locator("h1")).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectAxeClean(page);
      });
    }
  }
});

for (const width of WIDTHS) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 740 }, storageState: ADMIN_STATE });

    for (const path of [...MEMBER_PAGES, ...CONSOLE_PAGES]) {
      test(`${path} renders without horizontal scroll and passes axe`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator("h1")).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectAxeClean(page);
      });
    }

    test("no tab is marked current on a machine pass", async ({ page }) => {
      await page.goto("/m/example-token");
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Main" }).locator("[aria-current]")).toHaveCount(0);
    });

    test("member tab bar navigates and marks the current tab", async ({ page }) => {
      await page.goto("/machines");
      const nav = page.getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link", { name: "Machines" })).toHaveAttribute("aria-current", "page");
      await nav.getByRole("link", { name: "Help" }).click();
      await expect(page).toHaveURL(/\/help$/);
      await expect(page.getByRole("heading", { level: 1, name: "Help" })).toBeVisible();
    });

    test("help shows every status as icon + word", async ({ page }) => {
      await page.goto("/help");
      for (const word of ["Cleared", "Supervision required", "Not cleared", "Available", "In use", "Out of service"]) {
        const badge = page.locator("[data-status]", { hasText: word }).first();
        await expect(badge).toBeVisible();
        await expect(badge.locator("svg")).toHaveCount(1);
      }
    });

    test("console drawer opens on a phone and navigates", async ({ page }) => {
      await page.goto("/console");
      const drawer = page.getByRole("dialog");
      // In dev the button can be clicked before React hydrates; retry until the drawer opens.
      await expect(async () => {
        await page.getByRole("button", { name: "Open menu" }).click();
        await expect(drawer).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      await expectAxeClean(page);
      await drawer.getByRole("link", { name: "Faults" }).click();
      await expect(page).toHaveURL(/\/console\/faults$/);
      await expect(drawer).toBeHidden();
    });
  });
}

test.describe("at 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 800 }, storageState: ADMIN_STATE });

  test("the console sidebar marks the current section and passes axe", async ({ page }) => {
    await page.goto("/console/faults");
    const nav = page.getByRole("navigation", { name: "Staff console" });
    await expect(nav.getByRole("link", { name: "Faults" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });
});

test.describe("not found", () => {
  test.use({ allowedBrowserErrors: [/status of 404/] });

  test("unknown routes show the not-found page", async ({ page }) => {
    const res = await page.goto("/definitely-not-a-page");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/help");
  const headers = res.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});
