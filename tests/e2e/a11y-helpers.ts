import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

/** P7-01: WCAG 2.2 AA (axe's 2.0–2.2 A/AA rules). */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page scrolls horizontally").toBeLessThanOrEqual(0);
}

export async function expectAxeClean(page: Page) {
  // A button fading from disabled (50% opacity) to enabled after hydration
  // can be sampled mid-transition and fail colour contrast under load.
  // Settle every transition so axe sees final colours.
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** P7-07: primary member actions are at least 44 × 44 CSS px. */
export async function expectTouchTarget(target: Locator, label: string) {
  const box = await target.boundingBox();
  expect(box, `${label} is visible`).not.toBeNull();
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44);
}
