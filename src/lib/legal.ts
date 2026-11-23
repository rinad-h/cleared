/**
 * Text shared by the Help, Terms and Privacy pages (Phase 7 P7-10 to P7-12),
 * so the limits are written once. Plain strings: no I/O, safe anywhere.
 */

/** What Cleared is, in one sentence (PRD 5.4). */
export const WHAT_CLEARED_IS =
  "Cleared is a decision-support and record-keeping tool, not a safety system or an access-control system.";

/** Every limit from PRD 5.4, in plain language. */
export const LIMITS = [
  "It doesn't check that you're at the machine. A scan proves a signed-in account opened the machine page, not that the person is standing there. Sessions are self-reported.",
  "“In use” and estimated free times are self-reported estimates. A machine may free up early, run over, or be in use without a recorded session.",
  "It doesn't check supervision. “Supervision required” shows a requirement; it doesn't confirm a supervisor is present.",
  "It can't stop a machine. Out of service and Not cleared are displays and records; they don't cut power.",
  "Its records are only as accurate as staff keep them. A missed revocation or a wrong sign-off gives a wrong pass.",
  "Screenshots and shared phones are made harder (a live clock and your name on the pass), not prevented.",
  "Supervisors remain responsible for physical safety rules.",
  "Emergencies and injuries follow your institution's procedures, not Cleared.",
] as const;

/** Who to contact about anything in Cleared: makerspace staff, never the developer. */
export const CONTACT_STAFF =
  "For anything about your account, your certifications, a machine or your data, talk to the makerspace staff, in person or however your makerspace normally reaches them. Staff run Cleared for your makerspace, so they're the right people to ask, not the software's developer.";
