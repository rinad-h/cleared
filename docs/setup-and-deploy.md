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
6. [Create the D1 databases](#6-create-the-d1-databases)
7. [Add your deployment values (`cleared.config.json`)](#7-add-your-deployment-values-clearedconfigjson)
8. [Run it locally](#8-run-it-locally)
9. [Set up email (Brevo)](#9-set-up-email-brevo)
10. [First deploy to staging](#10-first-deploy-to-staging)
11. [First deploy to production](#11-first-deploy-to-production)
12. [First-run setup in the app](#12-first-run-setup-in-the-app)
13. [Everyday deploys](#13-everyday-deploys)
14. [Checks before every deploy](#14-checks-before-every-deploy)
15. [Operating it: logs, usage, backups](#15-operating-it-logs-usage-backups)
16. [Troubleshooting](#16-troubleshooting)
17. [Command reference](#17-command-reference)

---

## 1. What you'll end up with

| | Staging | Production |
|---|---|---|
| Worker name | `cleared-staging` | `cleared` |
| URL | `https://cleared-staging.<your-subdomain>.workers.dev` | `https://cleared.<your-subdomain>.workers.dev` |
| D1 database | `cleared-staging` | `cleared-prod` |
| Purpose | Try every change first | The URL printed on your QR labels |

Plus a local development setup that uses a local copy of D1 and no Cloudflare quota.

> **Choose your names once.** QR labels encode the production URL. If you later change the `workers.dev` subdomain or the Worker name, every label has to be reprinted.

---

## 2. Prerequisites

| You need | Notes |
|---|---|
| **Node.js 22 or later** and **npm** | `node -v`. Use the version in `.nvmrc` if you use nvm |
| **git** | — |
| **openssl** | To generate secrets (`openssl rand -base64 32`). Preinstalled on macOS and Linux; on Windows use Git Bash or WSL |
| **A Cloudflare account** | Free. **Don't add a payment method** |
| **A Brevo account** | Free (300 emails/day). Sends verification and password-reset emails |
| **An email address for sending** | Any inbox you control, verified in Brevo as the sender. A dedicated project mailbox is better than a personal one |

Optional: a phone and a printer to test QR labels.

**Everything above is free.** The limits of every service (requests per day, database reads and writes, emails per day) are listed in [`technologies.md` §3.2](./technologies.md#32-free-limits-for-every-technology). The ones you're most likely to notice:

| Service | Free limit | Resets |
|---|---|---|
| Cloudflare Workers | 100,000 requests/day per account; 10 ms CPU per request | 00:00 UTC |
| Cloudflare D1 | 5M rows read/day, 100k rows written/day, 500 MB per database | 00:00 UTC |
| Brevo | 300 emails/day (Cleared stops at 280) | Daily |

---

## 3. Create your Cloudflare account and `workers.dev` subdomain

1. Sign up at <https://dash.cloudflare.com/sign-up> and verify your email. Turn on two-factor authentication (**My Profile → Authentication**).
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

**No browser available** (SSH, a server)? Create an API token instead (§14) and run `export CLOUDFLARE_API_TOKEN=<token>` before running Wrangler.

---

## 6. Create the D1 databases

Create one database for staging and one for production. `--location=wnam` places the primary copy in western North America. Choose the hint nearest your users: `wnam`, `enam`, `weur`, `eeur`, `apac` or `oc`.

```bash
npx wrangler d1 create cleared-staging --location=wnam
npx wrangler d1 create cleared-prod    --location=wnam
```

Each command prints a block like this:

```jsonc
{
  "d1_databases": [
    { "binding": "DB", "database_name": "cleared-prod", "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
  ]
}
```

Copy each **`database_id`** into `cleared.config.json` (next section). If Wrangler asks whether to update your config automatically, answer **no**: the committed `wrangler.jsonc` must keep its placeholders.

Check they exist:

```bash
npx wrangler d1 list
```

> **Data location:** D1 has no Canadian jurisdiction. `--jurisdiction eu` (EU) and `--jurisdiction us` exist if your institution requires them; a jurisdiction overrides the location hint. Mention data location in your privacy notice.

---

## 7. Add your deployment values (`cleared.config.json`)

The repository stays **generic**: the committed `wrangler.jsonc` keeps placeholders (`<your-subdomain>`, `<prod-database-id>`, `<staging-database-id>`) and `npm run check` fails if real values ever land in it. Your own values go in a **git-ignored** file instead:

```bash
cp cleared.config.example.json cleared.config.json
```

```json
{
  "workersSubdomain": "my-makerspace",
  "d1": {
    "production": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "staging": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
  }
}
```

| Field | Value |
|---|---|
| `workersSubdomain` | Your `workers.dev` subdomain from §3: just the label (`my-makerspace`), no `https://`, no dots |
| `d1.production` | The `cleared-prod` ID from §6 |
| `d1.staging` | The `cleared-staging` ID from §6 |

These aren't secrets, but they're yours, so they never go in the repository. Keep a copy in your password manager.

**How it's used:** every command that talks to your Cloudflare deployment first runs `scripts/render-wrangler.mjs`, which fills the placeholders and writes **`wrangler.deploy.jsonc`** (also git-ignored), then runs Wrangler with `--config wrangler.deploy.jsonc`. The npm scripts do this for you:

| Use | Instead of |
|---|---|
| `npm run deploy`, `npm run deploy:staging`, `npm run deploy:first`, `npm run deploy:first:staging` | `opennextjs-cloudflare deploy …` |
| `npm run db:migrate:remote`, `npm run db:migrate:staging` | `npx wrangler d1 migrations apply DB --remote …` |
| `npm run remote -- <wrangler arguments>` | `npx wrangler <arguments>` for anything that touches a **remote D1 database** (`d1 execute`, `d1 export`, `d1 time-travel`, `d1 migrations list`) |

Plain `npx wrangler` against the committed `wrangler.jsonc` sees placeholder database IDs, so remote D1 commands fail with it. Commands that only need your login and the Worker name (`wrangler tail`, `wrangler secret …`, `wrangler rollback`, `wrangler deployments list`) work either way. Local development and tests never need `cleared.config.json`.

Check the rendered config and your URLs:

```bash
npm run config:render                                # writes wrangler.deploy.jsonc, or says what's missing
node scripts/render-wrangler.mjs --url staging       # https://cleared-staging.<your-subdomain>.workers.dev
node scripts/render-wrangler.mjs --url production    # https://cleared.<your-subdomain>.workers.dev
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
ENABLE_DEV_OUTBOX=1        # local only: shows verification/reset links instead of emailing them
```

Then:

```bash
npm run db:migrate         # apply all migrations to the LOCAL D1 (in .wrangler/state)
npm run db:seed            # optional: clearly fake demo data ("Demo Makerspace")
npm run dev                # http://localhost:3000
```

- **The dev server only listens on this computer** (`127.0.0.1`), so the dev-only pages (spikes, and the email outbox from Phase 1) aren't reachable from the café or campus Wi-Fi. `http://localhost:3000` works as usual.
- **Emails in development aren't sent.** The verification or reset link is printed in the terminal and available at `http://localhost:3000/api/dev/outbox?email=<address>`.
- The first account you create and verify can complete **Setup** and becomes admin.
- **Test the real Workers runtime** before deploying: `npm run preview` builds with OpenNext and serves on `http://localhost:8787` (if that port is taken: `npm run preview -- --port 8799`). Set `PUBLIC_BASE_URL` and `BETTER_AUTH_URL` to the preview URL in `.dev.vars` while previewing.
- **Don't put secrets in `.env`, `.env.local` or similar.** OpenNext can embed `.env*` values into the deployed bundle. Use `.dev.vars` locally and Worker secrets in Cloudflare.

Run the checks:

```bash
npm run lint && npm run typecheck && npm test
npx playwright install chromium   # once: the browser used by the E2E tests
npm run test:e2e           # browser tests against a throwaway local database
```

---

## 9. Set up email (Brevo)

Cleared sends two kinds of email: **verify your address** (on sign-up) and **reset your password**.

1. Sign up at <https://www.brevo.com> (free plan, no card).
2. **Add and verify a sender:** **Senders, Domains & Dedicated IPs → Senders → Add a sender**. Use the address you want emails to come from, then click the link Brevo emails to it.
3. **Create an API key:** **SMTP & API → API Keys → Generate a new API key**. Copy it (it starts with `xkeysib-`). It's shown only once.
4. New accounts are sometimes reviewed before they can send. If test emails don't arrive, check the Brevo dashboard for an activation notice.

> **What recipients see:** Brevo can't authenticate free-mail senders (Gmail, Outlook), so it replaces the From address with one on its own domain (e.g. `name@123456.brevosend.com`). The display name stays "Cleared", and replies go to your real address because Cleared sets `replyTo`. Emails usually reach the inbox, but test a few providers before a pilot, and tell users to look for "Cleared" (and to check spam). If you own a domain, authenticating it in Brevo (**Senders, Domains & Dedicated IPs → Domains**) removes the rewrite. That's optional and not free.

> **Free limit:** 300 emails/day. Cleared stops at `EMAIL_DAILY_CAP` (280) and shows "Email is busy today, try again after the daily reset".

You'll store the key as a Worker secret in the next steps, never in a file in the repo.

---

## 10. First deploy to staging

### 10.1 Apply the database migrations

```bash
npm run db:migrate:staging
```

Wrangler lists the migrations it's about to apply and asks for confirmation. Check with:

```bash
npm run remote -- d1 migrations list DB --remote --env staging
```

### 10.2 Deploy with secrets

`wrangler.jsonc` lists the secrets the Worker requires (`BETTER_AUTH_SECRET`, `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`). For the **first** deploy, upload them together with the code:

```bash
npm run deploy:first:staging
# Brevo API key (input hidden): ****
# Sender address verified in Brevo: you@example.org
```

`scripts/deploy.sh staging --first`:
1. renders `wrangler.deploy.jsonc` from your `cleared.config.json` (§7);
2. **refuses to continue if staging already has its secrets** (a second "first deploy" would replace `BETTER_AUTH_SECRET` and sign everyone out);
3. asks for the Brevo key with a hidden prompt, so it never lands in your shell history (it uses `BREVO_API_KEY` / `EMAIL_FROM_ADDRESS` instead if they're already set in your environment);
4. generates a fresh `BETTER_AUTH_SECRET` (`openssl rand -base64 32`);
5. builds (without the secrets in the build's environment), then scans the build for secret values (`scripts/check-bundle.mjs`);
6. writes the three secrets to a private temporary file (mode 600, deleted on exit, even on failure or Ctrl-C) and runs `opennextjs-cloudflare deploy --config wrangler.deploy.jsonc --env staging --secrets-file <tmp>`;
7. runs the smoke test (§10.3).

The environment comes only from the script name: `npm run deploy:first:staging` or `npm run deploy:first` (production). Extra arguments such as `-- --env staging` are rejected rather than guessed.

> **Use a different `BETTER_AUTH_SECRET` for staging and production,** and keep each one stable. Changing it later signs everyone out. To change one secret on purpose: `npm run remote -- secret put BREVO_API_KEY [--env staging]` (it prompts for the value).

### 10.3 Check it

The deploy script already ran `scripts/smoke-test.sh staging`: `/api/health` must report `ok`, `environment: "staging"` and the version this checkout builds (the commit SHA, plus `-dirty-<hash>` if you deployed uncommitted changes), `/help` must render and `/` must redirect (307) to `/machines`. By hand:

```bash
bash scripts/smoke-test.sh staging
curl https://cleared-staging.<your-subdomain>.workers.dev/api/health
# {"status":"ok","version":"<git sha>","environment":"staging"}

npm run remote -- secret list --env staging   # shows the three secret names (not values)
npx wrangler tail cleared-staging             # live logs; open the site in a browser to see requests
```

Open the staging URL on your phone, sign up, verify from the email, and sign in.

---

## 11. First deploy to production

The same steps for production:

```bash
npm run db:migrate:remote
npm run deploy:first          # prompts for the Brevo key and sender, then deploys and smoke-tests
```

---

## 12. First-run setup in the app

1. Open `https://cleared.<your-subdomain>.workers.dev` and **sign up** with the account that should be the admin. Verify the email.
2. You're sent to **Setup**: enter the makerspace name and time zone. You're now the **admin**, and setup is closed for everyone else.
3. In the staff console: add **rooms**, **certifications** and **machines**, then print the **label sheet** (**Console → Labels**).
4. Copy the **join link** (**Console → Settings**) and share it. People who open it, sign up and join become members.
5. Promote supervisors and technicians to **staff** under **Console → Members**.

If the wrong person completes setup on a fresh deployment, fix it with the admin script (§16) or recreate the database.

---

## 13. Everyday deploys

After code changes:

```bash
npm run check                                     # must pass before any deploy (§14)
# if the change added a migration (new file in drizzle/):
npm run db:migrate:staging
npm run deploy:staging                            # build, deploy to staging, smoke test
# try it on staging (npm run test:e2e locally too), then:
npm run db:migrate:remote
npm run deploy                                    # build, deploy to production, smoke test
```

Rules:

- **Apply migrations before deploying the code that needs them.** Migrations must be **additive** (new tables, new nullable or defaulted columns, new indexes), so the old code keeps working against the new schema.
- **Secrets persist across deploys.** You only set them again to change them: `npm run remote -- secret put BREVO_API_KEY [--env staging]`.
- **Roll back** a bad code deploy: `npx wrangler rollback [--env staging]` (Workers keeps 30 days of versions). Never roll back a migration; write a new one.

### Making a schema change

```bash
# 1. edit src/db/schema.ts
npm run db:generate          # drizzle-kit writes a new SQL file in drizzle/
# 2. read the generated SQL; add anything drizzle-kit can't (e.g. triggers)
npm run db:migrate           # apply locally and test
```

Then the staging/production steps above.

---

## 14. Checks before every deploy

There's no CI server: deploys happen from your machine, so run the checks there first.

```bash
npm run check          # what must pass before any deploy
npm run test:e2e       # browser tests on a throwaway local database (recommended before production)
```

`npm run check` runs, in order:

| Step | Fails when |
|---|---|
| Repo guards (`scripts/check-bundle.mjs --repo`) | A `.env*` or `.dev.vars` file is tracked by git; `ENABLE_DEV_OUTBOX` appears in `wrangler.jsonc`; `wrangler.jsonc` or `cleared.config.example.json` holds real values instead of placeholders; `cleared.config.json` or `wrangler.deploy.jsonc` is tracked |
| `npm run lint`, `npm run typecheck` | ESLint warnings or errors; TypeScript errors |
| Binding types (`scripts/cf-typegen.mjs --check`) | `cloudflare-env.d.ts` is stale: run `npm run cf-typegen` |
| `npm test` | A unit or service test fails |
| `npm run build:worker` | The Next.js or OpenNext build fails |
| Bundle scan (`scripts/check-bundle.mjs`) | Something that looks like a secret (Brevo key, auth secret, private key, token) is in the files sent to browsers |

Each deploy script then runs the **smoke test** by itself: `/api/health` on the environment you just deployed must answer `ok` with your current commit SHA (`scripts/smoke-test.sh`). If it fails, roll back (`npx wrangler rollback [--env staging]`) and look at `npx wrangler tail`.

> **Deploying from a machine with no browser** (SSH, a server)? Create an API token instead of `wrangler login`: dashboard → **My Profile → API Tokens → Create Token → Create Custom Token** with **Account · Workers Scripts · Edit** and **Account · D1 · Edit**, limited to your account. Then `export CLOUDFLARE_API_TOKEN=<token>` and `export CLOUDFLARE_ACCOUNT_ID=<id>`. Never save the token in the repository.

---

## 15. Operating it: logs, usage, backups

| Task | How |
|---|---|
| **Live logs** | `npx wrangler tail cleared` (or `cleared-staging`) |
| **Stored logs** | Dashboard → Workers & Pages → `cleared` → **Logs** (3 days on the free plan) |
| **Request and CPU usage** | Dashboard → `cleared` → **Metrics**. Watch daily requests (free limit 100,000) and errors such as **1102** (CPU limit) |
| **Database usage** | Dashboard → **Storage & Databases → D1** → `cleared-prod` → **Metrics** (rows read: 5M/day; rows written: 100k/day) |
| **Query the database** | `npm run remote -- d1 execute cleared-prod --remote --command "SELECT COUNT(*) FROM members"`. Remote queries count toward your daily quota; keep them small |
| **Backup** | `mkdir -p ~/cleared-backups && npm run remote -- d1 export cleared-prod --remote --output="$HOME/cleared-backups/cleared-$(date +%F).sql"`. **Always outside the repository**: a dump contains personal data, and the repository is public. `npm run check` fails if a `.sql` file outside `drizzle/` could be committed |
| **Restore to a point in time** (last 7 days) | `npm run remote -- d1 time-travel info cleared-prod` then `npm run remote -- d1 time-travel restore cleared-prod --timestamp=<ISO time>`. Rehearse on staging first: `npm run remote -- d1 time-travel info cleared-staging --env staging` |
| **Change a secret** | `npx wrangler secret put <NAME> [--env staging]` |

Daily free limits reset at **00:00 UTC**. If you hit one, the app shows a "back after the daily reset" message until then. Nothing is billed.

---

## 16. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `wrangler` commands act on the wrong account | Several accounts on your login | `export CLOUDFLARE_ACCOUNT_ID=…` (§5) |
| Deploy fails: missing required secret | First deploy without secrets | Use `npm run deploy:first[:staging]` (§10.2) or `npm run remote -- secret put <NAME> [--env staging]` |
| `deploy: … already has its secrets` | `deploy:first` on an environment that's already set up | Use `npm run deploy[:staging]`; secrets persist across deploys |
| `deploy: unexpected argument` | e.g. `npm run deploy -- --env staging` | The environment comes from the script name: `npm run deploy:staging` |
| Smoke test fails on `version` right after a deploy | The deploy didn't happen, or the tree changed during it | Check the deploy output; rerun `bash scripts/smoke-test.sh staging` |
| `no such table` errors after deploy | Migrations not applied to that database | `npm run db:migrate:staging` / `npm run db:migrate:remote` |
| `render-wrangler: missing deployment values` | No `cleared.config.json` | §7 |
| A remote `d1` command fails with an invalid database ID | Plain `npx wrangler` reads the committed placeholders | Use `npm run remote -- d1 …` (§7) |
| Sign-in works locally but not when deployed; cookies missing | `BETTER_AUTH_URL` doesn't exactly match the deployed URL | Check `workersSubdomain` in `cleared.config.json` and `node scripts/render-wrangler.mjs --url production`, then redeploy |
| Verification emails don't arrive | Brevo sender not verified, account not yet approved, wrong API key, or spam folder | Check the Brevo dashboard (**Transactional → Logs**); `npx wrangler secret list` |
| "Email is busy today" | Daily email cap reached | Wait for 00:00 UTC; for urgent cases use the admin set-password script below |
| **Error 1102** in logs | A request used more CPU than the free plan allows | See which route in **Logs**; `technologies.md` §5.2 and §6.4 |
| **Error 1027** | 100,000 daily Worker requests used up | Wait for 00:00 UTC; close idle board/console tabs; check for runaway polling |
| QR labels point to the wrong address | Printed from staging, or `PUBLIC_BASE_URL` wrong | Labels always use `PUBLIC_BASE_URL`; staging labels print a red "STAGING" banner. Fix the URL, reprint from production |
| Local dev can't find the database | Local migrations not applied | `npm run db:migrate` |
| A user forgot their password and email isn't working | — | `npx tsx scripts/set-password.ts <email> <temporary-password> [--env staging]` hashes locally and updates D1 |
| The only admin lost access | — | `npx tsx scripts/make-admin.ts <email> [--env staging]` |

---

## 17. Command reference

| Command | What it does |
|---|---|
| `npm ci` | Install exact dependencies |
| `npm run dev` | Next.js dev server with local D1 (`localhost:3000`) |
| `npm run preview` | OpenNext build served in the Workers runtime (`localhost:8787`) |
| `npm run check` | Everything that must pass before a deploy: repo guards, lint, types, binding types, tests, Worker build, bundle scan (§14) |
| `npm run lint` / `npm run typecheck` / `npm test` | Checks and service tests individually |
| `npm run test:e2e` | Browser tests on a throwaway local database |
| `npm run db:generate` | New migration from `src/db/schema.ts` changes |
| `npm run db:migrate` | Apply migrations to the local D1 |
| `npm run db:seed` | Load fake demo data locally |
| `npm run cf-typegen` | Regenerate binding types after editing `wrangler.jsonc` |
| `npm run config:render` | Write `wrangler.deploy.jsonc` from `wrangler.jsonc` + `cleared.config.json` |
| `npm run remote -- <args>` | Run Wrangler against your deployment config (needed for remote D1 commands) |
| `npm run deploy:first:staging` / `npm run deploy:first` | First deploy of staging / production: prompts for the Brevo key, generates `BETTER_AUTH_SECRET`, uploads secrets with the code, smoke-tests (refuses if the secrets already exist) |
| `npm run deploy:staging` / `npm run deploy` | Build, deploy to staging / production, then smoke test `/api/health` |
| `npx wrangler login` / `whoami` | Connect to / check your Cloudflare account |
| `npx wrangler d1 create <name> --location=wnam` | Create a D1 database |
| `npx wrangler d1 list` | List databases |
| `npm run db:migrate:staging` / `npm run db:migrate:remote` | Apply migrations to the staging / production database |
| `npm run remote -- d1 migrations list DB --remote [--env staging]` | Show applied and pending migrations |
| `npm run remote -- d1 execute <db> --remote --command "<SQL>"` | Run a query (uses quota) |
| `npm run remote -- d1 export <db> --remote --output=<file outside the repo>` | Backup (contains personal data) |
| `npm run remote -- d1 time-travel restore <db> --timestamp=<ISO>` | Point-in-time restore |
| `npx wrangler secret put <NAME> [--env staging]` | Set or change a secret |
| `npx wrangler secret list [--env staging]` | List secret names |
| `npx wrangler tail <worker>` | Live logs |
| `npx wrangler rollback [--env staging]` | Roll back to the previous code version |
| `npx wrangler deployments list [--env staging]` | Recent deployments |
