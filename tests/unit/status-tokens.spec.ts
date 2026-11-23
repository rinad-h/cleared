import { describe, expect, it } from "vitest";
// Vite's ?raw import reads the stylesheet as text at build time.
import css from "@/app/globals.css?raw";
import { STATUSES } from "@/components/status-badge";

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`Missing 6-digit hex token --${name} in globals.css`);
  return match[1];
}

describe("status colour tokens", () => {
  it.each(["cleared", "supervision", "not-cleared", "out-of-service", "in-use"])(
    "%s foreground on background has at least 4.5:1 contrast",
    (status) => {
      const ratio = contrast(token(`status-${status}`), token(`status-${status}-foreground`));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("every badge status has a word and an icon, not just a colour", () => {
    for (const { label, icon } of Object.values(STATUSES)) {
      expect(label.length).toBeGreaterThan(0);
      expect(icon).toBeDefined();
    }
  });
});
