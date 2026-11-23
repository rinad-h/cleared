import { describe, expect, it } from "vitest";
import { isDemoName } from "@/lib/demo";

describe("isDemoName (P7-72 demo banner)", () => {
  it("is true when the makerspace name starts with Demo", () => {
    expect(isDemoName("Demo Makerspace")).toBe(true);
    expect(isDemoName("Demo")).toBe(true);
    expect(isDemoName("Demo-Space")).toBe(true);
    expect(isDemoName("  Demo Makerspace")).toBe(true);
  });

  it("is false for real names, other casing, Demo later in the name, a longer word (Demolition) and no makerspace", () => {
    expect(isDemoName("Engineering Makerspace")).toBe(false);
    expect(isDemoName("demo makerspace")).toBe(false);
    expect(isDemoName("The Demo Space")).toBe(false);
    expect(isDemoName("Demolition Lab")).toBe(false);
    expect(isDemoName("")).toBe(false);
    expect(isDemoName(null)).toBe(false);
    expect(isDemoName(undefined)).toBe(false);
  });
});
