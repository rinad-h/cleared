# Cleared — Implementation Phases

> The recommended build order for the Cleared classroom MVP (PRD Sections 5–11, 14–15) as a **Next.js 16 app on Cloudflare Workers Free (OpenNext) + D1, with Better Auth email + password**: see [`../technologies.md`](../technologies.md) for the stack and [`../setup-and-deploy.md`](../setup-and-deploy.md) for accounts, configuration and deploy commands.
> Each phase has its own document with scope, schema, API, UI, tasks, tests and exit criteria.

| | |
|---|---|
| Source of truth for *what* | [`../PRD.md`](../PRD.md): Section 7 is the backlog, Section 9 the authorization spec, Section 10.3 the data model, Section 11.3 the acceptance tests |
| Source of truth for *how / with what* | [`../technologies.md`](../technologies.md): stack, free-tier limits, D1 concurrency patterns |
| Out of scope for every phase | Everything in **PRD Section 5.3** (deferred), plus websockets, background jobs, cron, paid services |

---

## 1. Phase map

| # | Phase | Delivers | PRD FRs | PRD tests | Est. effort* |
|---|---|---|---|---|---|
| 0 | [Foundation & platform](./phase-0-foundation.md) | Next.js + OpenNext scaffold, D1 (staging + prod), local check + deploy scripts, service-test and E2E harness, CPU spikes (password hashing, server rendering), health route on the final `workers.dev` URL | — | — | 2–3 days |
| 1 | [Identity, setup & access control](./phase-1-identity-and-access.md) | Better Auth (email + password, verification, password reset), `members`, `settings`, first-run setup, join link, roles, suspension, actor/permission layer, app shell | FR-01, FR-02, FR-03 | T10 (part) | 4–5 days |
| 2 | [Catalog & QR labels](./phase-2-catalog-and-labels.md) | Rooms, certifications, machines (basics + admin-only fields), retire, QR tokens, printable label sheet, `/m/:token` shell | FR-04, FR-05, FR-06 | T10 (part), T01 (partial) | 3–4 days |
| 3 | [Certifications & the machine pass](./phase-3-certifications-and-pass.md) | Pass engine, pass page, sign-off, revocation, expiry, Members pages, My certifications | FR-07, FR-08 (grant side), FR-09, FR-18 | T02, T03 | 4–5 days |
| 4 | [Sessions & member status board](./phase-4-sessions-and-status-board.md) | Start/extend/end sessions, lazy expiry, write-token concurrency, revocation/suspension ending sessions, status board with ETag polling | FR-08 (session side), FR-10, FR-11 | T04 (part), T05, T06 | 4–5 days |
| 5 | [Faults, out-of-service & service log](./phase-5-faults-and-service-log.md) | Fault reports, out-of-service details, fault queue, service log (append-only, corrections), machine detail. **Minimum demo complete** | FR-12, FR-13, FR-14, FR-15 | T07, T08, T01 (full) | 5–6 days |
| 6 | [Checkups, console home & abuse protection](./phase-6-checkups-console-and-abuse.md) | Recurring checkups, staff console home, rate limits, full authorization sweep, persistence test | FR-16, FR-17, FR-19 | T04 (rest), T09, T10 (full), T11 | 3–4 days |
| 7 | [Hardening, polish & launch](./phase-7-hardening-and-launch.md) | Accessibility, help page and terms (PRD 5.4), privacy notice, performance and quota audit, demo data, runbook, cold-start measurement, Definition of Done | NFRs (PRD 11), Section 15 | T12, re-run T01–T11 | 4–6 days |

\* One developer working with an AI coding agent, part-time. The total is about 6 weeks, matching the PRD's M0–M3 plan.

### Dependency graph

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6 ──► Phase 7
 platform    identity    catalog     pass &      sessions    faults &    checkups,   hardening
                         & labels    grants      & board     service     console     & launch
                                                              │
                                                    MINIMUM DEMO COMPLETE
                                                    (PRD 5.1 steps 1–10)
```

The phases are strictly sequential: each one depends on the schema and middleware of the one before. Inside a phase, the backend tasks (schema → domain logic → API → tests) come before the UI tasks.

---

## 2. Mapping to the PRD milestones (M0–M3)

The PRD (Section 14) builds a **thin vertical slice first** (M0 = a basic version of everything in the 10-step demo), then adds rules (M1) and maintenance depth (M2). These phases build **one domain at a time, completely**, in the order the demo needs them. The reason: on D1 the concurrency and pass rules shape the schema and the write helpers, so building them properly once avoids rewriting the M0 shortcuts in M1.

| PRD milestone | PRD exit criterion | Satisfied at the end of |
|---|---|---|
| **M0 — Minimum demo** | 10-step demo (5.1) works on the published app; T01 | **Phase 5** |
| **M1 — Rules and member app** | T02–T06 and T10 pass | Phase 4 (T02–T06), **Phase 6** (T10 full) |
| **M2 — Maintenance side** | T07–T09 and T11 pass | **Phase 6** |
| **M3 — Polish** (stretch) | T12 | **Phase 7** |

### Demo-first option (if a demo is due by week 2)

Every phase marks the tasks needed for the 10-step minimum demo with **★**. If a demo date comes before Phase 5 would finish, use this order instead:

1. Phase 0 (all of it).
2. Only the ★ tasks of Phases 1 → 5, in order. This is PRD **M0**.
3. Return to the unstarred tasks of Phases 1 → 5, then Phases 6 and 7.

The ★ tasks never take shortcuts that later tasks have to undo. For example, the session-start write helper is the full write-token version from day one, even when only one requirement exists.

### Demo checkpoints

Each phase ends with part of the PRD 5.1 demo working on **staging**:

| After phase | Demo steps working |
|---|---|
| 1 | (prerequisite) Sign in, first-run setup, join link |
| 2 | 1. Admin creates makerspace and machine · 2. Printable QR label · 3. Student scans and signs in |
| 3 | 4. NOT CLEARED with missing cert + training link · 5. Staff sign-off · 6. Scan again → CLEARED |
| 4 | 7. Start session with expected duration → board shows *In use · est. free* |
| 5 | 8. Fault takes machine out of service → board shows *Out of service* · 9. Technician logs service and returns it to service · 10. Board shows *Available*; history shows the repair |

---

## 3. Working rules (apply to every phase)

These turn PRD Section 14's "Build rule" and "Instruction to Replit Agent" into rules for this stack.

1. **One phase at a time.** Don't start phase *N+1* until phase *N*'s exit criteria are met: `npm run check` and `npm run test:e2e` green, manual checks done on **staging**, and the phase deployed to **production** (from Phase 2 on).
2. **The PRD wins on behaviour; `technologies.md` wins on platform.** If they conflict (for example Clerk vs Better Auth), follow `technologies.md` and note the deviation in the phase doc's *Decisions* section.
3. **Never build anything in PRD Section 5.3.** If a task seems to need it, stop and write it down as an open question.
4. **No websockets, background workers, cron triggers, queues or paid services.** Polling (30 s) and lazy evaluation only.
5. **Server decides, client displays.** Pass status, permissions, "active session", due dates: all computed on the server with server UTC time. Hiding a button is never security.
6. **Every mutation is one atomic `db.batch()`**, with the patterns in `technologies.md` §12 (machine write token, guarded inserts, `data_version` bump).
7. **Additive migrations only** once production has data (from the end of Phase 2).
8. **No auth bypass exists in the code.** Services take an `actor` argument, so tests don't need to fake sign-in; E2E signs up real accounts. The only dev-only route (the email outbox) is guarded and checked by `npm run check` (Phase 0).
9. **Seed data is clearly fake** ("Demo Makerspace", "Demo Student 1") and never presented as pilot results.
10. **Privacy:** member-facing responses never include who is using a machine, fault descriptions, or reporter names (PRD 7.1). Logs never include emails, codes, tokens or free text.

---

## 4. Shared conventions

Every phase uses these conventions. Phase 0 and Phase 1 build them; later phases reuse them.

### 4.1 Data

| Convention | Rule |
|---|---|
| Primary keys | `id TEXT PRIMARY KEY`, `crypto.randomUUID()` |
| Timestamps | `INTEGER` Unix **milliseconds UTC**, named `*_at`. Every table has `created_at`; mutable tables also have `updated_at` |
| Booleans | `INTEGER` 0/1 with `CHECK` |
| Enums | `TEXT` + `CHECK (col IN (...))`; values exported from `src/server/domain/enums.ts` |
| Tokens | 128-bit random, base64url (22 chars): `qr_token`, `member_join_token`, `write_token` |
| Foreign keys | Declared; `ON DELETE RESTRICT` (nothing is hard-deleted except Better Auth's expired sessions/verifications) |
| Soft states | Retire machines (`status='retired'`), deactivate certifications/checkups (`active=0`), suspend members. No deletes of business data |
| Change counter | `settings.data_version` incremented in every mutation batch |

### 4.2 Table ownership (which phase creates what)

| Table | Created in | Notes |
|---|---|---|
| `health` (none; `/api/health` reads `SELECT 1`) | 0 | — |
| Better Auth: `user`, `session`, `account`, `verification`, `rate_limit` | 1 | Generated from Better Auth's schema (`rate_limit` because its limiter uses database storage) |
| `settings`, `members`, `email_send_log` | 1 | `email_send_log` enforces the Brevo daily cap |
| `rooms`, `certifications`, `machines`, `machine_requirements` | 2 | `machines.write_token` from the start |
| `grants` | 3 | — |
| `machine_sessions` (the PRD's `sessions`) | 4 | Partial unique index. Renamed so it can't be confused with Better Auth's `session` table |
| `faults`, `service_records` | 5 | Append-only triggers on `service_records` |
| `checkups` | 6 | Phase 5 adds `service_records.checkup_id` as a plain nullable column; Phase 6 adds the table and validates it |
| `rate_limits` (fallback only) | 6 | Only if the rate-limit binding is unavailable on Free |

> `service_records.checkup_id` is created in Phase 5 **without** a foreign key, because the `checkups` table doesn't exist yet. Phase 6 enforces the link in application code: SQLite can't add a foreign key to an existing column. This is a deliberate trade-off to keep migrations additive.

### 4.3 Server operations (Next.js)

Cleared has no REST API of its own. Each phase lists its **operations** in a table with a *Kind* column:

| Kind | What it is | Where | Used for |
|---|---|---|---|
| **Page data** | An async function called by a Server Component | `src/data/*.ts` → `src/server/services/*` read functions | Everything a page shows on first render |
| **Server action** | A `"use server"` function called from a `<form action>` or a client handler | `src/actions/*.ts` | Every mutation |
| **Route handler** | `GET` only, returns JSON | `src/app/api/*/route.ts` | Polling (status board, console home) and the deploy health check |
| **Better Auth** | Better Auth's own endpoints | `src/app/api/auth/[...all]/route.ts` | Sign-up, sign-in, verification, reset, sign-out |

| Convention | Rule |
|---|---|
| Layering | Action/page/route → `getActor()` → `parse(Schema, input)` → **service** `(db, actor, input, now)` → result. Services contain **all** business and permission rules and import nothing from Next.js |
| Actor | `getActor()` returns `{ kind: "anonymous" }`, `{ kind: "user", userId, email }` (signed in, no membership) or `{ kind: "member", memberId, userId, role, status, displayName }`. Built once per request (`React.cache`) from the Better Auth session + `members` row |
| Not signed in | Pages: `proxy.ts` redirects to `/sign-in?next=…` (cookie check), and the page's `requireUser()` redirects if the session is invalid. Actions: `ServiceError("UNAUTHENTICATED")`. Route handlers: **401** |
| Membership | `requireMember(actor)` → `NOT_A_MEMBER` / `SUSPENDED` |
| Roles | `requireRole(actor, "staff" \| "admin")` at the top of every service that needs it; admin-only **fields** checked per field → `FORBIDDEN_FIELD` (the whole request is rejected) |
| Errors | Services throw `ServiceError(code, message, fieldErrors?)`. `run()` turns it into an `ActionResult` (`{ ok: false, error, code, fieldErrors }`). Route handlers map codes to HTTP statuses: `UNAUTHENTICATED` 401, `FORBIDDEN*`/`NOT_A_MEMBER`/`SUSPENDED` 403, `NOT_FOUND` 404, conflicts 409, `RATE_LIMITED` 429, `DAILY_LIMIT` 503 |
| Error codes | Shared list in `src/server/domain/errors.ts`: `VALIDATION_FAILED`, `NOT_FOUND`, `MACHINE_BUSY`, `MACHINE_RETIRED`, `MACHINE_OUT_OF_SERVICE`, `OPEN_OOS_FAULT`, `SETUP_ALREADY_DONE`, `LAST_ADMIN`, `CONFLICT_RETRY`, `RATE_LIMITED`, `DAILY_LIMIT`, … Phase docs name the code; the UI maps each one to a message |
| Validation | Zod schemas in `src/lib/validation.ts` (or `src/server/schemas/*`), used by actions **and** forms. Failures → `fieldErrors` |
| Unknown QR token | Not an error: the pass data returns `{ recognized: false }` and the page shows "label not recognized" |
| After a mutation | The action calls `refresh()` (or `revalidatePath`) so the page re-renders in the same response, or `redirect()` |
| Times | Stored as UTC ms; passed to client components as ISO strings; formatted in `settings.timezone` |
| Idempotency | Creates that could be double-tapped take a client-generated `clientRequestId` (UUID, created when the form/dialog opens) |
| Pagination | `limit` (default 50, max 200) + opaque `cursor` on long lists (sessions, service history, members) |
| Polling | Route handlers return an `ETag` and honour `If-None-Match` → **304** |
| CSRF | Server actions: Next.js origin check (built in). Route handlers: GET only |

### 4.4 Frontend

| Convention | Rule |
|---|---|
| Status display | Always **colour + icon + word** (PRD 8). One `<StatusBadge>` component, used everywhere |
| States | Every data view has loading (skeleton via `<Suspense>`), empty, error (`error.tsx` with retry) and "offline / daily limit" states |
| Server vs client | Server Components by default. Client components only for interactivity (forms, dialogs, live clock, polling). Session reads inside `<Suspense>` (`technologies.md` §5.3) |
| Prefetch | `<Link prefetch={false}>` in the member app and long lists (quota, `technologies.md` §5.3) |
| Times | Rendered in the makerspace time zone; estimates always labelled ("est. free 3:10 pm", "expected back") |
| Layout | Member app mobile-first, works at **320 px**; console works on phone and desktop |
| Accessibility | Labels on every control, visible focus ring, no colour-only meaning, `aria-live` for pass status and form errors |
| Navigation | Member: bottom tab bar (Machines · My certs · Help). Console: sidebar on desktop, drawer on phone. Staff/admin see a "Member app ⇄ Staff console" switch |

### 4.5 Testing

| Convention | Rule |
|---|---|
| Test files | `tests/services/T02-pass.spec.ts`, etc. One file per PRD test ID; extra cases in `tests/services/<area>.spec.ts`; unit tests in `tests/unit/`; E2E in `tests/e2e/` |
| Where they run | Vitest with `@cloudflare/vitest-plugin`: real `workerd` + a fresh local D1 with all migrations applied |
| Actors | `actors.admin()`, `actors.staff()`, `actors.member({ status })`, `actors.nonMember()`, `actors.anonymous()` insert the `user` + `members` rows and return an `Actor`. Services are called directly with it, so no auth stub exists |
| Clock | Services take `now`; tests pass it explicitly (`T0`, `T0 + 15 * MIN`, …) |
| Builders | `seed.machine({ requires: [certA], supervised: true })`, `seed.grant(member, cert, { expiresAt })`, … |
| Concurrency | Fire overlapping service calls with `Promise.all`; assert on the final rows |
| E2E | Playwright against `next dev` on a throwaway D1 (`tests/e2e/run.sh`); signs up real accounts; reads verification links from the dev outbox |
| Coverage | `src/server/domain/*` ≥ 90% lines; every service covered by a T-spec |

---

## 5. Definition of "phase done"

A phase is done when **all** of the following are true:

- [ ] All tasks in the phase doc are checked off (or explicitly moved to a later phase with a reason).
- [ ] `npm run check` and `npm run test:e2e` pass on the commit being deployed (there is no CI server).
- [ ] New migrations reviewed by hand, applied to staging, and (from Phase 2 on) to production.
- [ ] The phase's manual checks pass on **staging** on a physical phone.
- [ ] The phase's demo checkpoint works on staging.
- [ ] No new free-tier risk was introduced without a note in `technologies.md` §13.
- [ ] The phase doc's *Decisions* and *Open questions* sections are updated with anything learned.
- [ ] Deployed to production (Phases 2+).

---

## 6. Requirement traceability

| PRD item | Phase(s) |
|---|---|
| FR-01 Setup and sign-in | 1 |
| FR-02 Joining | 1 |
| FR-03 Roles and suspension | 1 (rules), 4 (suspension ends sessions) |
| FR-04 Rooms and machines | 2 |
| FR-05 Certifications | 2 |
| FR-06 QR labels | 2 |
| FR-07 Sign-off | 3 |
| FR-08 Revocation and suspension effects | 3 (revoke), 4 (ending sessions) |
| FR-09 Machine pass | 3 (engine + page), 4 (session controls), 5 (report-a-problem) |
| FR-10 Sessions | 4 |
| FR-11 Member status board | 4 (5 adds out-of-service detail, issue badge) |
| FR-12 Fault reports | 5 |
| FR-13 Out-of-service details | 5 |
| FR-14 Fault queue | 5 |
| FR-15 Service log | 5 (6 adds checkup linking) |
| FR-16 Checkups | 6 |
| FR-17 Staff console home | 6 (4 and 5 add the data sources) |
| FR-18 Certification records | 3 (4 adds recent sessions) |
| FR-19 Basic abuse protection | 1 (auth limits), 6 (action limits) |
| PRD 5.4 limits / help page | 7 (help-page stub in 1) |
| PRD 8 design rules | All; audited in 7 |
| PRD 9 permissions | 1 (guard + matrix), each phase adds routes, 6 (full sweep) |
| PRD 11.1 security & privacy | 0 (no auth bypass, dev-outbox guard), 1 (auth), 7 (privacy notice, retention) |
| PRD 11.2 quality targets | 7 |
| T01 | 2 (scan opens pass), 5 (full demo), 7 (re-run on production) |
| T02, T03 | 3 |
| T04 | 4 (sessions end), 6 (console flag) |
| T05, T06 | 4 |
| T07, T08 | 5 |
| T09 | 6 |
| T10 | 1–2 (initial), 6 (full) |
| T11 | 6 (first run), 7 (final) |
| T12 | 7 |
| PRD 15 Definition of Done | 7 |
