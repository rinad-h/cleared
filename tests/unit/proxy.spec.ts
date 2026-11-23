import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("proxy (signed-out redirect)", () => {
  it("redirects to /sign-in with the original path and query in `next`", () => {
    const res = proxy(new NextRequest("https://cleared.example/m/abc?from=label"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("next")).toBe("/m/abc?from=label");
  });

  it.each([
    ["http://localhost:3000/machines", "better-auth.session_token=t"],
    ["https://cleared.example/machines", "__Secure-better-auth.session_token=t"],
  ])("lets %s through with a session cookie", (url, cookie) => {
    const res = proxy(new NextRequest(url, { headers: { cookie } }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
