# Cleared — Runbook

> **Stub (Phase 0).** Completed in Phase 7 with monitoring, backups during a pilot, the admin scripts and incident steps. Commands for a first-time setup are in [`setup-and-deploy.md`](./setup-and-deploy.md).

Replace `<your-subdomain>` with your own `workers.dev` subdomain. Commands that touch a remote D1 database run through `npm run remote -- …`, which uses your git-ignored `cleared.config.json` (`setup-and-deploy.md` §7). There is one deployment (Worker and D1 database both named `cleared`) and no staging copy; deploy scripts reject extra arguments.

## Deploy

Deploys run from your machine (there's no CI server and no staging copy). Test locally, apply migrations first, then deploy; the deploy script ends with a smoke test that `/api/health` returns the new commit SHA.

```bash
npm run check                 # repo guards, lint, types, tests, build, bundle scan
npm run test:e2e              # browser tests on a throwaway local database
npm run preview               # optional: try it in the real Workers runtime (localhost:8787)

npm run db:migrate:remote
npm run deploy                # rescans the build for secrets, ends with: bash scripts/smoke-test.sh
```

## Roll back code

Workers keeps 30 days of versions.

```bash
npx wrangler deployments list           # find the last good version
npx wrangler rollback                   # previous version (or: npx wrangler rollback <version-id>)
```

Never roll back a migration. Migrations are additive, so older code keeps working against the newer schema; fix forward with a new migration. If a migration or bad code damaged data, restore it (next section).

## Restore data (D1 Time Travel, last 7 days)

This is the undo for a bad migration or data change. A restore replaces the whole database, so take an export first (next section). Rehearse it once before a pilot, while the database only holds demo data.

```bash
npm run remote -- d1 time-travel info cleared
npm run remote -- d1 time-travel restore cleared --timestamp=<ISO-8601 time before the incident>
```

## Back up (during a pilot, weekly)

A dump contains personal data. Write it **outside the repository** (which is public) and store it privately:

```bash
mkdir -p ~/cleared-backups
npm run remote -- d1 export cleared --remote --output="$HOME/cleared-backups/cleared-$(date +%F).sql"
```

## Check health and limits

| What | How |
|---|---|
| Is it up? | `curl https://cleared.<your-subdomain>.workers.dev/api/health` |
| Live logs | `npx wrangler tail cleared` |
| Requests, CPU, errors (1102 = CPU limit, 1027 = daily requests) | Dashboard → Workers & Pages → `cleared` → Metrics |
| D1 rows read / written | Dashboard → Storage & Databases → D1 → `cleared` → Metrics |

Daily free limits reset at 00:00 UTC (5 pm MST, 6 pm MDT). Nothing is billed.
