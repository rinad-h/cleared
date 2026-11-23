import { nextBoundary, type CheckupState } from "./checkups";
import type { OutOfServiceReason } from "./enums";
import type { GrantRow } from "./grants";
import { computePass } from "./pass";
import { BOARD_MAX_VALIDITY_MS, isActive } from "./sessions";

/**
 * The staff console home (FR-17, Phase 6 §4.3). Pure: no I/O, `now` passed
 * in. Used by the page's first render and the polling route handler. Staff
 * only: unlike the member board, it names members.
 */

/** At most this many active sessions are listed (first render and polls, §10 Risks). */
export const CONSOLE_MAX_SESSIONS = 100;

export type ConsoleData = {
  generatedAt: string;
  validUntil: string;
  timezone: string;
  counts: { openFaults: number; outOfServiceFaults: number; checkupsDueSoon: number; checkupsOverdue: number };
  outOfServiceMachines: {
    id: string;
    name: string;
    roomName: string;
    reason: OutOfServiceReason;
    since: string;
    note: string | null;
    expectedBackAt: string | null;
    openFaultCount: number;
  }[];
  activeSessions: {
    id: string;
    member: { id: string; displayName: string };
    machine: { id: string; name: string; roomName: string };
    startedAt: string;
    expectedEndAt: string;
    supervisionAcknowledged: boolean;
  }[];
  /** More active sessions exist than are listed. */
  activeSessionsTruncated: boolean;
  noLongerAuthorized: {
    sessionId: string;
    member: { id: string; displayName: string };
    machine: { id: string; name: string };
    missing: { id: string; name: string; state: "never" | "expired" | "revoked"; since: string | null }[];
  }[];
};

export type ConsoleInput = {
  now: number;
  timezone: string;
  openFaults: readonly { machineId: string; tookOutOfService: boolean }[];
  /** Active checkups on live machines. */
  checkups: readonly { nextDueAt: number; state: CheckupState }[];
  /** Machines with `status = 'out_of_service'`. */
  outOfServiceMachines: readonly {
    id: string;
    name: string;
    roomName: string;
    reason: OutOfServiceReason | null;
    statusChangedAt: number;
    note: string | null;
    expectedBackAt: number | null;
  }[];
  /** Open sessions (expired-but-open ones are ignored), with their member and machine. */
  openSessions: readonly {
    id: string;
    memberId: string;
    memberName: string;
    memberStatus: "active" | "suspended";
    memberRole: "admin" | "staff" | "member";
    machineId: string;
    machineName: string;
    roomName: string;
    startedAt: number;
    expectedEndAt: number;
    endedAt: number | null;
    supervisionAcknowledged: boolean;
  }[];
  /** Requirements of the machines with open sessions. */
  requirements: readonly { machineId: string; certificationId: string; certificationName: string }[];
  /** Grants of the members with open sessions (all of them; validity is checked here). */
  grants: readonly (GrantRow & { memberId: string })[];
};

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Counts, out-of-service machines, active sessions (newest first) and the
 * sessions whose member is no longer certified for the machine (the same pass
 * engine as everywhere else, D3). `validUntil` is when this can next change
 * without a write: a session's estimated end, a relevant grant expiring, a
 * checkup becoming due soon or overdue, capped at 10 minutes.
 */
export function buildConsole(input: ConsoleInput): { data: ConsoleData; validUntil: number } {
  const { now } = input;
  let validUntil = now + BOARD_MAX_VALIDITY_MS;

  const faultsByMachine = new Map<string, number>();
  let outOfServiceFaults = 0;
  for (const f of input.openFaults) {
    faultsByMachine.set(f.machineId, (faultsByMachine.get(f.machineId) ?? 0) + 1);
    if (f.tookOutOfService) outOfServiceFaults++;
  }

  let checkupsDueSoon = 0;
  let checkupsOverdue = 0;
  for (const c of input.checkups) {
    if (c.state === "due_soon") checkupsDueSoon++;
    if (c.state === "overdue") checkupsOverdue++;
    const boundary = nextBoundary(c.nextDueAt, now);
    if (boundary !== null) validUntil = Math.min(validUntil, boundary);
  }

  const outOfServiceMachines = [...input.outOfServiceMachines]
    .sort((a, b) => a.statusChangedAt - b.statusChangedAt || a.name.localeCompare(b.name))
    .map((m) => ({
      id: m.id,
      name: m.name,
      roomName: m.roomName,
      reason: m.reason ?? "other",
      since: iso(m.statusChangedAt),
      note: m.note,
      expectedBackAt: m.expectedBackAt === null ? null : iso(m.expectedBackAt),
      openFaultCount: faultsByMachine.get(m.id) ?? 0,
    }));

  const active = input.openSessions
    .filter((s) => isActive(s, now))
    .sort((a, b) => b.startedAt - a.startedAt || a.id.localeCompare(b.id));

  const reqsByMachine = new Map<string, { id: string; name: string; trainingUrl: null }[]>();
  for (const r of input.requirements) {
    const list = reqsByMachine.get(r.machineId) ?? [];
    list.push({ id: r.certificationId, name: r.certificationName, trainingUrl: null });
    reqsByMachine.set(r.machineId, list);
  }
  const grantsByMember = new Map<string, GrantRow[]>();
  for (const g of input.grants) {
    const list = grantsByMember.get(g.memberId) ?? [];
    list.push(g);
    grantsByMember.set(g.memberId, list);
  }

  const noLongerAuthorized: ConsoleData["noLongerAuthorized"] = [];
  for (const s of active) {
    validUntil = Math.min(validUntil, s.expectedEndAt);
    const requirements = reqsByMachine.get(s.machineId) ?? [];
    const memberGrants = grantsByMember.get(s.memberId) ?? [];
    const pass = computePass({
      now,
      machine: { status: "available", supervised: false },
      requirements,
      viewer: { kind: "member", memberId: s.memberId, role: s.memberRole, status: s.memberStatus, displayName: s.memberName },
      grants: memberGrants,
    });
    if (!pass.certifiedForMachine) {
      noLongerAuthorized.push({
        sessionId: s.id,
        member: { id: s.memberId, displayName: s.memberName },
        machine: { id: s.machineId, name: s.machineName },
        missing: pass.missing.map((m) => ({ id: m.id, name: m.name, state: m.state, since: m.since === null ? null : iso(m.since) })),
      });
    }
    // A grant this session relies on expiring flips it into "no longer authorized" without a write.
    const required = new Set(requirements.map((r) => r.id));
    for (const g of memberGrants) {
      if (g.revokedAt === null && g.expiresAt !== null && g.expiresAt > now && required.has(g.certificationId)) {
        validUntil = Math.min(validUntil, g.expiresAt);
      }
    }
  }

  const listed = active.slice(0, CONSOLE_MAX_SESSIONS);
  return {
    data: {
      generatedAt: iso(now),
      validUntil: iso(validUntil),
      timezone: input.timezone,
      counts: {
        openFaults: input.openFaults.length,
        outOfServiceFaults,
        checkupsDueSoon,
        checkupsOverdue,
      },
      outOfServiceMachines,
      activeSessions: listed.map((s) => ({
        id: s.id,
        member: { id: s.memberId, displayName: s.memberName },
        machine: { id: s.machineId, name: s.machineName, roomName: s.roomName },
        startedAt: iso(s.startedAt),
        expectedEndAt: iso(s.expectedEndAt),
        supervisionAcknowledged: s.supervisionAcknowledged,
      })),
      activeSessionsTruncated: active.length > listed.length,
      noLongerAuthorized,
    },
    validUntil,
  };
}

/* ------------------------------------------------------------------ ETags */

/** `W/"c.<data_version>.<memberId>.<role>.<validUntil>"` (§4.3). */
export function consoleEtag(dataVersion: number, memberId: string, role: string, validUntil: number): string {
  return `W/"c.${dataVersion}.${memberId}.${role}.${validUntil}"`;
}

const ETAG = /^W\/"c\.(\d+)\.([0-9a-f-]{36})\.(admin|staff)\.(\d+)"$/;

/** Parse a client's `If-None-Match`; anything unexpected is null (a full answer). */
export function parseConsoleEtag(
  header: string | null | undefined,
): { dataVersion: number; memberId: string; role: string; validUntil: number } | null {
  if (!header) return null;
  const match = ETAG.exec(header.trim());
  if (!match) return null;
  return { dataVersion: Number(match[1]), memberId: match[2], role: match[3], validUntil: Number(match[4]) };
}
