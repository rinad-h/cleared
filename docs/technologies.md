# Cleared — Technologies and Platform

> **Purpose.** This document lists every technology Cleared uses, why it was chosen, what it costs (always **$0**), and the free-tier limits it has to stay within. It **replaces PRD Section 10 ("Replit Technical Design")**.
>
> **Stack in one line:** one **Next.js 16** app (App Router, server actions) deployed to **Cloudflare Workers Free** with **OpenNext**, using **Cloudflare D1** (SQLite) through **Drizzle**, and **Better Auth** with **email + password** for sign-in.
>
> Step-by-step account setup, configuration and deploy commands: [`setup-and-deploy.md`](./setup-and-deploy.md).
>
> | Detail | Value |
> |---|---|
> | Hosting | Cloudflare Workers Free (one Worker serves pages, server actions, route handlers and static assets) |
> | Database | Cloudflare D1 Free (SQLite) |
> | Auth | Better Auth, email + password, users stored in our own D1 tables |
> | Budget | **$0. No paid plans, no domain purchase, no credit card on any account.** |
> | Limits checked | November 22, 2026 (see [Sources](#19-sources-checked-november-22-2026)). Re-check before Phase 0 and before any pilot. |
> | Companion docs | [`PRD.md`](./PRD.md) (what to build), [`phases/`](./phases/README.md) (build order) |

---

## Table of contents

1. [Summary](#1-summary)
2. [The $0 rules](#2-the-0-rules)
3. [Stack at a glance](#3-stack-at-a-glance)
4. [Cloudflare platform](#4-cloudflare-platform)
5. [Next.js on Workers (OpenNext)](#5-nextjs-on-workers-opennext)
6. [Authentication: how Better Auth works and its limits](#6-authentication-how-better-auth-works-and-its-limits)
7. [Email](#7-email)
8. [Frontend](#8-frontend)
9. [Server code structure](#9-server-code-structure)
10. [Testing](#10-testing)
11. [Tooling, checks and deployment](#11-tooling-checks-and-deployment)
12. [Designing for D1 instead of PostgreSQL](#12-designing-for-d1-instead-of-postgresql)
13. [Free-tier budget and capacity planning](#13-free-tier-budget-and-capacity-planning)
14. [What happens at a limit, and how we watch for it](#14-what-happens-at-a-limit-and-how-we-watch-for-it)
15. [Paid traps to avoid](#15-paid-traps-to-avoid)
16. [Known platform quirks](#16-known-platform-quirks)
17. [Accounts, secrets and configuration](#17-accounts-secrets-and-configuration)
18. [Changes from the PRD (Replit → Cloudflare)](#18-changes-from-the-prd-replit--cloudflare)
19. [Sources](#19-sources-checked-november-22-2026)

---

## 1. Summary

Cleared is **one Next.js application** compiled by **OpenNext** into **one Cloudflare Worker**:

- **Pages** are React Server Components, rendered in the Worker. They read data directly from D1 through `src/data/*`.
- **Mutations** are **server actions** (`src/actions/*`). Next.js checks their origin automatically, and every one calls a permission-checked service function.
- **Polling endpoints** (the status board and the staff console) are **route handlers** (`src/app/api/*/route.ts`) that return JSON with an **ETag**. An unchanged poll costs about 2 database rows instead of about 150.
- **Auth** is **Better Auth**, mounted at `/api/auth/[...all]`. It's a library running in our Worker, not a hosted service. Users, password hashes and sessions live in **our D1 tables**.
- **Static files** (JS chunks, CSS, images) are served by Workers Static Assets: free, unlimited, and they don't count toward the Worker request quota.

```
 Student phone / staff laptop
          │  HTTPS  https://cleared.<your-subdomain>.workers.dev
          ▼
 ┌──────────────────────── Cloudflare edge (Workers Free) ──────────────────────┐
 │  Static assets (/_next/static/*, images)    ← free, unlimited, no Worker run │
 │                                                                              │
 │  Worker "cleared" (OpenNext output of the Next.js app)                       │
 │    ├─ proxy.ts            cheap redirect: no session cookie → /sign-in       │
 │    ├─ Pages (RSC)         /machines, /m/[token], /console/* … → src/data/*   │
 │    ├─ Server actions      src/actions/* → src/server/services/* (checks)     │
 │    ├─ Route handlers      /api/status-board, /api/console (ETag/304)         │
 │    ├─ Better Auth         /api/auth/* (sign-up, sign-in, reset, sessions)    │
 │    └─ Drizzle ──────────► D1 "cleared-prod" (SQLite)                         │
 └──────────────────────────────────────────────────────────────────────────────┘
          │ outbound fetch, only for verification / password-reset emails
          ▼
   Brevo transactional email API (free, 300 emails/day)
```

---

## 2. The $0 rules

These rules are hard constraints. If a feature can't be built within them, it's deferred.

1. **No paid plans anywhere.** Cloudflare stays on **Workers Free**. Never click "Upgrade to Workers Paid" ($5/month), even to get past a limit for one day.
2. **No credit card on any account.** Workers and D1 don't need one. Avoid products that ask for one even on a free tier (for example **R2**, which OpenNext's optional caches can use; we don't use them).
3. **No domain purchase.** The app lives at `https://cleared.<account-subdomain>.workers.dev`. That rules out anything that needs a domain you own (Clerk production instances, Cloudflare Email Service, Resend, a custom email "From" domain).
4. **Only open-source or free-forever libraries** (MIT, Apache-2.0, ISC or similar).
5. **Hitting a limit must fail safely, not bill.** On the free plan, going over a limit makes requests fail until the daily reset at 00:00 UTC; it's never billed. §14 covers what that looks like and how to avoid it.
6. **Every new service is checked against this list** and added to §3 with its free-tier limits before it's used.

> **Not covered by $0:** physical materials such as sticker or label paper for QR labels. A school printer, plain paper and clear tape are enough for the classroom demo.

---

## 3. Stack at a glance

Versions are a known-good combination on Workers Free as of November 2026. Pin exact versions in `package.json` when Phase 0 starts.

| Layer | Technology | Known-good version | Role | Cost / free limit |
|---|---|---|---|---|
| Framework | **Next.js** (App Router, TypeScript) | 16.4 | Pages, server actions, route handlers, `proxy.ts` | $0 (MIT) |
| UI runtime | **React** | 19.3 | Server + client components | $0 (MIT) |
| Workers adapter | **@opennextjs/cloudflare** (OpenNext) | 1.20 | Builds the Next.js app into a Worker | $0 (MIT) |
| Hosting | **Cloudflare Workers** (Free) | — | Runs everything that isn't a static file | 100,000 Worker requests/day; **10 ms CPU per request** |
| Static hosting | **Workers Static Assets** | — | `/_next/static/*`, images, fonts | Free and unlimited; doesn't count toward requests |
| Database | **Cloudflare D1** (Free) | — | All app data and auth data | 5M rows read/day, 100k rows written/day, 500 MB per DB |
| ORM / migrations | **Drizzle ORM** + **drizzle-kit** | 0.45 / 0.31 | Typed queries, `db.batch()`, SQL migrations applied by Wrangler | $0 |
| Auth | **Better Auth** (email + password) | 1.7 | Sign-up, sign-in, email verification, password reset, sessions | $0 (MIT); uses our Worker and D1 quotas |
| Email | **Brevo** transactional API (Free) | — | Verification and password-reset emails | **300 emails/day**, "Sent with Brevo" footer |
| Validation | **Zod** | 4.6 | Every action input, route handler query, form | $0 |
| Styling | **Tailwind CSS** | 4.3 | Mobile-first styles; semantic tokens in `globals.css` | $0 |
| Components | **shadcn/ui** (Radix) | CLI 4.x | Accessible dialogs, selects, tables, alert dialogs | $0 |
| Icons / toasts | **lucide-react**, **sonner** | — | Status icons (colour + icon + word), toasts | $0 |
| Animation (optional) | **Motion** | 14 | Small shared primitives (`src/components/motion.tsx`) on console screens; keep the pass page light | $0 |
| QR codes | **qrcode** | 1.5 | Label sheet QR SVGs, **rendered in the browser** | $0 |
| Rate limiting | **Workers Rate Limiting binding** + Better Auth's built-in limiter | — | FR-19 action limits; sign-in/sign-up brute-force limits | $0 (binding availability on Free verified in Phase 0) |
| Logs | **Workers Logs** | — | Errors, CPU time per request | 200,000 events/day, 3-day retention (pricing changes Dec 1, 2026) |
| Unit / service tests | **Vitest** + **@cloudflare/vitest-plugin** (formerly `@cloudflare/vitest-pool-workers`) | 4.1 / 1.9 | Domain and service tests against a real local D1 in `workerd` | $0, uses no Cloudflare quota |
| E2E tests | **Playwright** | — | Browser acceptance tests against an isolated local D1 (`tests/e2e/run.sh`) | $0 |
| Lint / types | **ESLint** (`eslint-config-next`) + **TypeScript** strict | 9 / 5 | — | $0 |
| Package manager | **npm** | — | Installs and lockfile | $0 |
| CLI | **Wrangler** | 4.x | Local D1, migrations, deploys, secrets, `wrangler tail` | $0 |
| Source control | **GitHub** (or any git host) | — | Repo, one pull request per phase. **No CI/CD:** checks and deploys run locally (§11.3) | Free |

**Total monthly cost: $0.00.**

### 3.1 Is everything free?

**Yes.** Every service is on a free plan that needs **no credit card**, and every library is open source. On every free plan we use, going over a limit **stops or pauses** that feature; it never bills you. The only costs outside the $0 software budget:

| Not free | Why it isn't needed |
|---|---|
| Paper/stickers to print QR labels | Physical materials, not software. Plain paper and tape work for a demo |
| A custom domain (~$10–20/year) | Optional. Without one, the app uses `*.workers.dev` and Brevo rewrites the email sender (§7.2) |
| Paid plans (Workers Paid $5/month, Brevo Starter, GitHub Pro) | Never required. Cleared is designed to fit the free limits below |

### 3.2 Free limits for every technology

Checked November 2026 (sources in §19). Daily Cloudflare limits reset at **00:00 UTC**.

#### Cloudflare (hosting, database, rate limiting, logs)

| Technology | Limit (free) | Value | When exceeded | Where Cleared deals with it |
|---|---|---|---|---|
| **Workers** | Requests | **100,000 / day** per account (all Workers on the account share it) | Error 1027 until 00:00 UTC | ETag polling, `prefetch={false}`, static assets (§13) |
| | CPU time | **10 ms per request** (waiting on D1/fetch doesn't count) | Error 1102 for that request | Small server components, client-side QR, spike S1/S2 (§5.2, §6.4) |
| | Memory | 128 MB per isolate | Request fails | Not a concern for this app |
| | Subrequests | 50 per request (1,000 to Cloudflare services) | Request fails | ≤ 10 D1 calls per request; `db.batch()` counts as one |
| | Worker size | 64 MiB uncompressed | Deploy refused | Lean server dependencies |
| | Startup time | 1 s | Deploy refused | No heavy module-level code |
| | Workers per account | 100 | Can't create more | We use 2 (staging, production) |
| | Env vars + secrets | 64 per Worker, 5 KB each | Deploy refused | We use ~10 |
| | Cron Triggers | 5 per account | — | Not used (no background jobs) |
| | Version history | 30 days | Older versions can't be rolled back to | `wrangler rollback` within 30 days |
| **Static assets** | Requests | **Free and unlimited**, don't count toward Worker requests | — | JS/CSS/images served this way |
| | Files | 20,000 per Worker version | Deploy refused | A Next.js build is far below this |
| | File size | 25 MiB per file | Deploy refused | — |
| **D1** | Rows read | **5,000,000 / day** per account (rows *scanned*, not returned) | Queries fail until 00:00 UTC | Indexes on every hot filter; ETag short-circuit (§12, §13) |
| | Rows written | **100,000 / day** per account (index updates count) | Writes fail until 00:00 UTC | Purposeful indexes only |
| | Database size | **500 MB** per database | Writes fail | Years of data ≈ a few MB; retention rule |
| | Total storage | 5 GB per account | Writes fail | — |
| | Databases | 10 per account | Can't create more | We use 2 |
| | Queries per Worker request | 50 (a `db.batch()` = 1) | Request fails | — |
| | Bound parameters | 100 per query | Query fails | Chunk large `IN (…)` lists |
| | Statement size | 100 KB | Query fails | — |
| | Row / string / BLOB size | 2 MB | Write fails | Longest text field is 2,000 chars |
| | Query duration | 30 s | Query fails | Queries take milliseconds |
| | Time Travel (restore) | 7 days | Older points can't be restored | Weekly `d1 export` backups during a pilot |
| | Dashboard/Wrangler queries | **Count toward the quotas above** | — | Keep ad-hoc remote queries small |
| **Rate Limiting binding** | Usage | No separate published limit; periods of **10 s or 60 s** only; counters per Cloudflare location (best-effort) | — | FR-19 action limits; D1 fallback if unavailable (§4.4) |
| **Workers Logs** | Events | **200,000 / day**, **3-day** retention (pricing change announced for **Dec 1, 2026**) | Logging stops for the day; the app keeps working | No noisy logging; sampling if needed (§4.5) |
| **`workers.dev`** | Subdomains | **1 per account** (each Worker gets `<name>.<subdomain>.workers.dev`) | — | Pick once; labels encode it (§4.6) |
| **Cloudflare API** (used by Wrangler) | Requests | 1,200 per 5 minutes per user | 429 for 5 min | Only deploys and migrations call it |

#### Email

| Technology | Limit (free) | Value | When exceeded | Where Cleared deals with it |
|---|---|---|---|---|
| **Brevo** | Emails | **300 / day** (transactional and marketing combined) | Up to 1,000 extra transactional emails wait in a retry queue; anything beyond that **isn't delivered** | App stops at `EMAIL_DAILY_CAP` = 280 with a clear message (§7.2) |
| | API rate | 1,000 requests/s; max 2,000 recipients per request | 429 | We send one email per request |
| | Contacts | 100,000 stored | — | Not used (transactional only) |
| | Users | 1 per account | — | Use a project mailbox |
| | Sender | Free-mail senders rewritten to a `brevosend.com`-style address; "Sent with Brevo" footer | — | Display name "Cleared" + `replyTo` (§7.2) |
| | Account | New accounts may need approval before sending | Emails don't send | Create the account early (Phase 0) |

#### Source control

| Technology | Limit (free) | Value | When exceeded | Where Cleared deals with it |
|---|---|---|---|---|
| **GitHub** (repo) | Repos | Unlimited public and private | — | — |
| | Size | Files ≤ 100 MB (hard); repo ideally < 1 GB | Push refused | No binaries or backups in the repo |

No CI/CD service is used: `npm run check` and the deploy scripts run on the developer's machine (§11.3).

#### Libraries and tools (no usage limits)

These run in our code or on your machine. They have **no usage quotas or accounts**. Their only "limit" is the licence, and all allow free commercial use.

| Technology | Licence | Notes |
|---|---|---|
| Next.js, React | MIT | — |
| @opennextjs/cloudflare | MIT | Its optional R2/KV caches are **not** used (R2 needs a card) |
| Better Auth | MIT | No user cap or fees. Its load counts toward **our** Worker/D1 limits (§6.5); its rate limits are ones we configure (§6.3) |
| Drizzle ORM, drizzle-kit | Apache-2.0 | — |
| Zod | MIT | — |
| Tailwind CSS | MIT | — |
| shadcn/ui, Radix UI | MIT | Components are copied into the repo |
| lucide-react | ISC | — |
| sonner, Motion | MIT | — |
| qrcode | MIT | Runs in the browser |
| TypeScript | Apache-2.0 | — |
| ESLint | MIT | — |
| Vitest, @cloudflare/vitest-plugin | MIT | Tests use local D1, **no Cloudflare quota** |
| Playwright | Apache-2.0 | Runs locally, **no Cloudflare quota** |
| Wrangler | MIT or Apache-2.0 | Free CLI. **Remote** D1 commands count toward D1 quotas |
| Node.js, npm | MIT / Artistic-2.0 | npm registry downloads are free |

> If any number in this section changes, update it here **and** in §13 (capacity planning). Re-check before Phase 0 and before any pilot.

---

## 4. Cloudflare platform

### 4.1 Workers Free limits we design around

| Limit | Value | Design response |
|---|---|---|
| Requests | **100,000 / day**, reset 00:00 UTC; over the limit returns **Error 1027** | Static files don't count. Polling uses ETags and pauses in hidden tabs. Link prefetching is off on member screens (§5.3) |
| CPU time | **10 ms per request** (waiting on D1 or `fetch` doesn't count) | **Two risks: password hashing (§6.4) and server rendering (§5.2).** Both are measured in the Phase 0 spikes before anything is built on them |
| Memory | 128 MB per isolate | Fine for this app |
| Subrequests | 50 per request | One request makes ≤ 10 D1 calls; `db.batch()` counts as one |
| Worker size | 64 MiB uncompressed (the old 3 MiB compressed free limit was removed in September 2026; OpenNext's docs may still quote it) | Next.js + OpenNext fits. Keep server dependencies lean anyway (startup time) |
| Startup time | 1 second | Avoid heavy module-level work. Create Better Auth per request (`getAuth()`) |
| Cron Triggers | 5 per account | **Not used.** PRD rule: no background jobs |

**`next dev` and `wrangler dev` don't enforce the 10 ms CPU limit.** CPU problems only show up after deploy. That's why every deploy runs a smoke test and Phase 7 runs a CPU audit from Workers Logs (`cpuTime`).

### 4.2 Static assets

OpenNext puts the build's static files in `.open-next/assets`, served by Workers Static Assets (`"assets": { "directory": ".open-next/assets", "binding": "ASSETS" }`). Those requests are free, unlimited, and don't run the Worker.

**Unlike a plain single-page app, every page navigation does run the Worker**, because pages are server-rendered. That includes opening a QR label's `/m/<token>` URL, and it's the main quota difference from the earlier Vite plan. §13 accounts for it.

### 4.3 Cloudflare D1 (Free)

| Limit (Free) | Value | Design response |
|---|---|---|
| Rows read | **5,000,000 / day** | Counts **rows scanned**, not returned. Every hot query is index-backed. Board and console polls use the ETag short-circuit |
| Rows written | **100,000 / day** | Each index on a written column adds a write. Keep indexes purposeful |
| Max DB size | **500 MB** | Years of makerspace data are a few MB |
| Storage per account | 5 GB | — |
| Databases per account | 10 | We use 2 (staging, production). Local dev and test databases don't count |
| Queries per invocation | 50 (`db.batch()` = 1) | — |
| Bound parameters | 100 per query | Chunk large `IN (…)` lists |
| Time Travel | **7 days** point-in-time restore | Backup safety net (Phase 7 runbook) |

- **Queries from the dashboard or `wrangler d1 execute --remote` count toward the quota.** Don't run big ad-hoc queries against production.
- **No interactive transactions and no `SELECT … FOR UPDATE`.** A `db.batch([...])` runs as **one atomic transaction**. §12 shows how the PRD's row-lock rules are rebuilt on top of it.
- **Supported:** partial indexes, `CHECK` constraints, foreign keys, triggers, `ON CONFLICT`, `RETURNING`, FTS5.
- **Location:** create the production DB with **location hint `wnam`** (western North America). D1 has no Canadian jurisdiction, so data is very likely stored in the U.S. Disclose this in any privacy review.

### 4.4 Workers Rate Limiting binding

- Used for **FR-19** (session starts, fault reports, joins: 20/min per member).
- Config: `ratelimits` in `wrangler.jsonc` with `limit` and `period` (**10 or 60 s**). Counters are **per Cloudflare location and eventually consistent**, so best-effort. That matches the PRD's "basic per-instance limit".
- Read in server code via `getCloudflareContext().env.RL_ACTIONS.limit({ key })`.
- It's GA, and community answers say it works on Free at no cost, but Cloudflare's docs don't say so outright. **Phase 0 verifies it.** Fallback: a fixed-window counter table in D1.
- Sign-in and sign-up brute-force protection is handled by **Better Auth's own rate limiter** with database storage (§6.5), not this binding.

### 4.5 Workers Logs

- `"observability": { "enabled": true }`. Free: **200,000 events/day**, **3-day retention**.
- **Pricing change announced for December 1, 2026.** Re-check before Phase 0. If free logging shrinks, sample with `head_sampling_rate` or turn it off and use `wrangler tail`.
- **Never log** emails, passwords, reset or verification tokens, session cookies, fault descriptions or member names.

### 4.6 The `workers.dev` URL (it must never change)

- Pick the **account subdomain** once (`setup-and-deploy.md` §3). The production URL is `https://cleared.<your-subdomain>.workers.dev`.
- **QR labels encode this URL.** Changing the subdomain or Worker name, or later moving to a custom domain, means **reprinting every label**.
- It's stored as `PUBLIC_BASE_URL` (and `BETTER_AUTH_URL`). **Labels and the join link are always built from `PUBLIC_BASE_URL`, never from the request host** (a label printed while browsing staging or localhost must not point there).

### 4.7 `wrangler.jsonc`

The committed file keeps the placeholders (`<your-subdomain>`, database IDs); `npm run check` rejects real values in it. Each deployment's values live in the git-ignored `cleared.config.json`, and `scripts/render-wrangler.mjs` renders them into a git-ignored `wrangler.deploy.jsonc` that every remote command uses (`setup-and-deploy.md` §7).

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "cleared",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-11-20",                 // the Phase 0 date
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "secrets": { "required": ["BETTER_AUTH_SECRET", "BREVO_API_KEY", "EMAIL_FROM_ADDRESS"] },
  "workers_dev": true,
  "preview_urls": false,
  "observability": { "enabled": true },
  "vars": {
    "ENVIRONMENT": "production",
    "PUBLIC_BASE_URL": "https://cleared.<your-subdomain>.workers.dev",
    "BETTER_AUTH_URL": "https://cleared.<your-subdomain>.workers.dev",
    "REQUIRE_EMAIL_VERIFICATION": "true",
    "EMAIL_FROM_NAME": "Cleared",
    "EMAIL_DAILY_CAP": "280"
  },
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "services": [{ "binding": "WORKER_SELF_REFERENCE", "service": "cleared" }],
  "d1_databases": [
    { "binding": "DB", "database_name": "cleared-prod", "database_id": "<prod-database-id>", "migrations_dir": "drizzle" }
  ],
  "ratelimits": [
    { "name": "RL_ACTIONS", "namespace_id": "1001", "simple": { "limit": 20, "period": 60 } }
  ],
  "env": {
    "staging": {
      "name": "cleared-staging",
      "vars": {
        "ENVIRONMENT": "staging",
        "PUBLIC_BASE_URL": "https://cleared-staging.<your-subdomain>.workers.dev",
        "BETTER_AUTH_URL": "https://cleared-staging.<your-subdomain>.workers.dev",
        "REQUIRE_EMAIL_VERIFICATION": "true",
        "EMAIL_FROM_NAME": "Cleared (staging)",
        "EMAIL_DAILY_CAP": "50"
      },
      "services": [{ "binding": "WORKER_SELF_REFERENCE", "service": "cleared-staging" }],
      "d1_databases": [
        { "binding": "DB", "database_name": "cleared-staging", "database_id": "<staging-database-id>", "migrations_dir": "drizzle" }
      ],
      "ratelimits": [
        { "name": "RL_ACTIONS", "namespace_id": "2001", "simple": { "limit": 20, "period": 60 } }
      ]
    }
  }
}
```

### 4.8 Environments

| Environment | How it runs | Database | Purpose |
|---|---|---|---|
| **Local dev** | `npm run dev` (Next dev server + `initOpenNextCloudflareForDev()` providing D1 and other bindings) | Wrangler local D1 in `.wrangler/state`, **no quota used** | Day-to-day work |
| **Local preview** | `npm run preview` (OpenNext build in real `workerd`, `localhost:8787`) | Local D1 | Catch Workers-runtime problems before deploying |
| **Tests** | Vitest (`workerd` pool) and Playwright against an isolated throwaway D1 (`tests/e2e/run.sh`) | Fresh per run | Automated tests |
| **Staging** | `cleared-staging.<your-subdomain>.workers.dev` | `cleared-staging` | Every deploy lands here first; manual tests; CPU checks |
| **Production** | `cleared.<your-subdomain>.workers.dev` | `cleared-prod` (`wnam`) | Demo and pilot; the URL on every label |

**Daily quotas are per Cloudflare account and shared by all Workers on it,** including any other Workers you run on the same account. Keep staging traffic light and run E2E locally.

---

## 5. Next.js on Workers (OpenNext)

### 5.1 How it fits together

- `@opennextjs/cloudflare` builds the Next.js output into `.open-next/worker.js` + `.open-next/assets`. `npm run deploy` runs `scripts/deploy.sh`: render `wrangler.deploy.jsonc` → `opennextjs-cloudflare build` → bundle scan → `opennextjs-cloudflare deploy` → smoke test (§11.3).
- **Bindings** (`DB`, `RL_ACTIONS`) are read with `getCloudflareContext().env` (e.g. `src/db/index.ts`). **Vars and secrets** (`PUBLIC_BASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `ENVIRONMENT`, `REQUIRE_EMAIL_VERIFICATION`, `ENABLE_DEV_OUTBOX`, …) are read with **`getEnv()` from `src/lib/env.ts`**: it returns the same bindings, but under `next dev` it applies the E2E harness's `process.env` overrides (random port, `ENVIRONMENT=test`). Reading vars straight from `getCloudflareContext().env` makes E2E sign-up and the test-only rate-limit switch silently use the wrong values.
- In dev, `initOpenNextCloudflareForDev()` in `next.config.ts` gives `next dev` the same bindings against local D1.
- `open-next.config.ts` stays the default `defineCloudflareConfig()`: **no incremental cache, no R2, no KV**. Every page is dynamic (it depends on who's signed in), so ISR caching would add nothing.

### 5.2 CPU risk from server rendering

Rendering a React page on the server uses CPU on every request. Light pages are usually well under 10 ms. Heavy pages (big tables, charts, markdown) can go over, and that gives **Error 1102** in production only.

Rules that keep pages cheap:

1. **The pass page and the status board are the hot paths.** Keep their server components small: one data load, a compact component tree, no markdown or chart libraries.
2. **Polling goes to JSON route handlers, not `router.refresh()`.** A refresh re-renders the whole page on the server every 30 s. A route handler with an ETag usually answers **304** after reading about 2 rows, at almost no CPU. (A small `<AutoRefresh>` client component that calls `router.refresh()` is used only on the pass page, every 60 s, while the page is visible.)
3. **Long lists paginate** (service history, members, sessions): ≤ 50 rows per render.
4. **Charts and Recharts aren't needed in the MVP.** Don't add them.
5. **Measure:** Phase 0 spike S2 deploys a representative page and reads `cpuTime` in Workers Logs. Phase 7 audits every route.

### 5.3 Quota-aware Next.js settings

| Setting | Why |
|---|---|
| `prefetch={false}` on `<Link>`s in the member app and on long console lists | Next prefetches visible links. Each prefetch is a Worker request that spends quota for pages nobody opens. Keep prefetch only on the few console nav items |
| No `export const revalidate` / ISR | Needs an incremental cache (KV/R2). All pages are dynamic |
| `cacheComponents` on in dev only | OpenNext/workerd can hang with Next 16 Cache Components output (§16). **Consequence:** every component that reads the session must render inside `<Suspense>` |
| `proxy.ts` only does cookie-presence redirects | It runs on matched routes. Keep it cheap; real checks happen in server code |
| Static marketing/help pages use static rendering where possible | `/help`, `/terms`, `/privacy` have no session reads, so they can be prerendered and served as assets |

### 5.4 CSRF and origins

- **Server actions** are POSTs that Next.js checks automatically: the `Origin` header must match the host. Keep `serverActions.allowedOrigins` unset (same origin only).
- **Route handlers** are **GET-only** (read and poll). No mutating route handlers except Better Auth's own `/api/auth/*`, which checks `trustedOrigins`.
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax` (Better Auth defaults in production).

---

## 6. Authentication: how Better Auth works and its limits

### 6.1 What Better Auth is

Better Auth is an **open-source TypeScript library**, not a hosted service like Clerk or Auth0. It runs **inside our Worker**, stores everything in **our D1 database**, and costs nothing. There's no vendor account, no monthly-user cap and no per-user price.

It owns four tables (generated by its CLI, migrated with drizzle-kit like any other table):

| Table | Holds |
|---|---|
| `user` | id, name, **email (unique, lowercased)**, `emailVerified`, timestamps |
| `account` | How a user signs in. For email + password: `providerId = "credential"` and the **password hash** |
| `session` | One row per signed-in browser: token, expiry, IP, user agent |
| `verification` | Short-lived tokens for email verification and password reset |

Roles (`admin`/`staff`/`member`) and suspension **are not Better Auth's job**. They live in our own `members` table, linked by `members.auth_user_id` (PRD 10.2: roles in our own table).

### 6.2 How the flows work

| Flow | What happens |
|---|---|
| **Sign up** (`POST /api/auth/sign-up/email`) | Validates the email and password length → **hashes the password (scrypt)** → inserts `user` + `account` → sends a **verification email** (Brevo) → no session yet if verification is required |
| **Verify email** (link in the email) | `verification` token checked → `user.emailVerified = true` → session created (auto sign-in) → redirect to `next` |
| **Sign in** (`POST /api/auth/sign-in/email`) | Looks up the `account` by email → **verifies the password against the hash (scrypt)** → refuses if the email isn't verified (when required) → inserts a `session` row → sets a signed cookie |
| **Each request** | `getSession()` reads the cookie → checks the signature → loads the `session` row (or trusts the short-lived signed **cookie cache**, skipping D1) → returns the user. Our `getCurrentMember()` then loads `members` (role, status) |
| **Sign out** | Deletes the `session` row and clears the cookie |
| **Forgot password** | `requestPasswordReset` → token in `verification` → reset email → the user sets a new password (hashed again) → other sessions can be revoked |
| **Change password** | Verify the current password (hash) → hash the new one |

Next.js specifics: `getAuth()` builds the instance **per request** from `getEnv()` (vars and secrets, so the E2E overrides apply) and `getDb()`; the handler is mounted at `src/app/api/auth/[...all]/route.ts`; the `nextCookies()` plugin (last in the list) lets server actions set cookies; session reads go inside `<Suspense>`.

### 6.3 Configuration (`src/lib/auth.ts`)

Option names follow Better Auth 1.7; confirm against the installed version.

```ts
export function getAuth() {
  const env = getEnv();          // src/lib/env.ts: not getCloudflareContext().env (§5.1)
  const db = getDb();
  return betterAuth({
    appName: "Cleared",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
    trustedOrigins: [env.PUBLIC_BASE_URL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION === "true",
      autoSignIn: false,                         // no session until the email is verified
      resetPasswordTokenExpiresIn: 60 * 60,      // 1 hour
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => email(env, db).passwordReset(user.email, url),
      // password: { hash, verify }               // only if spike S1 says native scrypt is needed (§6.4)
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,                   // 24 hours
      sendVerificationEmail: async ({ user, url }) => email(env, db).verifyEmail(user.email, url),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,              // 30 days: students stay signed in on their phone
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 300 },
    },
    rateLimit: {
      enabled: true,
      storage: "database",                       // shared across Worker isolates (memory isn't)
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 300, max: 3 },
        "/send-verification-email": { window: 300, max: 3 },
      },
    },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    plugins: [nextCookies()],                    // must stay last
  });
}
```

### 6.4 Restrictions and how we handle them

| # | Restriction | Why | What we do |
|---|---|---|---|
| 1 | **Password hashing vs. the 10 ms CPU limit** | Better Auth hashes with **scrypt** (N=16384, r=16), deliberately slow so stolen hashes are hard to crack. One hash takes **tens of ms of CPU**; the pure-JS version, measured on Workers, is ~80 ms. That's above the free plan's documented 10 ms per request. It happens on **sign-up, sign-in, password reset and password change** only. Every other request is unaffected | **Evidence (Nov 2026):** a comparable production app with this exact setup (Better Auth default scrypt, Next.js + OpenNext, Workers Free) **registers and signs in without failures**. Cloudflare evidently doesn't fail these requests in practice, so **we keep the default hashing**. **Remaining check (spike S1, now light):** after Cleared's first staging deploy, do a handful of sign-ups/sign-ins and confirm no Error 1102 in Workers Logs; keep watching auth routes for 1102s during the pilot (Phase 7 CPU audit). **Only if failures ever appear:** 0 failures → keep the default. Any failures → switch to **native `node:crypto` scrypt** with the same parameters and hash format (several times faster than the JS version, and hashes stay compatible) and re-measure. Still failing → fall back to **Google sign-in + email one-time codes** (no hashing). **Never lower the scrypt cost to fit, and never pay** |
| 2 | **Email is needed for verification and password reset** | Better Auth generates the links; we must send them | Brevo free API (§7). If email fails, `REQUIRE_EMAIL_VERIFICATION=false` can be switched off for a demo, and admins can set a temporary password with a local script (§6.6) |
| 3 | **300 emails/day** (Brevo free) | Each sign-up sends 1 verification email; each reset sends 1 | Daily counter in D1 stops at 280 with a clear message; sessions last 30 days so resets are rare; term-start onboarding can be staggered |
| 4 | **The built-in rate limiter defaults to in-memory**, which isn't shared across Worker isolates | Workers run many isolates | `storage: "database"`: about one D1 write per auth attempt (small) |
| 5 | **Sessions read D1** on every request | Database sessions | `cookieCache` (5 min) skips most reads. Suspension is still checked on every request through our `members` table, so it applies immediately |
| 6 | **No MFA, passkeys or SSO in the MVP** | Scope | Better Auth has free plugins (`twoFactor`, `passkey`, generic OAuth) for P1. University SSO is P1 |
| 7 | **We own the security work** | Self-hosted | Password length 8–128; rate limits; generic "email or password is incorrect" messages (no account enumeration); HTTPS-only cookies; secrets only as Worker secrets; optional `haveIBeenPwned` plugin (free, k-anonymity) evaluated in Phase 7 |
| 8 | **Better Auth owns its table shapes** | Upgrades may add columns | Pin the version; regenerate the schema with its CLI on upgrade; additive migrations only |
| 9 | **Requires `nodejs_compat`** | It uses Node APIs | Already in `compatibility_flags` |
| 10 | **Session cookie cache delays sign-out on other devices by ≤ 5 min** | Signed cookie trusted for its lifetime | Acceptable; suspension unaffected (restriction 5) |
| 11 | **Unverified sign-ups can squat an email** (someone registers with another person's address) | Before verification | `requireEmailVerification: true`: unverified accounts can't sign in. They're harmless rows; Phase 7 documents a cleanup query |

### 6.5 What it costs in quota

| Action | Worker requests | D1 rows written | CPU |
|---|---|---|---|
| Sign up | 1 (+1 when the link is clicked) | ~5 (user, account, verification, rate limit, session) | **scrypt hash** |
| Sign in | 1 | ~3 (session, rate limit) | **scrypt verify** |
| Any page or action while signed in | 0 extra | 0 (cookie cache) or 1 read | negligible |
| Password reset | 2 | ~4 | **scrypt hash** |

### 6.6 Admin password reset without email (runbook)

If email is down, an admin can set a temporary password for a member:

1. On a laptop, run `npx tsx scripts/set-password.ts <email> <temp-password>`. It hashes locally with `hashPassword` from `better-auth/crypto` (as the seed script does), so it uses no Worker CPU.
2. The script runs `node scripts/render-wrangler.mjs` first, then the equivalent of `npm run remote -- d1 execute cleared-prod --remote --command "UPDATE account SET password = ? WHERE provider_id = 'credential' AND user_id = (SELECT id FROM user WHERE email = ?)"` (the committed `wrangler.jsonc` only has placeholder database IDs).
3. The member signs in and changes the password.

### 6.7 No test-auth stub

The PRD (11.1) wanted a test-only auth stub. With email + password, **we don't need one**:

- **Service tests** call service functions directly with an `actor` argument (§9), so no auth is involved.
- **E2E tests** sign up real accounts through the real Better Auth flow against a throwaway local D1. In dev and test, the email sender keeps verification links in a dev-only outbox the E2E reads (§7.3).

So there's **no auth bypass anywhere in the code**. That's stronger than PRD 11.1's "refuse to start if the stub is enabled".

---

## 7. Email

### 7.1 Decision: Brevo free transactional API

Email is used **only** for verification and password-reset links in the MVP. Fault alerts and staff invites are P1 (PRD 5.3).

| Option | Free? | Needs our own domain? | Verdict |
|---|---|---|---|
| Cloudflare Email Service | Free plan sends **only to verified addresses on your own account**; anyone else needs Workers Paid | **Yes** | ✘ |
| Cloudflare Email Routing `send_email` | Free | Yes; recipients must be verified | ✘ |
| Resend | 100/day | **Yes** (without one, only to your own address) | ✘ |
| **Brevo** (**chosen**) | **300/day**, no card | **No.** Verify a single sender address (a project Gmail) | ✔ |
| Gmail SMTP from the Worker (TCP sockets + app password) | 500/day | No | Fallback only |

**Integration:** one `fetch` to `https://api.brevo.com/v3/smtp/email` with the `BREVO_API_KEY` secret, wrapped in an `EmailSender` interface (`verifyEmail(to, url)`, `passwordReset(to, url)`) so the provider can be swapped.

### 7.2 Email risks

| Risk | Mitigation |
|---|---|
| **Free-mail sender is rewritten.** Brevo can't authenticate a Gmail/Outlook-style sender, so it **replaces the From address** with one on its own domain (e.g. `name@123456.brevosend.com`). The email then passes SPF/DKIM/DMARC under Brevo's domain and usually reaches the inbox, but the sender address looks unfamiliar | Display name "Cleared" so the inbox shows a recognisable name; **`replyTo`** set to the real address so replies don't go to Brevo; the sign-up screen says "look for an email from *Cleared*" and "check spam". Phase 1 spike (P1-01) tests Gmail, Outlook and a university inbox. Owning a domain would remove the rewrite, but costs money (§2) |
| **300/day cap** | D1 counter (`email_send_log`) stops at `EMAIL_DAILY_CAP` (280): "Email is busy today. Try again after 5 pm" (00:00 UTC is 5 pm MST, 6 pm MDT). Re-sending is rate-limited |
| **New Brevo accounts may need approval** | Create the account in Phase 0 |
| **"Sent with Brevo" footer** | Acceptable |

### 7.3 Dev and test email

- `ConsoleEmailSender` (when `ENVIRONMENT` is `development` or `test`): logs "verification email for <redacted>" and stores the link in an **in-memory dev outbox**.
- `GET /api/dev/outbox?email=…` returns the latest link, **only** when `process.env.NODE_ENV === "development"` **and** `ENABLE_DEV_OUTBOX=1`. Otherwise the route returns 404. The guard is enforced by: `wrangler.jsonc` never containing `ENABLE_DEV_OUTBOX` and the client bundle never containing it (both checked by `npm run check` and every deploy), and a Phase 1 route test covering all four `NODE_ENV` × `ENABLE_DEV_OUTBOX` combinations. Phase 1 adds a server-bundle marker check for the outbox handler, like the one for `getEnv()`'s dev-only branch. Playwright uses the outbox to click verification links.

---

## 8. Frontend

| Concern | Choice | Notes |
|---|---|---|
| Rendering | Server Components by default; client components only for interactivity (live clock, forms, polling, dialogs) | Database access is never in client components (`server-only` imports) |
| Forms | `<form action={serverAction}>` + `useActionState`, with the shared `ActionResult` / `run()` / `parse()` helpers (`src/lib/action.ts`) and Zod | Field errors returned as `fieldErrors` |
| Polling | A small `usePoll(url, { intervalMs: 30_000 })` hook: sends `If-None-Match`, keeps data on 304, pauses while hidden, backs off to 120 s after 10 min idle | Used by the board and the console home |
| Styling | Tailwind 4 with semantic tokens in `globals.css`; status tokens `cleared`, `supervision`, `not-cleared`, `out-of-service`, `in-use` (≥ 4.5:1 contrast) | Components use tokens only, never raw hex or palette steps |
| Components | shadcn/ui (Radix) | Accessible dialogs, selects, alert dialogs |
| Icons | lucide-react | Status = **colour + icon + word** (PRD 8) |
| Toasts | sonner | — |
| Animation | Motion (shared primitives in `src/components/motion.tsx`) on console screens if wanted; **minimal on the pass page** | Respect `prefers-reduced-motion` |
| QR | `qrcode` → SVG **in the browser** on the label sheet | No server CPU spent on 60 QR codes |
| Dates | `Intl.DateTimeFormat` with the makerspace `timezone` | No date library |
| Fonts | System font stack (or `next/font` self-hosted) | No external font requests |

**Performance budget:** the pass page's first load ≤ 250 KB JS gzipped; server render ≤ 5 ms CPU.

---

## 9. Server code structure

A standard App Router layout, plus a **service layer** so business rules can be tested without Next.js:

```
src/
├─ app/
│  ├─ (auth)/sign-in, sign-up, verify, forgot-password, reset-password
│  ├─ (member)/machines, m/[token], me/certifications, help, join/[token]
│  ├─ console/  (home, faults, checkups, machines, machines/[id], rooms, members, certifications, labels, settings)
│  ├─ setup/
│  └─ api/
│     ├─ auth/[...all]/route.ts      Better Auth
│     ├─ status-board/route.ts       GET + ETag
│     ├─ console/route.ts            GET + ETag
│     ├─ health/route.ts             GET (deploy smoke test)
│     └─ dev/outbox/route.ts         dev only
├─ actions/        "use server" wrappers: getActor() → parse() → service → refresh()/redirect
├─ data/           read queries for Server Components (call services' read functions)
├─ server/
│  ├─ services/    the business rules: (db, actor, input, now) → result. No Next.js imports
│  ├─ domain/      pure logic: pass engine, session rules, checkups, time maths
│  ├─ authz.ts     requireMember / requireRole / can() on an Actor
│  ├─ machine-write.ts   write-token compare-and-swap helper (§12.2)
│  └─ email.ts     EmailSender implementations
├─ db/             schema.ts, index.ts (getDb), auth-schema.ts
├─ lib/            auth.ts, auth-client.ts, actor.ts (session → Actor), action.ts, permissions.ts, validation.ts
└─ components/     ui/ (shadcn), StatusBadge, PassCard, MachineTile, …
```

**Rules:**

1. A server action has three lines of real work: `const actor = await getActor()` → `const input = parse(Schema, formData)` → `await services.x(db, actor, input, Date.now())`. Then `refresh()` or `redirect()`.
2. **Every permission check happens in the service** (`requireRole(actor, "staff")`), so a test can call the service as any role and prove the rule. Pages also hide controls with `can()`, but that's never the security.
3. Services take `now` as a parameter. Tests control time without hacks.
4. Services return typed results or throw `ServiceError(code, message, fieldErrors?)`. The `run()` wrapper maps it to an `ActionResult`; route handlers map it to HTTP status codes.
5. Database access is only in `src/server/*` and `src/data/*`, all `import "server-only"`.

---

## 10. Testing

| Kind | Tool | Runs | Covers |
|---|---|---|---|
| Unit | Vitest | `workerd` (same project as the service tests) | Pass engine, time maths, permission matrix, Zod schemas |
| Client hooks/components | Vitest + Testing Library | happy-dom (`tests/client/`) | `usePoll`, `AutoRefresh`, small interactive components |
| Scripts | `node:test` | Node (`tests/scripts/`) | `render-wrangler`, `check-bundle`: each guard proven to fail on a planted value |
| **Service integration [A]** | Vitest + `@cloudflare/vitest-plugin` | Inside `workerd` with a real local D1, migrations applied, isolated per test file | PRD **T02–T10**: call services with actors of every role, control `now`, run concurrent calls with `Promise.all` |
| Route handlers | Same pool | `workerd` | Board/console JSON shape, privacy, ETag/304 |
| **E2E** | Playwright against `next dev` on a throwaway D1 (`tests/e2e/run.sh`) | Local | Real sign-up → verify → sign-in; the PRD 5.1 10-step demo; 375 px and 320 px layouts; axe accessibility checks |
| **Manual [M]** | Physical phones + printed labels | Staging, production | **T01, T11, T12**; CPU spikes S1/S2 |

- E2E uses **`@playwright/test` (Node)** so tests share TypeScript types with the app.
- E2E runs against the dev server partly because Better Auth rate-limits sign-ups outside development. In E2E, set the rate-limit rules high through an env var that's only read when `ENVIRONMENT=test`.
- All automated tests use local D1 and **no Cloudflare quota**.

---

## 11. Tooling, checks and deployment

### 11.1 Tooling

Node.js 22+, npm, TypeScript (strict), ESLint (`eslint-config-next`), Wrangler 4, drizzle-kit, `tsx` for scripts.

### 11.2 Scripts

| Script | Does |
|---|---|
| `dev` | `next dev -H 127.0.0.1` with local D1 (loopback only) |
| `build` | `next build --webpack` (for OpenNext compatibility) |
| `build:worker` | `opennextjs-cloudflare build` |
| `preview` | `opennextjs-cloudflare build && opennextjs-cloudflare preview` (real `workerd`) |
| `check` | Everything that must pass before a deploy (§11.3) |
| `config:render` | Write `wrangler.deploy.jsonc` from `wrangler.jsonc` + `cleared.config.json` |
| `deploy` / `deploy:staging` | `scripts/deploy.sh production\|staging`: render config → build → bundle scan → deploy → smoke test. Extra arguments are rejected |
| `deploy:first` / `deploy:first:staging` | The same with `--first`: prompts for the Brevo key, generates `BETTER_AUTH_SECRET`, uploads secrets with `--secrets-file`; refuses if the environment already has them |
| `remote` | `wrangler --config wrangler.deploy.jsonc …` (remote D1 commands) |
| `lint`, `typecheck` | ESLint; `next typegen && tsc --noEmit` |
| `test` | Vitest (unit + service tests in `workerd`, client tests in happy-dom) + `node --test` script tests |
| `cf-typegen` | Regenerate `cloudflare-env.d.ts` (`scripts/cf-typegen.mjs`, deterministic) |
| `test:e2e` | Playwright on an isolated D1 |
| `db:generate` | drizzle-kit migration from `schema.ts` |
| `db:migrate` / `db:migrate:staging` / `db:migrate:remote` | Apply migrations locally / staging / production |
| `db:seed` | Clearly fake demo data (local or staging) |

### 11.3 Checks and deploys (local, no CI/CD)

There's **no CI/CD service** (decided 2026-11-22). The checks a CI server would run are one local command, and deploys run from the developer's machine:

| Command | Steps |
|---|---|
| `npm run check` | Repo guards (no `.env*` tracked, no `ENABLE_DEV_OUTBOX` in `wrangler.jsonc`, placeholders only in committed config) → lint → typecheck → `cloudflare-env.d.ts` freshness → `test` → `build:worker` (Next.js + OpenNext) → bundle scan (no secrets in client assets) |
| `npm run test:e2e` | Playwright on a throwaway local D1; run before production deploys |
| `npm run db:migrate:staging` / `db:migrate:remote` | Apply D1 migrations (always before the code that needs them) |
| `npm run deploy:staging` / `deploy` | Render `wrangler.deploy.jsonc` → OpenNext build → deploy → smoke test `GET /api/health` returns the commit SHA |

- **Migrations run before the deploy**, so only **additive** migrations are allowed once production has data.
- Deploying from a headless machine: `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit, D1: Edit, this account only) and `CLOUDFLARE_ACCOUNT_ID` in the shell environment, never in a file.
- Rollback: `wrangler rollback`; data: D1 Time Travel (7 days).

---

## 12. Designing for D1 instead of PostgreSQL

### 12.1 Types

| PRD (Postgres) | D1 (SQLite) | Rule |
|---|---|---|
| `uuid` PK | `TEXT PRIMARY KEY` | `crypto.randomUUID()` in the service |
| `timestamptz` | `INTEGER` (Unix **ms**, UTC) | Every `*_at` column; ISO strings in JSON |
| `boolean` | `INTEGER` 0/1 + `CHECK` | Drizzle `integer({ mode: "boolean" })` |
| enums | `TEXT` + `CHECK (x IN (…))` | Values shared from `src/server/domain/enums.ts` |
| case-insensitive unique | `TEXT COLLATE NOCASE UNIQUE` | Rooms, certifications |

Drizzle rule: correlated subqueries in Drizzle `sql` templates use **fully qualified raw names** (`"machine_requirements"."machine_id" = "machines"."id"`), because Drizzle drops table names in single-table queries.

### 12.2 Transactions without `SELECT … FOR UPDATE`

Each `db.batch()` is atomic and D1 runs statements one at a time. Two techniques replace the PRD's row lock:

**(a) Machine write token (optimistic compare-and-swap).** Each machine row has `write_token TEXT NOT NULL`. A mutation that must be serialised per machine:

1. **Read** the machine (token `T0`) and what the decision needs.
2. **Decide** in TypeScript with one `now`.
3. **Write** one `db.batch()`: statement 1 `UPDATE machines SET write_token = :T1, … WHERE id = :id AND write_token = :T0`; every later statement is guarded by `EXISTS (SELECT 1 FROM machines WHERE id = :id AND write_token = :T1)`.
4. Statement 1 changed **0 rows** → someone else wrote first → retry (≤ 3) → `CONFLICT_RETRY`.

A random token, not an incrementing version, is what makes the guards safe: a guard only matches the token *this* request wrote.

**(b) Inline re-verification.** Conditions on other rows (grant validity, member status) are repeated inside the guarded `INSERT … SELECT … WHERE`, so they're re-checked atomically:

```sql
INSERT INTO machine_sessions (id, machine_id, member_id, started_at, expected_end_at, supervision_acknowledged, client_request_id, created_at)
SELECT :id, :machineId, :memberId, :now, :end, :ack, :clientRequestId, :now
WHERE EXISTS (SELECT 1 FROM machines WHERE id = :machineId AND write_token = :t1 AND status = 'available')
  AND EXISTS (SELECT 1 FROM members  WHERE id = :memberId AND status = 'active')
  AND NOT EXISTS (
        SELECT 1 FROM machine_requirements r
        WHERE r.machine_id = :machineId
          AND NOT EXISTS (SELECT 1 FROM grants g
                          WHERE g.member_id = :memberId AND g.certification_id = r.certification_id
                            AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > :now)));
```

**(c) Backstop constraints:**

- `CREATE UNIQUE INDEX machine_sessions_one_open ON machine_sessions(machine_id) WHERE ended_at IS NULL;` (The PRD's `sessions` table is named `machine_sessions` so it can't be confused with Better Auth's `session` table.)
- `grants.client_request_id UNIQUE` + `ON CONFLICT DO NOTHING` (a double-tap creates one grant).
- `settings.id = 'singleton'` (setup only once).
- `BEFORE UPDATE/DELETE` triggers on `service_records` that `RAISE(ABORT)` (append-only).

### 12.3 Single-statement guards

```sql
-- FR-03: demote/suspend an admin only if another active admin remains
UPDATE members SET role = :role, updated_at = :now
WHERE id = :id
  AND (role <> 'admin' OR (SELECT COUNT(*) FROM members WHERE role = 'admin' AND status = 'active' AND id <> :id) >= 1);
```

### 12.4 Lazy session expiry (PRD)

A session is active while `ended_at IS NULL AND now < expected_end_at`. Expired-but-open rows are closed (`ended_at = expected_end_at`, `end_reason = 'expired'`) at the start of every machine write batch and on board/console polls. No background job.

### 12.5 `data_version`

`settings.data_version` is incremented in every mutation batch. Polling ETags are built from it, so an unchanged board answers 304 after about 2 rows read.

---

## 13. Free-tier budget and capacity planning

### 13.1 What costs quota

| Action | Worker requests | D1 rows read | D1 rows written |
|---|---|---|---|
| JS/CSS/images | **0** (static assets) | 0 | 0 |
| **Any page view** (server-rendered), including opening a QR label | **1** | ~3–30 | 0 |
| Board/console poll, unchanged (304) | 1 | **~2** | 0 |
| Board poll, changed (200) | 1 | ~100–200 (60 machines) | 0–5 |
| Server action (start/end session, report fault, sign off) | 1 (+0; the page refresh comes back in the same response) | ~10–30 | ~3–8 |
| Log service record | 1 | ~20–40 | ~5–12 |
| Sign in | 1 | ~5 | ~3 |
| Sign up + verify | 2 + 1 email | ~6 | ~6 |

### 13.2 Scenarios

| Scenario | Assumptions | Requests/day | Rows read/day | Rows written/day |
|---|---|---|---|---|
| **Classroom demo** | 5 machines, 20 users, 1 hour | < 3,000 (3%) | < 60k (1%) | < 1k (1%) |
| **Pilot (PRD Stage C)** | 10 machines, 150 members, 8 board viewers + 3 consoles visible 10 h, 250 actions, 1,500 page views | ~16,000 (**16%**) | ~0.35M with ETags (**7%**) | ~3k (**3%**) |
| **Full Pro space** | 60 machines, 1,000 members, 40 viewers + 6 consoles visible 10 h, 6,000 page views | ~64,000 (**64%**) | ~1.1M with ETags (**22%**) | ~10k (**10%**) |

**Rule of thumb:** one tab left visible on the board or console all day costs ~1,200 requests per 10 hours. The free plan supports roughly **75 continuously visible tabs a day** across everything on the account. A large, busy space approaches the request limit; a pilot is comfortable.

### 13.3 Built-in protections

1. Static assets for all JS/CSS/images.
2. **ETag/304** on `/api/status-board` and `/api/console` (built from `data_version`, viewer and a `validUntil` time).
3. **Polling only while visible**, with back-off to 120 s after 10 min idle.
4. **`prefetch={false}`** on member-app links.
5. Indexes on every hot filter; `EXPLAIN QUERY PLAN` audit in Phase 7.
6. Better Auth `cookieCache`.
7. Rate limits on actions and auth.
8. Email daily cap.

---

## 14. What happens at a limit, and how we watch for it

| Limit hit | What users see | Recovery |
|---|---|---|
| Workers 100k requests/day | Pages fail with Cloudflare **Error 1027** (cached static files still load) | Automatic at **00:00 UTC = 5 pm MST / 6 pm MDT** |
| 10 ms CPU on one request | That request fails (**Error 1102**) | Fix the code path; see §5.2 and §6.4 |
| D1 rows read/written per day | Queries fail → the app shows "Cleared is over its free daily limit, back after 5 pm" | Automatic at 00:00 UTC |
| D1 500 MB | Writes fail | Not realistic; retention rule (PRD 11.1) |
| Brevo 300/day (our cap 280) | "Email is busy today" on sign-up/reset | Next day |
| Workers Logs 200k/day | Logs stop; the app keeps working | Lower sampling |

**There are never surprise charges.** The cost of a limit is downtime, so:

- **Weekly (daily during a pilot):** check the Cloudflare dashboard → Workers & Pages → `cleared` → Metrics (requests, CPU, errors), and D1 → Metrics.
- **Optional $0 alarm (Phase 7, open decision):** a scheduled job that reads Cloudflare's GraphQL Analytics API with a read-only token and warns above 60% of any daily limit. The original plan ran it as a scheduled GitHub Actions workflow; GitHub Actions is otherwise not used (no CI/CD), so Phase 7 decides whether to opt in for this one job (and documents its free-tier limits in §3) or drop it.
- **Backups:** D1 Time Travel (7 days) plus a weekly `npm run remote -- d1 export … --output=<outside the repo>` during a pilot, stored privately (personal data; the repository is public).

---

## 15. Paid traps to avoid

| Looks tempting | Why it's excluded | Use instead |
|---|---|---|
| **Workers Paid ($5/mo)** | Breaks the $0 rule (even though it removes the CPU and request limits) | Stay within free quotas; spikes S1/S2 |
| **Custom domain** | Domain registration costs money | `*.workers.dev` |
| **Clerk** | Production needs an owned domain; dev instance capped at 100 users | Better Auth |
| **OpenNext R2 incremental cache / KV tag cache** | R2 needs a card; pages are dynamic anyway | Default `defineCloudflareConfig()` |
| **Vercel Hobby** | Free, but non-commercial use only, and it moves off D1 | Workers |
| **Cloudflare Email Service / Resend / Postmark** | Need a domain (and Workers Paid for Cloudflare's) | Brevo |
| **R2** (photo uploads) | Card required | No uploads (PRD 11.1: no photos) |
| **External Postgres via Hyperdrive** | Free Hyperdrive allows only 100k **queries**/day, which is tighter than D1, and the DB needs its own host | D1 |
| **Cron Triggers / Queues / Durable Objects** | PRD forbids background jobs; extra quotas and complexity | Lazy evaluation on read; write tokens |
| **Logpush, Tail Workers** | Paid | Workers Logs, `wrangler tail` |
| **SMS / MFA via SMS** | Paid everywhere | None in MVP |
| **Google Cloud billing** | Not needed | — |

---

## 16. Known platform quirks

Things that are known to matter for Next.js 16 + OpenNext + D1 + Better Auth on Workers Free. Phase 0 bakes them into the scaffold.

| Quirk | What to do |
|---|---|
| OpenNext/workerd can hang when serving Next 16 **Cache Components** output | Enable `cacheComponents` only when `NODE_ENV === "development"` in `next.config.ts`. Session reads must still sit inside `<Suspense>` (the dev build enforces it) |
| `@opennextjs/aws` expects a CommonJS default export from `cookie` when building the Worker middleware | **Not needed as of `@opennextjs/cloudflare` 1.20.18** (Phase 0 built and ran the proxy without it). If a later upgrade breaks the middleware build, add an npm `overrides` entry pinning `cookie` for `@opennextjs/aws` |
| Next 16 `proxy.ts` always runs on the Node.js runtime; OpenNext warns that Node.js middleware on Cloudflare is "experimental" | Works in `npm run preview` (real `workerd`). Keep `proxy.ts` to a cookie-presence redirect, and re-check redirects on staging after every OpenNext upgrade |
| `@cloudflare/vitest-pool-workers` was renamed `@cloudflare/vitest-plugin` (Vitest 4 API: `cloudflareTest()` plugin instead of `defineWorkersConfig`) | `vitest.config.mts` uses `cloudflareTest({ wrangler, main })` with a stub `main`, since `.open-next/worker.js` only exists after a build |
| `wrangler.jsonc` vars are the **production** values, and `next dev` reads them | `.dev.vars` overrides `ENVIRONMENT`, `PUBLIC_BASE_URL` and `BETTER_AUTH_URL` locally; the E2E harness overrides them through `process.env`, which `src/lib/env.ts` honours only in `next dev` |
| Builds | Use `next build --webpack` for OpenNext compatibility |
| `.env*` values can be **embedded into the bundle** by OpenNext | Secrets only in `.dev.vars` (local) and Worker secrets; git-ignore `.env*`; `npm run check` blocks committed `.env` files |
| Bindings in `next dev` | `initOpenNextCloudflareForDev()` in `next.config.ts` gives the dev server local D1 and vars (persisted under `.wrangler/state`) |
| E2E next to a running dev server | Give the E2E server its own `distDir` (`NEXT_DIST_DIR=.next-e2e`) and its own D1 state directory |
| Better Auth rate-limits sign-ups outside development | Raise the limits in E2E only (`ENVIRONMENT=test`) |
| The Next.js dev indicator covers bottom-left buttons at phone widths | Turn `devIndicators` off when `E2E=1` |
| Better Auth's default password hashing vs the 10 ms CPU limit | Works on Workers Free in practice for comparable apps; verified by spike S1 (§6.4) |
| Drizzle drops table names in single-table `sql` templates | Use fully qualified raw names in correlated subqueries (§12.1) |
| First deploy needs the required secrets | `opennextjs-cloudflare deploy --secrets-file <tmp file>` (`npm run deploy:first[:staging]` → `scripts/deploy.sh --first`, `setup-and-deploy.md` §10.2) |
| npm appends `-- args` to the **end** of a script's `&&` chain | Deploy scripts are one shell script that takes the environment from the script name and rejects extra arguments (`npm run deploy -- --env staging` would otherwise deploy production) |
| Under `next dev` (Cache Components), dynamic reads outside `<Suspense>` error; a streamed page can't change its HTTP status, and `export const instant` is rejected by production builds without Cache Components | Gate dev/staging-only *pages* inside the Suspense boundary (they render the not-found page with status 200); gate *route handlers* normally (real 404) |
| Windows Git Bash checks files out with CRLF, which breaks `set -euo pipefail` | `.gitattributes`: `* text=auto eol=lf`; scripts spawn tools with `process.execPath` instead of `npx` |

---

## 17. Accounts, secrets and configuration

### 17.1 Accounts (all free, no card)

| Account | Used for | Notes |
|---|---|---|
| Cloudflare | Workers, D1, logs | Daily quotas are shared by every Worker on an account; use a dedicated free account if you run other Workers |
| GitHub | Repo (optional) | Hosting the code; no Actions or other paid-tier features used |
| Brevo | Verification and reset emails | Verify a sender address |
| Project mailbox (recommended) | Brevo sender; owner of the project accounts | Keeps personal accounts separate |

Step-by-step: [`setup-and-deploy.md`](./setup-and-deploy.md).

### 17.2 Secrets and variables

| Name | Kind | Where |
|---|---|---|
| `BETTER_AUTH_SECRET` | secret (`openssl rand -base64 32`) | Worker secret per environment (different values); `.dev.vars` locally |
| `BREVO_API_KEY` | secret | Worker secret (staging, production) |
| `EMAIL_FROM_ADDRESS` | secret | Worker secret |
| `PUBLIC_BASE_URL`, `BETTER_AUTH_URL` | var | `wrangler.jsonc` per environment, with `<your-subdomain>` filled in from `cleared.config.json` at deploy time |
| Workers subdomain, D1 database IDs | deployment config (not secret, but personal) | Git-ignored `cleared.config.json` (or `WORKERS_SUBDOMAIN`, `D1_PRODUCTION_ID`, `D1_STAGING_ID` environment variables) |
| `ENVIRONMENT`, `REQUIRE_EMAIL_VERIFICATION`, `EMAIL_FROM_NAME`, `EMAIL_DAILY_CAP` | var | `wrangler.jsonc` |
| `ENABLE_DEV_OUTBOX` | var | `.dev.vars` / E2E only, **never** in `wrangler.jsonc` |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | shell environment | Only for deploys from a machine without a browser (`wrangler login` otherwise); never in a file |

**OpenNext can embed values from `.env.local` into the bundle.** Keep secrets in `.dev.vars` and Worker secrets only, never in `.env*`.

---

## 18. Changes from the PRD (Replit → Cloudflare)

| PRD item | PRD (Replit) | Now ($0 Cloudflare) | Why |
|---|---|---|---|
| Header, §4.1 goal 7 | Replit | Next.js on Cloudflare Workers + D1, `workers.dev` URL | Free Cloudflare deployment |
| §10.1 Frontend + backend | React + Vite SPA, Node + Express | **Next.js 16** (Server Components, server actions, route handlers) via **OpenNext** | One project for front and back end; proven on Workers Free |
| §10.1 Database | Replit PostgreSQL + Drizzle | **D1 (SQLite) + Drizzle** | Same ORM; types adapted (§12.1) |
| §10.3 Concurrency | `SELECT … FOR UPDATE` | **Atomic `db.batch()` + machine write tokens + guarded inserts**; partial unique index kept | D1 has no row locks (§12.2) |
| §10.1 Auth | Replit-managed Clerk | **Better Auth, email + password** with verification and reset emails; `members.clerk_user_id` → `members.auth_user_id` | Clerk production needs a paid domain |
| §10.4 API | REST endpoints | **Server actions** for mutations, **Server Components** for reads, **GET route handlers** for polling | Next.js conventions |
| §10.1 QR | Server-side SVG | **Browser-side SVG** (`qrcode`) | Saves Worker CPU |
| §10.1 Email (P1) | Resend | **Brevo** (used in P0 for verification/reset) | Resend needs a domain |
| §10.2 Cold starts | Reserved VM fallback | Workers isolates start fast; T12 still measured; no paid fallback | — |
| §10.2 Region | Replit region | D1 hint `wnam`, likely U.S. | Disclose |
| §11.1 Secrets | Replit Secrets | Worker secrets + `.dev.vars` | — |
| §11.1 Test auth stub | Stub that refuses to start in production | **No stub at all:** service tests take an `actor`; E2E uses real sign-up | Removes the risk entirely |
| FR-19 | Per-instance limits | Workers rate-limit binding + Better Auth database limiter | Isolates don't share memory |
| §12.3 Costs | Replit costs to measure | **$0 fixed**; capacity limits instead (§13) | — |

**PRD sections to update** (not done here): header table, §4.1 goal 7, §10, §11.1, §12.3, §14, §15 ("Replit HTTPS URL" → `workers.dev` URL), §16, §17.

---

## 19. Sources (checked November 22, 2026)

**Cloudflare**
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): 100k requests/day, 10 ms CPU, size limits
- [Static assets billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/): asset requests free and unlimited
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) and [community answer on Free](https://community.cloudflare.com/t/are-workers-rate-limiting-api-bindings-free-on-the-workers-free-plan/971323)
- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Workers Builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
- [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/) (considered, not used)
- [Cloudflare Email Service](https://developers.cloudflare.com/email-service/get-started/send-emails/) and [free-plan sending PR](https://github.com/cloudflare/cloudflare-docs/pull/35257)

**Next.js on Workers**
- [OpenNext Cloudflare troubleshooting](https://opennext.js.org/cloudflare/troubleshooting) (still quotes the old 3 MiB size limit)
- [Next.js on Cloudflare Workers: vinext or OpenNext?](https://whoooop.co.uk/blog/nextjs-on-cloudflare-workers)
- [Running a real app on the Workers free plan](https://thenextbeacon.com/insights/cloudflare-workers-free-plan-limits/)

**Auth**
- [Better Auth issue #969](https://github.com/better-auth/better-auth/issues/969) and [#8860](https://github.com/better-auth/better-auth/issues/8860): password hashing vs Workers CPU
- [Clerk environments](https://clerk.com/docs/guides/development/managing-environments) and [dev-instance limits](https://clerk.com/changelog/2024-08-02-dev-notice)

**Email**
- [Brevo transactional email API](https://www.brevo.com/features/email-api/) and [free plan](https://www.brevo.com/free-smtp-server/)
- [freeCodeCamp: Brevo single-sender verification](https://www.freecodecamp.org/news/how-to-bypass-cloud-smtp-restrictions-using-brevo-and-http-apis/)
- [Brevo: limits of the Free plan](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) and [API rate limits](https://www.brevo.com/blog/api-rate-limiting/)
- [Brevo: domain authentication and free-mail sender rewriting](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)


> Free tiers change. **Before Phase 0 and before any pilot, re-open these links and update §3 and §13** if anything changed.
