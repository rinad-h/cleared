# Cleared — Setup and Deploy Guide

> How to run Cleared locally and deploy your own copy to **Cloudflare Workers + D1 on the free plan**, from a fresh fork of this repository. Everything here costs **$0**: no paid plan, no domain, no credit card.
>
> Stack background and free-tier limits: [`technologies.md`](./technologies.md). Build order: [`phases/`](./phases/README.md).

> **Status:** this guide describes the finished project. The scripts and files it mentions (`package.json` scripts, `wrangler.jsonc`, `.dev.vars.example`, `scripts/*`) are created in [Phase 0](./phases/phase-0-foundation.md). Keep this guide in sync whenever a phase changes a command.

---

## Contents

1. [What you'll end up with](#1-what-youll-end-up-with)
2. [Prerequisites](#2-prerequisites)
3. [Create your Cloudflare account and `workers.dev` subdomain](#3-create-your-cloudflare-account-and-workersdev-subdomain)
4. [Get the code and install](#4-get-the-code-and-install)
5. [Connect Wrangler to your Cloudflare account](#5-connect-wrangler-to-your-cloudflare-account)
6. [Create the D1 database](#6-create-the-d1-database)
7. [Add your deployment values (`cleared.config.json`)](#7-add-your-deployment-values-clearedconfigjson)
8. [Run it locally](#8-run-it-locally)
9. [First deploy](#9-first-deploy)
10. [Testing changes without a staging copy](#10-testing-changes-without-a-staging-copy)
11. [First-run setup in the app](#11-first-run-setup-in-the-app)
12. [Everyday deploys](#12-everyday-deploys)
13. [Checks before every deploy](#13-checks-before-every-deploy)
14. [Operating it: logs, usage, backups](#14-operating-it-logs-usage-backups)
15. [Troubleshooting](#15-troubleshooting)
16. [Command reference](#16-command-reference)

---

## 1. What you'll end up with

| | The deployment |
|---|---|
| Worker name | `cleared` |
| URL | `https://cleared.<your-subdomain>.workers.dev` (the URL printed on your QR labels) |
| D1 database | `cleared` |

Plus a local development setup that uses a local copy of D1 and no Cloudflare quota.

There is **one deployment and no staging copy**. Changes are tested locally first ([section 10](#10-testing-changes-without-a-staging-copy)), and the deployment's `ENVIRONMENT` is `production`.

> **Choose your names once.** QR labels encode the deployment's URL. If you later change the `workers.dev` subdomain or the Worker name, every label has to be reprinted.

---

## 2. Prerequisites

| You need | Notes |
|---|---|
| **Node.js 22 or later** and **npm** | `node -v`. Use the version in `.nvmrc` if you use nvm |
| **git** | — |
| **openssl** | To generate secrets (`openssl rand -base64 32`). Preinstalled on macOS and Linux; on Windows use Git Bash or WSL |
| **A Cloudflare account** | Free. **Don't add a payment method** |

Optional: a phone and a printer to test QR labels.

**Everything above is free.** The limits of every service (requests per day, database reads and writes) are listed in [`technologies.md`, section 3.2](./technologies.md#32-free-limits-for-every-technology). The ones you're most likely to notice:

| Service | Free limit | Resets |
|---|---|---|
| Cloudflare Workers | 100,000 requests/day per account; 10 ms CPU per request | 00:00 UTC |
| Cloudflare D1 | 5M rows read/day, 100k rows written/day, 500 MB per database | 00:00 UTC |

---

## 3. Create your Cloudflare account and `workers.dev` subdomain

1. Sign up at <https://dash.cloudflare.com/sign-up> and confirm your address from the email Cloudflare sends. Turn on two-factor authentication (**My Profile → Authentication**).
2. In the dashboard, open **Compute (Workers) → Workers & Pages**. The first visit asks you to choose your **`workers.dev` subdomain**, for example `my-makerspace`. Your apps will live at `https://<worker-name>.my-makerspace.workers.dev`.
   - Pick something neutral and permanent. It ends up on printed labels.
   - You can see or change it later under **Workers & Pages → Account details → Subdomain**. Changing it changes every Worker's URL.
3. Check you're on the **Free** plan: **Workers & Pages → Plans** shows *Workers Free*. **Never upgrade.** Cleared is designed to fit the free limits, and going over a limit pauses the app until 00:00 UTC rather than billing you.

> One Cloudflare account's free limits (100,000 Worker requests/day, D1 reads/writes per day) are **shared by every Worker on the account**. If you already run other Workers on your account, consider a separate free account for Cleared.

---

## 4. Get the code and install

```bash
# Clone (or fork, then clone your fork):
git clone https://github.com/<github-user>/cleared.git
cd cleared
npm ci
```

---

## 5. Connect Wrangler to your Cloudflare account

Wrangler is Cloudflare's command-line tool. It's installed as a dev dependency, so always run it through `npx`.

```bash
npx wrangler login      # opens a browser; approve access
npx wrangler whoami     # shows the account name and ID you're connected to
```

If you have access to several Cloudflare accounts, `whoami` lists them. Put the right one in your shell before every Wrangler command:

```bash
export CLOUDFLARE_ACCOUNT_ID=<account-id-from-whoami>
```

**No browser available** (SSH, a server)? Create an API token instead ([section 13](#13-checks-before-every-deploy)) and run `export CLOUDFLARE_API_TOKEN=<token>` before running Wrangler.

---

## 6. Create the D1 database

Create the app's one database. `--location=wnam` places the primary copy in western North America. Choose the hint nearest your users: `wnam`, `enam`, `weur`, `eeur`, `apac` or `oc`.

```bash
npx wrangler d1 create cleared --location=wnam
```

If Wrangler asks whether to update your config automatically, answer **no** (or run the command outside the repository): the committed `wrangler.jsonc` must keep its placeholders. It then prints a block like this:

```jsonc
{
  "d1_databases": [
    {
      "binding": "cleared",
      "database_name": "cleared",
      "database_id": "1a2b3c4d-1111-2222-3333-444455556666"   // ← copy this value
    }
  ]
}
```

Copy the **`database_id`** value. You'll paste it into `cleared.config.json` in the next step.

Check it exists:

```bash
npx wrangler d1 list
```

> **Data location:** D1 has no Canadian jurisdiction. `--jurisdiction eu` (EU) and `--jurisdiction us` exist if your institution requires them; a jurisdiction overrides the location hint. Mention data location in your privacy notice.

---

## 7. Add your deployment values (`cleared.config.json`)

The repository stays **generic**: the committed `wrangler.jsonc` keeps placeholders (`<your-subdomain>`, `<database-id>`) and `npm run check` fails if real values ever land in it. Your own values go in a **git-ignored** file instead:

```bash
cp cleared.config.example.json cleared.config.json
```

```json
{
  "workersSubdomain": "my-makerspace",
  "d1DatabaseId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

Open `cleared.config.json` and replace both placeholders:

| Key | Replace with | Where to find it |
|---|---|---|
| `workersSubdomain` | Your subdomain, e.g. `my-makerspace` (without `.workers.dev`) | Dashboard → **Workers & Pages** → **Account details** → **Subdomain** |
| `d1DatabaseId` | The `database_id` from the previous step | The `wrangler d1 create` output, or `npx wrangler d1 list` (the ID in the `cleared` row) |

These aren't secrets, but they're yours, so they never go in the repository. Keep a copy in your password manager. For a one-off deploy from another machine, the environment variables `WORKERS_SUBDOMAIN` and `D1_DATABASE_ID` work instead of the file (and win over it).

**How it's used:** every command that talks to your Cloudflare deployment first runs `scripts/render-wrangler.mjs`, which fills the placeholders and writes **`wrangler.deploy.jsonc`** (also git-ignored), then runs Wrangler with `--config wrangler.deploy.jsonc`. The npm scripts do this for you:

| Use | Instead of |
|---|---|
| `npm run deploy`, `npm run deploy:first` | `opennextjs-cloudflare deploy …` |
| `npm run db:migrate:remote` | `npx wrangler d1 migrations apply DB --remote …` |
| `npm run remote -- <wrangler arguments>` | `npx wrangler <arguments>` for anything that touches a **remote D1 database** (`d1 execute`, `d1 export`, `d1 time-travel`, `d1 migrations list`) |

Plain `npx wrangler` against the committed `wrangler.jsonc` sees placeholder database IDs, so remote D1 commands fail with it. Commands that only need your login and the Worker name (`wrangler tail`, `wrangler secret …`, `wrangler rollback`, `wrangler deployments list`) work either way. Local development and tests never need `cleared.config.json`.

Check the rendered config and your URLs:

```bash
npm run config:render                   # writes wrangler.deploy.jsonc, or says what's missing
node scripts/render-wrangler.mjs --url  # https://cleared.<your-subdomain>.workers.dev
```

**Renaming the Worker** (for example `makerspace-pass` instead of `cleared`)? That's a change to the template itself: edit `name`, the `WORKER_SELF_REFERENCE` `service`, and both URLs in `wrangler.jsonc` (keeping `<your-subdomain>`), then run `npm run cf-typegen`. The URL is always `https://<name>.<your-subdomain>.workers.dev`. Leave `compatibility_date` as committed unless you change it deliberately and test.

---

## 8. Run it locally

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` (git-ignored, never committed). The example already overrides the production values from `wrangler.jsonc` for local work; the one thing you must set is the secret:

```bash
ENVIRONMENT=development
PUBLIC_BASE_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<output of: openssl rand -base64 32>
```

Then:

```bash
npm run db:migrate         # apply all migrations to the LOCAL D1 (in .wrangler/state)
npm run db:seed            # optional, after Setup: clearly fake demo data (docs/seed.md)
npm run dev                # http://localhost:3000
```

- **The dev server only listens on this computer** (`127.0.0.1`), so it isn't reachable from the café or campus Wi-Fi. `http://localhost:3000` works as usual.
- The first account you create can complete **Setup** and becomes admin.
- **Test the real Workers runtime** before deploying: `npm run preview` builds with OpenNext and serves on `http://localhost:8787` (if that port is taken: `npm run preview -- --port 8799`). Set `PUBLIC_BASE_URL` and `BETTER_AUTH_URL` to the preview URL in `.dev.vars` while previewing.
- **Don't put secrets in `.env`, `.env.local` or similar.** OpenNext can embed `.env*` values into the deployed bundle. Use `.dev.vars` locally and Worker secrets in Cloudflare.

Run the checks:

```bash
npm run lint && npm run typecheck && npm test
npx playwright install chromium   # once: the browser used by the E2E tests
npm run test:e2e           # browser tests against a throwaway local database
```

---

## 9. First deploy

This step also creates the `cleared` Worker; there's nothing to create in the dashboard.

### 9.1 Apply the database migrations

```bash
npm run db:migrate:remote
```

Wrangler lists the migrations it's about to apply and asks for confirmation. Check with:

```bash
npm run remote -- d1 migrations list DB --remote
```

### 9.2 Deploy with the secret

`wrangler.jsonc` lists the one secret the Worker requires, `BETTER_AUTH_SECRET`. The **first** deploy generates it and uploads it with the code:

```bash
npm run deploy:first
```

`scripts/deploy.sh --first`:
1. renders `wrangler.deploy.jsonc` from your `cleared.config.json` ([section 7](#7-add-your-deployment-values-clearedconfigjson));
2. **refuses to continue if the Worker already has `BETTER_AUTH_SECRET`** (a second "first deploy" would replace it and sign everyone out);
3. generates a fresh `BETTER_AUTH_SECRET` (`openssl rand -base64 32`);
4. builds (without the secret in the build's environment), then scans the build for secret values (`scripts/check-bundle.mjs`);
5. writes the secret to a private temporary file (mode 600, deleted on exit, even on failure or Ctrl-C) and runs `opennextjs-cloudflare deploy --config wrangler.deploy.jsonc --secrets-file <tmp>`;
6. runs the smoke test ([section 9.3](#93-check-it)).

Extra arguments are rejected rather than guessed.

> **Keep `BETTER_AUTH_SECRET` stable.** Changing it (`npm run remote -- secret put BETTER_AUTH_SECRET`) signs everyone out.

### 9.3 Check it

The deploy script already ran `scripts/smoke-test.sh`: `/api/health` must report `ok`, `environment: "production"` and the version this checkout builds (the commit SHA, plus `-dirty-<hash>` if you deployed uncommitted changes), `/help` must render and `/` must redirect (307) to `/machines`. By hand:

```bash
bash scripts/smoke-test.sh
curl https://cleared.<your-subdomain>.workers.dev/api/health
# {"status":"ok","version":"<git sha>","environment":"production"}

npm run remote -- secret list   # shows the secret's name (not its value)
npx wrangler tail cleared       # live logs; open the site in a browser to see requests
```

Open the URL on your phone and sign up; you're signed in straight away.

---

## 10. Testing changes without a staging copy

Cleared has one deployment. There's no staging Worker or database to try changes on first, so:

- **Until real users exist** (the build phases, before a pilot), the deployment itself is the test bed: deploy each phase and do its manual checks there.
- **Once it has real users,** test every change locally before deploying: `npm run check`, `npm run test:e2e`, and `npm run preview` (the real Workers runtime, `localhost:8787`). Then migrate and deploy ([section 12](#12-everyday-deploys)).
- **Undo** a bad code deploy with `npx wrangler rollback` (Workers keeps 30 days of versions), and a bad migration or data change with D1 Time Travel: `npm run remote -- d1 time-travel restore cleared --timestamp=<ISO time before the change>` (last 7 days; replaces the whole database, [section 14](#14-operating-it-logs-usage-backups)).
- **Measuring CPU on the deployment** (Phase 7 P7-30…33): open the real pages and read `cpuTime` per invocation in Dashboard → Workers & Pages → `cleared` → Logs. The Phase 0 spike routes were deleted in Phase 7; if `npm run remote -- secret list` still shows `ENABLE_SPIKES`, delete it with `npm run remote -- secret delete ENABLE_SPIKES`.

---

## 11. First-run setup in the app

1. Open `https://cleared.<your-subdomain>.workers.dev` and **sign up** with the account that should be the admin.
2. You're sent to **Setup**: enter the makerspace name and time zone. You're now the **admin**, and setup is closed for everyone else.
3. In the staff console: add **rooms**, **certifications** and **machines**, then print the **label sheet** (**Console → Labels**).
4. Copy the **join link** (**Console → Settings**) and share it. People who open it, sign up and join become members.
5. Promote supervisors and technicians to **staff** under **Console → Members**.

If the wrong person completes setup on a fresh deployment, fix it with the admin script ([section 15](#15-troubleshooting)) or recreate the database.

---

## 12. Everyday deploys

After code changes:

```bash
npm run check                  # must pass before any deploy (see section 13)
npm run test:e2e               # browser tests on a throwaway local database
# if the change added a migration (new file in drizzle/):
npm run db:migrate:remote
npm run deploy                 # build, deploy, smoke test
```

Rules:

- **Apply migrations before deploying the code that needs them.** Once the deployment has real data, migrations must be **additive** (new tables, new nullable or defaulted columns, new indexes), so the old code keeps working against the new schema.
- **Secrets persist across deploys.** You only set one again to change it: `npm run remote -- secret put <NAME>`.
- **Roll back** a bad code deploy: `npx wrangler rollback` (Workers keeps 30 days of versions). Never roll back a migration; write a new one (or, for real damage, restore with D1 Time Travel, [section 14](#14-operating-it-logs-usage-backups)).

### Making a schema change

```bash
# 1. edit src/db/schema.ts
npm run db:generate          # drizzle-kit writes a new SQL file in drizzle/
# 2. read the generated SQL; add anything drizzle-kit can't (e.g. triggers)
npm run db:migrate           # apply locally and test
```

Then the deploy steps above.

---

## 13. Checks before every deploy

There's no CI server: deploys happen from your machine, so run the checks there first.

```bash
npm run check          # what must pass before any deploy
npm run test:e2e       # browser tests on a throwaway local database (recommended before every deploy)
```

`npm run check` runs, in order:

| Step | Fails when |
|---|---|
| Repo guards (`scripts/check-bundle.mjs --repo`) | A `.env*` or `.dev.vars` file is tracked by git; `ENABLE_SPIKES` appears in `wrangler.jsonc`; `wrangler.jsonc` or `cleared.config.example.json` holds real values instead of placeholders; `cleared.config.json` or `wrangler.deploy.jsonc` is tracked |
| `npm run lint`, `npm run typecheck` | ESLint warnings or errors; TypeScript errors |
| Binding types (`scripts/cf-typegen.mjs --check`) | `cloudflare-env.d.ts` is stale: run `npm run cf-typegen` |
| `npm test` | A unit or service test fails |
| `npm run build:worker` | The Next.js or OpenNext build fails |
| Bundle scan (`scripts/check-bundle.mjs`) | Something that looks like a secret (auth secret, private key, token) is in the files sent to browsers |

Each deploy script then runs the **smoke test** by itself: `/api/health` on the deployment must answer `ok` with your current commit SHA (`scripts/smoke-test.sh`). If it fails, roll back (`npx wrangler rollback`) and look at `npx wrangler tail cleared`.

> **Deploying from a machine with no browser** (SSH, a server)? Create an API token instead of `wrangler login`: dashboard → **My Profile → API Tokens → Create Token → Create Custom Token** with **Account · Workers Scripts · Edit** and **Account · D1 · Edit**, limited to your account. Then `export CLOUDFLARE_API_TOKEN=<token>` and `export CLOUDFLARE_ACCOUNT_ID=<id>`. Never save the token in the repository.

---

## 14. Operating it: logs, usage, backups

| Task | How |
|---|---|
| **Live logs** | `npx wrangler tail cleared` |
| **Stored logs** | Dashboard → Workers & Pages → `cleared` → **Logs** (3 days on the free plan) |
| **Request and CPU usage** | Dashboard → `cleared` → **Metrics**. Watch daily requests (free limit 100,000) and errors such as **1102** (CPU limit) |
| **Database usage** | Dashboard → **Storage & Databases → D1** → `cleared` → **Metrics** (rows read: 5M/day; rows written: 100k/day) |
| **Query the database** | `npm run remote -- d1 execute cleared --remote --command "SELECT COUNT(*) FROM members"`. Remote queries count toward your daily quota; keep them small |
| **Backup** | `mkdir -p ~/cleared-backups && npm run remote -- d1 export cleared --remote --output="$HOME/cleared-backups/cleared-$(date +%F).sql"`. **Always outside the repository**: a dump contains personal data, and the repository is public. `npm run check` fails if a `.sql` file outside `drizzle/` could be committed |
| **Restore to a point in time** (last 7 days) | `npm run remote -- d1 time-travel info cleared` then `npm run remote -- d1 time-travel restore cleared --timestamp=<ISO time>`. A restore replaces the whole database; take an export first |
| **Change a secret** | `npm run remote -- secret put <NAME>` |

Daily free limits reset at **00:00 UTC**. If you hit one, the app shows a "back after the daily reset" message until then. Nothing is billed.

---

## 15. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `wrangler` commands act on the wrong account | Several accounts on your login | `export CLOUDFLARE_ACCOUNT_ID=…` ([section 5](#5-connect-wrangler-to-your-cloudflare-account)) |
| Deploy fails: missing required secret | First deploy without the secret | Use `npm run deploy:first` ([section 9.2](#92-deploy-with-the-secret)) or `npm run remote -- secret put <NAME>` |
| `deploy: the Worker already has BETTER_AUTH_SECRET` | `deploy:first` on a deployment that's already set up | Use `npm run deploy`; secrets persist across deploys |
| `deploy: unexpected argument` | e.g. `npm run deploy -- --force` | There's one deployment and no flags: `npm run deploy` (or `npm run deploy:first` once) |
| Smoke test fails on `version` right after a deploy | The deploy didn't happen, or the tree changed during it | Check the deploy output; rerun `bash scripts/smoke-test.sh` |
| `no such table` errors after deploy | Migrations not applied to the database | `npm run db:migrate:remote` |
| `render-wrangler: missing deployment values` | No `cleared.config.json` | [section 7](#7-add-your-deployment-values-clearedconfigjson) |
| A remote `d1` command fails with an invalid database ID | Plain `npx wrangler` reads the committed placeholders | Use `npm run remote -- d1 …` ([section 7](#7-add-your-deployment-values-clearedconfigjson)) |
| Sign-in works locally but not when deployed; cookies missing | `BETTER_AUTH_URL` doesn't exactly match the deployed URL | Check `workersSubdomain` in `cleared.config.json` and `node scripts/render-wrangler.mjs --url`, then redeploy |
| **Error 1102** in logs | A request used more CPU than the free plan allows | See which route in **Logs**; [`technologies.md`](./technologies.md) sections 5.2 and 6.4 |
| **Error 1027** | 100,000 daily Worker requests used up | Wait for 00:00 UTC; close idle board/console tabs; check for runaway polling |
| QR labels point to the wrong address | Printed from a local or preview server, or `PUBLIC_BASE_URL` wrong | Labels always use `PUBLIC_BASE_URL`; labels printed outside the deployment carry a red "NOT THE REAL APP" banner. Fix the URL, reprint from the deployment |
| Local dev can't find the database | Local migrations not applied | `npm run db:migrate` |
| A user forgot their password | Cleared sends no email, so there's no self-service reset | An admin confirms who they are, then runs `npx tsx scripts/set-password.ts <email> <temporary-password>` (hashes locally and updates D1); the user signs in and changes it |
| The only admin lost access | — | `npx tsx scripts/make-admin.ts <email>` |

---

## 16. Command reference

| Command | What it does |
|---|---|
| `npm ci` | Install exact dependencies |
| `npm run dev` | Next.js dev server with local D1 (`localhost:3000`) |
| `npm run preview` | OpenNext build served in the Workers runtime (`localhost:8787`) |
| `npm run check` | Everything that must pass before a deploy: repo guards, lint, types, binding types, tests, Worker build, bundle scan ([section 13](#13-checks-before-every-deploy)) |
| `npm run lint` / `npm run typecheck` / `npm test` | Checks and service tests individually |
| `npm run test:e2e` | Browser tests on a throwaway local database |
| `npm run db:generate` | New migration from `src/db/schema.ts` changes |
| `npm run db:migrate` | Apply migrations to the local D1 |
| `npm run db:seed` | Load fake demo data locally |
| `npm run db:seed -- --reset --i-know` | Back up, clear and re-seed the local demo data (only when the makerspace name starts with "Demo"; [`seed.md`](./seed.md)) |
| `bash scripts/reset-demo.sh --i-know` | The same on the deployment (backup to `~/cleared-backups/` first) |
| `npx tsx scripts/set-password.ts <email> <temp-password> [--local]` | Set a temporary password for a member (no email reset) |
| `npx tsx scripts/make-admin.ts <email> [--local]` | Make a member an active admin (admin lock-out) |
| `npm run cf-typegen` | Regenerate binding types after editing `wrangler.jsonc` |
| `npm run config:render` | Write `wrangler.deploy.jsonc` from `wrangler.jsonc` + `cleared.config.json` |
| `npm run remote -- <args>` | Run Wrangler against your deployment config (needed for remote D1 commands) |
| `npm run deploy:first` | First deploy: generates `BETTER_AUTH_SECRET`, uploads it with the code, smoke-tests (refuses if the secret already exists) |
| `npm run deploy` | Build, deploy, then smoke test `/api/health` |
| `npx wrangler login` / `whoami` | Connect to / check your Cloudflare account |
| `npx wrangler d1 create <name> --location=wnam` | Create a D1 database |
| `npx wrangler d1 list` | List databases |
| `npm run db:migrate:remote` | Apply migrations to the deployment's database |
| `npm run remote -- d1 migrations list DB --remote` | Show applied and pending migrations |
| `npm run remote -- d1 execute <db> --remote --command "<SQL>"` | Run a query (uses quota) |
| `npm run remote -- d1 export <db> --remote --output=<file outside the repo>` | Backup (contains personal data) |
| `npm run remote -- d1 time-travel restore <db> --timestamp=<ISO>` | Point-in-time restore |
| `npm run remote -- secret put <NAME>` / `secret delete <NAME>` | Set, change or remove a secret |
| `npm run remote -- secret list` | List secret names |
| `npx wrangler tail <worker>` | Live logs |
| `npx wrangler rollback` | Roll back to the previous code version |
| `npx wrangler deployments list` | Recent deployments |
