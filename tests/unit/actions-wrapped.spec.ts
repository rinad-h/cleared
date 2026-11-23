// P1-47: every server action goes through action() (getActor → parse → service).
// Later phases are covered automatically: every module in src/actions/ is checked.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { actionSchema, isWrappedAction } from "@/lib/server-action";

const modules = import.meta.glob<Record<string, unknown>>("../../src/actions/*.ts");

describe("server actions", () => {
  it("there are action modules to check", () => {
    expect(Object.keys(modules).length).toBeGreaterThan(0);
  });

  it.each(Object.keys(modules))("%s exports only action() wrappers", async (path) => {
    const mod = await modules[path]();
    const exports = Object.entries(mod);
    expect(exports.length, `${path} exports nothing`).toBeGreaterThan(0);
    for (const [name, value] of exports) {
      expect(isWrappedAction(value), `${path}: export "${name}" isn't created with action()`).toBe(true);
      // P6-07: every action parses its input with a Zod schema.
      expect(actionSchema(value), `${path}: export "${name}" declares no Zod schema`).toBeInstanceOf(z.ZodType);
    }
  });

  it("detects an unwrapped function", () => {
    expect(isWrappedAction(async () => undefined)).toBe(false);
    expect(isWrappedAction(undefined)).toBe(false);
  });
});
