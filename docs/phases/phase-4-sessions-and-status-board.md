# Phase 4 — Sessions & Member Status Board

> **Goal:** members record self-reported usage sessions from the pass, and everyone sees a live board of which machines are **Available**, **In use · est. free**, or **Out of service**, without anyone seeing who is using what.

| | |
|---|---|
| PRD coverage | **FR-10** (sessions), **FR-11** (member status board), **FR-08** (revocation/suspension end sessions), FR-18 (recent sessions), Journeys D and F, Section 7.1 (lazy expiry, privacy, estimates labelled), **T04** (session part), **T05**, **T06** |
| Depends on | Phase 3 (pass engine; grants), Phase 2 (`withMachineWrite`) |
| Unlocks | Phase 5 |
| Estimated effort | 4–5 days |
| Demo checkpoint | PRD 5.1 step **7**: student taps **Start session** (60 min) → the board shows the machine **In use · est. free 3:10 pm** |

---

## 1. Outcomes

1. `machine_sessions` table (the PRD's `sessions`) with a **partial unique index**: at most one open session per machine.
2. **Start / extend / end** as server actions with all FR-10 rules, built on the Phase 2 write-token helper and **guarded inserts** that re-check the pass atomically (`technologies.md` §12.2).
3. **Lazy expiry:** sessions past `expected_end_at` are closed with `ended_at = expected_end_at`, `end_reason = 'expired'` on the next write to that machine or the next board/console poll. **No background job.**
4. **Revocation and suspension end the member's affected active sessions** (`authorization_removed`) in the same atomic batch.
5. **Status board** (`/machines`): rooms → tiles with state, estimates, badges and ✔/✖ "cleared for me"; filters; a client component polling the **`GET /api/status-board` route handler** every 30 s with an **ETag short-circuit** that keeps D1 reads near zero when nothing changed.
6. **Privacy guarantee** tested: board responses contain no member identities.

## 2. Scope

**In:** sessions, lazy expiry, session controls on the pass, staff ending sessions, revocation/suspension effects, status board (page + route handler), recent sessions on My certifications and member detail, retire ends active session.

**Out:** session hand-over (P1, PRD 5.3), the console's active-session and "no longer authorized" lists (Phase 6), out-of-service state changes (Phase 5), the "Issue reported" badge data (Phase 5; the field exists now, always `false`).

> **Naming:** the PRD's `sessions` table is named **`machine_sessions`** here so it can't be confused with Better Auth's `session` (sign-in sessions) table.

---

## 3. Data model

Add to `src/db/schema.ts`, `npm run db:generate` → `drizzle/0004_sessions.sql`, review (check the partial indexes came out right), apply locally, then to the deployment. Additive only.

```sql
CREATE TABLE machine_sessions (
  id                       TEXT PRIMARY KEY,
  machine_id               TEXT NOT NULL REFERENCES machines(id),
  member_id                TEXT NOT NULL REFERENCES members(id),
  started_at               INTEGER NOT NULL,
  expected_end_at          INTEGER NOT NULL,
  ended_at                 INTEGER,
  end_reason               TEXT CHECK (end_reason IS NULL OR end_reason IN
                             ('user','staff','expired','machine_down','authorization_removed')),
  ended_by_member_id       TEXT REFERENCES members(id),
  supervision_acknowledged INTEGER NOT NULL DEFAULT 0 CHECK (supervision_acknowledged IN (0,1)),
  client_request_id        TEXT NOT NULL UNIQUE,
  created_at               INTEGER NOT NULL,
  CHECK (expected_end_at > started_at),
  CHECK (expected_end_at - started_at <= 240 * 60000),
  CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- FR-10: one open session per machine (backstop for the guarded insert)
CREATE UNIQUE INDEX machine_sessions_one_open ON machine_sessions(machine_id) WHERE ended_at IS NULL;
-- lazy expiry sweep and the board's open-session read
CREATE INDEX machine_sessions_open_expiry ON machine_sessions(expected_end_at) WHERE ended_at IS NULL;
-- "my recent sessions", member detail, revocation/suspension
CREATE INDEX machine_sessions_member ON machine_sessions(member_id, started_at);
-- machine detail recent sessions (Phase 5), audit questions
CREATE INDEX machine_sessions_machine ON machine_sessions(machine_id, started_at);
```

**Definitions** (server UTC `now`):

- **Open:** `ended_at IS NULL`.
- **Active:** open **and** `now < expected_end_at`.
- **Expired-but-open:** open **and** `expected_end_at <= now`. These still exist in the table until closed lazily, and are treated as **not active** everywhere, even before they're closed.

---

## 4. Domain logic

Session rules live in `src/server/domain/sessions.ts` (pure) and `src/server/services/sessions.ts` (`(db, actor, input, now)`).

### 4.1 Lazy expiry

```sql
-- per machine (inside every machine write batch, before anything else):
UPDATE machine_sessions SET ended_at = expected_end_at, end_reason = 'expired'
WHERE machine_id = :machineId AND ended_at IS NULL AND expected_end_at <= :now;

-- global (status board and console polls, only when the ETag check misses):
UPDATE machine_sessions SET ended_at = expected_end_at, end_reason = 'expired'
WHERE ended_at IS NULL AND expected_end_at <= :now;
```

Both use the partial index (rows read ≈ number of open sessions). If the global sweep changed any rows (`meta.changes > 0`), it's followed by a `data_version` bump. Reads that don't write (the pass page, My certifications) **compute** "active" from `expected_end_at` and don't close anything.

### 4.2 Start a session (`startSession`)

Input: `{ machineId, expectedMinutes?: 15–240 (default typical_session_minutes), supervisionAcknowledged?: boolean, clientRequestId: uuid }`.

**Checks (read phase), in order:**

| # | Check | `ServiceError` code |
|---|---|---|
| 1 | Actor is an active member | `NOT_A_MEMBER` / `SUSPENDED` |
| 2 | Rate limit (Phase 6 wires `RL_ACTIONS`) | `RATE_LIMITED` |
| 3 | `clientRequestId` already used by this member → return that session | (replay, not an error) |
| 4 | Machine exists and isn't retired | `NOT_FOUND` / `MACHINE_RETIRED` |
| 5 | Machine is out of service | `MACHINE_OUT_OF_SERVICE` |
| 6 | `computePass` → NOT_CLEARED | `NOT_CLEARED` (with the pass in `details`) |
| 7 | SUPERVISION_REQUIRED and `supervisionAcknowledged !== true` | `SUPERVISION_ACK_REQUIRED` |
| 8 | An **active** session exists on the machine (mine) | `ALREADY_IN_SESSION` `{ sessionId }` |
| 9 | An **active** session exists on the machine (someone else's) | `MACHINE_BUSY` `{ since, estFreeAt }` (no identity) |

**Write phase** (`withMachineWrite` from `src/server/machine-write.ts`), one batch:

1. `UPDATE machines SET write_token = :T1 WHERE id = :id AND write_token = :T0 AND status = 'available'`
2. Close expired-but-open sessions on this machine (§4.1), guarded by `T1`.
3. Guarded insert that **re-verifies** the pass conditions atomically (the `grants` condition comes from Phase 3's `validGrantSql()`):

```sql
INSERT INTO machine_sessions (id, machine_id, member_id, started_at, expected_end_at,
                              supervision_acknowledged, client_request_id, created_at)
SELECT :id, :machineId, :memberId, :now, :now + :minutes * 60000, :ack, :clientRequestId, :now
WHERE EXISTS (SELECT 1 FROM machines WHERE id = :machineId AND write_token = :T1 AND status = 'available')
  AND EXISTS (SELECT 1 FROM members  WHERE id = :memberId AND status = 'active')
  AND NOT EXISTS (
        SELECT 1 FROM machine_requirements r
        WHERE r.machine_id = :machineId
          AND NOT EXISTS (SELECT 1 FROM grants g
                          WHERE g.member_id = :memberId AND g.certification_id = r.certification_id
                            AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > :now)));
```

4. `UPDATE settings SET data_version = data_version + 1`

**Result handling:**

| Outcome | Meaning | Result |
|---|---|---|
| Stmt 1 changed 0 rows | Another write touched the machine (or it went out of service) | Retry from the read phase (≤ 3), then `CONFLICT_RETRY` |
| Stmt 1 changed 1, insert changed 0 | A grant was revoked, expired, or the member was suspended between read and write | `PASS_CHANGED` (the page refreshes and shows the new pass) |
| Batch error on `machine_sessions_one_open` | Shouldn't happen with the token; treated as busy | `MACHINE_BUSY` |
| Insert changed 1 | Success | `{ session }` |

### 4.3 Extend (`extendSession`)

- **Owner only.** Input `{ sessionId, minutes: 15 }` (allowed: 5–60; the UI sends 15).
- Session must be **active** → else `SESSION_ENDED`.
- The machine must not be out of service, and the member must still be active and certified (pass status CLEARED or SUPERVISION_REQUIRED) → else `NOT_CLEARED`. You can't extend once you're no longer authorized. That isn't stated in the PRD; it's recorded as a decision (§9).
- `new_end = min(expected_end_at + minutes, started_at + 240 min)`. If `expected_end_at` already equals the cap → `SESSION_AT_MAX`.
- Guarded update: `UPDATE … SET expected_end_at = :newEnd WHERE id = :id AND ended_at IS NULL AND expected_end_at > :now AND member_id = :actorMemberId`, plus the `data_version` bump.

### 4.4 End (`endSession`)

- Owner → `end_reason = 'user'`. Staff/admin ending **someone else's** → `'staff'` with `ended_by_member_id`. A member ending someone else's → `FORBIDDEN`.
- Session already ended → returns the existing state (idempotent).
- Session expired-but-open → closed as `'expired'` with `ended_at = expected_end_at` (what really happened).
- Otherwise: `UPDATE … SET ended_at = :now, end_reason = …, ended_by_member_id = :actor WHERE id = :id AND ended_at IS NULL`, plus the `data_version` bump.

### 4.5 Revocation and suspension end sessions (FR-08)

**Revocation**: the Phase 3 `revokeGrant` batch becomes:

```sql
-- 1. close the member's expired-but-open sessions honestly
UPDATE machine_sessions SET ended_at = expected_end_at, end_reason = 'expired'
WHERE member_id = :memberId AND ended_at IS NULL AND expected_end_at <= :now;
-- 2. revoke
UPDATE grants SET revoked_at = :now, revoked_by_member_id = :actor, revoke_reason = :reason
WHERE id = :grantId AND revoked_at IS NULL;
-- 3. end active sessions on machines that need this certification, unless another valid grant still covers it
UPDATE machine_sessions SET ended_at = :now, end_reason = 'authorization_removed', ended_by_member_id = :actor
WHERE member_id = :memberId AND ended_at IS NULL AND expected_end_at > :now
  AND machine_id IN (SELECT machine_id FROM machine_requirements WHERE certification_id = :certId)
  AND NOT EXISTS (SELECT 1 FROM grants g WHERE g.member_id = :memberId AND g.certification_id = :certId
                    AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > :now));
-- 4. data_version bump
```

Order matters: step 3's `NOT EXISTS` sees the revocation from step 2.

**Suspension**: the Phase 1 status-change service adds: end **all** of the member's active sessions with `authorization_removed` (after closing expired ones as `expired`).

**Retire** (Phase 2) adds: end the machine's active session with `end_reason = 'staff'`.

**Mid-session certification expiry does not end a session** (PRD 7.1). Phase 6's console flags it.

### 4.6 Status board

**Tile state** (exactly one):

| State | Condition | Shown |
|---|---|---|
| **Out of service** | `machines.status = 'out_of_service'` | reason (`issue reported` / `maintenance` / `other`), since `status_changed_at`, public note, expected back (Phase 5 writes these) |
| **In use** | Active session exists | "since 2:14 pm", "**est.** free 3:10 pm" |
| **Available** | Otherwise | — |

**Badges:** *Supervision required* (`machines.supervised`); *Issue reported (still usable)* (Phase 5: an open fault with `took_out_of_service = 0`).

**✔/✖ cleared for me:** `computePass(...).certifiedForMachine`. True when the viewer is an active member with all requirements valid. It ignores out-of-service and supervision (those have their own state and badge), so ✔/✖ answers "am I trained for this?".

**Never included** (PRD 7.1, FR-11): member IDs, names or emails; session IDs; fault descriptions; reporter identities; QR tokens.

The board is built by a pure function `buildBoard()` in `src/server/domain/board.ts` (machines + sessions + requirements + grants + now → rooms/tiles + validUntil), used by both the route handler and the page's first render.

### 4.7 ETag short-circuit (protects the free quota)

```
ETag: W/"b.<data_version>.<memberId>.<role>.<validUntil>"
validUntil = min( earliest expected_end_at among active sessions,
                  earliest expires_at (> now) among the viewer's grants for any required cert,
                  now + 10 minutes )                          ← periodic self-healing refresh
```

`src/app/api/status-board/route.ts` (`GET`), with `If-None-Match`:

1. `getActor()` (session from the cookie cache + the member row). Not signed in → **401**; not an active member → **403**.
2. Parse the client's ETag. Read `settings.data_version` (1 row).
3. If `data_version`, `memberId` and `role` match **and** `now < validUntil` → **304** (≈ 2 rows read, no writes, almost no CPU).
4. Otherwise run the global expiry sweep (§4.1) and compute the full board (§4.6) in one read batch: rooms, non-retired machines, requirements, open sessions, the viewer's grants (Phase 5 adds open-fault flags). Return **200** JSON with a new ETag and `Cache-Control: private, no-store`.

A forged ETag can only make the forger's own board stale. Nobody else is affected.

**Why a route handler and not `router.refresh()`:** a refresh would server-render the whole board page every 30 s, spending CPU and the full set of D1 reads on every poll (`technologies.md` §5.2). The JSON route usually answers 304.

**Cost at Pro scale (60 machines):** a 200 costs ≈ 200 rows read; a 304 costs ≈ 2. See `technologies.md` §13.

---

## 5. Operations

| Operation | Kind | Auth | Input | Result |
|---|---|---|---|---|
| `startSession` | Server action (`src/actions/sessions.ts`) | member | `{ machineId, expectedMinutes?, supervisionAcknowledged?, clientRequestId }` | `{ session: { id, startedAt, expectedEndAt } }`; codes per §4.2 |
| `extendSession` | Server action | member (owner) | `{ sessionId, minutes }` | `{ session }`; codes per §4.3 |
| `endSession` | Server action | member (owner) / staff | `{ sessionId }` | `{ session: { …, endedAt, endReason } }` |
| `getStatusBoard` | Page data (`src/data/board.ts`) | member | — | Board (§5.1) for the first render, plus its ETag |
| `GET /api/status-board` | Route handler | member | `If-None-Match?` | 200 board JSON (§5.1) / 304; 401 / 403 |
| `getMachineByToken` | Page data | user | `{ token }` | Phase 3 shape **+** `currentSession`, `actions` (§5.2) |
| `getMyCertifications` | Page data | member | — | **+** `recentSessions` (last 10: machine name, started, ended, end reason) |
| `getMemberDetail` | Page data | staff | `{ memberId }` | **+** `recentSessions` (last 20) and `activeSessions` |

All three session actions finish with `refresh()`, so the pass page shows the new state in the same response.

### 5.1 Board JSON

```jsonc
{
  "makerspace": { "name": "Demo Makerspace", "timezone": "America/Edmonton" },
  "generatedAt": "2026-11-22T21:41:00.000Z",
  "validUntil": "2026-11-22T22:10:00.000Z",
  "rooms": [
    {
      "id": "…", "name": "Laser Room",
      "machines": [
        {
          "id": "…", "name": "Epilog Laser #1",
          "state": "in_use",                                   // available | in_use | out_of_service
          "inUse": { "since": "…", "estFreeAt": "…" },         // only when in_use
          "outOfService": null,                                // { reason, since, note, expectedBackAt }
          "supervisionRequired": false,
          "issueReported": false,
          "clearedForMe": true
        }
      ]
    }
  ]
}
```

Rooms are ordered by `sort_order, name`; machines by name. Rooms with no live machines are omitted.

### 5.2 Pass additions

```jsonc
"currentSession": {
  "state": "other",                 // none | mine | other
  "id": null,                       // only when "mine"
  "startedAt": "…", "expectedEndAt": "…"
},
"actions": {
  "canStart": false,                // pass allows it and the machine is free
  "requiresSupervisionAck": false,
  "durationOptions": [15, 30, 60, 120],
  "defaultMinutes": 60,             // typical_session_minutes
  "canExtend": false, "canEnd": false,
  "canStaffEnd": true               // viewer is staff/admin and someone else's session is active
}
```

---

## 6. UI

### 6.1 Pass page session controls (Journey D)

A client component `<SessionControls>` on the pass page (`src/app/(member)/m/[token]/`), with forms bound to the session server actions via `useActionState`.

| Pass state | Machine free | Controls |
|---|---|---|
| CLEARED | yes | Duration chips **15 · 30 · 60 · 120** (default = typical, pre-selected; "Other…" for 15–240) → **Start session** |
| SUPERVISION REQUIRED | yes | Same, plus a required checkbox **"A supervisor is present"** ("recorded as self-reported") before Start is enabled |
| CLEARED / SUPERVISION | **mine** | "Your session · started 2:14 pm · **est.** end 3:14 pm", **+15 min** (hidden at the 240-min cap: "Maximum 4 hours"), **Done** |
| CLEARED / SUPERVISION | **someone else's** | "In use since 2:14 pm · **est.** free 3:10 pm"; Start disabled. **Staff/admin:** "End this session" (alert dialog: "Only do this if the machine is actually free") |
| NOT CLEARED / OUT OF SERVICE | — | No Start button (PRD Journey D) |

- `clientRequestId` for Start is generated when the controls mount and regenerated after each success, sent as a hidden field.
- Error toasts (sonner) by code: `MACHINE_BUSY` ("Someone just started a session"), `PASS_CHANGED` (the action's `refresh()` already shows the new pass), `CONFLICT_RETRY` ("Please try again"), `RATE_LIMITED`.
- Buttons show a pending state (`useFormStatus`) so a slow network doesn't invite double taps.

### 6.2 Status board (`src/app/(member)/machines/page.tsx`, the member home)

- **Server Component** page renders the shell and, inside `<Suspense>`, a first board from `getStatusBoard()` (so the first paint has data). It passes the board and its ETag to a client component **`<StatusBoard initial etag>`**.
- **`<StatusBoard>`** polls `GET /api/status-board` with the shared **`usePoll(url, { intervalMs: 30_000, initialData, initialEtag })`** hook (`src/components/use-poll.ts`): sends `If-None-Match`, keeps data on 304, pauses while the tab is hidden (`visibilitychange`), refetches on focus, backs off to 120 s after 10 min without interaction. Not `router.refresh()` (see §4.7).
- Header: makerspace name · "updated 2:41 pm" (last successful check, including 304s). If the last success was more than 2 min ago: an amber "Not updating. Check your connection".
- Filters: room select ("All rooms"); checkbox **"Only machines I'm cleared for"**. Both client-side and remembered in `localStorage`.
- Room sections → responsive grid of tiles (1 column at 320 px, 2 from 480 px, 3–4 on desktop).
- **Tile:** status colour bar + icon + **word** (AVAILABLE / IN USE / OUT OF SERVICE); machine name; ✔ or ✖ with a text alternative ("You're cleared" / "Not cleared"); detail lines ("est. free 3:10 pm"; "since 11:05 am · issue reported" + note in quotes + "expected back Thu 2 pm"); badge chips.
- Any links on the board (to My certifications) use `prefetch={false}`.
- **States:** loading skeleton tiles (`<Suspense>` fallback); empty ("No machines yet"); filter-empty ("You're not cleared for any machines yet. See My certifications"); error with retry; daily-limit banner (503 `DAILY_LIMIT` from the route handler).
- **Accessibility:** each tile is an `article` with an accessible name like "Epilog Laser #1, in use, estimated free 3:10 pm, you're cleared"; no information by colour alone.
- **CPU:** the board is a hot path. The server render happens once per visit; polls hit the route handler. Keep tile components simple (no per-tile animation on the poll update path).

The board matches the PRD 8.1 sketch.

---

## 7. Tasks

★ = needed for the PRD 5.1 minimum demo.

### 7.1 Server

| ID | Task |
|---|---|
| P4-01 ★ | `machine_sessions` in `src/db/schema.ts`; `npm run db:generate` → `drizzle/0004_sessions.sql`; review; apply locally, then to the deployment |
| P4-02 ★ | `src/server/domain/sessions.ts`: `isActive(session, now)`, `capEnd(startedAt)`, expiry SQL builders |
| P4-03 ★ | `startSession` service + action (§4.2) with guarded insert and all result cases |
| P4-04 ★ | `endSession` service + action (§4.4) |
| P4-05 | `extendSession` service + action (§4.3) |
| P4-06 | Revocation batch extension (§4.5) |
| P4-07 | Suspension batch extension (§4.5) |
| P4-08 | Retire ends active session |
| P4-09 ★ | `buildBoard()` in `src/server/domain/board.ts` (pure) |
| P4-10 ★ | `getStatusBoard` (page data) and `src/app/api/status-board/route.ts` with the global expiry sweep and ETag/304 (§4.7) |
| P4-11 ★ | `getMachineByToken` additions (§5.2) |
| P4-12 | `recentSessions` / `activeSessions` on My certifications and member detail |
| P4-13 | Dev-only logging of `rows_read` for the board route (200 vs 304), to verify the §4.7 cost estimate |

### 7.2 UI

| ID | Task |
|---|---|
| P4-20 ★ | `<SessionControls>` on the pass (§6.1), with `clientRequestId` per Start |
| P4-21 ★ | `usePoll` hook (shared with the Phase 6 console) |
| P4-22 ★ | Status board page + `<StatusBoard>` client component, tiles, filters, "updated at", polling and back-off (§6.2) |
| P4-23 | `<MachineTile>` and `<StatusBadge>` variants for in-use / out-of-service, matching the pass palette |
| P4-24 | Recent sessions on My certifications and member detail; staff "End session" on member detail |
| P4-25 | Member bottom nav: **Machines** (home) · My certs · Help (all `prefetch={false}`) |

### 7.3 Tests

Service tests in `tests/services/` (Vitest + `@cloudflare/vitest-plugin`, real local D1), calling services directly with actors and an explicit `now`. Route-handler tests call the exported `GET` with a `Request` built in the test, with the session cookie of a test user created through Better Auth's server API.

**T05 — sessions** (`tests/services/T05-sessions.spec.ts`)

| # | Case | Expected |
|---|---|---|
| 1 ★ | CLEARED member starts 60 min | Session created; `expected_end_at = now + 60 min` |
| 2 ★ | **Five concurrent `startSession` calls by five cleared members on one machine** (`Promise.all`) | Exactly **one** succeeds; others `MACHINE_BUSY` (after any retries); exactly one open row |
| 3 ★ | Start on a busy machine | `MACHINE_BUSY`, no identity in `details` |
| 4 | Supervised machine, member without ack → `SUPERVISION_ACK_REQUIRED`; with ack → created and `supervision_acknowledged = 1`; staff without ack → created | — |
| 5 | NOT_CLEARED → `NOT_CLEARED`; out of service → `MACHINE_OUT_OF_SERVICE`; retired → `MACHINE_RETIRED` | — |
| 6 | `expectedMinutes` 14 / 241 → `VALIDATION_FAILED`; omitted → typical minutes | — |
| 7 | Extend +15 repeatedly → stops at exactly 240 min total; at the cap → `SESSION_AT_MAX`; another member extends → `FORBIDDEN` | — |
| 8 | End own → `user`; staff ends another's → `staff` + `ended_by`; member ends another's → `FORBIDDEN`; ending twice → unchanged | — |
| 9 ★ | **Expiry:** start 15 min at `T0`; call `getStatusBoard` at `T0 + 20 min` → that session has `ended_at = expected_end_at`, `end_reason = expired` | — |
| 10 | Expired-but-open session doesn't block a new start (closed inside the start batch, without a board poll) | — |
| 11 | Same `clientRequestId` twice → one session; second call returns the same session | — |
| 12 | **Race: start vs revoke** (concurrent) → at the end there's no active session for a member without a valid grant | — |
| 13 | Requirement added to the machine (admin) during a start → start retries and returns `NOT_CLEARED` or `PASS_CHANGED` | — |

**T06 — status board** (`tests/services/T06-board.spec.ts` for `buildBoard`/`getStatusBoard`, `tests/routes/status-board.spec.ts` for the route handler)

| # | Case | Expected |
|---|---|---|
| 1 ★ | Available / In use (`since`, `estFreeAt`) / Out of service (status set in the test DB for now; re-run via the real flow in Phase 5) | Correct state per tile |
| 2 | Supervision badge | `supervisionRequired = true` on supervised machines |
| 3 | ✔/✖ matches `computePass().certifiedForMachine` for: certified member, uncertified member, staff without certs, member with an expired grant | — |
| 4 ★ | **Privacy:** serialise the route handler's JSON and assert it contains **none** of the seeded member IDs, emails, display names, session IDs or QR tokens | — |
| 5 | Retired machines absent; empty rooms omitted; room order respected | — |
| 6 | Route handler: suspended → 403; non-member → 403; no session cookie → 401 | — |
| 7 | ETag: second request unchanged → 304; after any mutation → 200; after `validUntil` passes → 200 and the expired session is closed; another member's ETag → 200 | — |

**T04 — revocation/suspension end sessions** (session part, `tests/services/T04-authorization-effects.spec.ts`; console part in Phase 6)

| # | Case | Expected |
|---|---|---|
| 1 | Revoke cert A while the member has an active session on a machine requiring A | Session ended, `authorization_removed`, `ended_by` = revoker |
| 2 | Same member's session on a machine that **doesn't** require A | Still active |
| 3 | Member has two valid grants for A; one revoked | Session continues |
| 4 | Suspend member with active sessions | All ended, `authorization_removed` |
| 5 | Grant expires mid-session (`now` past the expiry) | Session **not** ended (flagged in Phase 6) |

**E2E** (`tests/e2e/sessions-board.spec.ts`, Playwright on `next dev` with a throwaway D1, real sign-up): student starts a 60-min session on the pass; a second browser context on `/machines` sees *In use · est. free* within one poll; student taps Done; the board shows *Available*.

### 7.4 Manual checks

| ID | Check |
|---|---|
| P4-40 ★ | Demo step 7 on the deployed app: start a 60-min session on a phone → board on a second phone shows *In use · est. free* within 30 s |
| P4-41 | Two phones tap Start on the same machine at the same moment → one gets the session, the other sees "Someone just started a session" |
| P4-42 | Board status check usability (PRD 4.2): 5 people find "a free machine I'm cleared for, and when a busy one frees up", target ≤ 10 s for 4 of 5 |
| P4-43 | Leave the board open in a background tab for 10 min → no requests in `wrangler tail` while hidden |
| P4-44 | Workers Logs on the deployment: `cpuTime` for the `/machines` render, `/api/status-board` 200 and 304, and the start-session action, all well under 10 ms |

---

## 8. Exit criteria

- [ ] T05, T06 and the T04 session cases green; E2E green.
- [ ] Demo step 7 works on the deployed app.
- [ ] Measured board cost recorded in `technologies.md` §13.1: rows read for 304 and 200 at the demo data size.
- [ ] Board and session `cpuTime` recorded on the deployment.
- [ ] Migration `0004` applied to the deployment.

---

## 9. Decisions and open questions

| # | Item | Status |
|---|---|---|
| D1 | Table named `machine_sessions` (PRD: `sessions`) to avoid confusion with Better Auth's `session` | Decided |
| D2 | Extension requires the member to still be authorized | Decided (not in PRD; prevents extending after a lapse) |
| D3 | Ending an expired-but-open session records `expired` at `expected_end_at`, not "user at now" | Decided: truthful record |
| D4 | ✔/✖ means "certified", independent of out-of-service and supervision | Decided: those have their own state/badge |
| D5 | Board ETag includes a ≤ 10-min `validUntil` for self-healing | Decided |
| D6 | The board polls a JSON route handler (`usePoll`), not `router.refresh()` | Decided: 304s cost ~2 rows and almost no CPU |
| Q1 | May a member have open sessions on two machines at once? The PRD only limits one session **per machine**. Proposed: allow it (laser + 3D printer is common); revisit after interviews | Proposed |
| Q2 | Should tapping a board tile show the machine's requirements and training links ("what do I need")? Not in PRD. Proposed: P1 | Proposed |
| Q3 | Should a kiosk display (a TV at the door) be supported? It's just the board in a browser signed in as a member, at about 1,200 requests per 10 hours. Note it in the help page | Note |

## 10. Risks

| Risk | Mitigation |
|---|---|
| Board polling uses up the free request quota | ETags, visible-only polling, back-off, `prefetch={false}`; see `technologies.md` §13 |
| Board render exceeds the CPU limit at 60 machines | One server render per visit; polls go to the route handler; simple tiles; `cpuTime` check (P4-44) |
| Clock edge cases (session exactly at `expected_end_at`) | Strict `now < expected_end_at` everywhere; ±1 ms tests |
| Guarded-insert SQL drifts from `computePass` | Tests 12–13 cross-check; both use the same validity rule (`isGrantValid` / `validGrantSql()`, tested to agree in Phase 3) |
| Students forget to tap Done | Auto-expiry at the expected time (PRD); "est." wording everywhere |
