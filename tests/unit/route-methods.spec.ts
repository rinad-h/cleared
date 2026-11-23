// P7-52 (CSRF): server actions rely on Next.js's origin check; route handlers
// are GET only, apart from Better Auth's (it checks trustedOrigins itself).
import { describe, expect, it } from "vitest";

const sources = import.meta.glob<string>("../../src/app/**/route.ts", { query: "?raw", import: "default", eager: true });
const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const BETTER_AUTH = "../../src/app/api/auth/[...all]/route.ts";

/** Names exported from a module's source (functions, consts, `export { … }`). */
function exportedNames(source: string): string[] {
  const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.push(name);
    }
  }
  return names;
}

describe("route handlers", () => {
  it("there are route handlers, including Better Auth's", () => {
    expect(Object.keys(sources)).toContain(BETTER_AUTH);
    expect(Object.keys(sources).length).toBeGreaterThan(1);
  });

  it.each(Object.keys(sources).filter((p) => p !== BETTER_AUTH))("%s exports GET only", (path) => {
    const methods = exportedNames(sources[path]).filter((n) => HTTP_METHODS.includes(n));
    expect(methods).toEqual(["GET"]);
  });

  it("Better Auth's handler exports GET and POST only", () => {
    expect(exportedNames(sources[BETTER_AUTH]).filter((n) => HTTP_METHODS.includes(n)).sort()).toEqual(["GET", "POST"]);
  });

  it("finds every export form", () => {
    expect(exportedNames("export const POST = x; export async function GET() {} export { a as PUT, b };")).toEqual(["POST", "GET", "PUT", "b"]);
  });
});
