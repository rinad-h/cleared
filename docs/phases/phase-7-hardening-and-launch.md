# Phase 7 — Hardening, Polish & Launch

> **Goal:** turn the working MVP into something you can put in front of reviewers, a coordinator and real students. Make it accessible, honest about its limits, private by default, fast on a phone, safe within the free quotas and the 10 ms CPU limit, recoverable when something goes wrong, and provably done against PRD Section 15.

| | |
|---|---|
| PRD coverage | **M3** (accessibility pass, help page with Section 5.4 limits, cold-start measurement, clearly fake demo data), Section 4.2 (pilot metrics: the measurable ones), 5.4 (what Cleared doesn't do), 8 (design rules audit), 11.1 (privacy, retention, residency), 11.2 (quality targets), **T12**, re-run of **T01–T11**, **Section 15 Definition of Done**, Section 16 risks |
| Depends on | Phase 6 |
| Unlocks | Classroom demo; PRD Stage B (prototype tests) and Stage C (pilot) |
| Estimated effort | 4–6 days |
| Demo checkpoint | Final demo on production with clearly fake data, recorded; every DoD box ticked with evidence |

---

## 1. Outcomes

1. **Accessibility:** WCAG 2.2 AA on every screen; the pass and board work with VoiceOver/TalkBack, at 320 px and at 200% zoom.
2. **Help, Terms and Privacy pages** stating the PRD 5.4 limits in plain language, linked from the sign-in and sign-up screens, the pass and the footer.
3. **Performance:** pass interactive in ≤ 2 s warm on a mid-range phone (PRD 11.2); scan-to-pass measured warm and after idle (**T12**).
4. **CPU safety:** every server-rendered page and every Better Auth flow measured against the 10 ms free-plan limit from Workers Logs `cpuTime`.
5. **Free-tier safety:** every hot query index-checked, link prefetching audited, real rows-read numbers recorded, an optional $0 usage alarm, and quota-exhaustion behaviour tested.
6. **Security and privacy review** completed (no auth bypass, dev-only switches off in production, password handling); retention rule and data-residency answer written.
7. **Demo data** that is unmistakably fake, loadable locally and on the deployment, and removable.
8. **Runbook** for deploys, rollbacks, restores, backups, lock-outs, password resets and quota incidents.
9. **Definition of Done** (PRD 15) ticked with evidence; T01–T12 results recorded.

## 2. Scope

**In:** audits, fixes found by audits, content pages, seed/reset scripts, admin scripts, monitoring, runbook, measurements, final test pass, demo deliverables.

**Out:** any new feature, and everything in PRD 5.3. If an audit reveals a missing feature, log it as P1 unless it blocks a DoD item.

---

## 3. Workstreams and tasks

### 3.1 Accessibility (PRD 8, 11.2)

| ID | Task | Pass condition |
|---|---|---|
| P7-01 | **Automated:** `@axe-core/playwright` on every route (member, auth and console) in light mode, at 320 px and 1280 px | 0 serious/critical violations |
| P7-02 | **Keyboard-only** walk-through: sign up → sign in → board → pass → start/end session → report problem; console: sign off, log service, set out of service | Every control reachable; visible focus ring; logical order; dialogs trap and restore focus; Esc closes |
| P7-03 | **Screen readers:** VoiceOver (iOS Safari) and TalkBack (Android Chrome) on the pass, the board and the sign-in/sign-up forms | The pass status is announced as words; tiles read "name, state, estimate, cleared/not cleared"; form errors announced (`aria-live`) |
| P7-04 | **Colour:** check every status token pair (text and icon) in `globals.css` | ≥ 4.5:1 text, ≥ 3:1 icons/borders; status never by colour alone (colour + icon + word) |
| P7-05 | **Zoom and reflow:** 200% browser zoom and the largest OS text size | No clipped text; no horizontal scroll at 320 px |
| P7-06 | **Motion:** `prefers-reduced-motion` (Motion's `reducedMotion="user"` if a `MotionProvider` is used) | No pulsing or movement; the clock still ticks |
| P7-07 | **Touch targets** | ≥ 44 × 44 px for all primary actions on member screens |
| P7-08 | **Distance readability** (PRD 8: pass readable at 1–2 m) | Status word and member name readable at 2 m in makerspace lighting (2 testers) |
| P7-09 | **Forms:** labels, descriptions, error messages linked with `aria-describedby`; required fields marked in text; password fields have show/hide and `autocomplete="current-password"` / `"new-password"` | — |

### 3.2 Help, Terms and Privacy content (PRD 5.4, 11.1)

| ID | Task |
|---|---|
| P7-10 | **Help page** (`src/app/(member)/help/page.tsx`, statically rendered so it's served without Worker CPU), in plain language. Sections: *What Cleared is* (a decision-support and record-keeping tool); *What it doesn't do*: every PRD 5.4 bullet (no presence check; sessions and "in use" are self-reported estimates; supervision isn't verified; it can't stop a machine; records are only as accurate as staff keep them; screenshots and shared phones are mitigated, not prevented; supervisors remain responsible; emergencies follow institutional procedures); *How to use it* (scan → pass → start/done; report a problem); *What the colours mean* (with icons); *Forgot your password?*; *Who to contact* (makerspace staff, not the developer) |
| P7-11 | **Terms of use** page (static): the same limits as the help page plus acceptable use (don't share accounts or passwords, report problems honestly, don't misuse labels) and "provided as is for a classroom MVP / pilot" |
| P7-12 | **Privacy notice** page (static): what's collected (name, email, **a hashed password, never the password itself**, sign-in sessions, certifications, machine sessions, fault reports, service records; **no** photos or student ID numbers, PRD 11.1); why; **who processes it** (Cloudflare: hosting and database, likely U.S. data centres; Cleared sends no email); retention (§3.5); how to ask for access or deletion (contact staff); no tracking or analytics cookies (only the sign-in cookie) |
| P7-13 | Link Help, Terms and Privacy from: sign-in and sign-up pages ("By creating an account you agree…"), join page, pass page footer, console footer |
| P7-14 | Wording review: every estimate says "est." or "expected"; every session list says "self-reported"; checkups say "advisory" |

> These pages are for a classroom MVP and pilot conversations. They are **not legal advice**. A real university pilot goes through the institution's privacy review (PRD 11.1, Stage A question 9).

### 3.3 Performance and T12 (PRD 4.2, 11.2)

| ID | Task | Target |
|---|---|---|
| P7-20 | **Bundle audit:** `next build` output + an analyzer run; client components only where needed; console routes don't leak into the member bundle; icons imported by name; Motion kept off the pass page or limited to one primitive | First load of `/m/[token]` ≤ 250 KB JS gzipped |
| P7-21 | **Lighthouse (mobile, throttled)** on `/m/[token]`, `/machines` and `/sign-in` against production | Performance ≥ 85; Accessibility 100; Best Practices ≥ 95 |
| P7-22 | **Pass interactive time**, warm, on a mid-range Android phone (or Chrome DevTools "Moto G Power" profile) | ≤ 2 s (PRD 11.2) |
| P7-23 | **T12 scan-to-pass**: 10 trials **warm** (signed in, app used in the last 5 min) and 10 trials **after ≥ 30 min idle**, camera scan to the pass status visible, on 2 phones (iOS + Android), on campus Wi-Fi and on cellular. Record median and worst | Warm median ≤ 15 s; idle median ≤ 25 s (PRD 4.2) |
| P7-24 | Caching: OpenNext's hashed `/_next/static/*` files are served as immutable static assets; dynamic pages send `Cache-Control: private, no-store`. Check in devtools | Repeat visits load JS/CSS from cache |
| P7-25 | If T12 misses: shrink the pass page's server component tree, stream the pass inside `<Suspense>` with a skeleton, make sure the session read and the pass query run in **one** data load (not a waterfall), and drop non-essential client JS from the pass | — |

> On Workers there's no scale-to-zero VM to wake, so the PRD's Reserved-VM fallback doesn't apply (and would cost money). Optimising the page and the queries is the only lever, and it's free.

### 3.4 CPU audit (`technologies.md` §4.1, §5.2, §6.4)

| ID | Task | Pass condition |
|---|---|---|
| P7-30 | **Server-rendered pages:** on the deployment (while it holds only demo data) with demo data at 10 and 60 machines, load each hot page 20 times and read `cpuTime` from Workers Logs: pass (`/m/[token]`), board (`/machines`), console home (`/console`), machine detail (`/console/machines/[id]`), member detail, fault queue | p99 < 5 ms per page (half the 10 ms limit); investigate anything above |
| P7-31 | **Route handlers:** `/api/status-board` and `/api/console`, both 304 and 200 paths | 304 p99 < 2 ms; 200 p99 < 5 ms |
| P7-32 | **Server actions:** start/end session, report fault, sign off, log service | p99 < 5 ms |
| P7-33 | **Better Auth (spike S1 follow-up):** 50 sign-ups, 50 sign-ins, 10 password changes on the deployment (before a pilot; delete the test users afterwards); count **Error 1102** and record `cpuTime` | Bursts can hit Error 1102 (P1-01). Pass: with the client retry (Phase 1 P1-12), no user-visible sign-up/sign-in failure at classroom pace. Otherwise apply `technologies.md` §6.4: Google sign-in fallback; never lower the scrypt cost, never pay |
| P7-34 | Record all results in `technologies.md` §4.1/§6.5 | — |

### 3.5 Free-tier safety audit (`technologies.md` §13–14)

| ID | Task | Pass condition |
|---|---|---|
| P7-40 | **Index audit:** run `EXPLAIN QUERY PLAN` (locally) for every hot query: pass by token, board, console, fault queue, member search, grants by member/cert, open `machine_sessions`, service history, checkups, Better Auth session lookup | No `SCAN` of `machine_sessions`, `grants`, `faults`, `service_records` or `session`; scans only on small tables (`rooms`, `machines`, `machine_requirements`, `checkups`) |
| P7-41 | **Prefetch audit:** in production mode, open the board, My certifications and the console lists with the Network panel; count requests triggered by `<Link>` prefetches | No prefetch requests from member-app links or long lists (`prefetch={false}`); only console nav items prefetch |
| P7-42 | **Rows-read measurement:** log D1's `meta.rows_read` / `meta.rows_written` in development (a small dev-only addition to `src/server/log.ts` made in this phase; Phase 0 doesn't provide it), and record rows read/written per page, action and route handler with demo data at 10 and 60 machines | Update the `technologies.md` §13.1 table with measured values |
| P7-43 | **Simulated pilot day** (locally, never against production): a Playwright or small Node script replays a pilot day against `npm run preview` (real `workerd`), with 8 board viewers, 3 consoles, 1,500 page views, 250 actions; sums requests and rows read/written | Projected daily usage < 30% of every free limit |
| P7-44 | **Daily-limit behaviour:** force the `DAILY_LIMIT` path (a test-only fake D1 error in a service test, plus a manual check of the UI banner with a dev-only toggle) | Pages and polling components show "Cleared is over its free daily limit and will be back after 5 pm" |
| P7-45 | **Optional $0 usage alarm (open decision, see D2):** a GitHub Actions **scheduled workflow** (daily, 22:00 UTC) calls Cloudflare's GraphQL Analytics API with a **read-only** token (Account Analytics: Read) for today's Worker requests (all Workers on the account) and D1 rows read/written; opens a GitHub issue if any is > 60% of its limit. It runs in GitHub, not in the app, so it doesn't break the PRD's no-background-jobs rule. The project otherwise uses no GitHub Actions (no CI/CD, decided 2026-11-22): adopting this means documenting Actions' free-tier limits in `technologies.md` §3 and storing the read-only token as a GitHub secret. Otherwise check the dashboard weekly (`technologies.md` §14) | Workflow green; tested by temporarily lowering the threshold |
| P7-46 | Re-check the **Workers Logs pricing change (Dec 1, 2026)**: confirm logging is still free or adjust `head_sampling_rate` / disable it | Recorded in `technologies.md` §4.5 |

### 3.6 Security and privacy review (PRD 11.1)

| ID | Check |
|---|---|
| P7-50 | **No auth bypass:** search the codebase for any header- or env-based way to become a user (`X-Test`, `TEST_AUTH`, hard-coded IDs) → none. The action-wrapper sweep and T10 service sweep (Phase 6) are green |
| P7-51 | **Dev-only switches off:** the spike code is deleted (or `curl -i https://cleared.<your-subdomain>.workers.dev/api/spike/hash` → **404** and `npm run remote -- secret list` shows no `ENABLE_SPIKES`); `npm run check` confirms `ENABLE_SPIKES` isn't in `wrangler.jsonc` and `getEnv()`'s dev-only branch isn't in the Worker |
| P7-52 | **CSRF:** server actions rely on Next.js's built-in origin check (`serverActions.allowedOrigins` unset); every route handler other than Better Auth's exports **GET only** (a unit test lists `src/app/api/**/route.ts` exports); cookies `HttpOnly`, `Secure`, `SameSite=Lax`. Test: a cross-origin POST to a server action is rejected |
| P7-53 | **Passwords:** min 8 / max 128 enforced; sign-in errors are generic ("Email or password is incorrect"; no "no such user"); changing a password revokes the other sessions; Better Auth's limiter blocks a 6th sign-in attempt within a minute (manual check on the deployment) |
| P7-54 | **Optional breached-password check:** evaluate Better Auth's `haveIBeenPwned` plugin (free; sends only a 5-character hash prefix). It adds an outbound request and some CPU to sign-up and password change; adopt it only if P7-33 shows headroom. Record the decision |
| P7-55 | **Accounts that never joined:** document and test the cleanup query (`user` rows older than 7 days with no `members` row, e.g. sign-ups with a mistyped or someone else's address): `DELETE FROM session WHERE user_id IN (…); DELETE FROM account WHERE user_id IN (…); DELETE FROM user WHERE created_at < :cutoff AND id NOT IN (SELECT auth_user_id FROM members)`. Manual, run from the runbook |
| P7-56 | **Secrets:** none in the repo or the client bundle (search `.open-next/` output for the `BETTER_AUTH_SECRET` value); **no secrets in `.env*` files**, since OpenNext can embed `.env.local` values in the bundle (`technologies.md` §16); `.dev.vars` git-ignored; rotation procedure in the runbook |
| P7-57 | **Headers:** check in devtools that `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `frame-ancestors 'none'` (CSP via `next.config.ts` `headers()`) are present |
| P7-58 | **Dependencies:** `npm audit --omit=dev`; update or replace anything high/critical; pin exact versions (Next, OpenNext, Better Auth, Drizzle, Wrangler) |
| P7-59 | **Privacy of responses:** re-run the T06 privacy assertions against **production** `/api/status-board` responses with demo data; check the pass never shows other members' names, and that page HTML/RSC payloads for members don't include other members' data (inspect the RSC payload of `/machines`) |
| P7-60 | **Logs:** search 3 days of Workers Logs for `@`, `password`, `token=` and free-text fields → none |
| P7-61 | **Retention rule** (PRD 11.1): adopt "machine sessions kept 2 years; grants, faults and service records kept for the life of the makerspace (audit value); expired auth sessions purged". Implement as a **documented manual procedure** in the runbook (an `npm run remote -- d1 execute cleared --remote --command "…"` SQL run once a term by the admin), not a background job |
| P7-62 | **Data residency statement** for pilot conversations: "Data is stored in Cloudflare D1 with a western-North-America location hint; Cloudflare doesn't offer a Canadian jurisdiction for D1. Cleared sends no email, so no email provider sees your address." Add it to the privacy notice and the pilot checklist |
| P7-63 | **Account security:** 2FA on Cloudflare and GitHub; a Cloudflare API token, if one is used for headless deploys, is scoped (Phase 0) and only ever exported in the shell, never stored in a file (no CI/CD) |

### 3.7 Demo data (PRD M3, 14)

| ID | Task |
|---|---|
| P7-70 | `scripts/seed.ts` (run with `npm run db:seed`): "**Demo Makerspace**"; rooms *Laser Room*, *Wood Shop*, *3D Print Lab*, *Metal Shop*; certifications *Laser Cutter — Basic* (12 months), *Wood Shop — General* (12), *3D Printer — Intro* (none), *Lathe — Basic* (6); 10 machines including one supervised lathe and one out of service with a note; demo members **"Demo Student 1–5", "Demo Staff 1–2", "Demo Technician"** with `@example.com` emails; grants with a mix of valid/expiring/expired; a service history of 6 records (including one vendor repair and one correction); 3 checkups (one overdue) |
| P7-71 | Seeded accounts get real Better Auth credential rows with passwords hashed **locally** by `hashPassword` from `better-auth/crypto` (no Worker CPU used) so you can sign in as any demo user. Demo passwords live in `docs/seed.md` and are **only** used locally; on the deployment, seeded demo members get no `account` row (they can't sign in) |
| P7-72 | Every seeded name starts with **"Demo"**; the makerspace name contains "Demo"; a banner "Demo data. Not real makerspace records" appears when `settings.name` starts with "Demo" |
| P7-73 | `npm run db:seed -- --reset` for local and `scripts/reset-demo.sh` for the deployment: export a backup, clear business tables in FK-safe order, re-seed. It refuses to run unless `--i-know` is passed **and** the settings name starts with "Demo" (so it can never wipe a real pilot) |
| P7-74 | Live-demo accounts on the deployment are **real accounts you sign up** (your email as admin, a second as staff, a phone account as student). Seeded "Demo …" members only populate history |
| P7-75 | Seed data is never presented as pilot results (PRD 14). Add that sentence to the demo script |

### 3.8 Admin scripts

| ID | Task |
|---|---|
| P7-76 | `scripts/set-password.ts <email> <temp-password> [--local]`: hashes locally with `hashPassword` (no Worker CPU), then renders the deploy config and runs the equivalent of `npm run remote -- d1 execute … --remote` (or the local D1 with `--local`) to update the `credential` account row (`technologies.md` §6.6). Prints a reminder to tell the member to change it |
| P7-77 | `scripts/make-admin.ts <email> [--local]`: the admin lock-out fix (runbook P7-86) as a script, so nobody hand-types SQL against the live database |

### 3.9 Runbook (`docs/runbook.md`)

| ID | Section | Contents |
|---|---|---|
| P7-80 | Deploy | `npm run check` → `npm run test:e2e` → `npm run preview` for anything risky (there's no staging copy) → `npm run db:migrate:remote` → `npm run deploy` (ends with a smoke test); what "additive only" means; first-ever deploy uses `npm run deploy:first` (`scripts/deploy.sh --first`; uploads `BETTER_AUTH_SECRET`) |
| P7-81 | Rollback | `wrangler rollback` (code); schema is additive, so rolling back code is safe; never roll back migrations |
| P7-82 | Restore data | `npm run remote -- d1 time-travel info cleared`; `npm run remote -- d1 time-travel restore cleared --timestamp=<ISO>` (last 7 days). This is also the undo for a bad migration. Rehearse it once on the deployment while it holds only demo data (export first) |
| P7-83 | Backups | Weekly `npm run remote -- d1 export cleared --remote --output="$HOME/cleared-backups/cleared-YYYY-MM-DD.sql"` (outside the repository, which is public) during a pilot; store privately (encrypted drive, not GitHub; it contains password hashes and personal data); delete after the retention period |
| P7-84 | Quota incident | Symptoms (Error 1027, the daily-limit banner); check the dashboard (requests are shared with any other Worker on the account); what's using quota; wait for 00:00 UTC (5 pm MST / 6 pm MDT); mitigations (close kiosk tabs, raise poll intervals); **never upgrade to paid** |
| P7-85 | CPU incident (Error 1102) | Find the route in Workers Logs; if it's sign-in/sign-up, follow `technologies.md` §6.4; if it's a page, reduce its server render (P7-25 list) |
| P7-86 | Admin lock-out | `npx tsx scripts/make-admin.ts <email>` (logged in the runbook with date and reason) |
| P7-87 | Forgotten password | There's no self-service reset (no email): staff confirm identity in person → admin runs `scripts/set-password.ts` → member signs in and changes it |
| P7-89 | Secrets rotation | `BETTER_AUTH_SECRET` (`wrangler secret put`; **this signs everyone out**: every session cookie becomes invalid, so do it outside open hours) and the Cloudflare API token. Never put secrets in `.env*` files (OpenNext can bundle `.env.local`) |
| P7-90 | Join link leaked | Regenerate in Settings |
| P7-91 | Label misused / lost | Reprint (same token). If misused, retire the machine and re-add it (new token), then print the new label |
| P7-92 | Retention purge | The SQL from P7-61 and the never-joined account cleanup from P7-55, run once a term; record the date |
| P7-93 | "The pass was wrong" report | Check the member's grants (member detail history), the machine's requirements and status; the pass is computed from those records at that time. Fix the records, not the pass |

### 3.10 Final verification

| ID | Task |
|---|---|
| P7-95 | Re-run **all automated tests** (unit, service T02–T10, route handlers, action-wrapper sweep, E2E) on the final commit (`npm run check` + `npm run test:e2e`) |
| P7-96 | Re-run **T01** on production with freshly printed labels on 2 phones, starting from a brand-new student sign-up |
| P7-97 | Re-run **T11** on production after the final deploy |
| P7-98 | Run **T12** (P7-23) and record the results |
| P7-99 | Compile the **PRD 4.2 measurement table** from earlier phases: setup time (P2-63), sign-off (P3-52), status check (P4-42), service logging (P5-42), supervisor check (P6-41), scan-to-pass (P7-23), out-of-service-on-next-scan (T07 #2). Mark each as *classroom measurement*, not a pilot result |
| P7-100 | Record the final **demo video** (2–4 min) of the 10-step minimum demo on a phone + laptop |
| P7-101 | Update the PRD's Replit-specific sections to point to `technologies.md` (list in `technologies.md` §18), or attach `technologies.md` as an addendum if the PRD is frozen |

---

## 4. Definition of Done: PRD Section 15, with evidence

| PRD 15 item | Evidence |
|---|---|
| Published on a stable HTTPS URL; labels generated from that URL | Production `workers.dev` URL (Phase 0 decision); label sheet uses `PUBLIC_BASE_URL`, not the request host (Phase 2 test); *wording change from "Replit HTTPS URL"* |
| The 10-step minimum demo (5.1) works end to end on a physical phone | P5-41, P7-96, demo video P7-100 |
| Passes correct for requirements, supervised machines, expiry, revocation, suspension; revocation and suspension end active sessions | T02, T03, T04 green |
| Members see an accurate status board that never reveals who is using a machine | T06 (including the privacy assertions), P7-59 |
| Staff work the fault queue, set out-of-service details, log service records, manage checkups, see full service history | T07, T08, T09 green; P5-42 timing |
| Nobody can sign off themselves; staff can't change admin-only settings | T03 #2–3, T10 sweep |
| The help page states the limits in Section 5.4 | P7-10 (screenshot) |
| Tests T01–T11 pass; T12 done if M3 reached | P7-95…98 results table |
| No deferred feature (5.3) is described as built | Review of the help page, README and demo script against PRD 5.3 |

---

## 5. Pilot readiness checklist (for PRD Stage C)

Not required for the classroom MVP, but listed so nothing is forgotten:

- [ ] The institution's privacy review is done, or the pilot runs at a community makerspace first (PRD 16).
- [ ] Privacy notice reviewed by the space's coordinator; retention rule agreed.
- [ ] Data-residency statement (P7-62) accepted.
- [ ] The password-reset procedure (P7-87) explained to staff: there's no self-service reset.
- [ ] Labels printed on durable stock (physical cost, outside the $0 software budget) and stuck on 5–10 machines.
- [ ] Staff briefing (15 min): sign-off, revoke, fault queue, log service, console home, "the pass supports you; you still check".
- [ ] The door poster (board + join QR) is up.
- [ ] Weekly backup and quota check on the calendar; the usage alarm (P7-45) is on.
- [ ] Measurement plan for PRD 4.2 pilot metrics (coverage spot-checks, timings, feedback form).
- [ ] Free-tier limits re-checked (`technologies.md` §19) within a week of the pilot start.

---

## 6. Exit criteria

- [ ] Every task in §3 done or explicitly deferred with a reason.
- [ ] Every DoD row in §4 has evidence attached (command output, screenshots, the results table).
- [ ] CPU audit (P7-30…33) recorded with no route over 10 ms, and auth flows passing.
- [ ] T12 recorded; T01 and T11 re-run on production.
- [ ] Runbook complete; one restore rehearsed on the deployment while it held only demo data; `set-password` and `make-admin` scripts tested locally and on the deployment.
- [ ] Production holds only clearly fake demo data (or a real pilot's data with the privacy items done).
- [ ] $0 confirmed: Cloudflare on Free, no payment methods anywhere, no paid add-ons enabled.

---

## 7. Decisions and open questions

| # | Item | Status |
|---|---|---|
| D1 | The retention purge and never-joined account cleanup are manual, documented procedures (no background job) | Decided |
| D2 | The usage alarm, if adopted, runs in GitHub Actions, not in the app. Since 2026-11-22 the project uses no GitHub Actions otherwise, so adopting it is an explicit opt-in | Open |
| D3 | WCAG 2.2 AA as the accessibility bar | Decided |
| D4 | Password reset is a local admin script that hashes on the laptop, not an in-app feature (Cleared sends no email) | Decided: avoids Worker CPU and a new privileged screen |
| D5 | `haveIBeenPwned` check only if the CPU audit shows headroom | Decided |
| Q1 | Should the PRD itself be updated for the Cloudflare change, or is `technologies.md` an acceptable addendum? | Open |
| Q2 | Should production keep demo data after the demo, or be reset before a pilot? Proposed: reset + Setup on the pilot's real makerspace | Proposed |

## 8. Risks

| Risk | Mitigation |
|---|---|
| A page or sign-in path exceeds 10 ms CPU on the deployment only (not locally) | CPU audit P7-30…33 on the deployment; §6.4 decision rule for auth; P7-25 list for pages |
| T12 misses its target on cellular | P7-25 optimisations; measure on campus Wi-Fi too; the pass streams a skeleton immediately |
| Free-tier terms change before the demo | Re-check §19 sources in the final week; logs are optional |
| Audit findings exceed the time left | Fix anything that blocks a DoD item first; log the rest as P1 with reasons |
| Demo-day connectivity | A recorded demo video (P7-100) as backup; a local `npm run preview` as a last resort (its labels carry the "NOT THE REAL APP" banner) |
