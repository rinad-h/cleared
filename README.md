# Cleared

Cleared puts machine-access answers where they're needed in an education makerspace. Students scan a QR label on a machine and see an accurate **pass** (cleared, cleared with supervision, or not cleared, with what's missing), check which machines are free before walking over, and record a session in seconds. Staff sign off training, track certification expiry, work through fault reports, keep a service log and run recurring checkups. Cleared is a decision-support and record-keeping tool: it checks certification records; it doesn't lock machines or replace a supervisor.

It's one Next.js 16 app deployed to **Cloudflare Workers Free** with **D1** and **Better Auth** (email + password), designed to run for **$0**: no paid plans, no domain, no credit card.

> **Status:** early development. The Phase 0 code foundation is in place; its deploy and platform checks (first deploys, CPU spikes) are still to do. Features arrive phase by phase (see [`docs/phases/`](docs/phases/README.md)).

## Quick start (local)

Requires Node.js 22+ and npm.

```bash
npm ci
cp .dev.vars.example .dev.vars      # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:migrate                  # apply migrations to the local D1 (no Cloudflare account needed)
npm run dev                         # http://localhost:3000
```

Checks:

```bash
npm run check                       # repo guards, lint, types, tests, Worker build, bundle scan
npx playwright install chromium     # once
npm run test:e2e                    # Playwright on a throwaway local database
```

## Deploy your own copy

Everything runs on free plans with no credit card. The full walkthrough, with every dashboard click and a troubleshooting table, is **[`docs/setup-and-deploy.md`](docs/setup-and-deploy.md)**. The short version:

**Where things live.** The repository is generic and never holds your values:

| What | Where |
|---|---|
| Your `workers.dev` subdomain and D1 database IDs (not secret, but yours) | `cleared.config.json`, git-ignored (copy of `cleared.config.example.json`) |
| Secrets: `BETTER_AUTH_SECRET`, `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS` | Cloudflare Worker secrets (deployed), `.dev.vars` (local, git-ignored) |
| Cloudflare login | `npx wrangler login` (stored by Wrangler outside the repo) |

`wrangler.jsonc` keeps `<placeholders>`; deploy scripts render your values into a git-ignored `wrangler.deploy.jsonc`. Don't create `.env` files: OpenNext can embed them into the deployed bundle.

**Steps** (section numbers refer to the guide):

1. **Accounts** (§2–3, §9): a free Cloudflare account (choose your `workers.dev` subdomain once; QR labels encode it) and a free Brevo account with a verified sender and an API key.
2. **Connect and create databases** (§5–6):
   ```bash
   npx wrangler login
   npx wrangler d1 create cleared-staging --location=wnam
   npx wrangler d1 create cleared-prod    --location=wnam
   ```
3. **Your deployment values** (§7):
   ```bash
   cp cleared.config.example.json cleared.config.json   # fill in subdomain + both database IDs
   npm run config:render                                # checks them and writes wrangler.deploy.jsonc
   ```
4. **First deploy to staging, then production** (§10–11). `deploy:first` asks for the Brevo key (hidden, so it stays out of your shell history), generates `BETTER_AUTH_SECRET`, uploads the secrets with the code and smoke-tests the result. It refuses to run twice for the same environment:
   ```bash
   npm run db:migrate:staging
   npm run deploy:first:staging

   npm run db:migrate:remote
   npm run deploy:first
   ```
5. **In the app** (§12): sign up with the admin account, verify the email, and complete **Setup**.

**Everyday deploys** (§13–14). There's no CI server: you deploy from your machine, after the checks pass. The environment comes from the script name (extra arguments are rejected), and each deploy re-scans its build for secrets and ends with a smoke test that `/api/health` reports the version you just built.

```bash
npm run check                                           # must pass first
npm run db:migrate:staging && npm run deploy:staging    # try it on staging
npm run db:migrate:remote  && npm run deploy            # then production
```

For ad-hoc commands against your remote databases, use `npm run remote -- <wrangler args>` (for example `npm run remote -- d1 migrations list DB --remote`). Operating a deployment (logs, rollback, backups, restore) is in [`docs/runbook.md`](docs/runbook.md). **Database backups contain personal data: always write them outside this folder** (the repository is public).

## Documentation

| Document | What it covers |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Product requirements: what to build and why |
| [`docs/technologies.md`](docs/technologies.md) | Stack, free-tier limits, platform rules and quirks |
| [`docs/phases/`](docs/phases/README.md) | Build order, one document per phase |
| [`docs/setup-and-deploy.md`](docs/setup-and-deploy.md) | Running locally and deploying |
| [`docs/runbook.md`](docs/runbook.md) | Operating a deployment: deploys, rollback, restore |
| [`drizzle/README.md`](drizzle/README.md) | Migration workflow and review checklist |
| [`AGENTS.md`](AGENTS.md) | Project rules for contributors and coding agents |

## Licence

[MIT](LICENSE)
