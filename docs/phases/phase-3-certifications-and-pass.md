# Phase 3 — Certifications & the Machine Pass

> **Goal:** scanning a machine shows an accurate, server-computed pass (**CLEARED**, **SUPERVISION REQUIRED**, **NOT CLEARED** with exactly what's missing, or **OUT OF SERVICE**), and staff can sign members off and revoke certifications in seconds.

| | |
|---|---|
| PRD coverage | **FR-07** (sign-off), **FR-08** (revocation, grant side), **FR-09** (machine pass), **FR-18** (certification records), Business rules 7.1, Journeys B, C and D step 1, Section 8.1 (pass, My certifications), **T02**, **T03** |
| Depends on | Phase 2 (machines, requirements, certifications, `/m/[token]` shell) |
| Unlocks | Phase 4 (sessions need the pass to decide who can start) |
| Estimated effort | 4–5 days |
| Demo checkpoint | PRD 5.1 steps **4–6**: student scans → red **NOT CLEARED** listing the missing certification with its training link → staff signs them off → student scans again → green **CLEARED** |

---

## 1. Outcomes

1. A **pure, fully tested pass engine** (`src/server/domain/pass.ts`) that computes exactly one status in the PRD's precedence, using server UTC time.
2. A `grants` table with **idempotent sign-off** (a double-tap creates one grant), **no self sign-off** (enforced in the service *and* by a database `CHECK`), expiry from `validity_months`, revocation with a reason, and full history.
3. The **pass page** at `/m/[token]`: big colour + icon + word, member name, machine, **live ticking clock**, earliest expiry, missing certifications with training links, and join or "contact staff" prompts. Readable from 1–2 m.
4. **Members** console extended with certification status, grant history, **Sign off** and **Revoke**.
5. **My certifications** for members: grants, expiries, training links.

## 2. Scope

**In:** grants, pass engine, pass page data and page, sign-off/revoke UI, member certification views.

**Out (later phases):** session Start/Extend/Done on the pass (Phase 4), ending sessions on revocation (Phase 4), Report a problem (Phase 5), the console flag for mid-session expiry (Phase 6). **Out (deferred, PRD 5.3):** per-certification trainer rights, prerequisite attestation, quizzes, CSV import of existing sign-offs.

---

## 3. Data model

Add to `src/db/schema.ts`, `npm run db:generate` → `drizzle/0003_grants.sql`, review, apply local → staging → production (`db:migrate`, `db:migrate:staging`, `db:migrate:remote`). Additive only.

```sql
CREATE TABLE grants (
  id                   TEXT PRIMARY KEY,
  member_id            TEXT NOT NULL REFERENCES members(id),
  certification_id     TEXT NOT NULL REFERENCES certifications(id),
  granted_by_member_id TEXT NOT NULL REFERENCES members(id),
  granted_at           INTEGER NOT NULL,
  expires_at           INTEGER,
  client_request_id    TEXT NOT NULL UNIQUE,
  revoked_at           INTEGER,
  revoked_by_member_id TEXT REFERENCES members(id),
  revoke_reason        TEXT CHECK (revoke_reason IS NULL OR length(revoke_reason) BETWEEN 3 AND 300),
  created_at           INTEGER NOT NULL,
  CHECK (granted_by_member_id <> member_id),                               -- nobody signs off themselves
  CHECK ((revoked_at IS NULL) = (revoked_by_member_id IS NULL)),
  CHECK ((revoked_at IS NULL) = (revoke_reason IS NULL)),
  CHECK (expires_at IS NULL OR expires_at > granted_at)
);
CREATE INDEX grants_member_cert ON grants(member_id, certification_id);
```

- Grants are **never deleted**. Revocation fills the three `revoked_*` columns once (`WHERE revoked_at IS NULL`).
- A **re-grant** is a new row. The old rows stay as history (FR-07).

---

## 4. Domain logic

### 4.1 Valid grant

A grant is **valid at time `now`** when `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now)`. Requirements are **AND**: every required certification needs at least one valid grant (PRD 7.1).

For each certification, the **best grant** is the valid grant with the latest `expires_at` (null = never expires = best).

The same rule exists in two forms: TypeScript (`isGrantValid` in `src/server/domain/grants.ts`) and a shared SQL fragment builder (`validGrantSql()`) used by Phase 4's guarded insert. A test asserts they agree.

### 4.2 Expiry calculation

`expires_at = addMonthsUtc(granted_at, validity_months)`, or `null` when `validity_months` is null.

`addMonthsUtc` adds calendar months in UTC and **clamps to the last day of the month**: Jan 31 + 1 month = Feb 28 (or 29). The time of day is kept. It lives in `src/server/domain/time.ts` and is unit-tested for month ends, leap years, December→January and 120 months.

### 4.3 Pass engine (`computePass`)

```ts
type Viewer =
  | { kind: "none" }                                                   // signed in, no membership
  | { kind: "member"; memberId: string; role: Role; status: "active" | "suspended"; displayName: string };

interface PassInput {
  now: number;
  machine: { status: "available" | "out_of_service"; supervised: boolean };
  requirements: { id: string; name: string; trainingUrl: string | null }[];
  viewer: Viewer;
  grants: GrantRow[];   // the viewer's grants for the required certifications (all, including revoked/expired)
}

type MissingCert = {
  id: string; name: string; trainingUrl: string | null;
  state: "never" | "expired" | "revoked";   // why it's missing (latest grant's state)
  since: number | null;                      // when it expired/was revoked
};

type PassResult = {
  status: "OUT_OF_SERVICE" | "NOT_CLEARED" | "SUPERVISION_REQUIRED" | "CLEARED";
  notClearedReason?: "not_member" | "suspended" | "missing_certifications";
  missing: MissingCert[];                    // empty unless missing_certifications
  earliestExpiry: number | null;             // min expiry across required certs' best grants
  certifiedForMachine: boolean;              // active member with all requirements valid; ignores
                                             // out-of-service and supervision (used for the board's ✔/✖)
};
```

The `Viewer` is derived from the request's `Actor` (README §4.3): `actor.kind === "user"` → `{ kind: "none" }`, `actor.kind === "member"` → the member fields.

**Precedence (FR-09), evaluated top to bottom:**

| # | Condition | Result |
|---|---|---|
| 1 | `machine.status = out_of_service` | `OUT_OF_SERVICE` |
| 2 | viewer has no membership | `NOT_CLEARED`, reason `not_member` |
| 3 | viewer is suspended | `NOT_CLEARED`, reason `suspended` |
| 4 | some requirement has no valid grant | `NOT_CLEARED`, reason `missing_certifications`, listing **each** missing cert with its training link and state |
| 5 | machine is supervised **and** viewer's role is `member` | `SUPERVISION_REQUIRED` |
| 6 | otherwise | `CLEARED` |

Consequences, spelled out (each one is a T02 case):

- Staff and admins with valid certifications get **CLEARED** on supervised machines. Staff **without** the certifications are **NOT CLEARED**: being staff isn't a bypass.
- A machine with **no requirements** is CLEARED for any active member, or SUPERVISION_REQUIRED for a `member` if it's supervised.
- Out of service overrides everything, even for non-members.
- `computePass` is **pure**: no I/O, `now` passed in. It's exhaustively unit-tested and reused by the status board (Phase 4) and session start (Phase 4). It runs in the Worker and is cheap (a few small loops), so it adds nothing noticeable to the pass page's server-render CPU.

### 4.4 Sign-off rules (FR-07)

Service: `signOff(db, actor, { memberId, certificationId, clientRequestId }, now)` in `src/server/services/grants.ts`.

| Rule | `ServiceError` code |
|---|---|
| Actor is staff or admin | `FORBIDDEN` |
| Target ≠ actor (applies to admins too) | `SELF_SIGN_OFF` (the DB `CHECK` is a backstop) |
| Target is an **active** member (any role) | `NOT_FOUND` / `MEMBER_SUSPENDED` |
| Certification exists and is **active** | `CERT_INACTIVE` |
| `clientRequestId` is a UUID | `VALIDATION_FAILED` |

**Idempotent insert** (one `db.batch()`):

```sql
INSERT INTO grants (id, member_id, certification_id, granted_by_member_id, granted_at, expires_at, client_request_id, created_at)
VALUES (…)
ON CONFLICT(client_request_id) DO NOTHING;
-- then, in the same batch:
SELECT * FROM grants WHERE client_request_id = :clientRequestId;
```

- New row → `{ grant, created: true }`.
- Existing row with the same member and certification → `{ grant, created: false }` (replay; the UI shows the same success toast).
- Existing row with a different member or certification → `IDEMPOTENCY_MISMATCH`.

The batch also bumps `data_version`.

### 4.5 Revocation rules (FR-08, grant side)

Service: `revokeGrant(db, actor, { grantId, reason }, now)`.

| Rule | `ServiceError` code |
|---|---|
| Actor is staff or admin | `FORBIDDEN` |
| Grant's member ≠ actor ("for other members", PRD 9) | `SELF_REVOKE` |
| Reason 3–300 chars | `VALIDATION_FAILED` |
| Grant not already revoked | `ALREADY_REVOKED` |

`UPDATE grants SET revoked_at = :now, revoked_by_member_id = :actor, revoke_reason = :reason WHERE id = :id AND revoked_at IS NULL`, plus the `data_version` bump. The effect is **immediate**: the next pass computation excludes it. **Phase 4 adds** "end the member's affected active sessions" to this same batch.

---

## 5. Operations

| Operation | Kind | Auth | Input | Result |
|---|---|---|---|---|
| `getMachineByToken` | Page data (`src/data/pass.ts`) | user | `{ token }` | See §5.1 |
| `signOff` | Server action (`src/actions/grants.ts`) | staff | `{ memberId, certificationId, clientRequestId }` | `ActionResult` with the grant; codes per §4.4 |
| `revokeGrant` | Server action | staff | `{ grantId, reason }` | `ActionResult`; codes per §4.5 |
| `getMyCertifications` | Page data (`src/data/certifications.ts`) | member | — | See §5.2 |
| `getMemberDetail` | Page data (`src/data/members.ts`) | staff | `{ memberId }` | Phase 1 shape **+** `certifications` (same shape as §5.2, plus `history`: every grant with granted-by and revoked-by names) |

Both actions follow the standard shape: `getActor()` → `parse()` → service → `refresh()`, so the member detail page re-renders in the same response.

### 5.1 Pass data

```jsonc
{
  "recognized": true,
  "serverNow": "2026-11-22T21:41:07.000Z",
  "makerspace": { "name": "Demo Makerspace", "timezone": "America/Edmonton" },
  "machine": {
    "id": "…", "name": "Epilog Laser #1", "roomName": "Laser Room", "supervised": false,
    "status": "available",
    "outOfService": null              // { reason, since, note, expectedBackAt } when out of service (Phase 5 fills it)
  },
  "viewer": { "displayName": "Demo Student 1", "membership": "active", "role": "member" },
  "pass": {
    "status": "NOT_CLEARED",
    "notClearedReason": "missing_certifications",
    "missing": [
      { "id": "…", "name": "Laser Cutter — Basic", "trainingUrl": "https://…", "state": "never", "since": null }
    ],
    "earliestExpiry": null
  }
  // Phase 4 adds: "currentSession", "actions": { canStart, … }
  // Phase 5 adds: "actions.canReportFault"
}
```

- Non-member: `viewer.membership = "none"`, `role = null`, `displayName` from the Better Auth user's name.
- **Reads per pass:** machine by `qr_token` (1) + requirements by PK prefix (n) + certifications by ID (n) + member (1) + grants by `(member_id, certification_id)` (a few). About 10 rows, no scans, sent as **one `db.batch()` of reads** (one round trip).
- The page component passes this object to client components as plain serialisable props (ISO strings, no functions).

### 5.2 My certifications

```jsonc
{
  "certifications": [
    {
      "certification": { "id": "…", "name": "Laser Cutter — Basic", "trainingUrl": "https://…", "validityMonths": 12 },
      "state": "valid",                         // valid | expiring_soon (≤ 30 days) | expired | revoked | none
      "grantedAt": "…", "expiresAt": "…", "grantedByName": "Demo Staff 1",
      "revokedAt": null, "revokeReason": null
    }
  ]
  // Phase 4 adds: "recentSessions"
}
```

Lists every **active** certification. Inactive ones appear only if the member ever held them. `state = none` rows show the training link, so the page also works as "what can I get trained on".

---

## 6. UI

### 6.1 Pass page (`src/app/(member)/m/[token]/page.tsx`), the most important screen

Structure:

- **Server Component** page: renders the shell, then a `<Suspense>` boundary around `<PassSection token>` which reads the session (`getActor()`) and calls `getMachineByToken`. Session reads must be inside `<Suspense>`.
- **Client components** inside it: `<LiveClock offsetMs tz>`, `<MissingCertList>`, and (Phase 4/5) the session and report-a-problem forms that call server actions.
- **Refresh:** a client `<AutoRefresh seconds={60}>` (Phase 0 component) calls `router.refresh()` every 60 s **while the tab is visible**; after the tab was hidden it refreshes as soon as 60 s have passed since the last refresh (right away if they already have). After an action, the action's own `refresh()` re-renders the page, so no extra refresh is needed. That's cheaper than polling a JSON endpoint here because the pass is usually open for less than a minute.
- **Hot path CPU** (`technologies.md` §5.2): one batched data call, a small component tree, no markdown, charts or heavy animation. Check `cpuTime` on staging (P3-53).
- Links out of this page (to My certifications, Help) use `prefetch={false}`.

Layout, mobile-first and readable from 1–2 m:

```
┌─────────────────────────────────────┐
│ Demo Makerspace                     │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  ✔  CLEARED                   │  │  ← full-width block: colour + icon + WORD
│  │                               │  │    word ≥ 44 px, bold; icon ≥ 40 px
│  └───────────────────────────────┘  │
│                                     │
│  Demo Student 1                     │  ← member name ≥ 24 px
│  Epilog Laser #1 · Laser Room       │
│                                     │
│  ● 2:41:07 pm  Sun Nov 22           │  ← live clock, seconds tick, pulsing dot
│                                     │
│  Certified until Mar 3, 2027        │  ← earliest expiry
│                                     │
│  [ Start session ]  (Phase 4)       │
│  Report a problem   (Phase 5)       │
└─────────────────────────────────────┘
```

| Status | Colour / icon | Body |
|---|---|---|
| **CLEARED** | green / `CheckCircle2` | Earliest expiry |
| **SUPERVISION REQUIRED** | amber / `AlertTriangle` | "A staff member must be present while you use this machine." |
| **NOT CLEARED**, missing certs | red / `XCircle` | "You need:" then each cert with its state ("Not yet certified" / "Expired Oct 3" / "Revoked") and an **Open training** button (`target="_blank" rel="noopener noreferrer"`) and "After training, ask staff to sign you off." |
| **NOT CLEARED**, not a member | red / `XCircle` | "You're not a member of Demo Makerspace yet. Ask staff for the join link." |
| **NOT CLEARED**, suspended | red / `XCircle` | "Your access is suspended. Contact staff." |
| **OUT OF SERVICE** | slate / `Ban` | Since, reason, note, expected back (Phase 5 fills these) |

**Live clock and anti-screenshot:** offset = `serverNow − Date.now()` measured when the client component mounts. It renders `h:mm:ss a` in the makerspace time zone, updated every second, with a pulsing dot (`prefers-reduced-motion` → no pulse, the seconds still tick). A static screenshot is obvious because the seconds don't move (PRD 5.4: mitigated, not prevented).

**Accessibility:** the status block is `role="status"` with `aria-live="polite"`; the status is announced as text ("Pass: Cleared"); contrast ≥ 4.5:1; the training buttons are real links.

### 6.2 Console: member detail, certifications section

Route: `src/app/console/members/[id]/page.tsx` (Server Component + `getMemberDetail`).

- A table of **active certifications** × this member: state chip, expires, granted by/at. **Sign off** (if not valid or expiring soon, labelled "Renew") and **Revoke** (if valid).
- **Sign-off dialog** (client component, `useActionState` with the `signOff` action): certification select (pre-selected when opened from a row); helper text "Expires Nov 22, 2027 (12 months)" or "Never expires". `clientRequestId` is generated **when the dialog opens** and sent as a hidden field, so a double-tap or retry sends the same ID. On success: sonner toast "Signed off: Laser Cutter — Basic"; the action's `refresh()` updates the table.
- **Revoke dialog:** reason (required), warning "Takes effect immediately" (Phase 4 adds "and ends their active sessions on machines that require it").
- **History** (collapsible): every grant, newest first, with granted/revoked by, reasons, and expiry.
- Sign-off and revoke controls are hidden on your own member page (`can()`); the service refuses them anyway.

**Journey C speed path (target ≤ 30 s):** Members → type 3 letters → tap the result → Sign off → pick the certification → Confirm. Search is debounced (search params on the Members page), the list shows role and status, and the dialog opens with the most recently used certification pre-selected (remembered in `localStorage`).

### 6.3 My certifications (`src/app/(member)/me/certifications/page.tsx`)

Cards per certification: state chip (Valid / Expiring soon / Expired / Revoked / Not yet), dates, training link, and "Ask staff to sign you off after training" for none/expired.

---

## 7. Tasks

★ = needed for the PRD 5.1 minimum demo.

### 7.1 Server

| ID | Task |
|---|---|
| P3-01 ★ | `grants` in `src/db/schema.ts`; `npm run db:generate` → `drizzle/0003_grants.sql`; review; apply local → staging → production |
| P3-02 ★ | `addMonthsUtc` in `src/server/domain/time.ts`; `isGrantValid`, `bestGrant`, `validGrantSql()` in `src/server/domain/grants.ts` |
| P3-03 ★ | `computePass` in `src/server/domain/pass.ts` (§4.3) |
| P3-04 ★ | `loadPassContext(db, machine, actor)` in `src/server/services/pass.ts`: requirements + certifications + viewer grants in **one `db.batch()` of reads** |
| P3-05 ★ | Extend `getMachineByToken` to the §5.1 shape |
| P3-06 ★ | `signOff` service + server action (idempotent, rules §4.4) |
| P3-07 | `revokeGrant` service + server action (rules §4.5) |
| P3-08 | `getMyCertifications` |
| P3-09 ★ | Extend `getMemberDetail` with certifications + history |
| P3-10 | Zod: `SignOffInput`, `RevokeInput` in `src/server/schemas/grants.ts`; serialisable result types in `src/server/schemas/pass.ts` |

### 7.2 UI

| ID | Task |
|---|---|
| P3-20 ★ | `<PassCard>` with all status variants; `<LiveClock offsetMs tz>`; `<MissingCertList>` (client components where interactive) |
| P3-21 ★ | Pass page wiring: `<Suspense>` around the data section, `<AutoRefresh seconds={60}>`, not-recognized page from Phase 2 |
| P3-22 ★ | Member detail: certifications table, Sign-off dialog (with `clientRequestId`) |
| P3-23 | Revoke dialog, history list |
| P3-24 | My certifications page; add to the member bottom nav (`prefetch={false}`) |
| P3-25 | Visual check at 320 px, 375 px, 768 px; a "kiosk distance" check: status readable at 2 m |

### 7.3 Tests

Service tests in `tests/services/`, Vitest + `@cloudflare/vitest-plugin`, calling services directly with actors and an explicit `now`.

**T02 — pass logic** (`tests/services/T02-pass.spec.ts`, plus table-driven unit tests in `tests/unit/pass.spec.ts`)

| # | Case | Expected |
|---|---|---|
| 1 ★ | `actors.member()`, machine requires A, no grant | NOT_CLEARED, `missing=[A]` with training URL, `state=never` |
| 2 ★ | Member with valid A | CLEARED, `earliestExpiry` = A's expiry |
| 3 | Requires A + B, member has only A | NOT_CLEARED, `missing=[B]` only |
| 4 | Requires A + B, member has both | CLEARED; `earliestExpiry` = the earlier of the two |
| 5 | No requirements, active member | CLEARED |
| 6 | Supervised, member with certs | SUPERVISION_REQUIRED |
| 7 | Supervised, `actors.staff()` with certs / `actors.admin()` with certs | CLEARED / CLEARED |
| 8 | Supervised, staff **without** certs | NOT_CLEARED |
| 9 | `actors.nonMember()` | NOT_CLEARED, `not_member` |
| 10 | `actors.member({ status: "suspended" })` with all certs | NOT_CLEARED, `suspended` |
| 11 | Out of service (status set directly in the test DB for now; re-run via the real flow in Phase 5) for member / non-member / staff | OUT_OF_SERVICE for all |
| 12 | Grant expired 1 ms before `now` | NOT_CLEARED, `state=expired`, `since` = expiry |
| 13 | Grant revoked; a newer valid grant exists | CLEARED (the best grant wins) |
| 14 | Unknown token / retired machine | `recognized:false` |
| 15 | `actors.anonymous()` | `UNAUTHENTICATED` |
| 16 | `certifiedForMachine` matches certification validity regardless of OOS/supervision | — |
| 17 | `isGrantValid` and `validGrantSql()` agree on a generated set of grants at boundary times | — |

**T03 — sign-off** (`tests/services/T03-signoff.spec.ts`)

| # | Case | Expected |
|---|---|---|
| 1 ★ | Staff signs off another member | Grant created; `granted_by` = staff; `expires_at` = granted + validity |
| 2 ★ | **Admin signs off themselves** / staff signs off themselves | `SELF_SIGN_OFF` |
| 3 | Direct SQL insert with `granted_by = member_id` | Fails on the `CHECK` constraint (backstop) |
| 4 | Member tries to sign off | `FORBIDDEN` |
| 5 ★ | Validity 12 months → pass at `now = expiry + 1 ms` is NOT_CLEARED | — |
| 6 | Validity null → `expires_at` null → CLEARED far in the future | — |
| 7 ★ | Revoke → the very next pass is NOT_CLEARED (`state=revoked`) | — |
| 8 | Revoke twice → `ALREADY_REVOKED`; revoke own grant → `SELF_REVOKE`; reason missing → `VALIDATION_FAILED` | — |
| 9 ★ | **Same `clientRequestId` twice (sequential, and concurrent via `Promise.all`) → one grant row**; replay returns `created: false` | — |
| 10 | Same `clientRequestId` with a different certification → `IDEMPOTENCY_MISMATCH` | — |
| 11 | Re-grant after expiry → new row; both rows in history | — |
| 12 | Inactive certification → `CERT_INACTIVE`; suspended target → `MEMBER_SUSPENDED` | — |
| 13 | `addMonthsUtc`: Jan 31 + 1 → Feb 28; 2028-01-31 + 1 → Feb 29; Dec + 1 → Jan next year | — |

**Other**

| ID | Test |
|---|---|
| P3-40 | `getMyCertifications`: states valid / expiring_soon (≤ 30 days) / expired / revoked / none |
| P3-41 | `getMemberDetail` includes history with names; `actors.member()` → `FORBIDDEN` |
| P3-42 | Pass data never includes other members' data |
| P3-43 | E2E `tests/e2e/pass-signoff.spec.ts` (Playwright on `next dev` with a throwaway D1): two browser contexts sign up for real (student + staff promoted by the admin), then run demo steps 4–6 |

### 7.4 Manual checks

| ID | Check |
|---|---|
| P3-50 ★ | Steps 4–6 of the demo on staging with a physical phone (student) and a laptop (staff) |
| P3-51 | Pass readable at 1 m and 2 m in makerspace lighting; the ticking seconds are visible |
| P3-52 | Journey C timed: sign-off in ≤ 30 s (PRD 4.2). Record the time |
| P3-53 | Workers Logs on staging: `cpuTime` for `/m/<token>` (all four statuses) well under 10 ms |

---

## 8. Exit criteria

- [ ] T02 and T03 green (with the T02 out-of-service case marked to re-run against the real flow in Phase 5).
- [ ] Demo steps 4–6 work on staging and production with a phone.
- [ ] Sign-off timed at ≤ 30 s.
- [ ] Pass page `cpuTime` recorded on staging.
- [ ] Migration `0003` applied to production.

---

## 9. Decisions and open questions

| # | Item | Status |
|---|---|---|
| D1 | No self sign-off enforced in the service **and** by a DB `CHECK` | Decided |
| D2 | `addMonthsUtc` clamps to month end; expiry fixed at grant time | Decided |
| D3 | Staff can't revoke their own grants (PRD 9: "for other members") | Decided |
| D4 | No sign-off for suspended members | Decided (not in PRD; avoids confusing state) |
| D5 | The missing-cert `state` (`never`/`expired`/`revoked`) is shown to the member | Decided: helps them act; it's their own data |
| D6 | The pass refreshes with `router.refresh()` every 60 s (`<AutoRefresh>`), not a JSON poll | Decided: short-lived page; the board and console poll JSON instead |
| Q1 | Should staff be able to set a custom expiry at sign-off (shorter than the validity)? PRD 5.2 says "with optional expiry", FR-07 gives the formula. Proposed: formula only in the MVP | Proposed |
| Q2 | Should a pass show "expiring soon" (≤ 30 days) as a warning on CLEARED? Proposed: yes, as small text, without changing the status | Proposed |
| Q3 | Should expired certifications be renewable by sign-off without re-training? That's a process question for the interviews (PRD Stage A) | Open |

## 10. Risks

| Risk | Mitigation |
|---|---|
| The pass is wrong because of time-zone or clock errors | Server UTC only; `now` passed to services; boundary tests at ±1 ms |
| Screenshot passes | Live clock + name (mitigation only, PRD 5.4) |
| Pass page slow or over the CPU limit | Server-rendered on every scan: one batched read, small tree, `cpuTime` check (P3-53); first-load JS ≤ 250 KB gz; measured again in Phase 7 |
