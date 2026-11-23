import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const MEMBER_PAGES = ["/machines", "/me/certifications", "/help", "/m/example-token"];
const OTHER_PAGES = ["/console", "/console/faults", "/sign-in", "/sign-up", "/setup", "/join/example-token"];
const WIDTHS = [320, 375];

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page scrolls horizontally").toBeLessThanOrEqual(0);
}

async function expectAxeClean(page: Page) {
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

test("root redirects temporarily (307) to the machine list", async ({ page, request }) => {
  const res = await request.get("/", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(new URL(res.headers()["location"], "http://x").pathname).toBe("/machines");
  await page.goto("/");
  await expect(page).toHaveURL(/\/machines$/);
});

test("spike API routes are 404 outside development (no ENABLE_SPIKES)", async ({ request }) => {
  for (const path of ["/api/spike/hash", "/api/spike/rate-limit"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("spike pages render the not-found page outside development (no ENABLE_SPIKES)", async ({ page }) => {
  for (const path of ["/spike/pass", "/spike/board"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" }), path).toBeVisible();
    await expect(page.getByText("Spike S2"), path).toHaveCount(0);
  }
});

for (const width of WIDTHS) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 740 } });

    for (const path of [...MEMBER_PAGES, ...OTHER_PAGES]) {
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
  test.use({ viewport: { width: 1280, height: 800 } });

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
