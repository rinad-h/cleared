import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { buildSha } from "./scripts/lib/build-sha.cjs";

const isDev = process.env.NODE_ENV === "development";


// CSP allows 'self' only. Next.js injects inline bootstrap scripts, so script-src
// needs 'unsafe-inline' until nonces are added (tuned in Phase 7).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // The E2E server builds into its own directory so it can run next to `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // OpenNext/workerd can hang on Cache Components output: dev only (technologies.md §16).
  // Dev still enforces that session reads sit inside <Suspense>.
  cacheComponents: isDev,
  // Matches production prefetching, where Cache Components (and so Partial Prefetching) is off.
  partialPrefetching: isDev ? false : undefined,
  // The dev indicator covers bottom-left buttons at phone widths in E2E.
  devIndicators: process.env.E2E === "1" ? false : undefined,
  poweredByHeader: false,
  // Version baked into the build; `/api/health` reports it and the deploy scripts'
  // smoke test expects the same value (scripts/lib/build-sha.cjs, shared by both).
  env: {
    BUILD_SHA: buildSha(),
  },
  async redirects() {
    // The member app is the default screen. A config redirect costs no React render.
    return [{ source: "/", destination: "/machines", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;

// Gives `next dev` the Worker bindings (local D1, vars, .dev.vars) from wrangler.jsonc.
// E2E points it at a throwaway D1 state directory (tests/e2e/run.sh).
if (isDev) {
  void initOpenNextCloudflareForDev({
    remoteBindings: false,
    // Same directory the E2E harness passes to `wrangler d1 migrations apply --persist-to`.
    ...(process.env.D1_STATE_DIR ? { persist: { path: `${process.env.D1_STATE_DIR}/v3` } } : {}),
  });
}
