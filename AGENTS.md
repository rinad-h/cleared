# Cleared — rules for coding agents

Cleared is a Next.js 16 app on Cloudflare Workers Free (OpenNext) + D1 + Better Auth. Read before changing code:

- [`docs/PRD.md`](docs/PRD.md): what to build (Section 7 backlog, Section 9 permissions, Section 11.3 acceptance tests).
- [`docs/technologies.md`](docs/technologies.md): stack, free-tier limits, D1 patterns. **Wins over the PRD on platform questions.**
- [`docs/phases/`](docs/phases/README.md): build order. Work on one phase at a time; never build anything in PRD Section 5.3.

## Hard rules

1. **$0 only.** No paid plans, services or libraries; no websockets, cron, queues, Durable Objects or background jobs. Polling (ETag) and lazy evaluation only.
2. **Services hold every permission check.** `src/server/services/*` take `(db, actor, input, now)` and call `requireMember` / `requireRole` themselves. Pages hiding a button (`can()`) is never the security. Services import nothing from Next.js.
3. **`import "server-only"`** in every module that touches the database, auth or secrets (`src/db/*`, `src/server/*`, `src/data/*`, `src/lib/auth.ts`, `src/lib/env.ts`). Exceptions, on purpose: `src/server/domain/*` is pure (no I/O; `errors.ts` is also imported by the client error boundary) and `src/db/schema.ts` is loaded by drizzle-kit in plain Node.
4. **Session reads go inside `<Suspense>`.** `cacheComponents` is on in dev only (OpenNext quirk), and dev enforces this, including for navigations between sibling pages. Signed-in pages wrap their content in `<Gate area=…>` (`src/components/gate.tsx`), which has its own `<Suspense>`; layouts don't re-render on client navigation, so they never gate.
5. **Zod on every input:** server actions use `parse(Schema, formData)`; route handlers validate query params. Form fields that can repeat (checkboxes, multi-selects) use `formArray()` from `src/lib/validation.ts`.
6. **Vars and secrets via `getEnv()`** (`src/lib/env.ts`), never `getCloudflareContext().env.X` for them: only `getEnv()` applies the E2E overrides. Bindings (`DB`, `RL_ACTIONS`) come from `getCloudflareContext().env`.
7. **Errors:** services throw `ServiceError(code, message, fieldErrors?)` from `src/server/domain/errors.ts`; every server action is created with `action()` from `src/lib/server-action.ts` (it runs `getActor()` → `parse()` → the service inside `run()`; a test fails on any other export in `src/actions/`); route handlers use `toHttp()`. Never return raw error messages or stacks.
8. **Every mutation is one atomic batch** using the write-token / guarded-insert patterns (`technologies.md` §12) and bumps `settings.data_version` (`bumpVersion()` from `src/server/version.ts`). Use `db.batch()` for query builders only; batches with raw ``sql`…` `` statements go through `batch(db, [...])` from `src/server/batch.ts` (drizzle 0.45 bug).
9. **Additive migrations only** once the deployment has real data: follow the checklist in [`drizzle/README.md`](drizzle/README.md).
10. **Fully qualified names in correlated `sql` subqueries** (`"machine_requirements"."machine_id" = "machines"."id"`); Drizzle drops table names in single-table queries.
11. **`prefetch={false}`** on member-app links and long lists. Each prefetch is a billable Worker request.
12. **Labels and join URLs are built from `PUBLIC_BASE_URL` only**, never from the request host.
13. **Never log** emails, names, passwords, tokens, cookies, URLs or free text. Use `log(level, event, fields, err?)` from `src/server/log.ts` with ids, counts and codes; pass unexpected errors as `err` (never `err.message`).
14. **No auth bypass, ever.** Tests call services with an `actor`; E2E signs up real accounts. No header, env var or hard-coded id makes anyone a user (`npm run check` still refuses `ENABLE_SPIKES` in `wrangler.jsonc`).
15. **Secrets live in `.dev.vars` and Worker secrets**, never in `.env*` (OpenNext can embed `.env*` into the bundle).
16. **The repository stays generic.** `wrangler.jsonc` keeps its `<placeholders>`; deployment values (subdomain, D1 IDs) live in git-ignored `cleared.config.json` and are rendered into `wrangler.deploy.jsonc`. Never commit personal names, emails, URLs, accounts or IDs. Remote D1 commands go through `npm run remote -- …`.
17. **Status is colour + icon + word**: always `<StatusBadge>`, using the status tokens in `globals.css`.
18. **Times** are stored as UTC milliseconds; services take `now` as a parameter.

## Commands

```bash
npm run dev            # next dev with local D1
npm run check          # everything that must pass before a deploy (no CI server exists)
npm run test:e2e       # Playwright on a throwaway D1 (fails on browser console errors)
npm run deploy         # the one deployment (no staging); extra args are rejected
npm run db:generate    # after editing src/db/schema.ts, then review the SQL
npm run db:migrate     # apply migrations locally
npm run preview        # OpenNext build in real workerd (catches runtime issues)
```

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
