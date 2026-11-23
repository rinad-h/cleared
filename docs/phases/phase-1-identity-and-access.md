# Phase 1 — Identity, Setup & Access Control

> **Goal:** people can sign up and sign in with **email and password** (verified email, self-service password reset), the first person sets up the makerspace and becomes admin, everyone else joins with the join link, and every service enforces roles on the server.

| | |
|---|---|
| PRD coverage | **FR-01** (setup and sign-in), **FR-02** (joining), **FR-03** (roles and suspension), Section 9 (permissions), 11.1 (security), part of FR-19 (auth abuse limits), T10 (part) |
| Depends on | Phase 0 (scaffold, spike S1 decision on password hashing) |
| Unlocks | Phase 2 |
| Estimated effort | 4–5 days |
| Demo checkpoint | On staging, from a phone: sign up → verification email → verify → first user completes Setup → second user signs up, opens the join link and joins → admin promotes them to staff. "Forgot password" works end to end |

---

## 1. Outcomes

1. **Better Auth email + password** (`technologies.md` §6): sign-up, **email verification** (required), sign-in, sign-out, **forgot/reset password**, change password, sessions in D1, database-backed rate limits. Hashing as decided by spike S1.
2. **Brevo** email sender with a **daily cap** in D1, plus a guarded **dev outbox** for local and E2E use.
3. `settings` and `members` tables. Roles (`admin`/`staff`/`member`) and status (`active`/`suspended`) live in **our** `members` table.
4. **`getActor()`** builds the request's `Actor` (anonymous / signed-in user without membership / member). **Services enforce every permission** with `requireMember` / `requireRole`.
5. First-run **Setup** (exactly once, even under concurrent attempts), **join link** with regenerate, **role and suspension management** including the atomic last-admin rule.
6. App shell: sign-up/sign-in/verify/forgot/reset pages, setup, join, "no membership" and "suspended" gates, member/console switch, account page.
7. A test proves every server action goes through `getActor()` and a service (no unchecked actions).

## 2. Scope

**In:** auth flows, email sending, sessions, setup, join, roles, suspension, settings (name, time zone, join link), Members list/detail (roles and status), account page (change password, sign out everywhere), help page stub.

**Out:** staff email invitations (P1), SSO / social login / MFA / passkeys (P1; Better Auth has free plugins), per-certification trainer rights (P1), multiple makerspaces (P1), editing your own display name (open question §9).

---

## 3. Data model

Migration `drizzle/0001_identity.sql`. Better Auth's tables are generated with its CLI (`npx @better-auth/cli generate` for the Drizzle SQLite adapter) into `src/db/auth-schema.ts`, then included in the drizzle-kit migration and reviewed by hand.

### 3.1 Better Auth tables (generated; don't hand-edit columns)

| Table | Purpose |
|---|---|
| `user` | id, `name` (the display name entered at sign-up), `email` (unique, lowercased), `email_verified`, timestamps |
| `account` | `provider_id = 'credential'` + `password` (scrypt hash) |
| `session` | token, expiry, user, IP, user agent |
| `verification` | email-verification and password-reset tokens |
| `rate_limit` | Better Auth's limiter counters (`storage: "database"`) |

### 3.2 Cleared tables

```sql
CREATE TABLE settings (
  id                    TEXT PRIMARY KEY CHECK (id = 'singleton'),
  name                  TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  timezone              TEXT NOT NULL DEFAULT 'America/Edmonton',
  member_join_token     TEXT NOT NULL UNIQUE,
  join_token_rotated_at INTEGER NOT NULL,
  data_version          INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE members (
  id                          TEXT PRIMARY KEY,
  auth_user_id                TEXT NOT NULL UNIQUE REFERENCES "user"(id),
  email                       TEXT NOT NULL,
  display_name                TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  role                        TEXT NOT NULL CHECK (role IN ('admin','staff','member')),
  status                      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  status_changed_at           INTEGER,
  status_changed_by_member_id TEXT REFERENCES members(id),
  suspension_reason           TEXT CHECK (suspension_reason IS NULL OR length(suspension_reason) <= 300),
  created_at                  INTEGER NOT NULL,
  updated_at                  INTEGER NOT NULL
);
CREATE INDEX members_role_status  ON members(role, status);
CREATE INDEX members_display_name ON members(display_name COLLATE NOCASE);
CREATE INDEX members_email        ON members(email COLLATE NOCASE);

-- Brevo daily cap (technologies.md §7.2). One row per UTC day.
CREATE TABLE email_send_log (
  day   TEXT PRIMARY KEY,          -- 'YYYY-MM-DD' (UTC)
  count INTEGER NOT NULL DEFAULT 0
);
```

- `members.email` and `display_name` are copied from `user` at join, so staff search doesn't need a join.
- Search uses `LIKE '%q%'` on `display_name` and `email` (≈ 1,000 rows read per search at full Pro scale; fine). FTS5 is a Phase 7 optimisation candidate.

---

## 4. Authentication design

### 4.1 Better Auth configuration

As in `technologies.md` §6.3: `emailAndPassword` (8–128 chars, `requireEmailVerification` from the env var, `autoSignIn: false`, 1-hour reset tokens, `revokeSessionsOnPasswordReset`), `emailVerification` (send on sign-up, auto sign-in after verifying, 24 h expiry), 30-day sessions with a 5-minute cookie cache, **database rate limits** with custom rules, `trustedOrigins: [PUBLIC_BASE_URL]`, `cf-connecting-ip` for client IPs, `nextCookies()` last.

**If spike S1 chose native scrypt:** `emailAndPassword.password = { hash, verify }` implemented in `src/server/password.ts` with `node:crypto` `scrypt` (N=16384, r=16, p=1, 64-byte key, 16-byte salt, NFKC-normalised password, `salt:key` hex). That's the same format as Better Auth's default, so hashes made either way verify either way. A unit test proves it: a hash from `better-auth/crypto` `hashPassword` verifies with ours, and the other way round.

Mounted at `src/app/api/auth/[...all]/route.ts` with `toNextJsHandler(getAuth())` (a new instance per request).

### 4.2 Flows

| Flow | Route (page) | Steps | Errors shown |
|---|---|---|---|
| **Sign up** | `/sign-up?next=` | Name, email, password (with show/hide toggle; "at least 8 characters"; no composition rules, per NIST guidance) → `signUp.email({ name, email, password, callbackURL: "/verify-email/done?next=…" })` → "Check your email" screen with **Resend** (60 s cooldown) and "check your spam folder" | Email already registered → **the same "check your email" screen** (no account enumeration; Better Auth's behaviour with verification required, to confirm); weak password; `RATE_LIMITED`; `EMAIL_DAILY_CAP` |
| **Verify email** | link → `/api/auth/verify-email?token=…` → `/verify-email/done` | Token checked → `email_verified = true` → auto sign-in → redirect to `next` | Expired/invalid link → "This link has expired" + resend form |
| **Sign in** | `/sign-in?next=` | Email + password → `signIn.email(...)` → redirect to `next` | Wrong email or password → **one generic message** ("Email or password is incorrect"); unverified → "Verify your email first" + Resend; `RATE_LIMITED` ("Too many attempts. Wait a minute") |
| **Forgot password** | `/forgot-password` | Email → `requestPasswordReset({ email, redirectTo: "/reset-password" })` → **always** "If an account exists, we've emailed a link" | `RATE_LIMITED`, `EMAIL_DAILY_CAP` |
| **Reset password** | `/reset-password?token=` | New password twice → `resetPassword({ newPassword, token })` → other sessions revoked → "Password changed. Sign in" | Expired token → link back to Forgot password |
| **Change password** | `/me/account` | Current + new → `changePassword({ currentPassword, newPassword, revokeOtherSessions: true })` | Wrong current password |
| **Sign out** | account menu | `signOut()` | — |
| **Sign out everywhere** | `/me/account` | `revokeSessions()` | — |

**`next` handling:** after scanning a label (`/m/<token>`), `proxy.ts` sends a signed-out user to `/sign-in?next=/m/<token>`. `next` must be a relative path starting with `/` and not `//`; otherwise default to `/machines`. The sign-up link on the sign-in page carries `next` along.

### 4.3 Email sender (`src/server/email.ts`)

```ts
interface EmailSender {
  verifyEmail(to: string, url: string): Promise<void>;
  passwordReset(to: string, url: string): Promise<void>;
}
```

- **`BrevoEmailSender`** (staging/production):
  1. Reserve quota atomically:
     ```sql
     INSERT INTO email_send_log(day, count) VALUES (:day, 1)
     ON CONFLICT(day) DO UPDATE SET count = count + 1 WHERE count < :cap
     RETURNING count;
     ```
     No row → throw `EMAIL_DAILY_CAP` ("Email is busy today. Try again after 5 pm").
  2. `POST https://api.brevo.com/v3/smtp/email` with sender (`EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`), **`replyTo: EMAIL_FROM_ADDRESS`** (Brevo rewrites a free-mail sender to an address on its own domain, so without `replyTo` replies would go to Brevo), a short subject ("Verify your Cleared account" / "Reset your Cleared password"), plain-text + simple HTML body with the link, its expiry, and "If you didn't ask for this, ignore this email".
  3. A non-2xx response → log `email_send_failed` with the status code only → `EMAIL_SEND_FAILED`.
- **`DevEmailSender`** (`ENVIRONMENT` is `development` or `test`): logs a redacted line and stores `{ to, kind, url }` in an in-memory outbox.
- **`GET /api/dev/outbox?email=`** returns the latest link for that address. It returns 404 unless `NODE_ENV === "development"` **and** `ENABLE_DEV_OUTBOX === "1"`. E2E uses it to click verification and reset links.

### 4.4 Actor and authorization (`src/lib/actor.ts`, `src/server/authz.ts`)

```ts
// src/lib/actor.ts (server-only), cached per request with React.cache
export const getActor = cache(async (): Promise<Actor> => {
  const session = await getSession();                 // Better Auth (cookie cache or 1 D1 read)
  if (!session) return { kind: "anonymous" };
  const member = await findMemberByAuthUser(session.user.id);   // 1 indexed read, every request
  if (!member) return { kind: "user", userId: session.user.id, email: session.user.email, name: session.user.name };
  return { kind: "member", memberId: member.id, userId: session.user.id,
           role: member.role, status: member.status, displayName: member.display_name };
});
```

```ts
// src/server/authz.ts: used at the top of services
requireUser(actor)                 // ServiceError UNAUTHENTICATED
requireMember(actor)               // NOT_A_MEMBER | SUSPENDED (active members only)
requireRole(actor, "staff"|"admin")
```

`src/lib/permissions.ts` holds the PRD Section 9 matrix (`can.signOff(role)`, `can.changeRoles(role)`, …). Services use it for decisions; pages use it **only** to hide controls.

The member row is read on **every** request (not cached in the cookie), so suspension and role changes apply on the next request.

**Every server action** is written with one helper so none can skip the actor:

```ts
export const promoteMember = action(MemberPatchSchema, (actor, input, now) =>
  members.updateMember(getDb(), actor, input, now));
// action() = "use server" wrapper: getActor() → parse() → service → run() → refresh()
```

`tests/unit/actions-wrapped.spec.ts` imports every module in `src/actions/` and asserts each export was created by `action()` (it carries a hidden marker). Later phases are covered automatically.

### 4.5 `proxy.ts`

A cheap cookie-presence check, with the matcher updated to `/machines/:path*`, `/m/:path*`, `/me/:path*`, `/console/:path*`, `/setup`, `/join/:path*`. No session cookie → `/sign-in?next=<path>`. The real checks happen in pages (`requireUser`/`requireMember` → redirect) and in services.

### 4.6 Auth abuse limits (FR-19, auth part)

Better Auth's limiter with `storage: "database"` (shared across isolates): sign-in 5/min, sign-up 3/min, password-reset request 3 per 5 min, verification resend 3 per 5 min, all per IP (`cf-connecting-ip`). In E2E (`ENVIRONMENT=test`) the limits are raised through config, so tests can create many accounts (Better Auth rate-limits sign-ups outside development).

---

## 5. Operations

| Operation | Kind | Auth | Input | Result |
|---|---|---|---|---|
| Better Auth endpoints | Better Auth | public | — | Sign-up, sign-in, verify, reset, sign-out, sessions |
| `getMe` | Page data | user | — | `{ user, setupComplete, makerspace \| null, membership \| null }`, used by layouts and gates |
| `completeSetup` | Server action | user | `{ makerspaceName, timezone }` | Creates settings + the caller as admin (display name from `user.name`). **One batch:** `INSERT INTO settings (id='singleton', …)` + `INSERT INTO members (role='admin')`. A PK conflict rolls back the batch → `SETUP_ALREADY_DONE` |
| `getJoinPreview` | Page data | user | `token` | `{ valid, makerspaceName? }` |
| `joinMakerspace` | Server action | user | `{ token }` | New membership (`role='member'`, name/email from `user`). Already a member → existing membership **unchanged**, redirect to `/machines`. Bad/old token → `INVALID_JOIN_LINK`. No setup yet → `SETUP_NOT_DONE`. Rate-limited in Phase 6 |
| `getSettings` | Page data | admin | — | `{ name, timezone, joinUrl: PUBLIC_BASE_URL + "/join/" + token, joinTokenRotatedAt }` |
| `updateSettings` | Server action | admin | `{ name?, timezone? }` | Time zone validated with `Intl.supportedValuesOf("timeZone")`; bumps `data_version` |
| `regenerateJoinLink` | Server action | admin | — | New token; the old one stops working immediately |
| `searchMembers` | Page data | staff | `{ q?, role?, status?, cursor? }` | `{ items: [{ id, displayName, email, role, status }], nextCursor }` |
| `getMember` | Page data | staff | `id` | Profile, role, status, joined (Phase 3 adds grants, Phase 4 sessions) |
| `updateMember` | Server action | staff (per-field rules) | `{ id, role?, status?, suspensionReason? }` | Rules in §5.1 |

### 5.1 Role and status rules (FR-03)

| Change | Who | Extra rule | Error code |
|---|---|---|---|
| Set `role` | **admin** | Not if it leaves **zero active admins** | `FORBIDDEN_FIELD` (staff) · `LAST_ADMIN` |
| Suspend/reactivate a **member**-role user | staff, admin | — | — |
| Suspend/reactivate **staff/admin** | **admin** | Not the last active admin | `FORBIDDEN` (staff) · `LAST_ADMIN` |
| Change your **own** status | nobody | — | `CANNOT_SUSPEND_SELF` |
| Change your **own** role | admin | Not if you're the last active admin | `LAST_ADMIN` |

Atomic last-admin guard (one statement, so two admins demoting each other at once can't both succeed):

```sql
UPDATE members
SET role = :newRole, updated_at = :now
WHERE id = :id
  AND ( :newRole = 'admin' OR role <> 'admin' OR status <> 'active'
        OR (SELECT COUNT(*) FROM members WHERE role = 'admin' AND status = 'active' AND id <> :id) >= 1 );
-- 0 changes on an active admin → LAST_ADMIN
```

The same pattern applies to suspension. Phase 4 adds "suspension ends active sessions" to this batch. Every mutation batch also runs `UPDATE settings SET data_version = data_version + 1`.

---

## 6. UI

| Route | Screen | Notes |
|---|---|---|
| `/sign-up?next=` | **Sign up** | Name, email, password; link to Sign in; Terms/Privacy links (written in Phase 7) |
| `/sign-in?next=` | **Sign in** | Email, password, "Forgot password?", link to Sign up; makerspace name shown when setup is done |
| `/verify-email/sent`, `/verify-email/done` | **Check your email** / **Verified** | Resend button with cooldown; "check spam" |
| `/forgot-password`, `/reset-password` | **Reset** | Always the neutral confirmation message |
| `/setup` | **First-run setup** | Only when `setupComplete = false`. Makerspace name, time zone (searchable select, default `America/Edmonton`). Already done → `/machines` |
| `/join/[token]` | **Join** | Signed out → `proxy.ts` sends to sign-in/up with `next`. Valid → "Join **Demo Makerspace**" → Join. Invalid → "This join link isn't valid any more. Ask staff for the current link" |
| (gate) | **No membership** | "You're signed in as x@y but aren't a member. Ask staff for the join link." + Sign out |
| (gate) | **Suspended** | "Your access is suspended. Contact staff." + Sign out |
| `/me/account` | **Account** | Name/email (read-only), change password, sign out everywhere |
| `/help` | **Help (stub)** | PRD 5.4 text (finalised in Phase 7); statically rendered |
| `/console/members` | **Members** | Search (debounced), role/status filters, list |
| `/console/members/[id]` | **Member detail** | Role select (admin), Suspend/Reactivate with reason (staff/admin, hidden when not allowed), error toasts for `LAST_ADMIN`, `FORBIDDEN`, `CANNOT_SUSPEND_SELF` |
| `/console/settings` | **Settings** (admin) | Name, time zone, join link with Copy and Regenerate (confirm dialog) |

**Gate logic** in the member and console layouts (server components, inside `<Suspense>`):

```
actor = getActor()
 anonymous                    → (proxy.ts normally caught this) redirect /sign-in?next=
 setup not done               → /setup
 kind "user" (no membership)  → "No membership" gate   (except on /join/[token])
 member, suspended            → "Suspended" gate
 /console/* and role member   → "Staff only" page (services refuse anyway)
```

Staff and admins see a **Member app ⇄ Staff console** switch in the header (PRD 8).

---

## 7. Tasks

★ = needed for the PRD 5.1 minimum demo.

### 7.1 Spike

| ID | Task | Decision recorded |
|---|---|---|
| P1-01 ★ | **Email deliverability:** from staging, send verification and reset emails to a Gmail, an Outlook/Hotmail and a university address. Record inbox/spam/missing and delivery time | Brevo OK? "Check spam" copy needed? Fallback sender needed? |
| P1-02 | Fallback if email is unusable: set `REQUIRE_EMAIL_VERIFICATION=false` for the classroom demo (document it as a deviation from FR-01), and use the admin set-password script for resets (`technologies.md` §6.6) | — |

### 7.2 Backend

| ID | Task |
|---|---|
| P1-10 ★ | Generate Better Auth's schema; write `src/db/schema.ts` additions (`settings`, `members`, `email_send_log`); `npm run db:generate` → `0001_identity.sql`; review; apply local → staging → production |
| P1-11 ★ | `src/lib/auth.ts` (`getAuth()`, `getSession()`) with the §4.1 configuration; `src/app/api/auth/[...all]/route.ts`; `src/lib/auth-client.ts` |
| P1-12 ★ | Native scrypt hasher **only if S1 requires it**, with the cross-compatibility unit test |
| P1-13 ★ | Email senders + daily cap + dev outbox route (with its guard) |
| P1-14 ★ | `getActor()`, `authz.ts`, `permissions.ts` |
| P1-15 ★ | `action()` wrapper + the "all actions wrapped" test |
| P1-16 ★ | Services: `setup.completeSetup`, `join.preview`, `join.join`, `settings.get/update/regenerateJoinLink`, `members.search/get/update` |
| P1-17 ★ | Server actions and page-data functions for the above |
| P1-18 ★ | `bumpVersion()` statement helper, included in every mutation batch |
| P1-19 | Zod schemas: `SignUpForm` (client-side checks mirroring Better Auth's), `SetupInput`, `JoinInput`, `SettingsPatch`, `MemberPatch`, `DisplayName` (trimmed, 1–80, no control characters) |
| P1-20 | `proxy.ts` matcher |

### 7.3 Frontend

| ID | Task |
|---|---|
| P1-30 ★ | Sign-up, sign-in, check-email, verified pages with `next` handling |
| P1-31 | Forgot/reset password pages; account page |
| P1-32 ★ | Setup page |
| P1-33 ★ | Join page + gates |
| P1-34 ★ | Member and console layouts with nav, switch, account menu |
| P1-35 ★ | Members list + detail |
| P1-36 | Settings page |
| P1-37 | Help page stub |

### 7.4 Tests

Service tests call services with actors and explicit `now` (README §4.5). E2E uses real sign-up.

| ID | Test |
|---|---|
| P1-40 ★ | `actors.*` helpers: insert `user` (+ `account` where needed) and `members` rows; return `Actor` |
| P1-41 ★ | Setup: anonymous → `UNAUTHENTICATED`; first user → admin + settings; second → `SETUP_ALREADY_DONE`; **two concurrent setups → exactly one succeeds** |
| P1-42 ★ | `getActor`-shaped states: anonymous / user without membership / member / suspended |
| P1-43 ★ | Join: valid → member; invalid → `INVALID_JOIN_LINK`; **re-join leaves role and status unchanged**; regenerate → old token invalid, new works |
| P1-44 ★ | Roles: staff can't change roles (`FORBIDDEN_FIELD`); admin can; **last admin can't be demoted or suspended**; **two admins demoting each other concurrently → exactly one succeeds**; self-suspend refused |
| P1-45 ★ | Suspension: staff suspend member ✔; staff suspend staff/admin → `FORBIDDEN`; admin suspend staff ✔; a suspended actor → `SUSPENDED` from every member service |
| P1-46 | Settings: admin only; invalid time zone → validation error; `data_version` increments |
| P1-47 ★ | **All server actions wrapped** by `action()` (§4.4) |
| P1-48 | Email cap: with cap 2, the third send → `EMAIL_DAILY_CAP`; counter keyed by UTC day |
| P1-49 | `next` sanitiser: `//evil.com`, `https://evil.com`, `javascript:` → `/machines` |
| P1-50 | Dev outbox route returns 404 when `ENABLE_DEV_OUTBOX` is unset or `NODE_ENV` is `production` |
| P1-51 | Native hasher (if used): cross-verifies with `better-auth/crypto` `hashPassword` |
| P1-52 ★ | **E2E** `auth.spec.ts`: sign up → read the verification link from the dev outbox → verified + signed in → setup → sign out → sign in with a wrong password (generic error) → sign in → forgot password → reset via the outbox link → sign in with the new password |
| P1-53 ★ | **E2E** `join.spec.ts`: second account signs up, opens the join link, joins; admin promotes them to staff; staff sees the console |

### 7.5 Manual checks (staging, physical phone)

| ID | Check |
|---|---|
| P1-60 ★ | Sign up on a phone, verify from the phone's mail app, land back in Cleared signed in |
| P1-61 ★ | Close and reopen the browser → still signed in (30-day session) |
| P1-62 | Forgot password from a phone; the reset email arrives (record the time) |
| P1-63 | Workers Logs: sign-up and sign-in requests show **no 1102** and `cpuTime` within the S1 findings |

---

## 8. Exit criteria

- [ ] The E2E auth and join flows are green; service tests P1-41…P1-51 green.
- [ ] On staging with a phone: sign-up → verify → setup/join → promote works; password reset works; the session persists.
- [ ] No 1102 errors on auth routes in staging logs over the phase.
- [ ] Email deliverability recorded (P1-01); the fallback decision made if needed.
- [ ] Migration `0001` applied to production (production setup is run in Phase 2).

---

## 9. Decisions and open questions

| # | Item | Status |
|---|---|---|
| D1 | Email + password with **required** email verification (FR-01) | Decided (user choice); fallback P1-02 if email is unusable |
| D2 | Hashing: Better Auth default scrypt, or native `node:crypto` scrypt with the same format | Decided by spike S1 |
| D3 | Roles and status in `members`, not Better Auth | Decided (PRD 10.2) |
| D4 | Membership read on every request | Decided: suspension applies immediately |
| D5 | Generic sign-in errors and neutral reset/sign-up confirmations (no account enumeration) | Decided |
| D6 | Self-suspension refused | Decided (not in PRD; prevents lock-out mistakes) |
| D7 | No test-auth stub; services take an actor; E2E uses real sign-up | Decided (replaces PRD 11.1 stub) |
| Q1 | Can members edit their own display name? Proposed: not in MVP (prevents impersonation on passes); staff can't either; revisit in P1 | Proposed |
| Q2 | Unverified accounts piling up: proposed cleanup query in the runbook (delete `user` rows unverified for > 7 days with no `members` row), run by hand once a term | Proposed |
| Q3 | Should the sign-up page require an "I agree to the Terms" checkbox? Proposed: a sentence with links is enough for the MVP | Proposed |

## 10. Risks

| Risk | Mitigation |
|---|---|
| Password hashing exceeds the CPU limit in production | Spike S1 before this phase; native scrypt; monitor 1102s on auth routes (P1-63); fallback decided with the user |
| Verification emails land in spam or are slow | Spike P1-01; "check spam" copy; resend button; fallback P1-02 |
| Term-start sign-ups exceed 300 emails/day | Stagger onboarding; the cap message gives a time; the classroom demo needs < 20 |
| Students forget passwords | Self-service reset (email); admin set-password script as a fallback |
| Better Auth option names differ from this doc | Confirm against the installed version; the behaviour is the requirement |
