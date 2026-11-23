import { describe, expect, it } from "vitest";
import { scrubAuthLogMessage } from "@/lib/auth";

describe("Better Auth log scrubbing (AGENTS.md rule 13)", () => {
  it("removes emails and URLs from Better Auth's messages", () => {
    expect(scrubAuthLogMessage("Sign-up attempt for existing email: ada@example.test")).toBe(
      "Sign-up attempt for existing email: [email]",
    );
    expect(scrubAuthLogMessage("Redirecting to https://cleared.example/join/abc?x=1 now")).toBe(
      "Redirecting to [url] now",
    );
    expect(scrubAuthLogMessage("Invalid password")).toBe("Invalid password");
  });

  it("caps the length", () => {
    expect(scrubAuthLogMessage("x".repeat(1000))).toHaveLength(200);
  });
});
