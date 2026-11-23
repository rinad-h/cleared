# Phase 0 — Foundation & Platform

> **Goal:** a deployable, tested, nearly empty Next.js app on its **final production URL**, with every tool, account, environment and safety rail in place, so that from Phase 1 on every change is a feature change. This phase also **checks the two CPU risks** (password hashing and server rendering) on Workers Free before anything depends on them.

| | |
|---|---|
| PRD coverage | Section 10 (platform, replaced by `technologies.md`), 11.1 (no auth bypass), 14 (build rules) |
| Depends on | Nothing |
| Unlocks | Phase 1 |
| Estimated effort | 2–3 days |
| Demo checkpoint | `https://cleared.<your-subdomain>.workers.dev` loads the app shell; `/api/health` returns `ok` with the commit SHA; spikes S1 and S2 recorded |

---

## 1. Outcomes

1. Accounts ready (Cloudflare, GitHub, Brevo), **no payment method anywhere**.
2. The `workers.dev` URL is chosen and **frozen**. It's printed on every QR label.
3. A Next.js 16 + OpenNext + D1 + Drizzle + Better Auth project laid out as in `technologies.md` §9, with the known platform quirks handled (`technologies.md` §16).
4. D1 databases `cleared-staging` and `cleared-prod` (location hint `wnam`); local D1 for dev and tests.
5. Migration pipeline proven: `db:generate` → review → apply local → staging → production.
6. CI (lint, typecheck, tests, build, OpenNext build, bundle checks) and CD (staging on merge, production with approval).
7. Test harness: Vitest service tests in `workerd` with local D1; Playwright E2E on a throwaway D1.
8. **Spike S1 (password CPU)** and **spike S2 (server-render CPU)** done on staging.
9. Shared foundations in code: `getDb()`, `ServiceError` + `run()`, the `Actor` type, error boundaries, status colour tokens and `<StatusBadge>`.
10. **[`docs/setup-and-deploy.md`](../setup-and-deploy.md) works end to end** for someone starting from a fresh fork. Phase 0 is the first run-through of that guide.

## 2. Scope

**In:** accounts, scaffold, config, environments, CI/CD, test harness, health route, error handling, logging, app shell, platform spikes, the setup guide.

**Out:** the real sign-in UI and members (Phase 1), business tables (Phase 1+).

---

## 3. Tasks

★ = needed for the PRD 5.1 minimum demo. In Phase 0 everything is ★ except where marked.

### 3.1 Accounts and decisions

Follow [`setup-and-deploy.md`](../setup-and-deploy.md) §2–3 and §9.

| ID | Task | Detail | Done when |
|---|---|---|---|
| P0-01 | Project mailbox (recommended) | A dedicated address that owns the Brevo sender and project accounts | Exists with 2FA |
| P0-02 ★ | Cloudflare account | Free plan, **no payment method**, 2FA on. Daily quotas are shared by every Worker on an account, so use a dedicated free account if you already run other Workers | Dashboard shows Workers Free |
| P0-03 ★ | **Freeze the URL** | Choose the `workers.dev` subdomain (`setup-and-deploy.md` §3). Production `https://cleared.<your-subdomain>.workers.dev`, staging `https://cleared-staging.<your-subdomain>.workers.dev`. Set them as `PUBLIC_BASE_URL` / `BETTER_AUTH_URL` in your deployment's `wrangler.jsonc` | Recorded in §7; never changed afterwards |
| P0-04 ★ | GitHub repo | Public (unlimited Actions minutes) or private (2,000 min/month); `main` protected (PR + green CI) | Exists |
| P0-05 ★ | Brevo account | Free plan; verify the sender address; create an API key; check whether the account needs sending approval | Key stored in a password manager |
| P0-06 | Re-check free-tier limits | Open every source in `technologies.md` §19; update §3/§13 if anything changed; check the **Dec 1, 2026 Workers Logs** pricing change | `technologies.md` check date updated |

### 3.2 Scaffold

| ID | Task | Detail |
|---|---|---|
| P0-10 ★ | Create the project | `npx create-next-app@16` (TypeScript, App Router, Tailwind, ESLint, `src/` directory). Add `@opennextjs/cloudflare`, `wrangler`, `drizzle-orm`, `drizzle-kit`, `better-auth`, `zod`, `server-only`, `lucide-react`, `sonner`, `qrcode`, `tsx`; run `npx shadcn@latest init`. **Pin exact versions** (the known-good set in `technologies.md` §3). Add the `@opennextjs/aws` → `cookie` npm override if still needed (`technologies.md` §16) |
| P0-11 ★ | Platform config | `wrangler.jsonc` exactly as in `technologies.md` §4.7, with **placeholders** (`<your-subdomain>`, `<prod-database-id>`, `<staging-database-id>`) committed to the template, and your values in your deployment. Also `open-next.config.ts` (`defineCloudflareConfig()`, no caches), `next.config.ts` (`initOpenNextCloudflareForDev()`, `cacheComponents` dev-only, `distDir` from `NEXT_DIST_DIR`, `devIndicators` off when `E2E=1`), `drizzle.config.ts` (`schema: ./src/db/schema.ts`, `out: ./drizzle`, `dialect: sqlite`), `.dev.vars.example`, `.gitignore` (`.env*`, `.dev.vars*` except the example, `.open-next/`, `.wrangler/`, `.next*/`) |
| P0-12 ★ | Foundations | `src/db/index.ts` (`getDb()` → `drizzle(getCloudflareContext().env.DB, { schema })`); `src/lib/action.ts` (`ActionResult`, `run()`, `parse()`); `src/proxy.ts` (cookie-presence redirect; matcher set in Phase 1); shadcn components you'll use; `globals.css` semantic tokens |
| P0-13 ★ | Layout per `technologies.md` §9 | `src/server/{services,domain}/`, `src/server/authz.ts`, `src/server/machine-write.ts` (stub), `src/data/`, `src/actions/`, `src/lib/actor.ts` (stub). Add **`AGENTS.md`** (and a one-line `CLAUDE.md` pointing to it) with the project rules: services hold permission checks; `server-only` for DB/auth modules; session reads inside `<Suspense>`; Zod on every input; additive migrations; `prefetch={false}` on member links; labels/join URLs from `PUBLIC_BASE_URL` only; fully qualified names in correlated `sql` subqueries |
| P0-14 ★ | `ServiceError` + codes | `src/server/domain/errors.ts`: code list (README §4.3), `ServiceError(code, message, fieldErrors?)`. `run()` maps it to `ActionResult` with `code`; `toHttp()` for route handlers. D1 daily-limit errors (matched by message) → `DAILY_LIMIT` |
| P0-15 ★ | `Actor` type | `{ kind: "anonymous" } \| { kind: "user", … } \| { kind: "member", memberId, userId, role, status, displayName }`; `getActor()` implemented in Phase 1 |
| P0-16 ★ | `package.json` scripts | As in `technologies.md` §11.2 and `setup-and-deploy.md` §17: `dev`, `build`, `build:worker`, `preview`, `deploy`, `deploy:staging`, `deploy:first`, `lint`, `typecheck`, `test`, `test:e2e`, `db:generate`, `db:migrate`, `db:migrate:staging`, `db:migrate:remote`, `db:seed`, `cf-typegen` |
| P0-17 | `public/robots.txt` | `Disallow: /`. Pass pages and the console mustn't be indexed |
| P0-18 ★ | Root `README.md` | What Cleared is (one paragraph from the PRD), a link to `docs/setup-and-deploy.md`, the quick-start (`npm ci` → `.dev.vars` → `db:migrate` → `dev`), and links to the PRD, `technologies.md` and the phases. **No personal names, accounts or URLs.** Placeholders only |
| P0-19 | Licence | Choose and add a `LICENSE` file (e.g. MIT) so others can reuse the code |

### 3.3 Cloudflare resources

Follow `setup-and-deploy.md` §5–7 and §10–11.

| ID | Task | Detail |
|---|---|---|
| P0-20 ★ | Connect Wrangler | `npx wrangler login`, `npx wrangler whoami` (set `CLOUDFLARE_ACCOUNT_ID` if you have several accounts) |
| P0-21 ★ | Create D1 databases | `npx wrangler d1 create cleared-staging --location=wnam` and `npx wrangler d1 create cleared-prod --location=wnam`; put the IDs in your `wrangler.jsonc` |
| P0-22 ★ | `scripts/deploy-first.sh` | Generates `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), writes it plus `BREVO_API_KEY` and `EMAIL_FROM_ADDRESS` (read from the shell environment; fails if they're missing) to a temp file removed on exit, then runs `opennextjs-cloudflare build && opennextjs-cloudflare deploy --secrets-file <tmp> "$@"`. Run once with `-- --env staging` and once for production (**different secrets**) |
| P0-23 ★ | Rate-limit binding | `RL_ACTIONS` in both environments (verified in spike S3) |
| P0-24 ★ | `Env` types | `npm run cf-typegen` → `cloudflare-env.d.ts`; commit; CI checks it's current |

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
| P0-41 ★ | Apply everywhere | `npm run db:migrate` (local), `npx wrangler d1 migrations apply DB --remote --env staging`, `npx wrangler d1 migrations apply DB --remote`; confirm with `npx wrangler d1 migrations list DB --remote [--env staging]` |
| P0-42 ★ | `drizzle/README.md` checklist | Additive only once production has data; no `DROP`/`RENAME`; new columns nullable or defaulted; every hot filter indexed; triggers reviewed (drizzle-kit doesn't generate them); `EXPLAIN QUERY PLAN` for new hot queries; fully qualified names in correlated subqueries |

### 3.6 Test harness

| ID | Task | Detail |
|---|---|---|
| P0-50 ★ | Vitest in `workerd` | `vitest.config.ts` with `defineWorkersConfig`: `wrangler.configPath`, D1 binding, setup file applying `drizzle/` migrations with `applyD1Migrations`; path aliases matching `tsconfig` |
| P0-51 ★ | Test helpers | `tests/helpers/db.ts` (`testDb()`), `tests/helpers/time.ts` (`T0`, `MIN`, `HOUR`, `DAY`), placeholders for `actors` (Phase 1) and `seed` (Phase 2) |
| P0-52 ★ | First tests | `tests/unit/errors.spec.ts` (`ServiceError` → `ActionResult`; D1 limit → `DAILY_LIMIT`; unknown → generic message); `tests/services/health.spec.ts` (`SELECT 1` against local D1) |
| P0-53 ★ | E2E harness | `tests/e2e/run.sh`: makes a temp dir; applies migrations to a throwaway D1 state dir (`--persist-to`); starts `next dev` on a spare port with `D1_STATE_DIR`, `NEXT_DIST_DIR=.next-e2e`, `E2E=1`, `ENABLE_DEV_OUTBOX=1`, `ENVIRONMENT=test`, `BETTER_AUTH_URL=http://localhost:<port>`; waits for it; runs `npx playwright test`; stops the server. First spec: app shell at 320/375 px, no horizontal scroll, axe clean |

### 3.7 CI/CD

| ID | Task | Detail |
|---|---|---|
| P0-60 ★ | `ci.yml` | `npm ci` → `lint` → `typecheck` → `cf-typegen` diff check → `test` → `build` → `build:worker` → `scripts/check-bundle.mjs` → E2E job on `main` and PRs labelled `e2e` |
| P0-61 ★ | Cloudflare API token | Custom token: Workers Scripts: Edit, D1: Edit, your account only (`setup-and-deploy.md` §14). GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| P0-62 ★ | `deploy.yml` | Push to `main` → `wrangler d1 migrations apply DB --remote --env staging` → `npm run deploy:staging` → smoke test (`/api/health` returns the commit SHA). Production: same steps in a GitHub environment with **required reviewers**. The staging/production URLs come from repository **variables** (`STAGING_URL`, `PRODUCTION_URL`), not hard-coded, so forks work unchanged |
| P0-63 | Runbook stub | `docs/runbook.md` (completed in Phase 7): deploy, `wrangler rollback`, D1 Time Travel |

### 3.8 Bundle and config guards

There is no test-auth stub (`technologies.md` §6.7). CI still checks:

| ID | Check | How |
|---|---|---|
| P0-70 ★ | No secrets in the client bundle | `scripts/check-bundle.mjs` scans `.open-next/assets` for `xkeysib-` and other secret patterns; fails if found |
| P0-71 ★ | No `.env*` files committed | CI fails if `.env`, `.env.local` or `.env.production` is tracked (OpenNext can embed `.env*` values into the bundle) |
| P0-72 | Dev outbox guarded | `wrangler.jsonc` must not contain `ENABLE_DEV_OUTBOX`; a test asserts `/api/dev/outbox` returns 404 unless `NODE_ENV === "development"` **and** `ENABLE_DEV_OUTBOX === "1"` (route added in Phase 1) |
| P0-73 | Template hygiene (manual, before publishing the repo for others) | The upstream repo's `wrangler.jsonc` keeps the `<your-subdomain>` / `<…-database-id>` placeholders; no personal names, emails or URLs anywhere (`git grep -nE '\.workers\.dev'` shows only placeholders). Each deployer fills in their own values in their fork (`setup-and-deploy.md` §7), which is safe because the file has no secrets |

### 3.9 Platform spikes

| ID | Spike | Method | Decision |
|---|---|---|---|
| **P0-80 ★** | **S1: Better Auth email + password CPU on Workers Free** (light check; comparable apps on this exact setup sign up and sign in without failures) | After the first staging deploy, do **5–10 sign-ups and sign-ins** by hand or with a small script. Confirm no Cloudflare **1102** errors and note `cpuTime` in Workers Logs. Delete the test users | **No failures** (expected) → keep Better Auth's default scrypt. **Failures** → native `node:crypto` scrypt with the same parameters and format (`technologies.md` §6.4), re-test. **Still failing** → decide with the project owner: fall back to Google + email codes (no hashing). **Never** lower scrypt cost, **never** upgrade to paid |
| **P0-81 ★** | **S2: server-rendering CPU** | Deploy a representative **pass-like page** (session read + 5 D1 queries + ~40 elements) and a **board-like page** (60 tiles) to staging. Call each 50 times; read `cpuTime` (median, p99) | p99 ≤ 5 ms → proceed. 5–10 ms → apply `technologies.md` §5.2 rules strictly. > 10 ms → render the board client-side from the route handler JSON |
| P0-82 ★ | S3: rate-limit binding on Free | A temporary staging-only action calls `RL_ACTIONS.limit({ key: "spike" })` 25 times | Works → binding. Doesn't deploy or doesn't limit → D1 fallback (Phase 6) |
| P0-83 | S4: static assets not billed | Load a page while running `npx wrangler tail cleared-staging`: only the page request runs the Worker, not `/_next/static/*` | Confirmed |
| P0-84 | S5: cold path timing | After ≥ 30 min idle, time the first load of a page on a phone over cellular | Baseline for T12 |

---

## 4. Files produced

```
README.md  LICENSE  AGENTS.md  CLAUDE.md
wrangler.jsonc (placeholders)  open-next.config.ts  next.config.ts  drizzle.config.ts  vitest.config.ts
eslint.config.mjs  postcss.config.mjs  components.json  tsconfig.json  cloudflare-env.d.ts
.dev.vars.example  .gitignore  .nvmrc
drizzle/0000_baseline.sql  drizzle/README.md
scripts/deploy-first.sh  scripts/check-bundle.mjs
public/robots.txt
src/app/{layout.tsx, error.tsx, not-found.tsx, (auth)/…, (member)/…, console/…, api/health/route.ts}
src/db/{index.ts, schema.ts}
src/lib/{action.ts, actor.ts, permissions.ts (stub), validation.ts}
src/server/{domain/errors.ts, authz.ts (stub), machine-write.ts (stub), services/, log.ts}
src/components/{ui/*, status-badge.tsx, use-poll.ts, auto-refresh.tsx, layouts}
tests/{unit/errors.spec.ts, services/health.spec.ts, helpers/*, e2e/run.sh, e2e/shell.spec.ts}
.github/workflows/{ci.yml, deploy.yml}
docs/runbook.md (stub)   docs/setup-and-deploy.md (verified)
```

---

## 5. Tests and checks

| Check | Type | Pass condition |
|---|---|---|
| Health route | Service + smoke | `ok`, version present; staging and production return the deployed SHA |
| Error mapping | Unit | `ServiceError` → `ActionResult` with code; D1 limit → `DAILY_LIMIT`; unknown → generic message, no stack |
| Bundle and repo guards | CI | No secrets in assets; no `.env*` tracked. Prove each check fails once by planting a fake value |
| App shell | E2E | Renders at 320/375 px, no horizontal scroll, axe clean |
| Setup guide | Manual | Someone else (or you, in a fresh clone and a fresh Cloudflare account) follows `setup-and-deploy.md` to a working staging deploy without extra help; fix every gap found |
| Spikes | Manual | S1–S5 results in §7 |

---

## 6. Exit criteria

- [ ] Production and staging `/api/health` return `ok` with the current SHA; client routes render the shell (reload works).
- [ ] CI green on `main` with branch protection; staging auto-deploys; production deploys after approval.
- [ ] Migration `0000` applied locally, to staging and to production.
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
| Brevo account approved for sending | | |

## 8. Risks and open questions

| Item | Notes |
|---|---|
| S1 fails even with native scrypt | Unlikely. If it happens, the only $0 options are dropping passwords (Google + email codes) or accepting failures. Decide before Phase 1 |
| Other Workers on the same Cloudflare account | Quotas are per account. A busy day elsewhere could take Cleared down. Use a dedicated account |
| OpenNext / Next 16 quirks | Handle the ones in `technologies.md` §16; pin versions; upgrade deliberately |
| Workers Logs pricing change (Dec 1, 2026) | S1/S2 rely on `cpuTime` in logs. If logs stop being free, use `wrangler tail`, which shows CPU per request |
| Wrong subdomain chosen | Labels must be reprinted; choose once |
