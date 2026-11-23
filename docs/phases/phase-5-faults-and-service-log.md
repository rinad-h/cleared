# Phase 5 — Faults, Out-of-Service & Service Log

> **Goal:** a student can report a problem that takes a machine out of service immediately; technicians work a fault queue, post public status notes, log what they did in an append-only service history, and return the machine to service. **At the end of this phase the full PRD 5.1 minimum demo works.**

| | |
|---|---|
| PRD coverage | **FR-12** (fault reports), **FR-13** (out-of-service details), **FR-14** (fault queue), **FR-15** (service log), FR-09 (OUT OF SERVICE pass, Report a problem), FR-11 (out-of-service details and "Issue reported" badge on the board), Journeys E and G, Section 8.2 (Fault queue, Machine detail, Log service), **T07**, **T08**, **T01** (full) |
| Depends on | Phase 4 (sessions, board), Phase 2 (`withMachineWrite`) |
| Unlocks | Phase 6 |
| Estimated effort | 5–6 days |
| Demo checkpoint | PRD 5.1 steps **8–10**, and the **whole 10-step demo end to end on a physical phone** |

---

## 1. Outcomes

1. **Report a problem** from the pass: description (10–1000 chars) + "Unsafe or not working: take out of service". If ticked, the machine is **OUT OF SERVICE for everyone at once**, and any active session ends (`machine_down`).
2. **Staff status controls:** set out of service (`maintenance` / `other`) with a **public note** (≤ 200 chars) and **expected-back** time; add a note/time to a fault-triggered outage; **return to service**, which is refused while an open out-of-service fault exists.
3. **Fault queue:** open faults, out-of-service ones first, then oldest, with reporter, description and age.
4. **Service log:** who, when, type, work done, parts, minutes, outcome, linked faults (resolved by the record), optional correction of an earlier record. **Append-only, enforced by database triggers.** `returned_to_service` makes the machine *Available* only if no other out-of-service fault remains.
5. **Machine detail** page: status controls, open faults, full service history (newest first), recent sessions.
6. Board and pass show out-of-service details and the *Issue reported (still usable)* badge.

## 2. Scope

**In:** faults, out-of-service state machine, service records (including corrections), fault queue, machine detail, log-service form, board/pass integration, retire guard.

**Out:** checkups and the `checkup_id` link (Phase 6; the column is created now), console home counts (Phase 6), fault email alerts (P1), fault assignment (P1), photo uploads (not in PRD; R2 needs a card).

---

## 3. Data model

Migration `drizzle/0005_faults_service.sql` (generated from `src/db/schema.ts`, then the triggers are added by hand).

```sql
CREATE TABLE faults (
  id                            TEXT PRIMARY KEY,
  machine_id                    TEXT NOT NULL REFERENCES machines(id),
  reported_by_member_id         TEXT NOT NULL REFERENCES members(id),
  description                   TEXT NOT NULL CHECK (length(description) BETWEEN 10 AND 1000),
  took_out_of_service           INTEGER NOT NULL CHECK (took_out_of_service IN (0,1)),
  status                        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_by_service_record_id TEXT REFERENCES service_records(id),
  resolved_at                   INTEGER,
  client_request_id             TEXT NOT NULL UNIQUE,
  created_at                    INTEGER NOT NULL,
  CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
  CHECK ((status = 'resolved') = (resolved_by_service_record_id IS NOT NULL))
);
CREATE INDEX faults_machine_status ON faults(machine_id, status);
CREATE INDEX faults_open_queue     ON faults(took_out_of_service DESC, created_at) WHERE status = 'open';

CREATE TABLE service_records (
  id                     TEXT PRIMARY KEY,
  machine_id             TEXT NOT NULL REFERENCES machines(id),
  performed_at           INTEGER NOT NULL,
  performed_by_member_id TEXT REFERENCES members(id),
  external_technician    TEXT CHECK (external_technician IS NULL OR length(external_technician) BETWEEN 2 AND 120),
  logged_by_member_id    TEXT NOT NULL REFERENCES members(id),
  type                   TEXT NOT NULL CHECK (type IN
                           ('repair','scheduled_checkup','inspection','cleaning','calibration','other')),
  work_done              TEXT NOT NULL CHECK (length(work_done) BETWEEN 10 AND 2000),
  parts_used             TEXT CHECK (parts_used IS NULL OR length(parts_used) <= 500),
  minutes_spent          INTEGER CHECK (minutes_spent IS NULL OR minutes_spent BETWEEN 1 AND 10000),
  outcome                TEXT NOT NULL CHECK (outcome IN
                           ('returned_to_service','still_out_of_service','passed','issues_found')),
  checkup_id             TEXT,            -- validated in app code from Phase 6 (see README §4.2)
  corrects_record_id     TEXT REFERENCES service_records(id),
  client_request_id      TEXT NOT NULL UNIQUE,
  created_at             INTEGER NOT NULL,
  -- exactly one of: a staff member, or an external technician
  CHECK ((performed_by_member_id IS NULL) <> (external_technician IS NULL))
);
CREATE INDEX service_records_machine ON service_records(machine_id, performed_at);
CREATE INDEX service_records_checkup ON service_records(checkup_id, performed_at) WHERE checkup_id IS NOT NULL;

-- FR-15 / PRD 7.1: service history is append-only
CREATE TRIGGER service_records_no_update BEFORE UPDATE ON service_records
BEGIN SELECT RAISE(ABORT, 'service_records are append-only'); END;
CREATE TRIGGER service_records_no_delete BEFORE DELETE ON service_records
BEGIN SELECT RAISE(ABORT, 'service_records are append-only'); END;
```

**Notes**

- `faults` references `service_records`, so create `service_records` **first** in the migration file (the snippet above is ordered for reading; the real file is ordered for creation).
- drizzle-kit doesn't generate triggers. Add them to the generated SQL by hand and keep a comment in `schema.ts` pointing to the migration, so a future regenerate doesn't silently drop them.
- The PRD's "performed by a staff member, default self; optionally an external technician" is modelled as **exactly one** of `performed_by_member_id` / `external_technician`. `logged_by_member_id` is always the actor. Example: "Vendor: Acme Tool Repair (logged by M. Chen)".
- `faults.description` is shown **only** to staff (PRD 7.1).

---

## 4. Machine status rules

```
              report fault (take out of service)            staff: set out of service (maintenance|other)
 AVAILABLE ─────────────────────────────────────────────►  OUT_OF_SERVICE ◄────────────────────────────── AVAILABLE
     ▲          reason = issue_reported                        │   reason, note, expected_back_at
     │                                                         │
     │   service record outcome = returned_to_service          │  staff: "Return to service"
     └──────── AND no other open fault with took_out_of_service = 1 ───┘  (refused if such a fault is open)
```

| Event | Precondition | Effect (one atomic batch via `withMachineWrite`) |
|---|---|---|
| **Fault, take out of service** | Machine not retired | Close expired sessions; insert fault (`took_out_of_service = 1`). If the machine is **available**: `status = out_of_service`, `reason = issue_reported`, `status_changed_at = now`, note/expected-back cleared. If it's **already out of service**: status, reason and since are unchanged (the outage started earlier); the fault still blocks manual return. End the active session (`machine_down`). Bump `data_version` |
| **Fault, still usable** | Machine not retired | Insert fault (`took_out_of_service = 0`). No status change. Board shows *Issue reported (still usable)* |
| **Staff: set out of service** | Machine available | `status = out_of_service`, `reason = maintenance \| other`, note, expected back, `status_changed_at = now`; end the active session (`machine_down`) |
| **Staff: update outage details** | Machine out of service (any reason) | Update `status_note` and `expected_back_at` only (reason stays) |
| **Staff: return to service** | Machine out of service **and** no open fault with `took_out_of_service = 1` | `status = available`; clear reason/note/expected back; `status_changed_at = now`. Otherwise → `OPEN_OOS_FAULT` with the fault IDs (FR-13: "must be resolved by a service record") |
| **Service record** | Machine not retired; see §5 | Insert record; resolve linked faults; if `outcome = returned_to_service`: return to service **only if** no open out-of-service fault remains after resolving |
| **Retire** (Phase 2, extended) | **No open faults** | Otherwise `OPEN_FAULTS`. Log a service record to resolve them first |

The return-to-service step inside the service-record batch is self-guarding, so it can't race with a new fault:

```sql
UPDATE machines
SET status = 'available', out_of_service_reason = NULL, status_note = NULL, expected_back_at = NULL,
    status_changed_at = :now, write_token = :T2, updated_at = :now
WHERE id = :machineId AND status = 'out_of_service'
  AND EXISTS (SELECT 1 FROM machines WHERE id = :machineId AND write_token = :T1)
  AND NOT EXISTS (SELECT 1 FROM faults WHERE machine_id = :machineId AND status = 'open' AND took_out_of_service = 1);
```

It runs **after** the statements that resolve the linked faults, in the same batch, so it sees them resolved. When written as a Drizzle `sql` template, use fully qualified raw names in correlated subqueries (`technologies.md` §12.1).

---

## 5. Service log rules (FR-15)

| Field | Rule |
|---|---|
| `performedAt` | Defaults to now; **not in the future** (2-minute tolerance for clock skew) → `FUTURE_DATE`; not before 2000-01-01 |
| `performedByMemberId` / `externalTechnician` | Exactly one. Default: the actor. The member must be **active staff or admin** → `INVALID_PERFORMER` |
| `type` | One of the six types |
| `workDone` | **Required**, 10–2000 chars |
| `partsUsed` | Optional, ≤ 500 chars |
| `minutesSpent` | Optional, 1–10000 |
| `outcome` | **Required**: `returned_to_service` / `still_out_of_service` / `passed` / `issues_found`. The form suggests outcomes by type (repair → the first two; checkup/inspection/cleaning/calibration → the last two) but the service accepts any |
| `faultIds` | Optional, ≤ 20. Each must be an **open** fault **on this machine** → `INVALID_FAULT`. All are resolved by this record |
| `checkupId` | Accepted from Phase 6 (`NOT_SUPPORTED_YET` before that) |
| `correctsRecordId` | Optional; must be a record **on the same machine** that isn't itself a correction (one level) → `INVALID_CORRECTION`. **A correction can't link faults or a checkup and never changes machine status** → `CORRECTION_NO_EFFECTS` |
| `clientRequestId` | UUID, created when the form opens; a replay returns the existing record |

**Append-only:** there is no edit or delete action, and the triggers block it in the database. A correction is shown on the original ("Corrected by record of Nov 23") and on itself ("Corrects record of Oct 14").

---

## 6. Operations

Services live in `src/server/services/faults.ts`, `machine-status.ts` and `service-records.ts`, all with the signature `(db, actor, input, now)`. Actions in `src/actions/*` are thin wrappers (`getActor()` → `parse()` → service → `refresh()`/`redirect()`), using the shared `run()` / `ActionResult` helpers.

| Operation | Kind | Auth | Input | Result |
|---|---|---|---|---|
| `reportFault` | Server action (`src/actions/faults.ts`) | member | `{ machineId, description, takeOutOfService, clientRequestId }` | `{ ok, faultId, tookOutOfService }`. `MACHINE_RETIRED`. Rate-limited in Phase 6 |
| `getFaultQueue` | Page data (`src/data/faults.ts`) | staff | `{ machineId? }` | Queue items (§6.1) |
| `setMachineOutOfService` | Server action (`src/actions/machine-status.ts`) | staff | `{ machineId, reason: "maintenance" \| "other", note?, expectedBackAt? }` | Machine status. `MACHINE_RETIRED` |
| `updateOutageDetails` | Server action | staff | `{ machineId, note?, expectedBackAt? }` | Machine status (reason unchanged) |
| `returnMachineToService` | Server action | staff | `{ machineId }` | Machine status. `OPEN_OOS_FAULT` with fault IDs |
| `logServiceRecord` | Server action (`src/actions/service-records.ts`) | staff | `{ machineId, performedAt?, performedByMemberId?, externalTechnician?, type, workDone, partsUsed?, minutesSpent?, faultIds?, checkupId?, outcome, correctsRecordId?, clientRequestId }` | `{ ok, recordId, machineStatus, resolvedFaultIds }`, then `redirect()` to machine detail |
| `getServiceHistory` | Page data (`src/data/machines.ts`) | staff | `{ machineId, cursor?, limit? }` | Newest first; each record with performer/logger names, linked faults, corrections both ways |
| `getMachineDetail` | Page data | staff | `{ machineId }` | §6.2 |
| Pass data (`getPass`) | Page data | user | `{ token }` | **+** `machine.outOfService` filled; `actions.canReportFault` (active member, machine not retired) |
| Status board | Route handler `GET /api/status-board` | member | `If-None-Match?` | **+** `outOfService` details and `issueReported` |

### 6.1 Fault queue data (FR-14)

```jsonc
{
  "items": [
    {
      "id": "…",
      "machine": { "id": "…", "name": "Bandsaw", "roomName": "Wood Shop", "status": "out_of_service" },
      "tookOutOfService": true,
      "reportedAt": "…", "ageMinutes": 135,
      "reporter": { "id": "…", "displayName": "Demo Student 3" },
      "description": "Blade wandering, burning smell"
    }
  ]
}
```

Order: `took_out_of_service DESC, created_at ASC` (out of service first, then oldest), using the partial index `faults_open_queue`. Faults on retired machines can't exist (retire is refused while faults are open).

### 6.2 Machine detail data

```jsonc
{
  "machine": { "id", "name", "room", "status", "supervised", "typicalSessionMinutes", "requirements": [...],
               "outOfService": { "reason", "since", "note", "expectedBackAt" } | null },
  "openFaults":     [ /* same shape as the queue items */ ],
  "activeSession":  { "id", "member": { "id", "displayName" }, "startedAt", "expectedEndAt" } | null,
  "recentSessions": [ /* last 20, with member names (staff view) */ ],
  "serviceHistory": { "items": [ /* first page, newest first */ ], "nextCursor": "…" },
  "checkups": []    // Phase 6
}
```

Loaded with one read `db.batch()` in `src/data/machines.ts`. The page renders it inside `<Suspense>` (session read).

---

## 7. UI

### 7.1 Member side

- **Pass → "Report a problem"** (`src/app/(member)/m/[token]/`; a link-style button under the main actions; available for any status except retired):
  - Client component sheet with a description textarea (counter, 10–1000), a checkbox **"Unsafe or not working: take out of service"** with help text "Everyone will see this machine as out of service until staff fix it", and Submit. Calls the `reportFault` action through `useActionState`.
  - `clientRequestId` is generated when the sheet opens.
  - On success the action calls `refresh()`, so the pass re-renders in the same response (shows OUT OF SERVICE if ticked), with a toast "Thanks, staff can see this in the console".
- **Pass OUT OF SERVICE**: grey block, `Ban` icon, "OUT OF SERVICE", then "since 11:05 am · issue reported", the staff note in quotes, "expected back Thu 2 pm (estimate)". No Start button.
- **Board tiles**: the out-of-service detail lines (as in the PRD 8.1 sketch) and the *Issue reported* chip. **Never** the fault text or reporter.

### 7.2 Staff console

| Route | Screen | Contents |
|---|---|---|
| `src/app/console/faults/page.tsx` | **Fault queue** | Cards ordered as in §6.1: machine + room, OUT OF SERVICE chip if applicable, "reported 2 h ago by Demo Student 3", description, **Log service** (pre-links this fault) and **Open machine**. Empty state: "No open faults" (text, with an icon). Nav item shows the open count |
| `src/app/console/machines/[id]/page.tsx` | **Machine detail** (PRD 8.2 sketch) | Header: name, room, big status chip. **Status panel** (client component with server-action forms): if available → "Set out of service" (reason, note ≤ 200 with counter, expected back date/time picker); if out → edit note / expected back, "Return to service" (disabled with the explanation "Resolve open out-of-service faults by logging a service record" when blocked). **Open faults** list. **Active session** (member name, est. end, End session). **Service history** (newest first: date, who / "Vendor: X (logged by Y)", type, work done, parts, minutes, outcome chip, linked faults, correction links; "Load more" via `?cursor=`). **Recent sessions.** Phase 6 adds **Checkups** |
| `src/app/console/machines/[id]/service/new/page.tsx?faultIds=` | **Log service** | Phone-first form, target ≤ 60 s (PRD 4.2), posting to `logServiceRecord` with `useActionState`: **When** (defaults to now; "Earlier…" opens a date/time picker, future dates disabled) · **Who** (segmented: *Me* / *Other staff* (select) / *External technician* (text)) · **Type** (chips) · **What was done** (textarea, 10–2000) · **Linked faults** (checkboxes, pre-ticked from the query) · **Outcome** (chips suggested by type; if open out-of-service faults would remain after this record, the *Returned to service* chip shows "Machine stays out of service: another fault is still open") · *More details* (collapsed): parts used, minutes spent · Submit. On success the action redirects to machine detail with a toast "Logged. Machine is now Available" (or "still out of service"). Field errors come back as `fieldErrors` |
| (from history) | **Correct a record** | "Correct this record" on a history item → the same form in correction mode (`?corrects=<id>`): pre-filled, no fault/checkup links, no outcome-driven status change, banner "This adds a new record that corrects the one from Oct 14. The original stays in the history" |

Console nav gains **Faults** (with count). Machines list rows link to machine detail with `<Link prefetch={false}>`.

---

## 8. Tasks

★ = needed for the PRD 5.1 minimum demo.

### 8.1 Backend

| ID | Task |
|---|---|
| P5-01 ★ | Add `faults` and `service_records` to `src/db/schema.ts`; `npm run db:generate`; hand-add the triggers (create order: `service_records`, then `faults`, then triggers); apply locally, then to the deployment |
| P5-02 ★ | `src/server/domain/machine-status.ts`: pure transition rules (§4) returning the statements to add to a `withMachineWrite` batch |
| P5-03 ★ | `services/faults.reportFault` (both variants; idempotent; ends the session on take-out-of-service) + `actions/faults.ts` |
| P5-04 ★ | `services/machine-status` (set out / update details / return, with the `OPEN_OOS_FAULT` guard) + actions |
| P5-05 ★ | `services/service-records.logServiceRecord` (§5 validation; resolve faults; guarded return to service; corrections) + action |
| P5-06 | `getServiceHistory` (cursor pagination on `(performed_at, id)`) |
| P5-07 ★ | `getFaultQueue` in `src/data/faults.ts` |
| P5-08 ★ | `getMachineDetail` (one read batch) |
| P5-09 ★ | Board and pass data: `outOfService` details + `issueReported` (open fault with `took_out_of_service = 0` on a machine that isn't out of service) |
| P5-10 | Retire guard: `OPEN_FAULTS` |
| P5-11 | `data_version` bump in all new batches |
| P5-12 | Map the new error codes to user messages in the shared UI error map |

### 8.2 Frontend

| ID | Task |
|---|---|
| P5-20 ★ | Report-a-problem sheet on the pass |
| P5-21 ★ | Pass OUT OF SERVICE variant with details |
| P5-22 ★ | Board tile out-of-service lines + Issue reported chip |
| P5-23 ★ | Fault queue page + nav count |
| P5-24 ★ | Machine detail page (status panel, open faults, history, sessions) |
| P5-25 ★ | Log service form (phone-first) |
| P5-26 | Correction mode + correction links in history |
| P5-27 | Date/time picker in the makerspace time zone (convert to UTC ms before calling the action; display "Thu 2 pm" style) |

### 8.3 Tests

Service tests in `tests/services/` call services directly with actors from the `actors` helper and an explicit `now`. Out-of-service setup uses the real services, not direct DB writes.

**T07 — faults and out-of-service** (`tests/services/T07-faults.spec.ts`)

| # | Case | Expected |
|---|---|---|
| 1 ★ | Member reports with take-out-of-service on a machine with an active session | Machine `out_of_service`, reason `issue_reported`, `status_changed_at = now`; the session ended with `machine_down`; the fault has `took_out_of_service = 1` |
| 2 ★ | **Next pass** for any member is `OUT_OF_SERVICE` (PRD 4.2 "100% of out-of-service fault reports show OUT OF SERVICE on the next scan") | — |
| 3 | Fault "still usable" → status unchanged; board `issueReported = true`; pass unchanged | — |
| 4 | Fault on a retired machine → `MACHINE_RETIRED`; description 9 / 1001 chars → `VALIDATION_FAILED` | — |
| 5 | Fault on a machine already out for maintenance → reason and since unchanged; return to service now refused | — |
| 6 ★ | **Return to service refused while an out-of-service fault is open** → `OPEN_OOS_FAULT` | — |
| 7 | Staff set out of service (`maintenance`) with note + expected back → board shows them; the active session ended | — |
| 8 | Staff update the note on a fault-triggered outage → reason stays `issue_reported` | — |
| 9 | Note 201 chars → `VALIDATION_FAILED`; member actor → `FORBIDDEN` on status services and the fault queue | — |
| 10 ★ | Queue order: out-of-service faults first, then oldest; resolved faults excluded | — |
| 11 | Concurrent `reportFault` + `startSession` (`Promise.all`) → never an active session on an out-of-service machine | — |
| 12 | Re-run the T02 #11 and T06 #1 out-of-service cases **through the real services** (not direct DB writes) | — |

**T08 — service log** (`tests/services/T08-service.spec.ts`)

| # | Case | Expected |
|---|---|---|
| 1 | Missing `workDone` or `outcome` → `VALIDATION_FAILED`; `workDone` 9 chars → `VALIDATION_FAILED` | — |
| 2 | `performedAt` more than 2 min after `now` → `FUTURE_DATE` | — |
| 3 ★ | Record linking the open fault with `returned_to_service` → fault resolved (`resolved_by_service_record_id`, `resolved_at`), machine **Available**, note/expected back cleared | — |
| 4 ★ | Two out-of-service faults open; record resolves **one** with `returned_to_service` → machine **stays out of service**; result says so | — |
| 5 | `still_out_of_service` resolving a fault → fault resolved, machine stays out | — |
| 6 | Linking a fault from another machine, or an already-resolved fault → `INVALID_FAULT` | — |
| 7 ★ | **Records can't be edited or deleted:** no update/delete service or action exists (a test lists `src/actions/service-records.ts` exports), **and** direct SQL `UPDATE`/`DELETE` fails with "append-only" | — |
| 8 | Correction: links to the original; shown both ways; correction with `faultIds` → `CORRECTION_NO_EFFECTS`; correction doesn't change machine status | — |
| 9 | External technician stored; `performedByMemberId` null; logged-by = actor; both set → `VALIDATION_FAILED`; neither → defaults to the actor | — |
| 10 | Performer must be active staff/admin → a member ID → `INVALID_PERFORMER` | — |
| 11 | History newest first with pagination; member actor → `FORBIDDEN` | — |
| 12 | Same `clientRequestId` twice → one record | — |
| 13 | Retire with open faults → `OPEN_FAULTS`; after logging a resolving record → retire OK | — |

### 8.4 Full minimum demo (T01, end to end)

| ID | Check |
|---|---|
| P5-40 ★ | **Playwright E2E** `tests/e2e/minimum-demo.spec.ts`: on `next dev` with a throwaway D1, three browser contexts sign up real accounts (admin, staff, student) and run PRD 5.1 steps 1–10 |
| P5-41 ★ | **Manual on the deployed app with a physical phone** (T01): print a label → scan → sign in → NOT CLEARED → staff signs off → CLEARED → Start 60 min → board *In use* → Report a problem (take out of service) → board *Out of service · issue reported* → staff logs a repair with `returned_to_service` → board *Available* → machine detail shows the repair. Record a short screen recording of the demo |
| P5-42 | Service logging timed on a phone: ≤ 60 s (PRD 4.2) |
| P5-43 | Check `cpuTime` in Workers Logs (the deployment) for the machine detail page and the log-service action; note anything above 5 ms for the Phase 7 audit |

---

## 9. Exit criteria

- [ ] T07 and T08 green; the out-of-service cases of T02/T06 re-run through the real services.
- [ ] **The 10-step minimum demo works end to end on the deployed app on a physical phone** (PRD M0 exit, T01).
- [ ] Service-record entry measured at ≤ 60 s on a phone.
- [ ] Migration `0005` applied to the deployment.

---

## 10. Decisions and open questions

| # | Item | Status |
|---|---|---|
| D1 | Append-only enforced by triggers, not just by the absence of an action | Decided |
| D2 | Exactly one of performer member / external technician; logger always recorded | Decided (interprets PRD FR-15) |
| D3 | A fault on an already-out machine keeps the original reason and since time | Decided |
| D4 | Staff "set out of service" ends the active session (`machine_down`) | Decided (PRD states it for faults only; same safety logic) |
| D5 | Corrections are one level deep, link no faults/checkups, and never change status | Decided: keeps corrections purely about the record |
| D6 | Retire is refused while faults are open | Decided: forces faults to be closed with a record |
| D7 | The outcome is not restricted by type in the service (only suggested in the form) | Decided: technicians know best; PRD lists one enum |
| Q1 | Should members see "you reported this" on the pass? Proposed: no in MVP (privacy: the board never shows reporters) | Proposed |
| Q2 | Should the fault queue show faults reported on machines that have since been returned to service by a different fault's record? They stay open until linked. Proposed: yes, they stay in the queue (by design) | Proposed |
| Q3 | Fault de-duplication (several students report the same breakage)? Proposed: show "2 other open reports" on the queue card; technicians link all of them in one record | Proposed |

## 11. Risks

| Risk | Mitigation |
|---|---|
| A machine gets stuck out of service (fault never linked) | The return refusal message names the fault; the queue shows it; the Log service form pre-links it |
| Technicians skip logging | Return to service requires a record when a fault took it out (PRD 16); the form takes ≤ 60 s |
| False or malicious fault reports | Rate limits (Phase 6); reporter recorded and visible to staff; staff can resolve with an `inspection` record, outcome `passed` |
| Batch gets long (many linked faults) | `faultIds` capped at 20; each resolve is one statement; well under D1's limits |
| Machine detail page is heavy to render (long history) | First page of history only (≤ 50 rows), "Load more"; CPU checked in P5-43 |
| A future `db:generate` drops the hand-written triggers | Comment in `schema.ts`; T08 #7 fails if the triggers are missing |
