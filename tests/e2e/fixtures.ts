import { test as base, expect } from "@playwright/test";

/**
 * `test` with an automatic check: any uncaught page error or console error
 * (hydration mismatch, CSP violation, client exception, failed request) fails
 * the test. A test that expects some, e.g. the 404 page logging its own 404,
 * lists them with `test.use({ allowedBrowserErrors: [/…/] })`.
 */
export const test = base.extend<{ allowedBrowserErrors: RegExp[]; browserErrors: string[] }>({
  allowedBrowserErrors: [[], { option: true }],
  browserErrors: [
    async ({ page, allowedBrowserErrors }, use) => {
      const errors: string[] = [];
      const record = (text: string) => {
        if (!allowedBrowserErrors.some((re) => re.test(text))) errors.push(text);
      };
      page.on("pageerror", (err) => record(`pageerror: ${err.message}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") record(`console.error: ${msg.text()}`);
      });
      await use(errors);
      expect(errors, "errors in the browser").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
