# Cleared — Runbook

> **Stub (Phase 0).** Completed in Phase 7 with monitoring, backups during a pilot, the admin scripts and incident steps. Commands for a first-time setup are in [`setup-and-deploy.md`](./setup-and-deploy.md).

Replace `<your-subdomain>` with your own `workers.dev` subdomain. Commands that touch a remote D1 database run through `npm run remote -- …`, which uses your git-ignored `cleared.config.json` (`setup-and-deploy.md` §7). For **staging**, add `--env staging` to `npm run remote` commands and use the database name `cleared-staging`. Deploys are different: pick the environment with the script name (`npm run deploy:staging` / `npm run deploy`); extra arguments are rejected.

## Deploy

Deploys run from your machine (there's no CI server). Run the checks, apply migrations first, then deploy; each deploy script ends with a smoke test that `/api/health` returns the new commit SHA.

```bash
npm run check                 # repo guards, lint, types, tests, build, bundle scan
npm run db:migrate:staging
npm run deploy:staging        # rescans the build for secrets, ends with: bash scripts/smoke-test.sh staging

npm run db:migrate:remote
npm run deploy                # ends with: bash scripts/smoke-test.sh production
```

## Roll back code

Workers keeps 30 days of versions.

```bash
npx wrangler deployments list           # find the last good version
npx wrangler rollback                   # previous version (or: npx wrangler rollback <version-id>)
```

Never roll back a migration. Migrations are additive, so older code keeps working against the newer schema; fix forward with a new migration.

## Restore data (D1 Time Travel, last 7 days)

Rehearse on staging first. A restore replaces the whole database.

```bash
# rehearsal on staging
npm run remote -- d1 time-travel info cleared-staging --env staging
npm run remote -- d1 time-travel restore cleared-staging --env staging --timestamp=<ISO-8601 time>

# production
npm run remote -- d1 time-travel info cleared-prod
npm run remote -- d1 time-travel restore cleared-prod --timestamp=<ISO-8601 time before the incident>
```

## Back up (during a pilot, weekly)

A dump contains personal data. Write it **outside the repository** (which is public) and store it privately:

```bash
mkdir -p ~/cleared-backups
npm run remote -- d1 export cleared-prod --remote --output="$HOME/cleared-backups/cleared-$(date +%F).sql"
```

## Check health and limits

| What | How |
|---|---|
| Is it up? | `curl https://cleared.<your-subdomain>.workers.dev/api/health` |
| Live logs | `npx wrangler tail cleared` |
| Requests, CPU, errors (1102 = CPU limit, 1027 = daily requests) | Dashboard → Workers & Pages → `cleared` → Metrics |
| D1 rows read / written | Dashboard → Storage & Databases → D1 → `cleared-prod` → Metrics |

Daily free limits reset at 00:00 UTC (5 pm MST, 6 pm MDT). Nothing is billed.
