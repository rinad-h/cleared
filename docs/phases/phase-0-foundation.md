# Phase 0 — Foundation & Platform

> **Goal:** a deployable, tested, nearly empty Next.js app on its **final URL**, with every tool, account, config and safety rail in place, so that from Phase 1 on every change is a feature change. This phase also **checks the two CPU risks** (password hashing and server rendering) on Workers Free before anything depends on them.

| | |
|---|---|
| PRD coverage | Section 10 (platform, replaced by `technologies.md`), 11.1 (no auth bypass), 14 (build rules) |
| Depends on | Nothing |
| Unlocks | Phase 1 |
| Estimated effort | 2–3 days |
| Demo checkpoint | `https://cleared.<your-subdomain>.workers.dev` loads the app shell; `/api/health` returns `ok` with the commit SHA; spikes S1 and S2 recorded |

---

## 1. Outcomes

1. Accounts ready (Cloudflare, GitHub), **no payment method anywhere**.
2. The `workers.dev` URL is chosen and **frozen**. It's printed on every QR label.
3. A Next.js 16 + OpenNext + D1 + Drizzle + Better Auth project laid out as in `technologies.md` §9, with the known platform quirks handled (`technologies.md` §16).
4. One D1 database, `cleared` (location hint `wnam`), for the single deployment; local D1 for dev and tests.
5. Migration pipeline proven: `db:generate` → review → apply local → the deployment.
6. Local checks (`npm run check`: lint, typecheck, tests, OpenNext build, bundle and repo guards) and deploy scripts that smoke-test what they deploy. No CI/CD service.
7. Test harness: Vitest service tests in `workerd` with local D1; Playwright E2E on a throwaway D1.
8. **Spike S1 (password CPU)** and **spike S2 (server-render CPU)** done on the deployment.
9. Shared foundations in code: `getDb()`, `ServiceError` + `run()`, the `Actor` type, error boundaries, status colour tokens and `<StatusBadge>`.
10. **[`docs/setup-and-deploy.md`](../setup-and-deploy.md) works end to end** for someone starting from a fresh fork. Phase 0 is the first run-through of that guide.

## 2. Scope

**In:** accounts, scaffold, config, the deployment, check and deploy scripts, test harness, health route, error handling, logging, app shell, platform spikes, the setup guide.

**Out:** the real sign-in UI and members (Phase 1), business tables (Phase 1+).

---

## 3. Tasks

★ = needed for the PRD 5.1 minimum demo. In Phase 0 everything is ★ except where marked.

### 3.1 Accounts and decisions

Follow [`setup-and-deploy.md`](../setup-and-deploy.md) §2–3.

| ID | Task | Detail | Done when |
|---|---|---|---|
| P0-01 | Project mailbox (recommended) | A dedicated address that owns the project accounts | Exists with 2FA |
| P0-02 ★ | Cloudflare account | Free plan, **no payment method**, 2FA on. Daily quotas are shared by every Worker on an account, so use a dedicated free account if you already run other Workers | Dashboard shows Workers Free |
| P0-03 ★ | **Freeze the URL** | Choose the `workers.dev` subdomain (`setup-and-deploy.md` §3). The app's URL is `https://cleared.<your-subdomain>.workers.dev` (one deployment, no staging). Put the subdomain in your git-ignored `cleared.config.json`; deploys render it into `PUBLIC_BASE_URL` / `BETTER_AUTH_URL` | Recorded privately; never changed afterwards |
| P0-04 | GitHub repo | Public or private, to hold the code and one pull request per phase. No Actions (no CI/CD) | Exists |
| P0-06 | Re-check free-tier limits | Open every source in `technologies.md` §19; update §3/§13 if anything changed; check the **Dec 1, 2026 Workers Logs** pricing change | `technologies.md` check date updated |

### 3.2 Scaffold

| ID | Task | Detail |
|---|---|---|
| P0-10 ★ | Create the project | `npx create-next-app@16` (TypeScript, App Router, Tailwind, ESLint, `src/` directory). Add `@opennextjs/cloudflare`, `wrangler`, `drizzle-orm`, `drizzle-kit`, `better-auth`, `zod`, `server-only`, `lucide-react`, `sonner`, `qrcode`, `tsx`; run `npx shadcn@latest init`. **Pin exact versions** (the known-good set in `technologies.md` §3). Add the `@opennextjs/aws` → `cookie` npm override if still needed (`technologies.md` §16) |
| P0-11 ★ | Platform config | `wrangler.jsonc` exactly as in `technologies.md` §4.7, with **placeholders** (`<your-subdomain>`, `<database-id>`) committed to the template; your values in the git-ignored `cleared.config.json`, rendered into `wrangler.deploy.jsonc` by `scripts/render-wrangler.mjs`. Also `open-next.config.ts` (`defineCloudflareConfig()`, no caches), `next.config.ts` (`initOpenNextCloudflareForDev()`, `cacheComponents` dev-only, `distDir` from `NEXT_DIST_DIR`, `devIndicators` off when `E2E=1`), `drizzle.config.ts` (`schema: ./src/db/schema.ts`, `out: ./drizzle`, `dialect: sqlite`), `.dev.vars.example`, `.gitignore` (`.env*`, `.dev.vars*` except the example, `.open-next/`, `.wrangler/`, `.next*/`) |
| P0-12 ★ | Foundations | `src/db/index.ts` (`getDb()` → `drizzle(getCloudflareContext().env.DB, { schema })`); `src/lib/action.ts` (`ActionResult`, `run()`, `parse()`); `src/proxy.ts` (cookie-presence redirect; matcher set in Phase 1); shadcn components you'll use; `globals.css` semantic tokens |
| P0-13 ★ | Layout per `technologies.md` §9 | `src/server/{services,domain}/`, `src/server/authz.ts`, `src/server/machine-write.ts` (stub), `src/data/`, `src/actions/`, `src/lib/actor.ts` (stub). Add **`AGENTS.md`** (and a one-line `CLAUDE.md` pointing to it) with the project rules: services hold permission checks; `server-only` for DB/auth modules; session reads inside `<Suspense>`; Zod on every input; additive migrations; `prefetch={false}` on member links; labels/join URLs from `PUBLIC_BASE_URL` only; fully qualified names in correlated `sql` subqueries |
| P0-14 ★ | `ServiceError` + codes | `src/server/domain/errors.ts`: code list (README §4.3), `ServiceError(code, message, fieldErrors?)`. `run()` maps it to `ActionResult` with `code`; `toHttp()` for route handlers. D1 daily-limit errors (matched by message) → `DAILY_LIMIT` |
| P0-15 ★ | `Actor` type | `{ kind: "anonymous" } \| { kind: "user", … } \| { kind: "member", memberId, userId, role, status, displayName }`; `getActor()` implemented in Phase 1 |
| P0-16 ★ | `package.json` scripts | As in `technologies.md` §11.2 and `setup-and-deploy.md` §16: `dev`, `build`, `build:worker`, `preview`, `check`, `config:render`, `deploy`, `deploy:first`, `remote`, `lint`, `typecheck`, `test`, `test:e2e`, `db:generate`, `db:migrate`, `db:migrate:remote`, `db:seed`, `cf-typegen` |
| P0-17 | `public/robots.txt` | `Disallow: /`. Pass pages and the console mustn't be indexed |
| P0-18 ★ | Root `README.md` | What Cleared is (one paragraph from the PRD), a link to `docs/setup-and-deploy.md`, the quick-start (`npm ci` → `.dev.vars` → `db:migrate` → `dev`), and links to the PRD, `technologies.md` and the phases. **No personal names, accounts or URLs.** Placeholders only |
| P0-19 | Licence | Choose and add a `LICENSE` file (e.g. MIT) so others can reuse the code |

### 3.3 Cloudflare resources

Follow `setup-and-deploy.md` §5–7 and §9.

| ID | Task | Detail |
|---|---|---|
| P0-20 ★ | Connect Wrangler | `npx wrangler login`, `npx wrangler whoami` (set `CLOUDFLARE_ACCOUNT_ID` if you have several accounts) |
| P0-21 ★ | Create the D1 database | `npx wrangler d1 create cleared --location=wnam` (outside the repo, or answer "no" to updating the config); put the ID in your `cleared.config.json` as `d1DatabaseId` (never in `wrangler.jsonc`) |
| P0-22 ★ | `scripts/deploy.sh` (`deploy:first`) | With `--first`: refuses if the Worker already has `BETTER_AUTH_SECRET`; generates `BETTER_AUTH_SECRET` (`openssl rand -base64 32`); builds without the secret in the environment; scans the build for its value; writes it to a mode-600 temp file removed on exit and runs `opennextjs-cloudflare deploy --secrets-file <tmp>`; smoke-tests. Run once. Extra arguments are rejected |
| P0-23 ★ | Rate-limit binding | `RL_ACTIONS` in `wrangler.jsonc` (verified in spike S3) |
| P0-24 ★ | `Env` types | `npm run cf-typegen` → `cloudflare-env.d.ts`; commit; `npm run check` fails if it's stale |

### 3.4 App skeleton

| ID | Task | Detail |
|---|---|---|
| P0-30 ★ | Route groups | `(auth)/sign-in`, `(auth)/sign-up` (placeholders), `(member)/machines`, `(member)/m/[token]`, `(member)/me/certifications`, `(member)/help`, `join/[token]`, `setup`, `console/*`. Two layouts: member (bottom tab bar) and console (sidebar on desktop, drawer on phone). `not-found.tsx`, `error.tsx` (retry + a "daily limit" variant), `loading.tsx` skeletons |
| P0-31 ★ | `GET /api/health` | Route handler: `SELECT 1` through `getDb()` → `{ status: "ok", version: BUILD_SHA, environment }`. `BUILD_SHA` injected at build time |
| P0-32 ★ | Logging helper | `log(level, event, fields)` → JSON to `console.log`. No emails, names, tokens or free text |
| P0-33 ★ | Status tokens + `<StatusBadge>` | Tokens `cleared`, `supervision`, `not-cleared`, `out-of-service`, `in-use` (≥ 4.5:1 contrast). The badge always renders **colour + icon + word** |
| P0-34 | Security headers | `next.config.ts` `headers()`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, a CSP allowing `'self'` (tune in Phase 7) |
| P0-35 | `usePoll` hook | `src/components/use-poll.ts`: JSON fetch with `If-None-Match`, keeps data on 304, pauses while hidden, 30 s → 120 s back-off after 10 min idle (Phases 4 and 6) |
| P0-36 | `<AutoRefresh>` | Small client component that calls `router.refresh()` every N seconds while the tab is visible (pass page, Phase 3) |

### 3.5 Database and migrations

| ID | Task | Detail |
|---|---|---|
| P0-40 ★ | Baseline migration | `drizzle/0000_baseline.sql`: `app_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)`. Proves the pipeline before real tables |
| P0-41 ★ | Apply everywhere | `npm run db:migrate` (local), `npm run db:migrate:remote`; confirm with `npm run remote -- d1 migrations list DB --remote` |
| P0-42 ★ | `drizzle/README.md` checklist | Additive only once the deployment has data; no `DROP`/`RENAME`; new columns nullable or defaulted; every hot filter indexed; triggers reviewed (drizzle-kit doesn't generate them); `EXPLAIN QUERY PLAN` for new hot queries; fully qualified names in correlated subqueries |

### 3.6 Test harness

| ID | Task | Detail |
|---|---|---|
| P0-50 ★ | Vitest in `workerd` | `vitest.config.mts` with the `cloudflareTest()` plugin from `@cloudflare/vitest-plugin` (the renamed `vitest-pool-workers`): `wrangler.configPath`, D1 binding, setup file applying `drizzle/` migrations with `applyD1Migrations`; path aliases matching `tsconfig` |
| P0-51 ★ | Test helpers | `tests/helpers/db.ts` (`testDb()`), `tests/helpers/time.ts` (`T0`, `MIN`, `HOUR`, `DAY`), placeholders for `actors` (Phase 1) and `seed` (Phase 2) |
| P0-52 ★ | First tests | `tests/unit/errors.spec.ts` (`ServiceError` → `ActionResult`; D1 limit → `DAILY_LIMIT`; unknown → generic message); `tests/services/health.spec.ts` (`SELECT 1` against local D1) |
| P0-53 ★ | E2E harness | `tests/e2e/run.sh`: makes a temp dir; applies migrations to a throwaway D1 state dir (`--persist-to`); starts `next dev` on a spare port with `D1_STATE_DIR`, `NEXT_DIST_DIR=.next-e2e`, `E2E=1`, `ENVIRONMENT=test`, `BETTER_AUTH_URL=http://localhost:<port>`; waits for it; runs `npx playwright test`; stops the server. First spec: app shell at 320/375 px, no horizontal scroll, axe clean |

### 3.7 Checks and deploys (no CI/CD)

**Decision (2026-11-22): no CI/CD service.** The original P0-60 (`ci.yml`), P0-61 (Cloudflare API token as GitHub secrets) and P0-62 (`deploy.yml`) are replaced by local commands:

| ID | Task | Detail |
|---|---|---|
| P0-60 ★ | `npm run check` | Repo guards → `lint` → `typecheck` → `cf-typegen --check` → `test` → `build:worker` → bundle scan (`scripts/check-bundle.mjs`). Must pass before every deploy; `npm run test:e2e` too once the deployment has real users |
| P0-61 | API token (only if deploying headless) | Custom token: Workers Scripts: Edit, D1: Edit, your account only (`setup-and-deploy.md` §13), exported in the shell, never stored in a file. Not needed with `wrangler login` |
| P0-62 ★ | Deploy scripts + smoke test | `npm run deploy` renders `wrangler.deploy.jsonc`, builds, deploys, then runs `scripts/smoke-test.sh` (`/api/health` must return the current commit SHA). Migrations first with `npm run db:migrate:remote` |
| P0-63 | Runbook stub | `docs/runbook.md` (completed in Phase 7): deploy, `wrangler rollback`, D1 Time Travel |

### 3.8 Bundle and config guards

There is no test-auth stub (`technologies.md` §6.7). `npm run check` still checks:

| ID | Check | How |
|---|---|---|
| P0-70 ★ | No secrets in the client bundle | `scripts/check-bundle.mjs` scans `.open-next/assets` for secret patterns (auth secret, private keys, tokens); fails if found |
| P0-71 ★ | No `.env*` files committed | `npm run check` fails if `.env`, `.env.local` or `.env.production` is tracked (OpenNext can embed `.env*` values into the bundle) |
| P0-72 | Dev-only switches guarded | `wrangler.jsonc` must not contain `ENABLE_SPIKES` (only ever a temporary Worker secret); the dev-only branch of `getEnv()` must not reach the Worker bundle |
| P0-73 | Template hygiene (**automated** + a manual name/email check) | `scripts/check-bundle.mjs` fails if `wrangler.jsonc` loses a placeholder or gains a real URL, UUID/hex id or `account_id`; if `cleared.config.example.json` holds real values; if `cleared.config.json`, `wrangler.deploy.*`, `.env*`/`.dev.vars` or a `.sql` file outside `drizzle/` could be committed; or if a value from your `cleared.config.json` appears in any committable file. Deployers keep their values in the git-ignored `cleared.config.json` (`setup-and-deploy.md` §7). Still check by hand that no personal names or emails appear anywhere |

### 3.9 Platform spikes

| ID | Spike | Method | Decision |
|---|---|---|---|
| **P0-80 ★** | **S1: Better Auth email + password CPU on Workers Free** (light check; comparable apps on this exact setup sign up and sign in without failures) | After the first deploy, do **5–10 sign-ups and sign-ins** by hand or with a small script. Confirm no Cloudflare **1102** errors and note `cpuTime` in Workers Logs. Delete the test users | **No failures** (expected) → keep Better Auth's default scrypt. **Failures** → native `node:crypto` scrypt with the same parameters and format (`technologies.md` §6.4), re-test. **Still failing** → decide with the project owner: fall back to Google + email codes (no hashing). **Never** lower scrypt cost, **never** upgrade to paid |
| **P0-81 ★** | **S2: server-rendering CPU** | Deploy a representative **pass-like page** (session read + 5 D1 queries + ~40 elements) and a **board-like page** (60 tiles) to the deployment (with `ENABLE_SPIKES=1`). Call each 50 times; read `cpuTime` (median, p99) | p99 ≤ 5 ms → proceed. 5–10 ms → apply `technologies.md` §5.2 rules strictly. > 10 ms → render the board client-side from the route handler JSON |
| P0-82 ★ | S3: rate-limit binding on Free | A temporary spike route (dev, or the deployment with `ENABLE_SPIKES=1`) calls `RL_ACTIONS.limit({ key: "spike" })` 25 times | Works → binding. Doesn't deploy or doesn't limit → D1 fallback (Phase 6) |
| P0-83 | S4: static assets not billed | Load a page while running `npx wrangler tail cleared`: only the page request runs the Worker, not `/_next/static/*` | Confirmed |
| P0-84 | S5: cold path timing | After ≥ 30 min idle, time the first load of a page on a phone over cellular | Baseline for T12 |

---

## 4. Files produced

```
README.md  LICENSE  AGENTS.md  CLAUDE.md  .gitattributes
wrangler.jsonc (placeholders)  cleared.config.example.json  open-next.config.ts  next.config.ts  drizzle.config.ts
vitest.config.mts  playwright.config.ts  eslint.config.mjs  postcss.config.mjs  components.json  tsconfig.json  cloudflare-env.d.ts
.dev.vars.example  .gitignore  .nvmrc
drizzle/0000_baseline.sql  drizzle/README.md
scripts/{deploy.sh, smoke-test.sh, render-wrangler.mjs, check-bundle.mjs, cf-typegen.mjs, seed.ts, spike-load.mjs (temporary)}
scripts/lib/{jsonc.mjs, build-sha.cjs}
public/robots.txt
src/proxy.ts
src/app/{layout.tsx, error.tsx, global-error.tsx, not-found.tsx, icon.svg, (auth)/…, (member)/…, join/…, setup/, console/…, api/health/route.ts}
src/app/{spike/…, api/spike/…} (temporary, dev or ENABLE_SPIKES=1 only)
src/db/{index.ts, schema.ts}
src/lib/{action.ts, actor.ts, env.ts, permissions.ts (stub), validation.ts, utils.ts}
src/server/{domain/{errors,actor,enums}.ts, authz.ts (stub), machine-write.ts (stub), services/health.ts, log.ts, spikes/ (temporary)}
src/data/README.md  src/actions/README.md (filled from Phase 1)
src/components/{ui/*, status-badge.tsx, placeholder.tsx, use-poll.ts, auto-refresh.tsx, layouts/*}
tests/{unit/*, services/*, client/*, scripts/*, helpers/*, e2e/{run.sh, fixtures.ts, shell.spec.ts}}
docs/runbook.md (stub)   docs/setup-and-deploy.md (verified)
```

---

## 5. Tests and checks

| Check | Type | Pass condition |
|---|---|---|
| Health route | Service + smoke | `ok`, version present; the deployment returns the deployed SHA |
| Error mapping | Unit | `ServiceError` → `ActionResult` with code; D1 limit → `DAILY_LIMIT`; unknown → generic message, no stack |
| Bundle and repo guards | `npm run check` | No secrets in assets; no `.env*` tracked. Prove each check fails once by planting a fake value |
| App shell | E2E | Renders at 320/375 px, no horizontal scroll, axe clean |
| Setup guide | Manual | Someone else (or you, in a fresh clone and a fresh Cloudflare account) follows `setup-and-deploy.md` to a working deploy without extra help; fix every gap found |
| Spikes | Manual | S1–S5 results in §7 |

---

## 6. Exit criteria

- [ ] The deployment's `/api/health` returns `ok` with the current SHA; client routes render the shell (reload works).
- [ ] `npm run check` and `npm run test:e2e` green on the deployed commit; `npm run deploy` finishes with a passing smoke test.
- [ ] Migration `0000` applied locally and to the deployment.
- [ ] S1 and S2 decided, with numbers; rate-limit approach decided (S3).
- [ ] `setup-and-deploy.md` verified from a fresh clone.
- [ ] The template repository contains no personal names, accounts, subdomains or database IDs (P0-73).
- [ ] No payment method on any account; Cloudflare shows Workers Free.

---

## 7. Decisions (fill in during the phase; keep personal values out of the repo)

| Decision | Value | Date |
|---|---|---|
| Subdomain chosen and recorded privately | yes/no | |
| **S1:** sign-up/sign-in failures out of 5–10; median `cpuTime`; hasher | | |
| **S2:** pass-like and board-like p99 `cpuTime`; render strategy | | |
| S3: rate-limit binding works on Free? | | |

### 7.1 Implementation notes (decided while building)

| Decision | Detail | Date |
|---|---|---|
| Test runner package | `@cloudflare/vitest-pool-workers` is deprecated and renamed `@cloudflare/vitest-plugin` (Vitest 4 `cloudflareTest()` plugin). Config is `vitest.config.mts` (the package is ESM-only) with a stub `main` so tests don't need an OpenNext build | 2026-11-22 |
| `cookie` npm override | Not needed with `@opennextjs/cloudflare` 1.20.18; build and `preview` work without it | 2026-11-22 |
| `proxy.ts` on Workers | Next 16 proxy is Node.js runtime; OpenNext calls this "experimental" but the redirect works in `preview` (workerd). The matcher matches nothing until Phase 1 | 2026-11-22 |
| Spike S1 method | Better Auth's tables arrive in Phase 1, so S1 measures the exact functions Better Auth uses (`hashPassword` / `verifyPassword` from `better-auth/crypto`) at `/api/spike/hash?op=signup\|signin`. Re-confirm with real sign-ups on the deployment in Phase 1 | 2026-11-22 |
| Spike routes | `/spike/pass`, `/spike/board`, `/api/spike/hash`, `/api/spike/rate-limit`: on in development; on the deployment only while the `ENABLE_SPIKES` Worker secret is `1` (`npm run remote -- secret put ENABLE_SPIKES`, then `npm run remote -- secret delete ENABLE_SPIKES`), otherwise 404. Load them with `node scripts/spike-load.mjs <url> 50`; delete after recording results | 2026-11-22, updated 2026-11-23 |
| Local/E2E env overrides | `wrangler.jsonc` vars are production values. `.dev.vars` overrides them locally; the E2E harness overrides `ENVIRONMENT`, URLs and secrets via `process.env`, read by `getEnv()` only under `next dev` | 2026-11-22 |
| `cf-typegen` | Runs with `--strict-vars=false` so generated types don't contain the placeholder URLs and `ENVIRONMENT` can be `development`/`test` | 2026-11-22 |
| Worker build in `npm run check` | One step, `npm run build:worker`: OpenNext runs `npm run build` (`next build --webpack`) itself with the settings it needs. A separate `npm run build` + `--skipNextBuild` fails (no standalone middleware trace) and would build twice | 2026-11-22 |
| Generic repo, personal config outside it | The committed `wrangler.jsonc` keeps placeholders (enforced by `npm run check`). Your subdomain and D1 database ID live in git-ignored `cleared.config.json` (or `WORKERS_SUBDOMAIN` / `D1_DATABASE_ID`); `scripts/render-wrangler.mjs` writes git-ignored `wrangler.deploy.jsonc`, used by every deploy/remote script (`npm run remote -- …` for ad-hoc remote D1 commands) | 2026-11-22 |
| No CI/CD | GitHub Actions dropped at the project owner's request. P0-60–62 became `npm run check` + deploy scripts that smoke-test; the deploy URL for the smoke test comes from `cleared.config.json`. Trade-off: nothing enforces the checks automatically, so run `npm run check` before every deploy and merge | 2026-11-22 |
| `cf-typegen` determinism | `scripts/cf-typegen.mjs` generates from a temporary copy of `wrangler.jsonc` without `main`; otherwise Wrangler types the self-reference binding from `.open-next/worker.js` when a build exists, and the `npm run check` freshness check would flap | 2026-11-22 |
| Licence | MIT, copyright "The Cleared contributors" (no personal names) | 2026-11-22 |
| Code review fixes (2026-11-22) | One `scripts/deploy.sh` for all deploys, extra args rejected (npm appends `-- args` to the end of an `&&` chain, so a passed-through flag could silently change what deploys); `--first` refuses to overwrite the existing secret | 2026-11-22 |
| Build version | `scripts/lib/build-sha.cjs`, shared by `next.config.ts` and the smoke test: commit SHA, `-dirty-<hash>` for uncommitted changes, `BUILD_SHA` override. The smoke test also checks `environment`, `/help` and the `/` → `/machines` 307 | 2026-11-22 |
| Guards | `check-bundle.mjs` scans the whole build (client and Worker) for literal secret values from `.dev.vars`/the environment, for embedded `.env*` values (`next-env.mjs`), and for the marker in `getEnv()`'s dev-only branch, which must be removed as dead code; it runs in `npm run check` and in every deploy | 2026-11-22 |
| Windows | `.gitattributes` forces LF; `cf-typegen.mjs` runs Wrangler via `process.execPath` (no `npx.cmd`) | 2026-11-22 |
| Forms | FormData keys sent once are strings: repeating fields (checkboxes, multi-selects) use `formArray()` from `src/lib/validation.ts` | 2026-11-22 |
| Logging | `log(level, event, fields, err?)`: fields can't overwrite `level`/`event`; redaction works word by word (ids/counts/codes kept); `err` becomes PII-free `errorDetails()` (names, stack frames, Drizzle SQL without params, D1 cause) | 2026-11-22 |
| Daily-limit detection | Only D1 quota wording, walking the `cause` chain and never matching Drizzle's "Failed query … params" text (user input) | 2026-11-22 |
| sonner | Installed but not mounted (it shipped ~9 KB to every page with no caller); the first phase that shows a toast mounts `<Toaster>` in the member/console layouts | 2026-11-22 |
| Dev server | `next dev -H 127.0.0.1` (also in E2E): dev-only routes aren't reachable from the LAN | 2026-11-22 |
| Tests | Vitest has two projects: `workers` (workerd + D1, every var pinned) and `dom` (happy-dom, `tests/client/`); `node --test` covers the deploy-critical scripts; `.only` is always an error. E2E fails on browser console errors and on changes to your own `.wrangler/state` | 2026-11-22 |
| Spike pages | Gated inside their `<Suspense>` boundary (required under `next dev`), so outside development (and without `ENABLE_SPIKES=1`) they render the not-found page with status 200; the spike API routes return a real 404. `export const instant = false` would block instead, but production builds reject it without Cache Components | 2026-11-22 |
| Single deployment, no staging | At the project owner's request: one Worker (`cleared`) and one D1 database (`cleared`); `wrangler.jsonc` has no `env` block, `cleared.config.json` holds `workersSubdomain` + `d1DatabaseId`, and `ENVIRONMENT` is `development`, `test` or `production`. Trade-off: no pre-production copy, so once the app has real users every change is tested locally first (`npm run check`, `npm run test:e2e`, `npm run preview`), and D1 Time Travel + `wrangler rollback` are the undo (`setup-and-deploy.md` §10) | 2026-11-23 |
| No email sending | At the project owner's request the app sends no email: Brevo's sign-up needs an organization postal address, and Resend and Cloudflare Email need a domain. No Brevo account or secrets; `BETTER_AUTH_SECRET` is the only Worker secret; no address verification and no self-service password reset (admin script instead; `technologies.md` §7) | 2026-11-23 |

## 8. Risks and open questions

| Item | Notes |
|---|---|
| S1 fails even with native scrypt | Unlikely. If it happens, the only $0 options are dropping passwords (Google sign-in) or accepting failures. Decide before Phase 1 |
| Other Workers on the same Cloudflare account | Quotas are per account. A busy day elsewhere could take Cleared down. Use a dedicated account |
| OpenNext / Next 16 quirks | Handle the ones in `technologies.md` §16; pin versions; upgrade deliberately |
| Workers Logs pricing change (Dec 1, 2026) | S1/S2 rely on `cpuTime` in logs. If logs stop being free, use `wrangler tail`, which shows CPU per request |
| Wrong subdomain chosen | Labels must be reprinted; choose once |
