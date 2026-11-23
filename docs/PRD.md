# Cleared — Product Requirements Document

> **Know who is cleared to use every machine, right at the machine.**
> A live machine status board, certification pass, and maintenance log for education makerspaces. QR stickers and students' own phones; no hardware required.

| Document detail | Value                                                                        |
| --------------- | ---------------------------------------------------------------------------- |
| Course          | ENTI 333 — Fall 2026, Lab 4                                                  |
| Author          | Ryan Wong                                                                    |
| Product         | Cleared (working name; trademark and domain not checked)                     |
| Date            | October 28, 2026                                                             |
| Target platform | Responsive web app built and published on Replit                             |
| Stage           | Concept and classroom MVP. No customers, interviews, or revenue claimed yet. |
| Primary readers | Instructor, prospective pilot partners, and Replit Agent (AI coding agent)   |

---

## 1. Executive Summary

University and library makerspaces let students use laser cutters, 3D printers, CNC mills, lathes, and welders, but only once they are trained on each machine. The University of Calgary's Schulich Makerspace rules, for example, say: *"Only operate machines that you are certified to operate"*, *"Only one person per machine"*, and *"Never work alone in the shop"* ([Schulich shop guidelines](https://schulich.libguides.com/c.php?g=745335&p=5394794)).

Those rules have to be checked by a busy, often student, supervisor, at the machine, in the moment. Whether a person is certified usually lives somewhere else: an LMS course, a badge list, a sign-in system, a spreadsheet, or a paper binder.

**Cleared** puts the answer where it is needed. The app has two sides:

- **Member app (students).**
  - A live **machine status board** shows every machine as *Available*, *In use* (with an estimated free time), or *Out of service* (since when, why, and when it's expected back), plus *Supervision required* and *Issue reported* badges, so students know before they walk over.
  - A QR sticker on each machine opens the student's pass for that machine: **CLEARED**, **SUPERVISION REQUIRED**, **NOT CLEARED** (with exactly what training is missing), or **OUT OF SERVICE**. From the same page the student records a usage session and can report a fault, which immediately marks the machine out of service.
- **Staff console (supervisors and maintenance technicians).**
  - A queue of reported faults, and recurring checkups that are due or overdue.
  - A **per-machine service log**: when each machine was serviced, who did it, and what they did.
  - Machine and user management, and a view of recorded active sessions.

**What Cleared is:** a **decision-support and record-keeping tool**. It verifies *certification records*. It does **not** verify physical presence, physically lock machines, or replace a supervisor (Section 5.4).

**Positioning:** Cleared is a lightweight certification and machine-usage tool for education makerspaces that need point-of-use authorization checks **without adopting a full makerspace management suite** (memberships, billing, bookings, inventory). It combines in one simple app: a live machine status board, QR passes, training sign-offs with expiry, self-reported usage logs, fault reporting, and a maintenance service log. It is priced for a single campus or library space, at about half of the cheapest suite plan reviewed (Section 12).

**MVP promise:** A coordinator can configure machines and certifications in under 30 minutes. A student can see which machines are free before walking over, then scan, see an accurate pass, and record a session in under 15 seconds. Technicians can work through reported faults, log every service, and return machines to service.

## 2. Problem, Customer, and Founder Fit

### 2.1 The problem

Makerspace safety depends on per-machine training, but checking that training at the point of use is manual:

| Pain point | What likely happens today (to be confirmed in interviews) |
|---|---|
| **Is this person trained on this machine?** | The supervisor asks, trusts the answer, or looks it up in a separate system. |
| **Training records are scattered** | Online modules in an LMS or library guide; practical sign-offs on paper, in a spreadsheet, or in a sign-in system; building access on the campus card. |
| **Who is on which machine?** | Sign-in sheets don't record which machine, and nobody signs out. |
| **"Never work alone"** | Hard to monitor across rooms during quiet hours. |
| **A machine is broken** | Someone mentions it or tapes a note on it; the next student may not know. |
| **Is the machine free or working?** | Students walk over to find it busy or broken; there is no shared view of availability or repair status. |
| **What was done to this machine?** | Repairs and checkups are logged on paper, in email, or not at all, so recurring problems and overdue checkups are hard to spot. |
| **Audits and incident reviews** | Answering "who used the lathe on Tuesday, and were they certified?" can take hours, if it is possible at all. |

**Public evidence that the workflow exists:**
- UCalgary runs two makerspaces with separate training paths. TFDL requires a safety orientation, quiz, and electronic waiver for room access, and offers an online module for each piece of equipment plus voluntary digital badges ([TFDL Makerspace Training](https://libguides.ucalgary.ca/makerspace_training), [UCalgary Library Makerspace](https://library.ucalgary.ca/services/makerspace)).
- Schulich has general and advanced access training plus per-machine certification rules ([Schulich Makerspace](https://schulich.ucalgary.ca/departments-centres/makerspace)).
- Ohio State's engineering makerspace states that users must be "certified in the makerspace badging system" and that "Badging is tracked through the sign-in system" ([OSU Makerspace](https://engineering.osu.edu/makerspace)).

How UCalgary spaces record practical sign-offs and check them at the machine is **not publicly documented**. Finding out is the first goal of the interviews (Section 13).

### 2.2 Beachhead market

**Initial buyer:** The coordinator or manager of a single **post-secondary or library makerspace** with 5–60 training-gated machines and student or part-time staff, that does not already run a full makerspace management suite.

**Why this segment:**
- Rules are written down, so the product supports an existing process rather than inventing one.
- Staff turn over every term, so knowledge in a supervisor's head is lost repeatedly.
- Every space has the same core objects: machines, certifications, trainers, sessions, faults.
- Spaces already pay for equipment, consumables, and some software, and safety and liability give a reason to spend.

**Later segments (not in MVP):** High-school shop classes, public-library maker programs, and community makerspaces such as Calgary's non-profit Protospace, which has wood, metal, laser, and 3D-printing equipment and offers equipment classes ([Protospace](https://protospace.ca/)).

**Excluded:** Industrial workplaces (occupational health and safety obligations), and any use where software is expected to *prevent* machine operation.

### 2.3 Market size

| Level | Figure | Basis |
|---|---|---|
| **Published count** | **284** active makerspaces across 214 U.S. *public* colleges and universities (census Sept 2018–Apr 2019); 110 of them library-affiliated | [Melo, Hirsh & March, *portal* 23(1), 2023](https://cdr.lib.unc.edu/downloads/n009wc71m) |
| **Published share** | **~32%** of U.S. academic libraries reviewed run a makerspace (138 of 436, 2025 data) | [Kotuła, *Journal of Academic Librarianship* 52(5), 2026](https://www.sciencedirect.com/science/article/abs/pii/S0099133326001278) |
| **Illustrative addressable market (assumption)** | **400–600** education makerspaces in North America | **Not sourced.** Adds U.S. private institutions, colleges, and Canada to the public-U.S. census, which is dated and U.S.-only. No Canadian census was found. |
| **Qualified prospects (unknown)** | Spaces with training-gated machines and no satisfactory existing system | To be estimated from interviews and outreach |
| **Obtainable in 3 years (assumption)** | 5–10% of the illustrative market → **20–60 Pro spaces** → **CAD $9,800–$29,400 ARR** | Conversion rate is a planning assumption |

**Plain conclusion:** This is a **small, lifestyle-scale business**, not a venture-scale one. It makes sense only because AI-assisted development and serverless hosting let one person build and run it at very low cost. That is the "too niche before AI coding" case the assignment describes. K-12 shops and public libraries are a larger follow-on market that is not sized here.

### 2.4 Founder–problem fit

- **Access:** As a University of Calgary student, the author can approach staff at both campus makerspaces (TFDL and Schulich) and at Protospace. Willingness to participate is not assumed.
- **Personal experience:** As a makerspace user, the author has found it hard to tell, before arriving or even once there, which machines are in use, which are free, and which are broken or waiting for repair. There is no single place to check machine status, and a broken machine is often discovered only when someone tries to use it. This first-hand frustration with machine status and fault visibility is the origin of the idea, and the reason the member machine status board, fault reporting, and the staff maintenance console are core MVP features. The certification side of the problem is less familiar to the author and will be validated through the interviews in Section 13.

### 2.5 Users and jobs to be done

| User | Job to be done | Success for this user |
|---|---|---|
| **Coordinator / admin** (buyer) | "Keep training records accurate and show our rules are followed, without adding staff." | One place for certifications, sessions, and faults; answers audit questions in minutes |
| **Supervisor / trainer** (student staff) | "Know at a glance who is certified for what, and sign people off quickly." | One board for recorded activity; sign-off in under 30 seconds |
| **Maintenance technician** (staff) | "See what's broken or due for a checkup, fix it, and keep a record of what was done." | One fault queue, checkup list, and service history per machine |
| **Member** (student user) | "Find a free machine I'm allowed to use, then get to work." | Status board shows what's free and when busy machines free up; scan → pass in under 15 seconds |

## 3. Positioning and Competition

### 3.1 Differentiation to validate

No single feature below is unique. Cleared's bet is the **combination**, aimed at spaces the suites overserve:

1. **Point-of-use pass.** The app is designed around one action: scan a machine and see your current authorization for it, including supervision requirements.
2. **Education-first workflow.** Online training link → practical sign-off by staff → expiry and renewal, built for term-by-term student staff turnover.
3. **Minimal setup.** No membership, billing, booking, or inventory system to configure.
4. **Single-space affordability.** About half the price of the cheapest suite plan reviewed, with a free tier for very small spaces.
5. **No dedicated hardware.** QR stickers and students' phones cover the core workflow.
6. **Status board and service history.** Students see live availability and repair status; technicians keep a per-machine service log and checkup schedule in the same app.

### 3.2 Competitive alternatives (vendor-published, checked October 28, 2026)

| Alternative | Relevant published offering | Why a buyer might choose it | Cleared's response |
|---|---|---|---|
| **Fabman** | Makerspace suite: training, permissions, door access, billing. Basic €49/month (about €588/year) with "free basic equipment"; €10–14/month per *integrated* machine; Bridge hardware €249 ([pricing](https://fabman.io/pricing), [shop](https://shop.fabman.io/)) | Works without hardware for non-integrated equipment; mature; adds billing and physical enforcement | Cleared Pro (CAD $490/yr) is about half of Fabman Basic, with a narrower, simpler scope. Fabman is the stronger choice if the space wants billing or interlocks. |
| **MakerOps** | Training, waivers, staff sign-off, scan-to-start controller, maintenance, inventory. USD $3,600 / $11,500 / from $24,000 per year; controller $349 ([makerops.ai](https://makerops.ai/)) | Closest feature match; designed for academic spaces | Similar core workflow at a small fraction of the Starter price, for spaces that don't need the full suite |
| **MakerSpace** (makerspaceops.com) | All-in-one platform; "No apps to install. Every machine gets a QR code" to start a *booked* session; can trigger relays ([site](https://makerspaceops.com/)) | Browser QR at the machine already exists here | Booking-centric; Cleared focuses on walk-up certification checks. Pricing not reviewed. |
| **QReserve** | Booking with certification prerequisites and expiry reminders ([makerspaces](https://get.qreserve.com/makerspaces)) | Strong if the space is booking-centric | Cleared is for walk-up use, not reservations |
| **Zipper**, **MakeIT Center** | Membership/booking platforms with certification tags; MakeIT's QR machine access runs through its app and its own devices ([Zipper](https://www.joinzipper.com/business-management-software/makerspaces), [MakeIT](https://makeit.center/markerspace-management-software)) | All-in-one membership and billing | Cleared targets education spaces that don't sell memberships |
| **Homegrown / existing campus systems** | Sign-in and badge systems (e.g., OSU tracks badging through its sign-in system); LMS training modules and badges (e.g., TFDL); campus card access | Already paid for or free; no procurement | Not checkable at the machine; usually no per-machine session or fault log. **This is the most likely competitor.** |
| **Open source** | e.g., Makespace members-app with per-machine QR signs ([GitHub](https://github.com/Makespace/members-app/pull/443)) | Free | Needs volunteer developers to host and maintain |
| **Paper / spreadsheet** | Binders, sign-in sheets | Free, familiar | No point-of-use check, no audit trail |

Also identified but not yet reviewed: WebCheckout and UTA FabApp.

**Competitive conclusion:** The category is proven; several vendors sell certification-gated machine access. Cleared's realistic opponent is **"free, homegrown, and good enough"**, not Fabman. Interviews must show that a point-of-use pass plus fault log is worth CAD $490/year over what a space already has.

## 4. Goals and Success Metrics

### 4.1 Product goals

1. Make the certification answer instant and trustworthy at the machine.
2. Replace paper sign-in with a per-machine, self-reported usage log.
3. Mark broken machines out of service in the app the moment a fault is reported.
4. Show members which machines are free, busy (and until roughly when), or out of service before they walk over.
5. Give technicians one place to track faults, checkups, and a complete service history per machine.
6. Give coordinators an auditable record of every grant, revocation, session, fault, and service.
7. Ship a secure, persistent, published application on Replit.

### 4.2 Pilot success criteria (targets, not results)

| Metric | Target | Measurement |
|---|---|---|
| Setup time | Coordinator configures 10 machines + 3 certifications + prints labels in **≤ 30 min** | Timed observation |
| Scan-to-pass time (warm) | Median **≤ 15 s** from scan to pass for a signed-in member | Timed phone tests |
| Scan-to-pass time (cold start) | Median **≤ 25 s** after the app has been idle | Timed tests after 30 min idle |
| Sign-off time | Trainer records a practical sign-off in **≤ 30 s** | Timed observation |
| Status check | **4 of 5** students find a free machine they're cleared for, and when a busy one is expected free, in **≤ 10 s** | Task-based usability test |
| Service logging | **100%** of resolved faults have a service record (enforced by the app); a record takes **≤ 60 s** to enter on a phone | App data + timed observation |
| Supervisor check | **4 of 5** supervisors identify, from the staff console, who has a recorded session on a machine and which machines are out of service, in **≤ 20 s** | Task-based usability test |
| Session logging coverage | **≥ 70%** of observed machine uses have a recorded session | Spot-check observation vs. logs |
| Fault handling | **100%** of out-of-service fault reports show OUT OF SERVICE on the next scan | Automated test + pilot log |
| Buying signal | **1+** coordinator agrees to a paid pilot or names a specific purchase condition | Recorded follow-up |

## 5. Scope and Priorities

### 5.1 Minimum classroom demo (must work first)

1. Admin creates a makerspace and a machine.
2. App generates a printable QR label.
3. Student scans the label and signs in.
4. App shows NOT CLEARED with the missing certification and its training link.
5. A staff member signs off the certification.
6. Student scans again and sees CLEARED.
7. Student starts a recorded session with an expected duration; the status board shows the machine **In use** with an estimated free time.
8. Student reports a fault that takes the machine out of service; the status board shows **Out of service** with the time reported.
9. Technician sees the fault in the staff console, logs a service record (who, when, what was done), and returns the machine to service.
10. The status board shows the machine **Available**, and the machine's service history shows the repair.

### 5.2 P0 — Classroom MVP

The MVP runs **one makerspace per deployment**, which is all a pilot needs.

- **Accounts:** Clerk sign-in. The first account completes setup and becomes admin. Everyone else joins with the member join link. Roles: admin, staff, member.
- **Setup:** rooms; machines (name, room, typical session length, *supervised* flag, required certifications); certifications (name, optional training link, optional validity in months); printable QR label sheet.
- **Certifications:** staff sign off members, with optional expiry, and can revoke. Nobody can sign off themselves.
- **Member app:** machine status board; machine pass; start/extend/end a session with an expected duration; report a fault; my certifications.
- **Staff console:** home summary; fault queue; out-of-service details; machine detail with full service log; log service; checkups due/overdue; machine and room management; members (sign off, revoke, suspend).

### 5.3 Deferred to fit the timeline

| Feature | Why it's deferred, and what the MVP does instead | When |
|---|---|---|
| Multiple makerspaces in one deployment | Tenant isolation touches every table and query; a pilot needs one space | P1, before a second customer |
| Fault email alerts | Provider setup, delivery tracking, and retries. Instead, the staff console shows the open-fault count | P1 |
| Staff email invitations | Admin promotes an existing member to staff | P1 |
| Per-certification trainer rights | Any staff member can sign off any certification | P1 |
| Prerequisite attestation, in-app quizzes | The pass links to the existing online training | P1 |
| Buddy-required rooms / lone-working warnings | Needs presence data the app can't verify | P1 |
| Staff-only machines | The *supervised* flag covers the MVP | P1 |
| Hand-over of another member's session | Sessions auto-end at their expected time; staff can end a stuck session | P1 |
| Fault assignment | Small teams work the queue in order | P1 |
| Separate audit-log table and viewer; CSV export/import | Grants, sessions, faults, and service records already store who and when | P1 |
| QR token regeneration | Reprint labels; retire and re-add a machine if a label is misused | P1 |
| Shared (cross-instance) rate limits | A basic per-instance limit is enough for a pilot | P1 |
| Reservations, parts inventory, LMS/SSO integration, hardware interlocks, billing, analytics, native apps | Only after validation | P2 |

### 5.4 What Cleared does not do

Cleared is a **decision-support and record-keeping tool**, not a safety system or access-control system. These limits must be stated in the app's help page and terms:

- **It does not verify physical presence.** A scan proves a signed-in account opened the machine page, not that the person is standing there. Sessions are **self-reported**.
- **"In use" and estimated free times are self-reported estimates.** A machine may free up early, run over, or be in use without a recorded session.
- **It does not verify supervision.** "Supervision required" displays a requirement; it does not confirm a supervisor is present.
- **It cannot stop a machine.** Out of service and NOT CLEARED are displays and records; they do not cut power.
- **Its records are only as accurate as staff keep them.** Missed revocations or wrong sign-offs produce wrong passes.
- **Screenshots and shared phones** are mitigated (live clock, name on pass), not prevented.
- **Supervisors remain responsible** for enforcing physical safety rules. Emergencies and injuries follow institutional procedures, not Cleared.

## 6. Core User Journeys

### Journey A — Admin sets up the makerspace

1. The first person to sign in completes **Setup** (makerspace name, time zone) and becomes admin.
2. Add rooms (e.g., *Laser Room*, *Wood Shop*).
3. Add certifications (e.g., *Laser Cutter — Basic*, training link to the existing online module, valid 12 months).
4. Add machines (e.g., *Epilog Laser #1*, Laser Room, requires *Laser Cutter — Basic*, typical session 60 min; *Metal Lathe*, **supervised**).
5. Print the label sheet and stick each label on its machine.
6. Share the member join link. Promote supervisors and technicians to **staff** from the Members page.

### Journey B — First-time member scans a machine

1. Scan the QR (or open the join link) → sign in → join.
2. The pass shows red **NOT CLEARED**, listing the missing certification with its training link.
3. After the student completes the training, a staff member signs them off (Journey C). The next scan shows the correct pass.

### Journey C — Staff member signs off a member

1. Staff console → **Members** → search the student → **Sign off** → pick the certification.
2. A grant is created, attributed to the staff member, with its expiry.

### Journey D — Member uses a machine

1. Scan → the pass shows the member's name, the machine, a live ticking clock (so a screenshot is obvious), and the earliest certification expiry:
   - **CLEARED** (green): all required certifications valid.
   - **SUPERVISION REQUIRED** (amber): certifications valid, but staff must be present. To start, the member ticks **"A supervisor is present"** (recorded as self-reported).
   - **NOT CLEARED** (red) or **OUT OF SERVICE** (grey): no Start button.
2. Tap **Start session** and pick an expected duration (15/30/60/120 min). The status board shows *In use · est. free 3:10 pm*.
3. If the machine already has an active session, the pass shows *In use since 2:14 pm · est. free 3:10 pm* and Start is disabled. If the machine is actually free, a staff member can end the old session.
4. Tap **+15 min** to extend, or **Done** when finished. A session left open ends automatically at its expected end time.

### Journey E — Fault reported

1. From the pass, tap **Report a problem** → description + checkbox **"Unsafe or not working — take out of service"**.
2. If checked, the machine shows **OUT OF SERVICE** to everyone, and any active session on it ends.
3. The fault appears in the staff console's fault queue, the open-fault count goes up, and the status board shows *Out of service · issue reported 11:05 am*.

### Journey F — Member checks machine status

1. Open **Machines** in the member app (bookmark, or a QR code at the door).
2. See machines grouped by room, each with colour + word:
   - *Available*
   - *In use · est. free 3:10 pm*
   - *Out of service · since 11:05 am · "Blade replacement, back Thu 2 pm"*
   - Badges: *Supervision required*, *Issue reported (still usable)*
3. Each tile shows ✔/✖ for whether the member is cleared for it. A filter shows only machines the member is cleared for.
4. The board never shows who is using a machine.

### Journey G — Technician handles a fault

1. Staff console → **Fault queue** (out-of-service first, then oldest).
2. Optionally add a public note and expected-back time to the out-of-service machine ("Replacing belt, back Thu 2 pm"). Members see these on the board.
3. After the work, tap **Log service**: when (defaults to now), who (defaults to self; optionally an external technician or vendor), type (repair), what was done, parts used, time spent, and outcome.
4. The service record resolves the linked fault. If the outcome is *returned to service* and no other out-of-service fault is open, the machine becomes *Available*.

### Journey H — Scheduled checkup

1. Staff add a recurring checkup to a machine (e.g., *Laser — clean lens and mirrors, every 14 days*).
2. The staff console's **Checkups** list shows *Due soon* (within 7 days) and *Overdue*.
3. The technician does the checkup and logs a *scheduled checkup* service record linked to it; the next due date resets.
4. The machine detail page shows the full service history: date, who, type, what was done, and any linked fault or checkup.

## 7. Functional Requirements and Acceptance Criteria

All P0. Deferred items are listed in 5.3.

| ID | Requirement | Acceptance criteria |
|---|---|---|
| **FR-01** | Setup and sign-in | Users sign in with Clerk (email with verification, or Google). On a fresh deployment the first signed-in user completes setup (makerspace name, time zone) and becomes admin; setup is then closed. Signed-out requests to private pages/APIs get 401 or a sign-in redirect. |
| **FR-02** | Joining | A signed-in user joins as `member` using the current join link. Admin can regenerate the link, which invalidates the old one. Users without a membership see "Ask staff for the join link". Re-joining never changes an existing membership. |
| **FR-03** | Roles and suspension | Admin sets roles (`admin`/`staff`/`member`). Staff and admin can suspend/reactivate users with the `member` role; only admin can suspend staff or admins. The last active admin cannot be demoted or suspended. |
| **FR-04** | Rooms and machines | Staff and admin manage rooms (name) and machine basics (name, room, typical_session_minutes, default 60). **Admin only:** required certifications, `supervised` flag, retire. Retired machines disappear from the board, their labels show "not recognized", and their history is kept. |
| **FR-05** | Certifications | Admin creates/edits certifications (name, optional training_url, optional validity_months). A certification required by a non-retired machine cannot be deactivated. |
| **FR-06** | QR labels | Each machine has a unique random token (≥ 128 bits). Staff print a label sheet (all or selected machines) showing QR + machine name + makerspace name, built from the published URL. Reprinting reuses the token. Unknown tokens show a neutral "label not recognized" page. |
| **FR-07** | Sign-off | Staff and admin grant a certification to **another** member; nobody can grant to themselves, including admins. `expires_at = granted_at + validity_months`, or null. Each request carries a client request ID, so a double-tap creates one grant. Re-granting creates a new grant; old grants stay in history. |
| **FR-08** | Revocation and suspension effects | Staff and admin revoke a grant with a reason; the effect is immediate. Revocation or suspension ends the member's active sessions (`authorization_removed`). |
| **FR-09** | Machine pass | Server computes exactly one status, in this precedence:<br>• `OUT_OF_SERVICE`<br>• `NOT_CLEARED`: lists each missing certification with its training link. Non-members see a join prompt; suspended members see "Contact staff".<br>• `SUPERVISION_REQUIRED`: members on supervised machines.<br>• `CLEARED`<br><br>Staff and admins with valid certifications get `CLEARED` on supervised machines. A machine with no requirements is `CLEARED` for any active member. The pass shows a live clock, the member's name, the machine, and the earliest expiry. |
| **FR-10** | Sessions | A member with `CLEARED`, or `SUPERVISION_REQUIRED` plus the acknowledgment, starts a session with an expected duration (15–240 min; default typical_session_minutes), stored as `expected_end_at`.<br>• One active session per machine; starting on a busy machine is refused.<br>• Members can extend to a 240-minute total and end their own sessions; staff can end any session.<br>• A session is active while `ended_at` is null and now < `expected_end_at`. Past that, it is closed with `ended_at = expected_end_at` (`expired`) on the next write to that machine or the next board poll. No background job. |
| **FR-11** | Member status board | Any active member sees all non-retired machines, grouped by room, each in one state:<br>• **Available**<br>• **In use**: since time and "est. free" time<br>• **Out of service**: reason (`issue reported`/`maintenance`/`other`), since time, staff note, expected-back time<br><br>Badges show *Supervision required* and *Issue reported (still usable)*. Each tile shows ✔/✖ for the viewer's clearance, with filters by room and "cleared for me". **It never shows who is using a machine, fault descriptions, or reporter names.** It polls every 30 s and shows "updated at". |
| **FR-12** | Fault reports | Any member reports a fault on a non-retired machine (description 10–1000 chars). "Take out of service" sets status `out_of_service` with reason `issue_reported` and ends the active session (`machine_down`). |
| **FR-13** | Out-of-service details | Staff set a machine out of service with a reason (`maintenance`/`other`), an optional public note (≤ 200 chars), and an expected-back time; they can add a note and time to a fault-triggered one too. Return to service clears these details. It is refused while any open fault on that machine took it out of service; that fault must be resolved by a service record. |
| **FR-14** | Fault queue | Staff see open faults, out-of-service ones first then oldest, with machine, reported time, reporter, description, and age. |
| **FR-15** | Service log | Staff log service records on a machine with:<br>• **performed_at**: defaults to now; cannot be in the future.<br>• **performed by**: a staff member, default self; optionally an external technician or vendor name.<br>• **type**: `repair`/`scheduled_checkup`/`inspection`/`cleaning`/`calibration`/`other`.<br>• **work done**: required, 10–2000 chars.<br>• **optional**: parts used, minutes spent, linked open faults, linked checkup.<br>• **outcome**: `returned_to_service`/`still_out_of_service`/`passed`/`issues_found`.<br><br>Linked faults are resolved. `returned_to_service` returns the machine to service unless another out-of-service fault remains open. Records are append-only; a correction is a new record that references the original. The machine detail page lists the full history, newest first. |
| **FR-16** | Checkups | Staff create recurring checkups per machine (name, interval_days, optional instructions). Next due = the latest linked `scheduled_checkup` record's performed_at (or the checkup's creation date) + interval. The console lists **Due soon** (≤ 7 days) and **Overdue**. Advisory only; never blocks use. |
| **FR-17** | Staff console home | Shows:<br>• counts of open faults and due/overdue checkups<br>• out-of-service machines<br>• active sessions (member, machine, est. end), labelled self-reported<br>• sessions whose member is no longer authorized, e.g. a certification that expired mid-session<br><br>Polls every 30 s. |
| **FR-18** | Certification records | Members see their own grants, expiries, training links, and recent sessions. Staff can search members and see the same for anyone. |
| **FR-19** | Basic abuse protection | Per-instance rate limits on session starts, fault reports, and joins (e.g., 20/min per user; 429 when exceeded). All input validated and escaped. |

### 7.1 Business rules

- **Pass logic is server-side only.** The client never decides status; time comparisons use server UTC.
- **Requirements are AND.** Each required certification needs a current valid grant: not revoked, and expiry null or in the future.
- **Mid-session expiry** does not end a session; the staff console flags it.
- **Retired machines** accept no sessions or faults (409).
- **Privacy on the status board:** machine state only, never who is using a machine, fault text, or reporter names. Staff see full details in the console.
- **Estimates are labelled.** Estimated-free and expected-back times always display as estimates ("est. free 3:10 pm").
- **Service history is append-only.** Records are never edited or deleted; a correction is a new record that references the original.
- **Timezone:** Store UTC; display in the makerspace's time zone (default `America/Edmonton`).

## 8. Screens

The app has two sides with one sign-in. Members see only the member app; staff and admins can switch between both.

### 8.1 Member app

| Screen | Contents |
|---|---|
| Sign-in / Join | Clerk sign-in; join confirmation, or "Ask staff for the join link" |
| **Machine status board** | Machines by room as colour-coded tiles: Available; In use (est. free time); Out of service (since, reason, note, expected back). Badges, ✔/✖ "cleared for me", room filter |
| **Machine pass** (`/m/{token}`) | Large status (colour + icon + word), member name, machine, live clock, missing certifications with training links, supervision checkbox, Start (with expected duration) / +15 min / Done, Report a problem |
| My certifications | Grants, expiries, training links, recent sessions |
| Help | The limits in Section 5.4, in plain language |

**Status board sketch (mobile; names and times illustrative):**

```
Schulich Makerspace — Machines              updated 2:41 pm
[All rooms ▾]   [☐ Only machines I'm cleared for]

LASER ROOM
┌───────────────────────────┐ ┌───────────────────────────┐
│ ● Epilog Laser #1      ✔  │ │ ● Epilog Laser #2      ✔  │
│ IN USE                    │ │ AVAILABLE                 │
│ est. free 3:10 pm         │ │                           │
└───────────────────────────┘ └───────────────────────────┘
WOOD SHOP
┌───────────────────────────┐ ┌───────────────────────────┐
│ ● Bandsaw              ✔  │ │ ● Table Saw            ✖  │
│ OUT OF SERVICE            │ │ AVAILABLE                 │
│ issue reported 11:05 am   │ │ Supervision required      │
│ "Blade replacement,       │ │                           │
│  back Thu 2 pm"           │ │                           │
└───────────────────────────┘ └───────────────────────────┘
```

### 8.2 Staff console (supervisors and maintenance technicians)

| Screen | Audience | Contents |
|---|---|---|
| **Console home** | Staff, admin | Open-fault and checkup counts, out-of-service machines, active sessions (self-reported), no-longer-authorized sessions |
| **Fault queue** | Staff, admin | Open faults (out-of-service first, then oldest) with reporter, description, age; Log service |
| **Checkups** | Staff, admin | Due soon / overdue; create and edit recurring checkups |
| **Machine detail** | Staff, admin | Status controls (out of service with reason, note, expected back), open faults, checkups, **full service history**, recent sessions |
| **Log service** | Staff, admin | When, who (self / other staff / external technician), type, work done, parts, minutes, linked faults and checkup, outcome |
| Machines / Rooms | Staff (basics), admin (all) | Add, rename, and move machines and rooms; typical session length; label sheet. Admin: required certifications, supervised flag, retire |
| Members | Staff, admin | Search; member detail (certifications, sessions); sign off, revoke, suspend members. Admin: roles |
| Certifications | Admin | Create/edit, training link, validity |
| Settings | Admin | Makerspace name, time zone, join link |

**Machine detail sketch (names illustrative):**

```
Bandsaw — Wood Shop                              OUT OF SERVICE
Open fault: "Blade wandering, burning smell" · reported 11:05 am
Checkup: Blade & guide inspection · every 30 days · due Nov 4

SERVICE HISTORY
Oct 14  J. Lee      Scheduled checkup  Inspected blade and guides;
                                       adjusted tension          → Passed
Sep 29  Vendor: Calgary Tool Repair (logged by M. Chen)
                    Repair             Replaced drive belt        → Returned to service
Sep 12  M. Chen     Cleaning           Cleared dust collection port → Passed
```

**Design:** The member app is mobile-first (works at 320 px), and the pass is readable from 1–2 m away. Status always uses colour **plus** icon **plus** word, never colour alone. The staff console works on desktop and on a phone, so technicians can log service at the machine. All screens have accessible labels, visible focus, and clear loading/error/empty states.

## 9. Permissions

| Action | Admin | Staff | Member |
|---|---|---|---|
| View status board, own pass and certifications; start/extend/end own session; report fault | ✔ | ✔ | ✔ |
| Staff console: home, fault queue, checkups, machine detail, service history, members | ✔ | ✔ | ✘ |
| Sign off and revoke certifications for **other** members | ✔ | ✔ | ✘ |
| End anyone's session; set out of service / return to service; log service; manage checkups | ✔ | ✔ | ✘ |
| Create/edit rooms and machine basics; print labels | ✔ | ✔ | ✘ |
| Suspend/reactivate members | ✔ | ✔ | ✘ |
| Certifications; machine requirements and supervised flag; retire machines | ✔ | ✘ | ✘ |
| Change roles; suspend staff/admins; join link; makerspace settings | ✔ | ✘ | ✘ |

Every API checks the caller's role on the server. Hiding buttons in the UI is not security.

## 10. Replit Technical Design

### 10.1 Stack

| Component | Choice | Reason |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind | Standard Replit Agent stack; mobile-first pages |
| Backend | Node.js + Express + TypeScript (same Replit app) | One deployment, one language |
| Database | Replit PostgreSQL + Drizzle ORM | Transactions, row locks, partial unique indexes |
| Auth | Replit-managed **Clerk Auth** (email with verification, Google) | Users don't need Replit accounts |
| QR | Server-side QR library → SVG; printable label sheet page | No paid service |
| Publishing | Replit **Autoscale** (Reserved VM considered for pilots, see 10.2) | Low, bursty traffic |
| Email (P1) | Resend via Replit's Resend connector | For fault alerts after the MVP |

### 10.2 Replit constraints and how the design handles them

| Constraint (per Replit docs) | Design response |
|---|---|
| Replit-managed Clerk does **not** support Clerk Organizations | Roles live in our own `members` table |
| Clerk development and production have **separate user stores** | Production test accounts are created on the published app (T11) |
| Separate dev and prod databases; schema changes are applied to production on publish; renames, dropped columns, and required columns without defaults are risky | After first publish, only additive changes with nullable or defaulted columns; check in a deployment preview |
| Autoscale scales to zero; it is not an always-on worker | **No background jobs.** Sessions expire by comparing against `expected_end_at` and are closed on writes and board polls. Checkup due dates are computed on read |
| Scale-to-zero means **cold starts** | Measure scan-to-pass after idle (T12). If it misses target in a pilot, switch that deployment to a Reserved VM and budget for it |
| QR labels encode the app's URL | Generate labels only from the stable published URL (`*.replit.app` or a custom domain), never the dev URL; a domain change means reprinting |
| Hosting region and plan limits | Confirm Replit's data-hosting region and plan limits before any university pilot (see Risks: data residency) |

### 10.3 Data model

All tables have `id` (UUID PK) and `created_at`.

| Table | Columns and constraints |
|---|---|
| `settings` | Single row: `name`, `timezone`, `member_join_token` |
| `members` | `clerk_user_id` (**unique**), `email`, `display_name`, `role` (`admin`/`staff`/`member`), `status` (`active`/`suspended`) |
| `rooms` | `name` |
| `certifications` | `name`, `training_url` (nullable), `validity_months` (nullable), `active` |
| `machines` | `room_id`, `name`, `supervised` (bool), `status` (`available`/`out_of_service`/`retired`), `status_changed_at`, `out_of_service_reason` (`issue_reported`/`maintenance`/`other`, nullable), `status_note` (nullable), `expected_back_at` (nullable), `qr_token` (**unique**), `typical_session_minutes` (default 60) |
| `machine_requirements` | `machine_id`, `certification_id`. **PK** both |
| `grants` | `member_id`, `certification_id`, `granted_by_member_id`, `granted_at`, `expires_at` (nullable), `client_request_id` (**unique**), `revoked_at`, `revoked_by_member_id`, `revoke_reason` |
| `sessions` | `machine_id`, `member_id`, `started_at`, `expected_end_at`, `ended_at` (nullable), `end_reason` (`user`/`staff`/`expired`/`machine_down`/`authorization_removed`), `supervision_acknowledged` |
| `faults` | `machine_id`, `reported_by_member_id`, `description`, `took_out_of_service`, `status` (`open`/`resolved`), `resolved_by_service_record_id` (nullable), `resolved_at` |
| `service_records` | `machine_id`, `performed_at`, `performed_by_member_id`, `external_technician` (nullable), `logged_by_member_id`, `type`, `work_done`, `parts_used` (nullable), `minutes_spent` (nullable), `outcome`, `checkup_id` (nullable), `corrects_record_id` (nullable). Insert-only |
| `checkups` | `machine_id`, `name`, `interval_days` (≥ 1), `instructions` (nullable), `active` |

**Concurrency rules:**
- **Partial unique index** on `sessions(machine_id) WHERE ended_at IS NULL`.
- Session start, fault-with-out-of-service, and service records that resolve faults or return a machine to service each run in one transaction that first locks the machine row (`SELECT … FOR UPDATE`). Inside the lock: close expired sessions, re-check status and the caller's pass, then write.
- Revocation and suspension update the grant or member and end affected sessions in one transaction.
- Indexes: `grants(member_id, certification_id)`, `faults(machine_id, status)`, `service_records(machine_id, performed_at)`, `checkups(machine_id)`.

**QR token design:** A random 128-bit URL-safe token stored as-is. The label is public and only identifies the machine, and the pass requires a signed-in member.

**Adding multiple makerspaces later (P1):** add a `spaces` table and a nullable, backfilled `space_id` on each table. This is an additive change, safe under Replit's publish-time schema sync.

### 10.4 API

All `/api` routes require Clerk auth and check the caller's role on the server.

| Method & path | Purpose | Role |
|---|---|---|
| `GET /m/:token` | Machine pass page (SPA route) | Public page; prompts sign-in |
| `GET /api/machines/by-token/:token` | Machine, caller's pass, current-session summary | Signed in |
| `GET /api/me` | Caller's membership and role | Signed in |
| `POST /api/setup` | First-run setup | First user only |
| `POST /api/join` | Join `{ token }` | Signed in |
| `PATCH /api/settings` · `POST /api/settings/join-link/regenerate` | Name, time zone; new join link | Admin |
| `GET/POST/PATCH /api/rooms[/:id]` | Rooms | Staff |
| `GET/POST/PATCH /api/machines[/:id]` | Machine basics (staff); requirements, supervised, retire (admin only, enforced per field) | Staff / Admin |
| `GET /api/machines/:id/detail` | Status, open faults, checkups, service history, recent sessions | Staff |
| `POST /api/machines/:id/status` | `available` ↔ `out_of_service` with `{ reason, note, expectedBackAt }` | Staff |
| `GET /api/labels` | Printable label sheet (optional `machineIds`) | Staff |
| `GET/POST/PATCH /api/certifications[/:id]` | Certifications | Admin (GET: all) |
| `POST /api/grants` · `POST /api/grants/:id/revoke` | Sign off `{ memberId, certificationId, clientRequestId }`; revoke `{ reason }` | Staff |
| `POST /api/machines/:id/sessions` | Start `{ expectedMinutes, supervisionAcknowledged? }` | Member |
| `POST /api/sessions/:id/extend` · `POST /api/sessions/:id/end` | Extend `{ minutes }`; end | Owner (end: owner or staff) |
| `POST /api/machines/:id/faults` | Report fault | Member |
| `GET /api/faults?status=open` | Fault queue | Staff |
| `GET/POST /api/machines/:id/service-records` | Service history / log service `{ performedAt, performedByMemberId?, externalTechnician?, type, workDone, partsUsed?, minutesSpent?, faultIds, checkupId?, outcome, correctsRecordId? }` | Staff |
| `GET/POST/PATCH /api/machines/:id/checkups[/:checkupId]` · `GET /api/checkups?due=soon` (or `overdue`) | Checkups | Staff |
| `GET /api/status-board` | Member status board; no names or fault text (also closes expired sessions) | Member |
| `GET /api/console` | Staff console home (also closes expired sessions) | Staff |
| `GET /api/me/certifications` | Own grants and sessions | Member |
| `GET /api/members[/:id]` · `PATCH /api/members/:id` | Search/detail; role (admin), status (staff for members, admin for all) | Staff / Admin |

## 11. Non-functional Requirements and Tests

### 11.1 Security and privacy

- Server-side role checks on every route (Section 9).
- Validate and escape all input; basic rate limits per FR-19.
- Clerk keys in Replit Secrets only; nothing secret in the frontend.
- Collect only name, email, and machine-use records. No photos or student ID numbers.
- **Test authentication:** automated tests run in development with a test-only auth stub. The server refuses to start if the stub is enabled in production.
- Before any real university pilot: the institution's privacy review, a privacy notice, a retention rule (e.g., sessions kept 2 years), and an answer on data residency.

### 11.2 Quality targets

- Pass page interactive in ≤ 2 s on a mid-range phone when warm; cold-start target per Section 4.2.
- Pass and status board legible at 320 px; status uses colour + icon + text.
- All timestamps stored in UTC.

### 11.3 Required tests

**[A]** = automated API integration test in development. **[M]** = manual test on the published app with production accounts.

| Test | Covers | Pass condition |
|---|---|---|
| T01 [M] | FR-06, FR-09 | Printed QR scanned on a physical phone opens the correct machine pass |
| T02 [A] | FR-09 | No grant → NOT_CLEARED with training link; all grants → CLEARED; two requirements need both; zero requirements → CLEARED; supervised → SUPERVISION_REQUIRED for members, CLEARED for staff; non-member and suspended messages; out of service overrides all |
| T03 [A] | FR-07 | Nobody, including admin, can sign off themselves; members get 403; expiry → NOT_CLEARED after expiry; revoke is immediate; same client request ID twice → one grant; re-grant keeps history |
| T04 [A] | FR-08, FR-17 | Revocation and suspension end the member's active sessions; mid-session expiry appears on the console |
| T05 [A] | FR-10 | Concurrent starts → exactly one active session; start on a busy machine refused; supervised start without acknowledgment refused; extension capped at 240 min; expired session closed with `ended_at = expected_end_at` |
| T06 [A] | FR-11 | Available / In use (est. free) / Out of service (reason, since, note, expected back) / Issue reported badge correct; ✔/✖ matches pass logic; response never contains user names, fault descriptions, or reporter IDs |
| T07 [A] | FR-12, FR-13, FR-14 | Out-of-service fault ends the session and sets `issue_reported`; fault on retired machine → 409; return to service refused while an out-of-service fault is open; queue order correct |
| T08 [A] | FR-15 | Work done and outcome required; future date rejected; linked faults resolved; `returned_to_service` sets Available only if no other out-of-service fault is open; records can't be edited or deleted; correction links to original; external technician stored |
| T09 [A] | FR-16 | Next due computed correctly; due-soon and overdue lists correct; logging a linked checkup resets next due |
| T10 [A] | FR-01–FR-05, Section 9 | Signed out → 401; members → 403 on console routes; staff → 403 on admin-only fields and routes; staff can suspend members but not staff/admins; last admin can't be demoted or suspended; regenerated join link invalidates the old one; setup can't be rerun |
| T11 [M] | Persistence | On the published app with production accounts, data survives refresh and republish |
| T12 [M] | Section 4.2 | Warm and cold-start scan-to-pass times measured and recorded |

## 12. Business Model

### 12.1 Pricing hypothesis (CAD; to be tested, not validated)

| Plan | Price | Includes |
|---|---|---|
| **Free** | $0 | 1 space, up to 5 machines. Lets a coordinator try it without purchase approval |
| **Pro** | **$490 / year** (or $49/month) per space | Up to 60 machines, unlimited members; CSV export when built (P1) |
| **Campus** (after P1 multi-space) | $1,900 / year | Up to 5 spaces, shared member directory |

**Rationale:**
- Fabman Basic is €49/month (about €588/year, roughly CAD $880–940 depending on exchange rate). Cleared Pro is about **half** that, for a narrower product.
- MakerOps Starter is USD $3,600/year.
- A low price is meant to fit within a coordinator's own approval authority. Each institution's threshold is unknown and is an interview question.
- Pilots run on a free Pro trial, so the Free tier's 5-machine cap doesn't limit them.
- Billing is **not** built in the MVP.

### 12.2 Where the value comes from

Supervisors are paid to be present during open hours, so time saved at the door is **not** a direct cost saving. The value case rests on:

1. **Risk and audit (primary, not yet quantified).** After an incident or complaint, the space can show in minutes who had a recorded session, whether they held a valid certification, who signed them off, and whether the machine was in service. The cost of *not* having this (incident reviews, insurance questions, reputational harm, losing access to a space) is the key interview question.
2. **Coordinator admin time (secondary).** Coordinators maintain training spreadsheets, renew certifications at term start, answer "is X trained on Y?" questions, and compile records. These hours compete with other paid work.
3. **Maintenance history (secondary).** A per-machine service log supports warranty claims and vendor follow-up, reveals recurring failures, keeps checkups from being forgotten, and replaces paper logbooks. Students also waste fewer trips to busy or broken machines.

**Break-even on coordinator time:** Pro at CAD $490/year, coordinator time valued at an illustrative CAD $35/hour, 35 active weeks per year. Break-even = $490 ÷ $35 = **14 hours/year = 24 minutes/week**.

| Coordinator admin time saved per week | Hours per year (× 35 weeks) | Value per year (× $35/h) |
|---:|---:|---:|
| 15 min | 8.75 h | $306 |
| 30 min | 17.5 h | $613 |
| 60 min | 35 h | $1,225 |

Cleared breaks even on time alone at roughly **25 minutes of saved coordinator work per week**. Any risk-and-audit value is on top. Both figures are assumptions that Stage A must test.

### 12.3 Revenue scenario (not a forecast)

40 Pro spaces × CAD $490 = **CAD $19,600 ARR**, before hosting, email, support, and payment fees. This is consistent with the lifestyle-scale conclusion in 2.3. Replit Autoscale, database, and email costs per space must be measured in the pilot; a Reserved VM for cold-start reasons would add a fixed monthly cost.

### 12.4 Go-to-market

1. **Local proof:** Free pilot at one UCalgary makerspace or Protospace.
2. **Case study:** Session-logging coverage, sign-off records, fault response, coordinator feedback.
3. **Direct outreach** to makerspace coordinators through academic library and makerspace communities. One credible case study travels.
4. **Free → Pro** when a space passes 5 machines.

## 13. Validation Plan

### Stage A — Problem interviews

Targets: **TFDL Makerspace staff**, **Schulich Makerspace technicians and student supervisors**, **Protospace trainers/volunteers**, plus at least one other Calgary post-secondary makerspace. Aim for 6 interviews.

**Problem**
1. "Walk me through what happens when a student walks up to the laser cutter. How do you know they're trained?"
2. "Where are practical sign-offs recorded today? Who can see them?"
3. "When did a check last fail: an untrained person on a machine, or a trained person turned away?"
4. "How do you handle 'never work alone', 'one person per machine', and machines that need a supervisor present?"
5. "How do you find out a machine is broken, and how long until the next user knows?"
6. "If something went wrong, how would you show who used it and that they were certified? Has that ever been asked of you?"

**Willingness to pay**

7. "What do you spend on software for the space today, and from whose budget?"
8. "Who approves a $500/year tool? What can you spend without a formal procurement process?"
9. "Would IT or privacy require single sign-on or Canadian data hosting?"
10. "Would you switch from your current system? What would have to be true?"
11. "Would you run a two-week free pilot, and pay for a term after it if it works?"

**Record:** current tools, frequency of checks, admin hours, past incidents, budget owner and limit, procurement and privacy requirements, objections.

### Stage B — Prototype test

Show the minimum demo (5.1) to 3+ coordinators and 5+ students. Time scan-to-pass with students. Have coordinators compare it to their current process and one competitor's site.

### Stage C — Two-week pilot

One space, 5–10 machines labelled. Measure logging coverage, scan-to-pass time (warm and cold), sign-offs recorded, faults reported, and supervisor feedback.

### Stage D — Buying signal

Ask for a paid term or a specific purchase condition. Record procurement, SSO, and residency requirements.

### Decision gates

- **Go:** Supervisors use the pass in real checks, students scan without reminders, and 1+ coordinator states a concrete purchase path.
- **Revise:** Coordinators value the fault log and records but not the pass → reposition as a shop log and maintenance tool.
- **Stop/pivot:** Spaces are satisfied with existing sign-in/badge systems, or privacy, SSO, or residency requirements block a small hosted tool.

## 14. Delivery Plan for Replit Agent

**Build rule:** Build one milestone at a time. Automated [A] tests must pass in development and manual [M] tests on the published app before starting the next milestone. Align week numbers with the course's final-project deadline.

| Milestone | Target | Build | Exit criterion |
|---|---|---|---|
| **M0 — Minimum demo** | Week 1–2 | Clerk sign-in + dev test-auth stub, first-run setup, rooms, one certification, machines, label sheet, pass, staff sign-off, start/end session with expected duration, fault with out-of-service, basic status board, basic service record that returns a machine to service | The 10-step demo in 5.1 works on the published app; T01 |
| **M1 — Rules and member app** | Week 3 | Join link, roles, suspension, multiple requirements, supervised flag, expiry, revocation ending sessions, extend and auto-expiry, full status board, my certifications | T02–T06 and T10 pass |
| **M2 — Maintenance side** | Week 4–5 | Fault queue, out-of-service details, full service log, checkups, machine detail, console home, rate limits | T07–T09 and T11 pass |
| **M3 — Polish** (stretch) | Week 6 | Accessibility pass, help page with Section 5.4 limits, cold-start measurement, clearly fake demo data | T12 |

**Instruction to Replit Agent:** Treat Section 7 as the backlog, Section 9 as the authorization spec, Section 10.3 as the schema (including the concurrency rules), and Section 11.3 as the acceptance checklist. **Do not build anything in Section 5.3.** Do not add websockets, background workers, scheduled deployments, or email. Never ship the test auth stub to production. Seed data must be clearly fake (e.g., "Demo Makerspace") and never presented as pilot results.

## 15. Definition of Done — Classroom MVP

- [ ] Published on a stable Replit HTTPS URL; labels generated from that URL.
- [ ] The 10-step minimum demo (5.1) works end to end on a physical phone.
- [ ] Passes are correct for requirements, supervised machines, expiry, revocation, and suspension; revocation and suspension end active sessions.
- [ ] Members see an accurate status board (availability, estimated free times, out-of-service details) that never reveals who is using a machine.
- [ ] Staff can work the fault queue, set out-of-service details, log service records (who, when, what), manage checkups, and see each machine's full service history.
- [ ] Nobody can sign off themselves; staff cannot change admin-only settings.
- [ ] The help page states the limits in Section 5.4.
- [ ] Tests T01–T11 pass; T12 completed if M3 is reached.
- [ ] No deferred feature (Section 5.3) is described as built.

## 16. Risks and Mitigations

| Risk | Impact | Mitigation / trigger |
|---|---|---|
| **False sense of safety** (users treat a pass as proof of presence or supervision) | Harm and liability | Section 5.4 limits shown in app and terms; "self-reported" and "advisory" labels; supervisors remain responsible |
| **Homegrown or existing sign-in/badge systems are "good enough"** | No reason to buy | Interview against the actual current system; pivot to shop log/maintenance if the pass adds nothing |
| **Suites (Fabman, MakerSpace, MakerOps) cover the same workflow** | Weak differentiation | Compete on simplicity and single-space price; re-check competitor plans before launch |
| **Students don't scan** | Incomplete logs; value collapses | Supervisors ask to see the pass; measure coverage; revise if < 70% |
| **Screenshot or shared-phone passes** | Wrong person on a machine | Live clock and name on pass; positioned as a supervisor aid |
| **Privacy review, SSO, or data residency** (Replit hosting region vs. institutional requirements) | Pilot blocked | Ask in Stage A; minimal data; start with Protospace if campus review is slow |
| **Cold starts slow the pass** | Students give up | Measure (T12); Reserved VM for pilots if needed |
| **Slow procurement** | Long sales cycle | Free tier; price within coordinator approval authority (to confirm) |
| **Small market** | Limited upside | Lifestyle-scale by design; low cost base; K-12 and libraries later |
| **Replit costs or limits change** | Margin or availability | Measure cost per space; standard Postgres + Node keeps it portable |
| **Technicians skip logging service** | Incomplete history; weak audit value | Resolving a fault requires a service record; the form takes ≤ 60 s on a phone |
| **Scope creep** | Unfinished MVP | Deferred list in 5.3 is not built; core demo lands in M0; M3 is stretch |

## 17. Evidence Ledger and Sources

| Claim | Status |
|---|---|
| UCalgary makerspaces use per-machine training and written shop rules | **Published** (sources 1–4) |
| How UCalgary sign-offs are recorded and checked at the machine | **Unknown** (Stage A) |
| Other universities track certification in sign-in/badge systems | **Published example** (OSU, source 6) |
| Competitor features and prices | **Vendor-published**, Oct 28, 2026; may change; exchange rates approximate |
| Academic makerspace counts | **Published research** (U.S. only; sources 7–8) |
| 400–600 North American spaces; 5–10% obtainable | **Assumptions** |
| Pricing, admin-time savings, revenue | **Hypotheses / illustrative arithmetic** |
| Customer interviews, pilots, revenue | **None yet** |

**UCalgary and local**
1. [TFDL Makerspace Training](https://libguides.ucalgary.ca/makerspace_training)
2. [UCalgary Library — Makerspace](https://library.ucalgary.ca/services/makerspace)
3. [Schulich Makerspace](https://schulich.ucalgary.ca/departments-centres/makerspace)
4. [Schulich Makerspace shop guidelines](https://schulich.libguides.com/c.php?g=745335&p=5394794)
5. [Protospace — Calgary's makerspace](https://protospace.ca/)

**Other institutions and research**

6. [Ohio State Engineering Makerspace](https://engineering.osu.edu/makerspace)
7. Melo, Hirsh & March (2023). [Makerspaces in Libraries at U.S. Public Colleges and Universities: A Census](https://cdr.lib.unc.edu/downloads/n009wc71m). *portal: Libraries and the Academy* 23(1), 35–43.
8. Kotuła (2026). [An exploratory study of technological resources in makerspaces at academic libraries in the United States](https://www.sciencedirect.com/science/article/abs/pii/S0099133326001278). *Journal of Academic Librarianship* 52(5), 103325.

**Competitors** (checked October 28, 2026)

9. [Fabman pricing](https://fabman.io/pricing) and [shop](https://shop.fabman.io/)
10. [MakerOps](https://makerops.ai/)
11. [MakerSpace (makerspaceops.com)](https://makerspaceops.com/)
12. [QReserve for makerspaces](https://get.qreserve.com/makerspaces)
13. [Zipper — makerspace software](https://www.joinzipper.com/business-management-software/makerspaces)
14. [MakeIT Center](https://makeit.center/markerspace-management-software)
15. [Makespace members-app (open source)](https://github.com/Makespace/members-app/pull/443)

**Platform documentation**

16. [Clerk Auth on Replit](https://docs.replit.com/features/auth-and-identity/clerk-auth)
17. [Replit SQL Database](https://docs.replit.com/features/data-and-storage/sql-database)
18. [Replit development vs. production](https://docs.replit.com/features/data-and-storage/development-and-production)
19. [Replit deployment types](https://docs.replit.com/features/publishing/deployment-types)
20. [Replit integrations (Resend connector)](https://docs.replit.com/replitai/integrations)
21. [Resend documentation](https://resend.com/docs) (domain verification requirement)

---

**One-sentence product statement:** **Cleared shows students which makerspace machines are free, busy, or out of service. It turns a QR sticker on each machine into a live certification pass and one-tap fault report, and gives maintenance staff a fault queue, checkup schedule, and complete service history, without a full makerspace suite or extra hardware.**
