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
7. [Configure `wrangler.jsonc`](#7-configure-wranglerjsonc)
8. [Run it locally](#8-run-it-locally)
9. [Set up email (Brevo)](#9-set-up-email-brevo)
10. [First deploy to staging](#10-first-deploy-to-staging)
11. [First deploy to production](#11-first-deploy-to-production)
12. [First-run setup in the app](#12-first-run-setup-in-the-app)
13. [Everyday deploys](#13-everyday-deploys)
14. [Automatic deploys with GitHub Actions (optional)](#14-automatic-deploys-with-github-actions-optional)
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
| **A GitHub account** | Only for automatic deploys (§14) |

Optional: a phone and a printer to test QR labels.

**Everything above is free.** The limits of every service (requests per day, database reads and writes, emails per day, CI minutes) are listed in [`technologies.md` §3.2](./technologies.md#32-free-limits-for-every-technology). The ones you're most likely to notice:

| Service | Free limit | Resets |
|---|---|---|
| Cloudflare Workers | 100,000 requests/day per account; 10 ms CPU per request | 00:00 UTC |
| Cloudflare D1 | 5M rows read/day, 100k rows written/day, 500 MB per database | 00:00 UTC |
| Brevo | 300 emails/day (Cleared stops at 280) | Daily |
| GitHub Actions | Unlimited for public repos; 2,000 min/month for private | Monthly |

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
# Fork the repository on GitHub first if you want automatic deploys (§14), then:
git clone https://github.com/<your-github-user>/cleared.git
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

**No browser available** (SSH, CI)? Create an API token instead (§14, step 1) and run `export CLOUDFLARE_API_TOKEN=<token>` before running Wrangler.

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

Copy each **`database_id`** into `wrangler.jsonc` (next section). If Wrangler asks whether to update your config automatically, answer **no**: the staging ID belongs under `env.staging`, which the automatic edit doesn't handle.

Check they exist:

```bash
npx wrangler d1 list
```

> **Data location:** D1 has no Canadian jurisdiction. `--jurisdiction eu` (EU) and `--jurisdiction us` exist if your institution requires them; a jurisdiction overrides the location hint. Mention data location in your privacy notice.

---

## 7. Configure `wrangler.jsonc`

Open `wrangler.jsonc` and replace every placeholder. These are the only edits a new deployment needs:

| Placeholder | Replace with |
|---|---|
| `<your-subdomain>` (4 places: `PUBLIC_BASE_URL` and `BETTER_AUTH_URL`, in production and in `env.staging`) | Your `workers.dev` subdomain from §3 |
| `<prod-database-id>` | The `cleared-prod` ID from §6 |
| `<staging-database-id>` | The `cleared-staging` ID from §6 |
| `compatibility_date` | Leave as committed. Only change it deliberately, and test after |

The relevant parts:

```jsonc
{
  "name": "cleared",
  "main": ".open-next/worker.js",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "workers_dev": true,
  "vars": {
    "ENVIRONMENT": "production",
    "PUBLIC_BASE_URL": "https://cleared.<your-subdomain>.workers.dev",
    "BETTER_AUTH_URL": "https://cleared.<your-subdomain>.workers.dev",
    "REQUIRE_EMAIL_VERIFICATION": "true",
    "EMAIL_FROM_NAME": "Cleared",
    "EMAIL_DAILY_CAP": "280"
  },
  "services": [{ "binding": "WORKER_SELF_REFERENCE", "service": "cleared" }],
  "d1_databases": [
    { "binding": "DB", "database_name": "cleared-prod", "database_id": "<prod-database-id>", "migrations_dir": "drizzle" }
  ],
  "env": {
    "staging": {
      "name": "cleared-staging",
      "vars": {
        "ENVIRONMENT": "staging",
        "PUBLIC_BASE_URL": "https://cleared-staging.<your-subdomain>.workers.dev",
        "BETTER_AUTH_URL": "https://cleared-staging.<your-subdomain>.workers.dev"
        // … other vars as committed
      },
      "services": [{ "binding": "WORKER_SELF_REFERENCE", "service": "cleared-staging" }],
      "d1_databases": [
        { "binding": "DB", "database_name": "cleared-staging", "database_id": "<staging-database-id>", "migrations_dir": "drizzle" }
      ]
    }
  }
}
```

**Renaming the Worker** (for example `makerspace-pass` instead of `cleared`)? Change `name`, the `WORKER_SELF_REFERENCE` `service`, and both URLs to match. The URL is always `https://<name>.<your-subdomain>.workers.dev`.

After editing, regenerate the binding types:

```bash
npm run cf-typegen
```

> `wrangler.jsonc` has no secrets in it, so committing your IDs and URLs is fine.

---

## 8. Run it locally

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` (git-ignored, never committed):

```bash
BETTER_AUTH_SECRET=<output of: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
ENABLE_DEV_OUTBOX=1        # local only: shows verification/reset links instead of emailing them
```

Then:

```bash
npm run db:migrate         # apply all migrations to the LOCAL D1 (in .wrangler/state)
npm run db:seed            # optional: clearly fake demo data ("Demo Makerspace")
npm run dev                # http://localhost:3000
```

- **Emails in development aren't sent.** The verification or reset link is printed in the terminal and available at `http://localhost:3000/api/dev/outbox?email=<address>`.
- The first account you create and verify can complete **Setup** and becomes admin.
- **Test the real Workers runtime** before deploying: `npm run preview` builds with OpenNext and serves on `http://localhost:8787`. Set `BETTER_AUTH_URL=http://localhost:8787` in `.dev.vars` while previewing.
- **Don't put secrets in `.env`, `.env.local` or similar.** OpenNext can embed `.env*` values into the deployed bundle. Use `.dev.vars` locally and Worker secrets in Cloudflare.

Run the checks:

```bash
npm run lint && npm run typecheck && npm test
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
npx wrangler d1 migrations apply DB --remote --env staging
```

Wrangler lists the migrations it's about to apply and asks for confirmation. Check with:

```bash
npx wrangler d1 migrations list DB --remote --env staging
```

### 10.2 Deploy with secrets

`wrangler.jsonc` lists the secrets the Worker requires (`BETTER_AUTH_SECRET`, `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`). For the **first** deploy, upload them together with the code using a temporary secrets file. The `deploy:first` script does it for you:

```bash
BREVO_API_KEY=xkeysib-... EMAIL_FROM_ADDRESS=you@example.org npm run deploy:first -- --env staging
```

`scripts/deploy-first.sh`:
1. generates a fresh `BETTER_AUTH_SECRET` (`openssl rand -base64 32`),
2. writes the three secrets to a temporary file (deleted on exit),
3. runs `opennextjs-cloudflare build` then `opennextjs-cloudflare deploy --env staging --secrets-file <tmp>`.

Doing it by hand instead:

```bash
npm run build:worker                                   # opennextjs-cloudflare build
printf 'BETTER_AUTH_SECRET=%s\nBREVO_API_KEY=%s\nEMAIL_FROM_ADDRESS=%s\n' \
  "$(openssl rand -base64 32)" "xkeysib-..." "you@example.org" > /tmp/cleared-secrets.env
npx opennextjs-cloudflare deploy --env staging --secrets-file /tmp/cleared-secrets.env
rm /tmp/cleared-secrets.env
```

> **Use a different `BETTER_AUTH_SECRET` for staging and production,** and keep each one stable. Changing it later signs everyone out.

### 10.3 Check it

```bash
curl https://cleared-staging.<your-subdomain>.workers.dev/api/health
# {"status":"ok","version":"<git sha>","environment":"staging"}

npx wrangler secret list --env staging       # shows the three secret names (not values)
npx wrangler tail cleared-staging            # live logs; open the site in a browser to see requests
```

Open the staging URL on your phone, sign up, verify from the email, and sign in.

---

## 11. First deploy to production

The same steps, without `--env staging`:

```bash
npx wrangler d1 migrations apply DB --remote
BREVO_API_KEY=xkeysib-... EMAIL_FROM_ADDRESS=you@example.org npm run deploy:first
curl https://cleared.<your-subdomain>.workers.dev/api/health
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
npm run lint && npm run typecheck && npm test     # local checks
# if the change added a migration (new file in drizzle/):
npx wrangler d1 migrations apply DB --remote --env staging
npm run deploy:staging                            # opennextjs-cloudflare build && deploy --env staging
# try it on staging, then:
npx wrangler d1 migrations apply DB --remote
npm run deploy                                    # production
```

Rules:

- **Apply migrations before deploying the code that needs them.** Migrations must be **additive** (new tables, new nullable or defaulted columns, new indexes), so the old code keeps working against the new schema.
- **Secrets persist across deploys.** You only set them again to change them: `npx wrangler secret put BREVO_API_KEY [--env staging]`.
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

## 14. Automatic deploys with GitHub Actions (optional)

The repository includes `.github/workflows/ci.yml` (checks on every PR) and `.github/workflows/deploy.yml` (staging on every push to `main`, production after manual approval).

1. **Create a Cloudflare API token:** dashboard → **My Profile → API Tokens → Create Token → Create Custom Token**:
   - Permissions: **Account · Workers Scripts · Edit** and **Account · D1 · Edit**
   - Account resources: **Include · <your account>**
   - Create it and copy the token.
2. **Add GitHub secrets:** repository → **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN`: the token
   - `CLOUDFLARE_ACCOUNT_ID`: from `npx wrangler whoami`

   And on the **Variables** tab (used by the smoke test after each deploy):
   - `STAGING_URL`: `https://cleared-staging.<your-subdomain>.workers.dev`
   - `PRODUCTION_URL`: `https://cleared.<your-subdomain>.workers.dev`
3. **Protect production:** **Settings → Environments → New environment** `production` → **Required reviewers**: add yourself. The production job waits for your approval.
4. **Do the first deploys by hand** (§10–11) so the Worker secrets exist. The workflow deploys code and applies migrations; it doesn't create secrets.
5. Push to `main`. Watch **Actions**: the staging job applies migrations, deploys and calls `/api/health`. Approve the production job when ready.

What `deploy.yml` runs (for reference):

```bash
npm ci
npx wrangler d1 migrations apply DB --remote --env staging
npm run deploy:staging
curl -fsS "$STAGING_URL/api/health"
# production job (after approval):
npx wrangler d1 migrations apply DB --remote
npm run deploy
```

> Public repositories get unlimited GitHub Actions minutes; private ones get 2,000 minutes/month on the free plan, which is plenty.

**Alternative:** Cloudflare **Workers Builds** (dashboard → your Worker → **Settings → Builds → Connect** → pick the repo, deploy command `npm run deploy`). Free, 3,000 build minutes/month. It doesn't apply D1 migrations for you, so apply them by hand before pushing a change that needs them.

---

## 15. Operating it: logs, usage, backups

| Task | How |
|---|---|
| **Live logs** | `npx wrangler tail cleared` (or `cleared-staging`) |
| **Stored logs** | Dashboard → Workers & Pages → `cleared` → **Logs** (3 days on the free plan) |
| **Request and CPU usage** | Dashboard → `cleared` → **Metrics**. Watch daily requests (free limit 100,000) and errors such as **1102** (CPU limit) |
| **Database usage** | Dashboard → **Storage & Databases → D1** → `cleared-prod` → **Metrics** (rows read: 5M/day; rows written: 100k/day) |
| **Query the database** | `npx wrangler d1 execute cleared-prod --remote --command "SELECT COUNT(*) FROM members"`. Remote queries count toward your daily quota; keep them small |
| **Backup** | `npx wrangler d1 export cleared-prod --remote --output=backup-$(date +%F).sql`. Store it privately: it contains personal data |
| **Restore to a point in time** (last 7 days) | `npx wrangler d1 time-travel info cleared-prod` then `npx wrangler d1 time-travel restore cleared-prod --timestamp=<ISO time>`. Rehearse on staging first |
| **Change a secret** | `npx wrangler secret put <NAME> [--env staging]` |

Daily free limits reset at **00:00 UTC**. If you hit one, the app shows a "back after the daily reset" message until then. Nothing is billed.

---

## 16. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `wrangler` commands act on the wrong account | Several accounts on your login | `export CLOUDFLARE_ACCOUNT_ID=…` (§5) |
| Deploy fails: missing required secret | First deploy without secrets | Use `npm run deploy:first` (§10.2) or `npx wrangler secret put …` |
| `no such table` errors after deploy | Migrations not applied to that database | `npx wrangler d1 migrations apply DB --remote [--env staging]` |
| Sign-in works locally but not when deployed; cookies missing | `BETTER_AUTH_URL` doesn't exactly match the deployed URL | Fix both URLs in `wrangler.jsonc` (`https://`, no trailing slash) and redeploy |
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
| `npm run lint` / `npm run typecheck` / `npm test` | Checks and service tests |
| `npm run test:e2e` | Browser tests on a throwaway local database |
| `npm run db:generate` | New migration from `src/db/schema.ts` changes |
| `npm run db:migrate` | Apply migrations to the local D1 |
| `npm run db:seed` | Load fake demo data locally |
| `npm run cf-typegen` | Regenerate binding types after editing `wrangler.jsonc` |
| `npm run deploy:first [-- --env staging]` | First deploy, generating and uploading secrets |
| `npm run deploy:staging` / `npm run deploy` | Build and deploy to staging / production |
| `npx wrangler login` / `whoami` | Connect to / check your Cloudflare account |
| `npx wrangler d1 create <name> --location=wnam` | Create a D1 database |
| `npx wrangler d1 list` | List databases |
| `npx wrangler d1 migrations apply DB --remote [--env staging]` | Apply migrations to a remote database |
| `npx wrangler d1 migrations list DB --remote [--env staging]` | Show applied and pending migrations |
| `npx wrangler d1 execute <db> --remote --command "<SQL>"` | Run a query (uses quota) |
| `npx wrangler d1 export <db> --remote --output=<file>` | Backup |
| `npx wrangler d1 time-travel restore <db> --timestamp=<ISO>` | Point-in-time restore |
| `npx wrangler secret put <NAME> [--env staging]` | Set or change a secret |
| `npx wrangler secret list [--env staging]` | List secret names |
| `npx wrangler tail <worker>` | Live logs |
| `npx wrangler rollback [--env staging]` | Roll back to the previous code version |
| `npx wrangler deployments list [--env staging]` | Recent deployments |
