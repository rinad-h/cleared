import type { OutOfServiceReason } from "./enums";
import type { GrantRow } from "./grants";
import { computePass, type Viewer } from "./pass";
import { BOARD_MAX_VALIDITY_MS, isActive } from "./sessions";

/**
 * The member status board (Phase 4 §4.6, FR-11). Pure: no I/O, `now` passed
 * in. Used by the page's first render and the polling route handler.
 *
 * Privacy (PRD 7.1): the output never contains member ids, names or emails,
 * session ids, fault descriptions, reporters or QR tokens.
 */

export type BoardTileState = "available" | "in_use" | "out_of_service";

export type BoardMachine = {
  id: string;
  name: string;
  state: BoardTileState;
  /** Only when in use. ISO times. */
  inUse: { since: string; estFreeAt: string } | null;
  /** Only when out of service. ISO times. */
  outOfService: { reason: OutOfServiceReason; since: string; note: string | null; expectedBackAt: string | null } | null;
  supervisionRequired: boolean;
  /** An open "still usable" fault on a machine that isn't out of service (Phase 5). Never the text or reporter. */
  issueReported: boolean;
  /** The viewer holds every required certification (ignores out of service and supervision, D4). */
  clearedForMe: boolean;
};

export type BoardRoom = { id: string; name: string; machines: BoardMachine[] };

export type StatusBoard = {
  makerspace: { name: string; timezone: string };
  generatedAt: string;
  validUntil: string;
  rooms: BoardRoom[];
};

export type BoardInput = {
  now: number;
  makerspace: { name: string; timezone: string };
  /** In display order (sort_order, name). */
  rooms: readonly { id: string; name: string }[];
  /** Non-retired machines. */
  machines: readonly {
    id: string;
    roomId: string;
    name: string;
    status: "available" | "out_of_service" | "retired";
    supervised: boolean;
    statusChangedAt: number;
    outOfServiceReason: OutOfServiceReason | null;
    statusNote: string | null;
    expectedBackAt: number | null;
  }[];
  requirements: readonly { machineId: string; certificationId: string }[];
  /** Open sessions (expired-but-open ones are ignored). */
  openSessions: readonly { machineId: string; startedAt: number; expectedEndAt: number; endedAt: number | null }[];
  viewer: Viewer;
  /** The viewer's grants (all of them; validity is checked here). */
  grants: readonly GrantRow[];
  /** Machines with an open fault that didn't take them out of service (Phase 5). */
  issueMachineIds?: ReadonlySet<string>;
};

const iso = (ms: number) => new Date(ms).toISOString();
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.name.localeCompare(b.name);

/**
 * Rooms in the given order, each with its live machines by name; rooms with
 * no live machines are left out. `validUntil` is when this board can next
 * change without a write (a session's estimated end, one of the viewer's
 * grants expiring), capped at 10 minutes (D5).
 */
export function buildBoard(input: BoardInput): { board: StatusBoard; validUntil: number } {
  const { now, viewer } = input;
  const reqsByMachine = new Map<string, { id: string; name: string; trainingUrl: null }[]>();
  for (const r of input.requirements) {
    const list = reqsByMachine.get(r.machineId) ?? [];
    list.push({ id: r.certificationId, name: "", trainingUrl: null });
    reqsByMachine.set(r.machineId, list);
  }
  const activeByMachine = new Map<string, { startedAt: number; expectedEndAt: number }>();
  for (const s of input.openSessions) {
    if (isActive(s, now)) activeByMachine.set(s.machineId, s);
  }

  let validUntil = now + BOARD_MAX_VALIDITY_MS;
  const requiredCerts = new Set<string>();
  const machinesByRoom = new Map<string, BoardMachine[]>();

  for (const m of [...input.machines].sort(byName)) {
    if (m.status === "retired") continue;
    const requirements = reqsByMachine.get(m.id) ?? [];
    for (const r of requirements) requiredCerts.add(r.id);
    const pass = computePass({
      now,
      machine: { status: m.status, supervised: m.supervised },
      requirements,
      viewer,
      grants: input.grants,
    });
    const session = activeByMachine.get(m.id);
    const oos = m.status === "out_of_service";
    const state: BoardTileState = oos ? "out_of_service" : session ? "in_use" : "available";
    if (session && !oos) validUntil = Math.min(validUntil, session.expectedEndAt);

    const tile: BoardMachine = {
      id: m.id,
      name: m.name,
      state,
      inUse: state === "in_use" && session ? { since: iso(session.startedAt), estFreeAt: iso(session.expectedEndAt) } : null,
      outOfService:
        oos && m.outOfServiceReason
          ? {
              reason: m.outOfServiceReason,
              since: iso(m.statusChangedAt),
              note: m.statusNote,
              expectedBackAt: m.expectedBackAt === null ? null : iso(m.expectedBackAt),
            }
          : null,
      supervisionRequired: m.supervised,
      issueReported: !oos && (input.issueMachineIds?.has(m.id) ?? false),
      clearedForMe: pass.certifiedForMachine,
    };
    const list = machinesByRoom.get(m.roomId) ?? [];
    list.push(tile);
    machinesByRoom.set(m.roomId, list);
  }

  // A grant of the viewer's expiring flips a ✔ to ✖ without any write.
  for (const g of input.grants) {
    if (g.revokedAt === null && g.expiresAt !== null && g.expiresAt > now && requiredCerts.has(g.certificationId)) {
      validUntil = Math.min(validUntil, g.expiresAt);
    }
  }

  const rooms: BoardRoom[] = [];
  for (const room of input.rooms) {
    const list = machinesByRoom.get(room.id);
    if (list && list.length > 0) rooms.push({ id: room.id, name: room.name, machines: list });
  }

  return {
    board: { makerspace: input.makerspace, generatedAt: iso(now), validUntil: iso(validUntil), rooms },
    validUntil,
  };
}

/* ------------------------------------------------------------------ ETags */

/** `W/"b.<data_version>.<memberId>.<role>.<validUntil>"` (§4.7). */
export function boardEtag(dataVersion: number, memberId: string, role: string, validUntil: number): string {
  return `W/"b.${dataVersion}.${memberId}.${role}.${validUntil}"`;
}

const ETAG = /^W\/"b\.(\d+)\.([0-9a-f-]{36})\.(admin|staff|member)\.(\d+)"$/;

/** Parse a client's `If-None-Match`; anything unexpected is null (a full answer). */
export function parseBoardEtag(
  header: string | null | undefined,
): { dataVersion: number; memberId: string; role: string; validUntil: number } | null {
  if (!header) return null;
  const match = ETAG.exec(header.trim());
  if (!match) return null;
  return { dataVersion: Number(match[1]), memberId: match[2], role: match[3], validUntil: Number(match[4]) };
}
