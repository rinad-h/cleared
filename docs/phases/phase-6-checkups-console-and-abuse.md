# Phase 6 — Checkups, Console Home & Abuse Protection

> **Goal:** close out the maintenance side and the staff overview. Recurring checkups with due/overdue lists, a console home that shows a supervisor everything that matters in one glance, per-member rate limits, and a full authorization sweep against PRD Section 9.

| | |
|---|---|
| PRD coverage | **FR-16** (checkups), **FR-17** (staff console home), **FR-19** (basic abuse protection), FR-15 (checkup link on service records), Journey H, Section 8.2 (Console home, Checkups), Section 9 (full sweep), **T04** (console part), **T09**, **T10** (full), **T11** |
| Depends on | Phase 5 (service records, faults, machine detail) |
| Unlocks | Phase 7 |
| Estimated effort | 3–4 days |
| Demo checkpoint | Staff opens the console home and, in ≤ 20 s, says who has a recorded session on which machine and which machines are out of service (PRD 4.2 supervisor check); a checkup shows *Overdue* → technician logs it → it moves out of the list |

---

## 1. Outcomes

1. **Checkups:** per-machine recurring tasks (name, interval in days, instructions, active). Next due is **computed on read**: latest linked `scheduled_checkup` record (or the checkup's creation) + interval. **Due soon** (≤ 7 days) and **Overdue** lists. Advisory only; **never blocks use**.
2. Service records can link a checkup (`checkup_id`), validated in the service.
3. **Console home** (`/console`): open-fault and checkup counts, out-of-service machines, **active sessions (labelled self-reported)**, and **sessions whose member is no longer authorized** (for example a certification that expired mid-session). Polls every 30 s through `GET /api/console` with an ETag.
4. **Rate limits** (FR-19): session starts, fault reports and joins limited per member/user (20/min) → `RATE_LIMITED`.
5. **T10 full sweep**: every row of PRD Section 9 is tested against the services for every actor kind, and every server action is proven to go through the shared actor helper.
6. **T11**: persistence across refresh and redeploy confirmed on the deployed app.

## 2. Scope

**In:** checkups CRUD and lists, checkup linking, console home (page + polling route handler), rate limits (binding or D1 fallback), validation sweep, T10 sweep, T11.

**Out:** checkup email reminders (P1, email alerts), fault assignment (P1), shared cross-location rate limits (P1), analytics (P2). Sign-in and sign-up brute-force limits are already handled by Better Auth's database-stored limiter (Phase 1).

---

## 3. Data model

Migration `drizzle/0006_checkups.sql` (+ `drizzle/0007_rate_limits.sql` only if spike P0 showed the rate-limit binding isn't available on Free).

```sql
CREATE TABLE checkups (
  id                   TEXT PRIMARY KEY,
  machine_id           TEXT NOT NULL REFERENCES machines(id),
  name                 TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  interval_days        INTEGER NOT NULL CHECK (interval_days BETWEEN 1 AND 730),
  instructions         TEXT CHECK (instructions IS NULL OR length(instructions) <= 2000),
  active               INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by_member_id TEXT NOT NULL REFERENCES members(id),
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE INDEX checkups_machine ON checkups(machine_id);

-- Fallback only (technologies.md §4.4):
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,         -- e.g. 'start:<memberId>'
  window_start INTEGER NOT NULL,         -- floor(now / 60000) * 60000
  count        INTEGER NOT NULL
);
```

`service_records.checkup_id` already exists (Phase 5) with the partial index `service_records_checkup (checkup_id, performed_at)`, which makes "latest record per checkup" an index lookup. The fallback table is named `rate_limits` so it doesn't clash with Better Auth's own `rate_limit` table.

---

## 4. Domain logic

### 4.1 Next due (FR-16)

```
lastDoneAt = MAX(performed_at) FROM service_records
             WHERE checkup_id = c.id AND type = 'scheduled_checkup'
base       = lastDoneAt ?? c.created_at
nextDueAt  = base + interval_days × 86,400,000 ms
state      = nextDueAt <= now                   → "overdue"
             nextDueAt <= now + 7 days          → "due_soon"
             otherwise                          → "ok"
```

- Only **active** checkups on **non-retired** machines appear in lists.
- Changing `interval_days` takes effect immediately (next due is recomputed from `base`).
- Deactivating hides the checkup. Reactivating uses the same rule (a long-inactive checkup will usually be overdue at once, which is intended).
- **Display:** due dates are shown as dates in the makerspace time zone ("due Nov 4"). Overdue shows "overdue by 3 days".
- Advisory only: no effect on passes, sessions or the member board (PRD FR-16).
- Pure functions in `src/server/domain/checkups.ts`: `nextDue`, `checkupState`, `nextBoundary`.

SQL used for lists (one query, index-backed). In a Drizzle `sql` template, use fully qualified raw names in the correlated subquery (`technologies.md` §12.1):

```sql
SELECT c.*, m.name AS machine_name, r.name AS room_name,
       (SELECT MAX(s.performed_at) FROM service_records s
        WHERE s.checkup_id = c.id AND s.type = 'scheduled_checkup') AS last_done_at
FROM checkups c
JOIN machines m ON m.id = c.machine_id AND m.status <> 'retired'
JOIN rooms r ON r.id = m.room_id
WHERE c.active = 1;
-- next_due and state computed in TypeScript with the request's `now`
```

### 4.2 Checkup link on service records

`logServiceRecord` (Phase 5) now accepts `checkupId`:

| Rule | Error |
|---|---|
| The checkup exists, is **active**, and belongs to **this machine** | `INVALID_CHECKUP` |
| `type` must be `scheduled_checkup` when `checkupId` is set | `CHECKUP_TYPE_MISMATCH` |
| Corrections can't link a checkup (Phase 5 rule) | `CORRECTION_NO_EFFECTS` |

The validation is in the service because SQLite can't add a foreign key to an existing column (README §4.2). To keep it race-safe, the insert is guarded: `… WHERE EXISTS (SELECT 1 FROM checkups WHERE id = :checkupId AND machine_id = :machineId AND active = 1)`.

### 4.3 Console home (FR-17)

Assembled by a pure function in `src/server/domain/console.ts` and loaded by `services/console.getConsole(db, actor, now)`.

| Section | Source | Notes |
|---|---|---|
| **Counts** | open faults (all / out-of-service), checkups due soon, overdue | — |
| **Out-of-service machines** | `machines WHERE status = 'out_of_service'` (index) | reason, since, note, expected back, open fault count |
| **Active sessions** | `machine_sessions` open + not expired (global expiry sweep first, as on the board) | member name, machine, room, started, **est.** end, supervision acknowledged. Header: "Self-reported by members" |
| **No longer authorized** | active sessions where `computePass(...).certifiedForMachine = false` for that member and machine | Typical causes: certification **expired mid-session**, or an admin **added a requirement** mid-session. Revocation and suspension already end sessions (Phase 4), so they won't appear here. Each row shows the reason ("Laser Cutter — Basic expired 2:30 pm") and an **End session** button |

**Delivery:** the `/console` page renders the first snapshot on the server (page data), then a client component polls `GET /api/console` every 30 s with `If-None-Match` (the shared `usePoll` hook). It doesn't use `router.refresh()`: a 304 costs ~2 rows and almost no CPU, while a refresh re-renders the whole page (`technologies.md` §5.2).

**ETag** (same scheme as the board, Phase 4):

```
validUntil = min( earliest expected_end_at of active sessions,
                  earliest future expires_at among grants of members with active sessions (relevant certs),
                  earliest future checkup boundary (nextDueAt − 7 days, or nextDueAt),
                  now + 10 minutes )
ETag = W/"c.<data_version>.<memberId>.<role>.<validUntil>"
```

### 4.4 Rate limits (FR-19)

| Action | Key | Limit | Where |
|---|---|---|---|
| Start session | `start:<memberId>` | 20 / 60 s | `services/sessions.startSession` |
| Report fault | `fault:<memberId>` | 20 / 60 s | `services/faults.reportFault` |
| Join | `join:<authUserId>` | 20 / 60 s | `services/membership.join` |
| Sign-in / sign-up | Better Auth limiter, database storage | Phase 1 rules (5/min sign-in, 3/min sign-up) | Phase 1, unchanged |

- **Binding path:** a `RateLimiter` interface with `limit(key): Promise<boolean>`. The production implementation calls `getCloudflareContext().env.RL_ACTIONS.limit({ key })`. Over the limit → `ServiceError("RATE_LIMITED")` → the action returns `{ ok: false, code: "RATE_LIMITED" }` and the UI shows "Try again in a minute".
- **D1 fallback path:**

```sql
INSERT INTO rate_limits (key, window_start, count) VALUES (:key, :window, 1)
ON CONFLICT(key) DO UPDATE SET
  count        = CASE WHEN window_start = :window THEN count + 1 ELSE 1 END,
  window_start = :window
RETURNING count;            -- > 20 → RATE_LIMITED
```

One row write per limited action. That's negligible next to the 100k/day write limit.

- The limiter is **passed into the service** (dependency injection), so tests use a fake limiter and the check runs **after** the actor is known (keys are member/user IDs) and **before** any D1 reads for the action.

### 4.5 Input validation sweep (FR-19 "All input validated and escaped")

- Every server action parses its input with a Zod schema through the shared `parse()` helper; every route handler parses its query. The action-wrapper test (§7.3) also asserts each action declares a schema.
- Strings: trimmed; control characters (except newline/tab in long text) rejected; maximum lengths match the DB `CHECK`s exactly. A test compares the Zod limits with the `CHECK` constraints in `drizzle/*.sql` for every text column.
- URLs (`training_url`) are restricted to http/https and displayed as links with `rel="noopener noreferrer"`.
- No HTML rendering of user input: all text goes through React. `dangerouslySetInnerHTML` is banned by an ESLint rule.
- IDs validated as UUIDs; tokens as 22-char base64url.

---

## 5. Operations

| Operation | Kind | Auth | Input | Result |
|---|---|---|---|---|
| `listMachineCheckups` | Page data (`src/data/checkups.ts`) | staff | `{ machineId, includeInactive? }` | `[{ id, name, intervalDays, instructions, active, lastDoneAt, nextDueAt, state }]` |
| `createCheckup` | Server action (`src/actions/checkups.ts`) | staff | `{ machineId, name, intervalDays, instructions? }` | `{ ok, checkupId }` |
| `updateCheckup` | Server action | staff | `{ checkupId, name?, intervalDays?, instructions?, active? }` | `{ ok }` |
| `listDueCheckups` | Page data | staff | `{ due: "soon" \| "overdue" \| "all" }` | Across machines: `[{ checkup…, machine: { id, name, roomName } }]`; overdue sorted by most overdue, due soon by soonest |
| `getConsole` (first render) | Page data (`src/data/console.ts`) | staff | — | §5.1 |
| Console poll | Route handler `GET /api/console` | staff | `If-None-Match?` | 200 §5.1 + `ETag` / 304. 401 signed out, 403 member |
| `logServiceRecord` | Server action | staff | **+** `checkupId` now accepted | — |
| `getMachineDetail` | Page data | staff | — | **+** `checkups` |
| `endSession` (from the console) | Server action (Phase 4) | staff | `{ sessionId }` | `{ ok }` |

### 5.1 Console data

```jsonc
{
  "generatedAt": "…", "validUntil": "…",
  "counts": { "openFaults": 3, "outOfServiceFaults": 1, "checkupsDueSoon": 2, "checkupsOverdue": 1 },
  "outOfServiceMachines": [
    { "id": "…", "name": "Bandsaw", "roomName": "Wood Shop", "reason": "issue_reported",
      "since": "…", "note": "Blade replacement", "expectedBackAt": "…", "openFaultCount": 1 }
  ],
  "activeSessions": [
    { "id": "…", "member": { "id": "…", "displayName": "Demo Student 1" },
      "machine": { "id": "…", "name": "Epilog Laser #1", "roomName": "Laser Room" },
      "startedAt": "…", "expectedEndAt": "…", "supervisionAcknowledged": false }
  ],
  "noLongerAuthorized": [
    { "sessionId": "…", "member": { "id": "…", "displayName": "Demo Student 2" },
      "machine": { "id": "…", "name": "Metal Lathe" },
      "missing": [ { "id": "…", "name": "Lathe — Basic", "state": "expired", "since": "…" } ] }
  ]
}
```

---

## 6. UI

| Route | Screen | Contents |
|---|---|---|
| `src/app/console/page.tsx` | **Console home** | Server-rendered first snapshot inside `<Suspense>`, then a client `ConsoleLive` component polling `/api/console`. Four count cards (Open faults · Out of service · Checkups due soon · Overdue), each linking to its list. **Out of service** list. **Active sessions** table/cards with the "Self-reported" label and an "est. end" column, plus End session per row (server action). **No longer authorized** (amber, only when not empty) with reason and End session. "Updated 2:41 pm". Replaces the Phase 2 setup checklist card (the checklist stays visible to admins until all its steps are done) |
| `src/app/console/checkups/page.tsx` | **Checkups** | Tabs **Overdue** / **Due soon** / **All** (`?tab=`). Rows: checkup name, machine + room, interval ("every 14 days"), last done, next due / "overdue by 3 days", **Log checkup** (opens Log service with `type = scheduled_checkup`, `checkupId`, outcome chips *Passed* / *Issues found*) |
| `src/app/console/machines/[id]/page.tsx` | **Machine detail** (+ Checkups) | Section listing checkups with state chips; Add / Edit dialog (server-action forms: name, interval in days with presets 7/14/30/90/180/365, instructions); Deactivate/Reactivate |
| Log service form | (+ checkup select) | When type = *Scheduled checkup*, show "Which checkup?" (this machine's active checkups) and its instructions read-only for reference |

Console nav final order: **Home** · Faults (count) · Checkups (overdue count) · Machines · Members · Rooms · Labels · Certifications (admin) · Settings (admin). Nav links keep Next's prefetch (few, frequently used); list rows use `prefetch={false}`.

---

## 7. Tasks

★ = needed for the PRD 5.1 minimum demo (none in this phase; the demo is complete after Phase 5).

### 7.1 Backend

| ID | Task |
|---|---|
| P6-01 | Add `checkups` (and `rate_limits` if needed) to `src/db/schema.ts`; `npm run db:generate`; apply locally, then to the deployment |
| P6-02 | `src/server/domain/checkups.ts`: `nextDue`, `checkupState`, `nextBoundary` (pure, unit-tested) |
| P6-03 | `services/checkups` (machine-scoped CRUD + cross-machine lists) + `src/actions/checkups.ts` + `src/data/checkups.ts` |
| P6-04 | `logServiceRecord`: `checkupId` validation and guarded insert |
| P6-05 | `src/server/domain/console.ts` (pure assembly) + `services/console.getConsole` + `src/app/api/console/route.ts` (GET, expiry sweep, ETag/304) |
| P6-06 | `RateLimiter` interface: binding implementation + D1 fallback; wire it into `startSession`, `reportFault`, `join` |
| P6-07 | Validation sweep: action-wrapper schema assertion; Zod-vs-`CHECK` length comparison test |
| P6-08 | Machine detail data adds checkups |

### 7.2 Frontend

| ID | Task |
|---|---|
| P6-20 | Console home page (server first render + `ConsoleLive` polling via `usePoll`) |
| P6-21 | Checkups page (tabs, Log checkup) |
| P6-22 | Machine detail checkups section + dialogs |
| P6-23 | Log service: checkup select + instructions |
| P6-24 | `RATE_LIMITED` handling everywhere: toast "You're doing that too fast. Try again in a minute" |
| P6-25 | Final console nav with counts |

### 7.3 Tests

All service tests call services directly with actors from the `actors` helper and an explicit `now`.

**T09 — checkups** (`tests/services/T09-checkups.spec.ts`)

| # | Case | Expected |
|---|---|---|
| 1 | New checkup, interval 14, created at T0, no records | `nextDueAt = T0 + 14 d`; at T0 + 6 d → `ok`; T0 + 7 d → `due_soon`; T0 + 14 d → `overdue` |
| 2 | Log a linked `scheduled_checkup` record at T1 | `nextDueAt = T1 + 14 d`; leaves the overdue list |
| 3 | A **back-dated** record (`performedAt` earlier than the latest) | Next due still based on the **latest** `performed_at` |
| 4 | Records of other types or for other checkups | Don't affect it |
| 5 | Change interval 14 → 30 | Next due recomputed from the same base |
| 6 | Inactive checkup / retired machine | Excluded from lists |
| 7 | `checkupId` from another machine → `INVALID_CHECKUP`; inactive → `INVALID_CHECKUP`; type ≠ `scheduled_checkup` → `CHECKUP_TYPE_MISMATCH`; on a correction → `CORRECTION_NO_EFFECTS` | — |
| 8 | Lists sorted correctly; member actor → `FORBIDDEN` | — |
| 9 | Checkups never change pass status or block a session start | — |

**T04 — console part** (`tests/services/T04-authorization-effects.spec.ts`, extends Phase 4)

| # | Case | Expected |
|---|---|---|
| 6 | Grant expires mid-session | Session still active **and** listed in `noLongerAuthorized` with `state = expired` |
| 7 | Admin adds a requirement the session's member lacks | Listed in `noLongerAuthorized` |
| 8 | Staff ends a flagged session | `end_reason = staff`; it leaves both lists |

**Console route handler** (`tests/services/console-route.spec.ts`, calling the route's `GET` with a mocked actor resolver)

| # | Case | Expected |
|---|---|---|
| 1 | Signed out → 401; member → 403; staff → 200 with the §5.1 shape | — |
| 2 | Second request with the returned `ETag`, nothing changed → 304 | — |
| 3 | After any mutation (`data_version` bump) → 200; after `validUntil` passes → 200 and the expired session closed | — |

**T10 — authorization, full sweep** (`tests/services/T10-permissions.spec.ts`). Table-driven from PRD Section 9: each row calls the listed services as every actor kind: **anonymous, nonMember, suspended, member, staff, admin**.

| PRD 9 row | Representative services | Expected |
|---|---|---|
| Status board, own pass and certs, own session, report fault | `getStatusBoard`, `getPass`, `getMyCertifications`, `startSession`, `endSession` (own), `reportFault` | member ✔ staff ✔ admin ✔; anonymous `UNAUTHENTICATED`; nonMember `NOT_A_MEMBER`; suspended `SUSPENDED` (`getPass` returns `NOT_CLEARED` with the right reason instead) |
| Console, fault queue, checkups, machine detail, history, members | `getConsole`, `getFaultQueue`, `listDueCheckups`, `getMachineDetail`, `getServiceHistory`, `searchMembers` | member `FORBIDDEN`; staff ✔; admin ✔ |
| Sign off / revoke for **others** | `signOff`, `revokeGrant` | member `FORBIDDEN`; staff ✔; admin ✔; **self → `SELF_SIGN_OFF` / `SELF_REVOKE` for everyone** |
| End anyone's session; out of service / return; log service; checkups | `endSession` (other's), `setMachineOutOfService`, `returnMachineToService`, `logServiceRecord`, `createCheckup`, `updateCheckup` | member `FORBIDDEN`; staff ✔; admin ✔ |
| Rooms, machine basics, labels | `createRoom`, `updateRoom`, `createMachine`/`updateMachine` (basics), `getLabels` | member `FORBIDDEN`; staff ✔; admin ✔ |
| Suspend/reactivate members | `updateMember({ status })` on a member | member `FORBIDDEN`; staff ✔; admin ✔ |
| Certifications; requirements, supervised, retire | `createCertification`, `updateCertification`, `updateMachine({ requirementIds \| supervised \| retire })` | member `FORBIDDEN`; **staff `FORBIDDEN` / `FORBIDDEN_FIELD`**; admin ✔ |
| Roles; suspend staff/admins; join link; settings | `updateMember({ role })`, `updateMember({ status })` on staff/admin, `regenerateJoinLink`, `updateSettings` | member `FORBIDDEN`; **staff `FORBIDDEN`**; admin ✔ |
| Plus | last admin can't be demoted/suspended; regenerated join link invalidates the old one; setup can't be rerun | (from Phase 1, re-asserted here) |

**Action wrapper sweep** (`tests/unit/actions-wrapped.spec.ts`) replaces the old HTTP route registry:

- Imports every module in `src/actions/*` and asserts **each exported function** was created by the shared `action(schema, handler)` helper from Phase 1 §4.4 (it tags the function with a marker). This extends the Phase 1 test P1-47. That helper always calls `getActor()` and `parse(schema, input)` before the handler, so an action can't skip auth or validation.
- Asserts every service exported from `src/server/services/*` takes an `actor` argument and is covered by at least one T10 row (a list kept in the test; a new service without a row fails the test).

**FR-19 — rate limits** (`tests/services/rate-limits.spec.ts`, with a fake `RateLimiter` for the binding path and the real D1 table for the fallback path)

| # | Case | Expected |
|---|---|---|
| 1 | 21 fault reports in one minute by one member | 21st → `RATE_LIMITED` |
| 2 | Another member at the same time | Unaffected |
| 3 | Joins and session starts limited the same way | — |
| 4 | Next window (`now + 60 s`) | Allowed again |

### 7.4 Manual checks

| ID | Check |
|---|---|
| P6-40 | On the deployed app, submit 25 fault reports in a minute from one account (a Playwright script against the deployed site) → `RATE_LIMITED` after about 20. Confirms the real binding |
| P6-41 | **Supervisor check** (PRD 4.2): 5 staff testers each find "who has a recorded session on the laser" and "which machines are out of service" from the console home. Target ≤ 20 s for 4 of 5 |
| P6-42 | Journey H on a phone: create a checkup with interval 1 day, log a back-dated checkup record, see it overdue the next day (or create it with a 1-day interval and wait), log it, see it leave the list |
| P6-43 ★ **T11** | On **the deployed app** with real accounts: create data → refresh → still there; **deploy a new version** (`npm run deploy` with any trivial change) → data still there; sign out/in → still there. Record the result |
| P6-44 | Leave the console open in a background tab for 10 min → no `/api/console` requests in `wrangler tail` while hidden |

---

## 8. Exit criteria

- [x] T09, T10 (full), T04 (complete), console route, action-wrapper and rate-limit tests green.
- [ ] **PRD M1 and M2 exit criteria met:** T02–T11 pass (T01 from Phase 5, T11 manual on the deployed app).
- [ ] Console home supervisor check measured (≤ 20 s, 4 of 5).
- [ ] Migration `0006` applied to the deployment.

---

## 9. Decisions and open questions

| # | Item | Status |
|---|---|---|
| D1 | `checkup_id` validated in the service with a guarded insert (no FK) | Decided (additive-migration constraint) |
| D2 | Next due uses the **latest `performed_at`**, not the latest inserted record | Decided: back-dated entries behave correctly |
| D3 | "No longer authorized" uses the same pass engine as everything else | Decided |
| D4 | Rate-limit keys use member/user IDs (after auth), not IPs | Decided: campus Wi-Fi shares IPs |
| D5 | The console polls a JSON route handler with ETags instead of `router.refresh()` | Decided: quota and CPU (`technologies.md` §5.2) |
| D6 | Authorization is proven at the service layer + an action-wrapper sweep, not with HTTP calls | Decided: no auth stub needed |
| Q1 | Should overdue checkups show on the member board? PRD: advisory only, staff-facing. Proposed: no | Proposed |
| Q2 | Checkups on a schedule by weekday ("every Monday") instead of an interval? Not in PRD → P1 if interviews ask for it | Open |

## 10. Risks

| Risk | Mitigation |
|---|---|
| The console polls on several staff screens all day | ETag; visible-only polling; back-off (`technologies.md` §13) |
| Rate-limit binding semantics (per location, eventual) let bursts through | Acceptable for a pilot (PRD: "basic per-instance limit"); shared limits are P1 |
| Permission drift as actions and services are added later | Action-wrapper sweep and the T10 service list fail `npm test` (and so `npm run check`) when something is missing |
| Console home render is heavy with many active sessions | First render and poll payload capped (e.g. 100 active sessions); CPU checked in Phase 7 |

---

## 11. Implementation notes (decided while building)

| Decision | Detail | Date |
|---|---|---|
| Migration `0006` | `drizzle/0006_checkups.sql`: generated, renamed from drizzle-kit's random name (journal tag updated). No `0007_rate_limits.sql`: the binding path is used (below) | 2026-11-23 |
| Rate limits: binding only | `RL_ACTIONS` has been in `wrangler.jsonc` since Phase 0, so `src/server/rate-limit.ts` has the `RateLimiter` interface, the binding implementation and `enforceRateLimit()`; the D1 fallback table wasn't built. If P6-40 on the deployment shows the binding doesn't limit, add the fallback then. Without the binding (it shouldn't happen), `getRateLimiter()` allows everything and logs `rate_limit.binding_missing` once | 2026-11-23 |
| Where the limit runs | `startSession`, `reportFault` and `joinMakerspace` take `{ limiter }` as an option and check it right after `parse()`, before any D1 read, so a replayed (double-tapped) request also counts. Only the server actions pass `getRateLimiter()`; services called without a limiter aren't limited (tests). The message is the service's ("You're doing that too fast. Try again in a minute."), and the pass, report sheet and join form already show service messages as they are (P6-24) | 2026-11-23 |
| Checkup link | `NOT_SUPPORTED_YET` is gone. New codes `INVALID_CHECKUP`, `CHECKUP_TYPE_MISMATCH` (400). Validation order: replay → `FUTURE_DATE` → `CORRECTION_NO_EFFECTS` (faults, then checkup) → `CHECKUP_TYPE_MISMATCH` → `INVALID_PERFORMER` → `INVALID_CORRECTION` → `INVALID_FAULT` → `INVALID_CHECKUP`. The checkup check is repeated inside statement 1 of the machine write (`checkupValidSql`), and `refused()` explains it | 2026-11-23 |
| Checkup writes | Create is one batch: an `INSERT … SELECT … WHERE` the machine isn't retired and the actor is still active staff, then a bump guarded by "the row exists". Update re-checks the actor inside the `UPDATE`. There's no `clientRequestId` (the spec's input has none): the dialog disables its button while saving and closes on success | 2026-11-23 |
| Checkup lists | `readCheckups()` is one query builder select with the correlated `MAX(performed_at)` subquery (fully qualified names). All three tabs sort by next due ascending, which is "most overdue first" for Overdue and "soonest first" for Due soon. Machine detail lists inactive checkups too | 2026-11-23 |
| Console data | One read batch of six (settings, open faults on live machines, out-of-service machines, open sessions with member/machine/room, requirements of machines with open sessions, grants of members with open sessions; the last two filtered by subqueries, so no `IN` lists) plus the checkup list in parallel. Joined columns are aliased (technologies.md §16). "No longer authorized" calls `computePass()` with the machine forced to available and unsupervised, so only certifications count. At most 100 active sessions are listed (`activeSessionsTruncated`) | 2026-11-23 |
| Console ETag | `W/"c.<data_version>.<memberId>.<role>.<validUntil>"`; the parser only accepts `admin`/`staff`. `validUntil` = min(session estimated ends, expiries of grants that a running session relies on, checkup boundaries from `nextBoundary()`, now + 10 min) | 2026-11-23 |
| End session from the console | `<EndSessionButton>` got an `onEnded` callback; the console passes the poll's `refresh()`. The action's own `refresh()` re-renders the page, but `<ConsoleLive>` keeps showing its polled data, so without the extra poll the row would stay until the next 30 s poll | 2026-11-23 |
| Setup checklist | Admins only, and it disappears once every step is done | 2026-11-23 |
| Checkup status | `<StatusBadge>` gained `overdue`, `due-soon`, `on-schedule` and `inactive` (AGENTS.md rule 17). The member Help page now lists only the member-facing statuses | 2026-11-23 |
| Validation sweep (P6-07) | `action()` stores its schema; `tests/unit/actions-wrapped.spec.ts` asserts each action has a Zod schema. `tests/unit/validation-limits.spec.ts` reads every `length(...)` CHECK in `drizzle/*.sql` and probes the matching Zod field at max / max + 1 (and min / min − 1); a new CHECK without an entry fails. Control characters: the Phase 5 text fields and `optionalText()` now reject them (`hasControlCharsInText()` allows newline, carriage return and tab in long text). `dangerouslySetInnerHTML` is banned with `no-restricted-syntax` (a separate config object can't name the `react/` plugin rule) | 2026-11-23 |
| T10 sweep | `tests/services/T10-permissions.spec.ts`. "Allowed" means not refused with a permission code (a business refusal such as `MACHINE_BUSY` still counts as allowed); each actor kind gets fresh data. A second block imports every service module and fails when an exported function doesn't take `(db, actor, …)` or has no row, apart from the listed actor-free helpers. `T10-access.spec.ts` stays as the Phase 1–4 detail tests | 2026-11-23 |
| Nav | Final order (Home · Faults · Checkups · Machines · Members · Rooms · Labels · Certifications · Settings), with the overdue-checkup count read once per request like the fault count | 2026-11-23 |
| Not done here | P6-40 (25 fault reports on the deployment), P6-41 (supervisor timing with 5 staff testers), P6-42 (Journey H on a phone over a day), P6-43 (T11 on the deployment), P6-44 (`wrangler tail` with a background tab) and applying `0006` to the deployment (`npm run db:migrate:remote`, then `npm run deploy`) need the deployed app and people | 2026-11-23 |
