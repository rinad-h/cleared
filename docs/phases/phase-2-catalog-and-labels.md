# Phase 2 — Catalog & QR Labels

> **Goal:** an admin can describe the makerspace (rooms, certifications, machines with requirements and the supervised flag) and print QR labels that open the right machine page on a phone.

| | |
|---|---|
| PRD coverage | **FR-04** (rooms and machines), **FR-05** (certifications), **FR-06** (QR labels), Journey A steps 2–5, Section 8.2 (Machines / Rooms, Certifications), T10 (part), T01 (scan → correct machine page) |
| Depends on | Phase 1 (Better Auth, `getActor()`, `requireRole`, settings) |
| Unlocks | Phase 3 (the pass needs machines + requirements) |
| Estimated effort | 3–4 days |
| Demo checkpoint | PRD 5.1 steps **1–3**: admin creates the makerspace and a machine → prints a QR label → a student scans it on a phone, signs in, and lands on that machine's page |

---

## 1. Outcomes

1. Staff manage **rooms** and **machine basics** (name, room, typical session length). **Admin only:** required certifications, `supervised` flag, retire.
2. Admin manages **certifications** (name, training link, validity in months, active). A certification required by a non-retired machine **can't be deactivated**.
3. Every machine has a **random 128-bit QR token**, created once and kept on rename, move or reprint.
4. A **printable label sheet** (all or selected machines) with QR + machine name + makerspace name, built from `PUBLIC_BASE_URL`. QR codes are drawn **in the browser** with the `qrcode` package (no Worker CPU).
5. A **door poster** with QR codes for the status board and the join link (Journey F: "a QR code at the door").
6. `/m/[token]` resolves to the machine or shows a neutral **"label not recognized"** page (unknown or retired token).
7. The machine row carries `write_token` from day one, ready for Phase 4's guarded writes, and `src/server/machine-write.ts` exists with tests.
8. **The deployment is configured** with the makerspace used for the demo. From this point, **migrations are additive only**.

## 2. Scope

**In:** rooms, certifications, machines (CRUD, requirements, supervised, retire), QR tokens, label sheet, door poster, machine-by-token page data (basics only), Journey A setup flow polish (≤ 30-minute target).

**Out:** pass status (Phase 3), out-of-service controls (Phase 5), machine detail with history (Phase 5), QR token regeneration (P1), CSV import (P1), staff-only machines (P1).

---

## 3. Data model

Edit `src/db/schema.ts`, run `npm run db:generate` (drizzle-kit writes `drizzle/0002_catalog.sql`), review the SQL by hand, then `npm run db:migrate` (local) → `npm run db:migrate:remote` (the deployment). The reviewed migration must match:

```sql
CREATE TABLE rooms (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 60),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE certifications (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 2 AND 80),
  training_url    TEXT CHECK (training_url IS NULL OR (length(training_url) <= 500
                    AND (training_url LIKE 'https://%' OR training_url LIKE 'http://%'))),
  validity_months INTEGER CHECK (validity_months IS NULL OR validity_months BETWEEN 1 AND 120),
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE machines (
  id                      TEXT PRIMARY KEY,
  room_id                 TEXT NOT NULL REFERENCES rooms(id),
  name                    TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  supervised              INTEGER NOT NULL DEFAULT 0 CHECK (supervised IN (0,1)),
  status                  TEXT NOT NULL DEFAULT 'available'
                            CHECK (status IN ('available','out_of_service','retired')),
  status_changed_at       INTEGER NOT NULL,
  out_of_service_reason   TEXT CHECK (out_of_service_reason IS NULL
                            OR out_of_service_reason IN ('issue_reported','maintenance','other')),
  status_note             TEXT CHECK (status_note IS NULL OR length(status_note) <= 200),
  expected_back_at        INTEGER,
  qr_token                TEXT NOT NULL UNIQUE,
  typical_session_minutes INTEGER NOT NULL DEFAULT 60 CHECK (typical_session_minutes BETWEEN 15 AND 240),
  write_token             TEXT NOT NULL,
  retired_at              INTEGER,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL,
  CHECK ((status = 'out_of_service') = (out_of_service_reason IS NOT NULL)),
  CHECK ((status = 'retired') = (retired_at IS NOT NULL))
);
CREATE INDEX machines_room   ON machines(room_id);
CREATE INDEX machines_status ON machines(status);
-- Machine names are unique among non-retired machines (a retired name can be reused).
CREATE UNIQUE INDEX machines_name_live ON machines(name COLLATE NOCASE) WHERE status <> 'retired';

CREATE TABLE machine_requirements (
  machine_id       TEXT NOT NULL REFERENCES machines(id),
  certification_id TEXT NOT NULL REFERENCES certifications(id),
  created_at       INTEGER NOT NULL,
  PRIMARY KEY (machine_id, certification_id)
);
CREATE INDEX machine_requirements_cert ON machine_requirements(certification_id);
```

**Notes**

- drizzle-kit can express the `CHECK`s (`check()`) and the partial index (`.where()`). Anything it gets wrong is fixed by hand in the generated SQL, and the schema file is updated to match.
- The out-of-service columns are created now (so the board and pass can read them in Phases 3–4) but are only written from Phase 5.
- `write_token` is a fresh `randomToken()` on create and on **every** machine update (§4.3).
- Requirements are **AND** (PRD 7.1). Editing them is admin-only and replaces the set atomically.

---

## 4. Domain rules

All rules below live in **services** (`src/server/services/rooms.ts`, `certifications.ts`, `machines.ts`), called as `(db, actor, input, now)`. Server actions and pages only call them.

### 4.1 Machines (FR-04)

| Field | Who can set | Validation |
|---|---|---|
| `name` | staff, admin | 1–80 chars, trimmed; unique (case-insensitive) among non-retired machines → `NAME_TAKEN` |
| `roomId` | staff, admin | Must exist → `NOT_FOUND` |
| `typicalSessionMinutes` | staff, admin | 15–240, default 60 |
| `supervised` | **admin** | boolean |
| `requirementIds` | **admin** | Array of **active** certification IDs, ≤ 20, no duplicates; inactive → `CERT_INACTIVE` |
| `retire` | **admin** | `true` only; permanent in the MVP |

- A staff actor whose input includes an admin-only field → **`FORBIDDEN_FIELD`**, and **nothing** in the input is applied (no partial updates).
- **Retired machines** can't be edited (`MACHINE_RETIRED`), disappear from the board and label sheet, and their token shows "label not recognized". All history rows are kept.
- **Retire side effects:** sets `status='retired'`, `retired_at`, `status_changed_at`, clears the out-of-service fields. Phase 4 extends retire to end any active session (`end_reason='staff'`). Phase 5 refuses retire while open faults exist (`OPEN_FAULTS`).

### 4.2 Certifications (FR-05)

- Admin creates/edits `name`, `trainingUrl` (http/https, ≤ 500 chars), `validityMonths` (1–120 or null = never expires), `active`.
- **Deactivate is refused** while any non-retired machine requires the certification → `CERT_IN_USE` with `details.machines: [{ id, name }]`, so the UI can say which machines.
- An inactive certification can't be added as a requirement or newly granted (Phase 3). Existing grants still display.
- Changing `validityMonths` affects **new** grants only. Existing `expires_at` values are fixed at grant time (Phase 3).
- Every role can read the list (PRD 10.4 "GET: all").

### 4.3 Machine writes use the write token

Every machine update (basics, admin fields, retire) uses the compare-and-swap pattern from `technologies.md` §12.2:

```
read machine (T0) → validate → db.batch([
  UPDATE machines SET …, write_token = :T1, updated_at = :now WHERE id = :id AND write_token = :T0,
  -- requirements change only:
  DELETE FROM machine_requirements WHERE machine_id = :id AND EXISTS(… write_token = :T1),
  INSERT INTO machine_requirements SELECT … WHERE EXISTS(… write_token = :T1),   (one per requirement)
  UPDATE settings SET data_version = data_version + 1
]) → statement 1 changed 0 rows → retry (≤ 3) → ServiceError CONFLICT_RETRY
```

This is the shared helper `withMachineWrite(db, machineId, build)` in **`src/server/machine-write.ts`**. Phases 4 and 5 reuse it for sessions, faults and service records, so it gets unit tests now (§7.4). Correlated subqueries in its `sql` templates use fully qualified raw names (`technologies.md` §12.1).

Guarding the requirement change with the token matters because a session start (Phase 4) checks requirements in its own guarded insert. Changing requirements changes the token, so a session start that read the old requirements retries.

### 4.4 QR tokens (FR-06)

- `qr_token = randomToken(16)`: 128 random bits, base64url, 22 chars (`src/server/domain/tokens.ts`). Created once at machine creation.
- Rename, move and reprint **reuse** the token. There's no regenerate operation (P1). If a label is misused, retire the machine and re-add it (PRD 5.3).
- URL format: `${PUBLIC_BASE_URL}/m/${qr_token}`. **Always built on the server from `PUBLIC_BASE_URL`** (read with `getEnv()` from `src/lib/env.ts`, so E2E overrides apply; `technologies.md` §5.1), never from the request host. Labels never use the request's own origin, so labels printed while browsing a local or preview server can't point at the wrong place by accident.

---

## 5. Operations

Kinds follow README §4.3. "Auth" is the minimum the service requires.

| Operation | Kind | Auth | Input | Result |
|---|---|---|---|---|
| `listRooms` | Page data (`src/data/rooms.ts`) | staff | — | `[{ id, name, sortOrder, machineCount }]` |
| `createRoom` | Server action (`src/actions/rooms.ts`) | staff | `{ name }` | Room; `NAME_TAKEN` |
| `updateRoom` | Server action | staff | `{ id, name?, sortOrder? }` | Room |
| `listCertifications` | Page data (`src/data/certifications.ts`) | member (inactive ones: staff+) | `{ includeInactive? }` | `[{ id, name, trainingUrl, validityMonths, active, requiredByCount }]` |
| `createCertification` | Server action (`src/actions/certifications.ts`) | admin | `{ name, trainingUrl?, validityMonths? }` | Certification |
| `updateCertification` | Server action | admin | `{ id, name?, trainingUrl?, validityMonths?, active? }` | Certification; `CERT_IN_USE` on deactivate |
| `listMachines` | Page data (`src/data/machines.ts`) | staff | `{ roomId?, includeRetired? }` | `[{ id, name, room: { id, name }, status, supervised, typicalSessionMinutes, requirements: [{ id, name }], qrToken }]` |
| `getMachine` | Page data | staff | `{ id }` | One machine (same shape) |
| `createMachine` | Server action (`src/actions/machines.ts`) | staff (admin fields: admin) | `{ name, roomId, typicalSessionMinutes?, supervised?, requirementIds? }` | Machine with `qrToken`; staff sending `supervised`/`requirementIds` → `FORBIDDEN_FIELD` |
| `updateMachine` | Server action | staff (per field) | `{ id, name?, roomId?, typicalSessionMinutes?, supervised?, requirementIds?, retire? }` | Per-field rules §4.1 |
| `getLabelSheet` | Page data (`src/data/labels.ts`) | staff | `{ machineIds? }` (default all non-retired) | `{ makerspaceName, environment, baseUrl, generatedAt, labels: [{ machineId, machineName, roomName, url }] }` |
| `getDoorPoster` | Page data | staff | — | `{ makerspaceName, boardUrl: baseUrl + "/machines", joinUrl? (admin only) }` |
| `getMachineByToken` | Page data (`src/data/pass.ts`) | user | `{ token }` | **Phase 2 shape:** `{ recognized: false }` or `{ recognized: true, machine: { id, name, roomName, supervised }, makerspace: { name, timezone } }`. Phase 3 adds `viewer`, `pass`; Phase 4 adds `currentSession` |

**Details**

- Each server action is `run(async () => { const actor = await getActor(); const input = parse(Schema, formData); await services.x(getDb(), actor, input, Date.now()); refresh(); })`. Errors surface as an `ActionResult` with the `ServiceError` code.
- `machineIds` on the label sheet come from the page's search params (`/console/labels?ids=a,b,c`), ≤ 200 IDs. The service reads all non-retired machines (≤ 60 rows at Pro scale) and filters in memory. That's simpler and cheaper than a large `IN (…)` list near D1's 100-parameter limit.
- Token lookup is `SELECT … FROM machines WHERE qr_token = ?` (unique index, one row read). A retired match also returns `{ recognized: false }`. Unknown and retired tokens look the same, so the response reveals nothing.
- Zod schemas for every input live in `src/server/schemas/catalog.ts` and are shared with the forms.

---

## 6. UI

### 6.1 Console screens (App Router)

| Route (file) | Audience | Contents |
|---|---|---|
| `/console/rooms` (`src/app/console/rooms/page.tsx`) | staff | List with machine counts; add (inline form → `createRoom`), rename, move up/down (`sortOrder`). Empty state: "Add your first room, e.g. *Laser Room*" |
| `/console/certifications` | admin | List: name, training link, validity ("12 months" / "Never expires"), "Required by N machines", active chip. Add/Edit dialog (client component, `useActionState`). If deactivate is refused, show the `CERT_IN_USE` machine list |
| `/console/machines` | staff | Grouped by room; status chip; supervised badge; requirement chips; "Print labels" (selection mode with checkboxes → `/console/labels?ids=…`); "Add machine" |
| `/console/machines/new`, `/console/machines/[id]/edit` | staff (admin section: admin) | Basics: name, room (select + "New room…"), typical session (15/30/45/60/90/120/180/240). **Admin section** (rendered only when `can(actor, "machineAdminFields")`; the service enforces it anyway): *Supervision required* switch with helper text; *Required certifications* multi-select (active only) with "All of these are required". **Danger zone (admin):** Retire, with an alert dialog that asks you to type the machine name. After create: "Saved. Add another in *Laser Room*" (keeps room and settings, for the ≤ 30-minute setup target) |
| `/console/labels?ids=` | staff | Print preview (§6.2) |
| `/console/door-poster` | staff | Printable Letter poster: makerspace name, "See which machines are free" + QR → `/machines`; for admins, optionally "New here? Join" + QR → join link |

Pages are Server Components that call `src/data/*`. Each page shell renders immediately and the session-dependent part loads inside `<Suspense>`. Console nav links keep the default prefetch; long lists use `prefetch={false}`.

The **Journey A setup checklist** card on the console home (temporary until Phase 6 builds the full home): ✔ Rooms · ✔ Certifications · ✔ Machines · ✔ Labels printed · ✔ Join link shared.

### 6.2 Label sheet

- **Browser-side QR:** a client component `<QrSvg value size>` (`src/components/qr-svg.tsx`) calls `QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 2 })` from the `qrcode` package and renders the SVG. The server only sends URLs, so no Worker CPU is spent on 60 QR codes (`technologies.md` §5.2). Codes aren't generated on the server because a label sheet has many codes per request.
- **Layouts** (CSS grid + `@page { size: letter; margin: 10mm }`):
  - *Large* (default): 2 × 4 per page, QR ≈ 50 mm. For machines scanned from about 1 m.
  - *Compact*: 3 × 6 per page, QR ≈ 32 mm. Minimum recommended size for reliable phone scanning at 20–30 cm.
- **Label content:** makerspace name (small) · **machine name** (large, bold) · room · QR · "Scan to check your pass" · URL in small print as a fallback.
- **Safety banners:**
  - `environment !== "production"` (a local or E2E server) → a red banner that also **prints**: "NOT THE REAL APP: these labels won't work".
  - `window.location.origin !== baseUrl` → a notice: "Labels point to *baseUrl*".
- `break-inside: avoid` on labels; the screen-only UI is hidden with `@media print`.
- **Contrast:** black on white only, a quiet zone of at least 2 modules, no logos inside the QR.

### 6.3 `/m/[token]` (shell for Phase 3)

File: `src/app/(member)/m/[token]/page.tsx`.

- Signed out → `proxy.ts` sees no session cookie and redirects to `/sign-in?next=/m/<token>`; after sign-in the user comes back here.
- `recognized: false` → neutral page: "This label isn't recognized. It may belong to a machine that's been retired. Ask staff." (no error styling).
- `recognized: true` → machine name, room, makerspace name, and a "Pass coming in Phase 3" placeholder (in the real build, Phase 3 replaces it).
- This page is a hot path (every QR scan is a Worker request and a server render). Keep its server component small: one `getMachineByToken` call, no heavy imports.

---

## 7. Tasks

★ = needed for the PRD 5.1 minimum demo.

### 7.1 Server

| ID | Task |
|---|---|
| P2-01 ★ | Schema in `src/db/schema.ts`; `npm run db:generate` → `drizzle/0002_catalog.sql`; review; apply locally, then to the deployment |
| P2-02 ★ | `withMachineWrite()` in `src/server/machine-write.ts` (§4.3) with retry/jitter and `CONFLICT_RETRY` |
| P2-03 ★ | Rooms service + server actions + page data |
| P2-04 ★ | Certifications service; deactivate guard (`CERT_IN_USE`) as a single guarded statement: `UPDATE certifications SET active = 0 … WHERE id = :id AND NOT EXISTS (SELECT 1 FROM machine_requirements r JOIN machines m ON m.id = r.machine_id WHERE r.certification_id = :id AND m.status <> 'retired')` |
| P2-05 ★ | Machines service with per-field authorization (reject the whole input on any forbidden field) |
| P2-06 ★ | Requirements replace (admin) via `withMachineWrite` |
| P2-07 | Retire (admin) via `withMachineWrite` |
| P2-08 ★ | `getMachineByToken` (Phase 2 shape) |
| P2-09 ★ | `getLabelSheet` (URLs from `PUBLIC_BASE_URL`; `environment` in the result) |
| P2-10 | `getDoorPoster` |
| P2-11 ★ | Zod schemas in `src/server/schemas/catalog.ts` |

### 7.2 UI

| ID | Task |
|---|---|
| P2-20 ★ | Add `qrcode` (+ `@types/qrcode`); `<QrSvg>` client component (memoised) |
| P2-21 ★ | Rooms page |
| P2-22 ★ | Certifications page (admin) |
| P2-23 ★ | Machines list + create/edit form with admin section and "Add another" |
| P2-24 ★ | Label sheet with both layouts, print CSS and safety banners |
| P2-25 | Door poster page |
| P2-26 ★ | `/m/[token]` shell (recognized / not recognized; sign-in redirect via `proxy.ts` matcher) |
| P2-27 | Setup checklist card on console home |
| P2-28 | Console nav: Machines, Rooms, Certifications (admin), Labels |

### 7.3 Deployment configuration

| ID | Task |
|---|---|
| P2-30 ★ | `npm run db:migrate:remote` for `0002`. The deployment's Setup was completed in Phase 1 with the demo makerspace ("Demo Makerspace", clearly fake); add the demo catalog there. A real pilot space starts later from a reset database (Phase 7) |
| P2-31 ★ | Mark the end of "free-form migrations": from now on, every migration follows the additive-only checklist (`drizzle/README.md`) |

### 7.4 Tests

Service tests run in Vitest with `@cloudflare/vitest-plugin` (real `workerd`, fresh local D1), calling services directly with actors and an explicit `now`.

| ID | Test | Covers |
|---|---|---|
| P2-40 ★ | Seed builders: `seed.room()`, `seed.cert({ validityMonths })`, `seed.machine({ room, requires, supervised, typicalSessionMinutes })` | — |
| P2-41 ★ | `tests/services/catalog-rooms.spec.ts`: staff ✔, `actors.member()` → `FORBIDDEN`, duplicate name → `NAME_TAKEN` (case-insensitive) | FR-04, T10 |
| P2-42 ★ | `tests/services/catalog-machines.spec.ts`: staff creates basics ✔; **staff sending `supervised` or `requirementIds` → `FORBIDDEN_FIELD` and nothing changed**; admin ✔; typical minutes default 60, bounds 15/240 | FR-04, T10 |
| P2-43 ★ | Requirements: inactive cert → `CERT_INACTIVE`; replace set works; write token changes | FR-04 |
| P2-44 | Retire: staff → `FORBIDDEN_FIELD`; admin ✔; retired → excluded from `getLabelSheet`, `getMachineByToken` returns `recognized:false`, update → `MACHINE_RETIRED`; row still exists; name reusable after retire | FR-04, FR-06 |
| P2-45 ★ | `tests/services/catalog-certifications.spec.ts`: staff → `FORBIDDEN` on create/update; members can list; validity bounds; non-http URL → `VALIDATION_FAILED`; **deactivate refused while a live machine requires it, allowed after that machine is retired** | FR-05, T10 |
| P2-46 ★ | QR token: 22 chars, base64url alphabet; unchanged after rename/move; unique across 1,000 generated machines | FR-06 |
| P2-47 ★ | Labels: every URL starts with the configured `PUBLIC_BASE_URL` (test sets it to a value different from any request host); selected IDs filter; retired excluded | FR-06 |
| P2-48 ★ | Unknown token → `{ recognized: false }`; `actors.anonymous()` → `UNAUTHENTICATED` | FR-06 |
| P2-49 | `tests/unit/machine-write.spec.ts`: concurrent updates via `Promise.all` → one wins on the first try and the other retries and succeeds; persistent conflict → `CONFLICT_RETRY`; guarded statements don't run when the CAS fails | Concurrency |
| P2-50 | Permission sweep: every new service rejects one role below its minimum (no new test code needed beyond adding the services to the sweep table) | T10 |
| P2-51 | E2E (`tests/e2e/catalog.spec.ts`, Playwright on `next dev` with a throwaway D1): an admin who signed up for real creates a room, a certification and a machine at 375 px, opens the label sheet, and the QR SVG renders | FR-04–06 |

### 7.5 Manual checks (deployed app)

| ID | Check |
|---|---|
| P2-60 ★ | **T01 (partial):** print a label sheet (both layouts) on paper; scan each QR with an **iPhone camera** and an **Android camera** → the correct `/m/<token>` page opens; sign in when prompted → returns to the same machine page |
| P2-61 | Scan a label at 1 m (Large) and 30 cm (Compact) in normal room light |
| P2-62 | Retire a machine → scanning its label shows "label not recognized" |
| P2-63 | Timed run of Journey A setup: 10 machines + 3 certifications + labels printed. Target ≤ 30 min (PRD 4.2). Record the time |
| P2-64 | Labels printed from a local dev server (`npm run dev`) print the red "NOT THE REAL APP" banner |
| P2-65 | Workers Logs: `cpuTime` for `/m/<token>` and `/console/labels` on the deployment stays well under 10 ms (`technologies.md` §5.2) |

---

## 8. Exit criteria

- [x] All Phase 2 service and E2E tests green; the permission sweep covers the new services (2026-11-23: `npm run check` and `npm run test:e2e` pass).
- [ ] The deployment has migration `0002`; the demo makerspace is set up on it.
- [ ] A label printed from **the deployment** opens the right machine on two different phones (T01 partial).
- [ ] Journey A timing recorded (target ≤ 30 min).
- [x] Additive-only migration rule in force (`drizzle/README.md`).

---

## 9. Decisions and open questions

| # | Item | Status |
|---|---|---|
| D1 | QR rendered in the browser (`qrcode` package in a client component), not on the server | Decided: Worker CPU limit (`technologies.md` §5.2, §8) |
| D2 | Machine names unique among non-retired machines | Decided (not in PRD; avoids confusing labels) |
| D3 | Retire is permanent in the MVP; no un-retire | Decided (PRD: "retire and re-add") |
| D4 | Staff input with any admin-only field is rejected whole (no partial apply) | Decided: clearer than silently ignoring fields |
| D5 | Unknown and retired tokens return the same `recognized:false` result | Decided |
| D6 | Label and join URLs come from `PUBLIC_BASE_URL`, never the request's origin | Decided (`technologies.md` §4.6) |
| Q1 | Room deletion: not in PRD. Not in the MVP (rooms with retired machines can't be deleted anyway); rooms can be renamed and reordered | Decided |
| Q2 | Label stock: plain paper + clear tape for the demo; weatherproof vinyl labels for the pilot. Physical cost, outside the $0 software budget | Note |
| Q3 | Should the door poster's join-link QR be printable by staff, or admins only? Admin only, since the join link is an admin setting (PRD 9): `getDoorPoster` returns `joinUrl` to admins only | Decided |

## 10. Risks

| Risk | Mitigation |
|---|---|
| Labels printed from a local or preview server | URL from `PUBLIC_BASE_URL` on the server; red printed banner outside `ENVIRONMENT=production` |
| QR too small or low-contrast to scan | Two tested sizes; black on white; quiet zone; manual scan test (P2-60/61) |
| A future URL change means reprinting every label | Subdomain frozen in Phase 0; label count is small (≤ 60) |
| Setup takes longer than 30 min | "Add another" flow, room pre-select, timed test P2-63 drives fixes |
| The `/m/[token]` server render gets heavy as later phases add to it | Keep it to one data call; check `cpuTime` (P2-65) and again in Phases 3–5 |

## 11. Implementation notes (decided while building)

| Decision | Detail | Date |
|---|---|---|
| Case-insensitive names | drizzle-kit can't express a column-level `COLLATE NOCASE`, so `rooms` and `certifications` get a unique index on `name COLLATE NOCASE` instead (`rooms_name_unique`, `certifications_name_unique`), the same guarantee as the SQL in §3. `machines_name_live` is the partial version. SQLite reports these violations as `UNIQUE constraint failed: rooms.name`; `isUniqueViolation()` (`src/server/db-errors.ts`) maps them to `NAME_TAKEN` | 2026-11-23 |
| Schemas live in `src/lib/schemas/catalog.ts` | Not `src/server/schemas/`: the client forms import them, and everything under `src/server/` (except `domain/`) is `server-only` (AGENTS.md rule 3). Same place as Phase 1's `identity.ts` | 2026-11-23 |
| New error codes | `NAME_TAKEN`, `CERT_INACTIVE`, `CERT_IN_USE` (all 409). `ServiceError` gained an optional `details` (`{ machines: [{ id, name }] }` for `CERT_IN_USE`), carried into `ActionResult` and `toHttp()` | 2026-11-23 |
| `withMachineWrite(db, machineId, now, build, opts?)` | `build(machine, attempt)` returns a plan: `set` (columns), `where` (extra conditions on the swap, re-checked atomically), `guarded(guard)` (statements guarded by the new token), `refused()` (explains a `where` refusal) and `result`. The `data_version` bump is guarded by the new token too, so a lost race doesn't bump it. When the swap changes 0 rows the helper re-reads the token: moved → retry (first try + 3 retries, 10–40 ms jittered backoff) → `CONFLICT_RETRY`; unchanged → `refused()`; row gone → `NOT_FOUND` | 2026-11-23 |
| Creating a machine | One guarded `INSERT … SELECT … WHERE` (room exists AND every chosen certification is active), then requirement inserts guarded by the new machine's write token. So a certification deactivated at the same moment can't leave a machine with a missing requirement: the whole create is refused (`CERT_INACTIVE`). Updates put the same conditions in `withMachineWrite`'s `where` | 2026-11-23 |
| Retire | Admin only, and on its own (combined with other changes → `VALIDATION_FAILED`). Sets `status='retired'`, `retired_at`, `status_changed_at` and clears the out-of-service columns. The confirm dialog asks for the machine's name (client side; the service doesn't need it) | 2026-11-23 |
| Room order | Besides `updateRoom({ sortOrder })`, a `moveRoom({ id, direction })` operation renumbers every room 0…n-1 in one batch, so "move up/down" is atomic and positions stay distinct. New rooms go last (`MAX(sort_order) + 1` inside the insert) | 2026-11-23 |
| Certification list for members | `listCertifications` needs an active member; `includeInactive` needs staff (`FORBIDDEN` for members) | 2026-11-23 |
| Form encoding | Admin fields must be distinguishable from "not sent" (`FORBIDDEN_FIELD` for staff). The admin section sends a hidden `supervised=false` before the checkbox (`optionalBoolean()` takes the last value) and a hidden empty `requirementIds` (`optionalFormArray()` drops empties), so "none ticked" clears the set; the staff form sends neither key. Both helpers are in `src/lib/validation.ts` | 2026-11-23 |
| QR drawing | `<QrSvg>` calls `QRCode.create()` from `qrcode` after hydration and draws one `<path>` (runs of dark modules merged), error correction M, 2-module quiet zone, black on white. Nothing is drawn during server rendering (an empty white square of the same size), so the Worker spends no CPU on codes; no SVG string is injected into the page | 2026-11-23 |
| Label selection | The machine list is a plain `GET` form to `/console/labels` with one `ids` checkbox per machine (works before hydration). `LabelSheetInput` accepts repeated `ids` and the comma list `?ids=a,b,c` | 2026-11-23 |
| Label layouts | Large: 2 × 4, QR 50 mm, QR beside the text (a 50 mm code plus five lines of text doesn't fit a 64 mm-tall cell stacked). Compact: 3 × 6, QR 32 mm. On screen the grid collapses to one column on phones | 2026-11-23 |
| Setup checklist | Rooms, certifications (active) and machines (live) are counted by `getSetupProgress` (one read). "Labels printed" (Print on the label sheet) and "Join link shared" (Copy on Settings, or printing the poster with the join QR) are remembered in that browser's `localStorage` only: no schema change for a card Phase 6 replaces. Staff don't see the two admin-only items | 2026-11-23 |
| `/m/[token]` | `<Gate area="member">` + one `getMachineByToken` read. Token-shaped check first (`[A-Za-z0-9_-]{1,64}`), so junk never reaches D1. The service itself only needs a signed-in user (§5) | 2026-11-23 |
| Demo catalog | `npm run db:seed` loads the P7-70 catalog (4 rooms, 4 certifications, 10 machines, two supervised lathes) into the **local** D1, skipping names that exist. Demo members, grants and `--reset` stay in Phase 7 | 2026-11-23 |
