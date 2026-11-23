import "server-only";
import { and, asc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { certifications, machineRequirements, machines, rooms } from "@/db/schema";
import { MachineCreate, MachineId, MachineList, MachineUpdate } from "@/lib/schemas/catalog";
import { requireRole } from "@/server/authz";
import { batch, type Batchable } from "@/server/batch";
import { isUniqueViolation } from "@/server/db-errors";
import type { Actor } from "@/server/domain/actor";
import type { MachineStatus } from "@/server/domain/enums";
import { ServiceError, type FieldErrors } from "@/server/domain/errors";
import { newToken } from "@/server/domain/identity";
import { parse } from "@/server/domain/parse";
import { tokenGuard, withMachineWrite } from "@/server/machine-write";
import { endMachineSessionsSql } from "@/server/services/sessions";
import { SETTINGS_ID } from "@/server/version";

export type MachineView = {
  id: string;
  name: string;
  room: { id: string; name: string };
  status: MachineStatus;
  supervised: boolean;
  typicalSessionMinutes: number;
  requirements: { id: string; name: string }[];
  qrToken: string;
};

const nameTaken = () =>
  new ServiceError("NAME_TAKEN", "A machine with that name already exists.", {
    name: ["A machine with that name already exists."],
  });
const notFound = () => new ServiceError("NOT_FOUND", "That machine doesn't exist.");
const roomNotFound = () =>
  new ServiceError("NOT_FOUND", "That room doesn't exist.", { roomId: ["Choose a room from the list."] });
const certInactive = () =>
  new ServiceError("CERT_INACTIVE", "Only active certifications can be required.", {
    requirementIds: ["Only active certifications can be required."],
  });
const retired = () => new ServiceError("MACHINE_RETIRED", "This machine is retired and can't be changed.");

/* ------------------------------------------------------------------ reads */

const NAME_NOCASE = sql`${machines.name} COLLATE NOCASE`;

async function readMachines(db: Db, where: SQL | undefined): Promise<MachineView[]> {
  const rows = await db
    .select({
      id: machines.id,
      name: machines.name,
      roomId: rooms.id,
      roomName: rooms.name,
      status: machines.status,
      supervised: machines.supervised,
      typicalSessionMinutes: machines.typicalSessionMinutes,
      qrToken: machines.qrToken,
    })
    .from(machines)
    .innerJoin(rooms, eq(rooms.id, machines.roomId))
    .where(where)
    .orderBy(asc(rooms.sortOrder), asc(sql`${rooms.name} COLLATE NOCASE`), asc(NAME_NOCASE))
    .all();
  if (rows.length === 0) return [];

  // One read for every machine's requirements (≤ 60 machines × 20 at pilot scale),
  // filtered in memory rather than with a large IN list (D1's 100-parameter limit).
  const wanted = new Set(rows.map((r) => r.id));
  const reqs = await db
    .select({ machineId: machineRequirements.machineId, id: certifications.id, name: certifications.name })
    .from(machineRequirements)
    .innerJoin(certifications, eq(certifications.id, machineRequirements.certificationId))
    .orderBy(asc(sql`${certifications.name} COLLATE NOCASE`))
    .all();
  const byMachine = new Map<string, { id: string; name: string }[]>();
  for (const r of reqs) {
    if (!wanted.has(r.machineId)) continue;
    const list = byMachine.get(r.machineId) ?? [];
    list.push({ id: r.id, name: r.name });
    byMachine.set(r.machineId, list);
  }

  return rows.map(({ roomId, roomName, ...m }) => ({
    ...m,
    room: { id: roomId, name: roomName },
    requirements: byMachine.get(m.id) ?? [],
  }));
}

/** Staff: machines grouped by room order, then name. Retired machines only on request. */
export async function listMachines(
  db: Db,
  actor: Actor,
  rawInput: Partial<MachineList> = {},
): Promise<MachineView[]> {
  requireRole(actor, "staff");
  const input = parse(MachineList, rawInput);
  return readMachines(
    db,
    and(
      input.includeRetired ? undefined : ne(machines.status, "retired"),
      input.roomId ? eq(machines.roomId, input.roomId) : undefined,
    ),
  );
}

/** Staff: one machine (retired ones included). */
export async function getMachine(db: Db, actor: Actor, rawInput: { id: string }): Promise<MachineView> {
  requireRole(actor, "staff");
  const { id } = parse(MachineId, rawInput);
  const [machine] = await readMachines(db, eq(machines.id, id));
  if (!machine) throw notFound();
  return machine;
}

/* ----------------------------------------------------------------- writes */

/** Staff may not send admin-only fields; the whole input is rejected (Phase 2 D4). */
function rejectAdminFields(actor: Actor & { kind: "member" }, fields: Record<string, unknown>) {
  if (actor.role === "admin") return;
  const sent = Object.entries(fields).filter(([, v]) => v !== undefined).map(([k]) => k);
  if (sent.length === 0) return;
  const fieldErrors: FieldErrors = {};
  for (const key of sent) fieldErrors[key] = ["Only admins can change this."];
  throw new ServiceError(
    "FORBIDDEN_FIELD",
    "Only admins can change supervision, required certifications or retire a machine. Nothing was saved.",
    fieldErrors,
  );
}

function roomExists(roomId: string): SQL {
  return sql`EXISTS (SELECT 1 FROM "rooms" WHERE "rooms"."id" = ${roomId})`;
}

/** Every listed certification exists and is active (checked inside the write). */
function allCertsActive(ids: string[]): SQL {
  const list = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  return sql`(SELECT COUNT(*) FROM "certifications" WHERE "certifications"."id" IN (${list}) AND "certifications"."active" = 1) = ${ids.length}`;
}

/** Replace a machine's requirements, guarded by the write token (Phase 2 §4.3). */
function replaceRequirements(machineId: string, ids: string[], guard: SQL, now: number): Batchable[] {
  return [
    sql`DELETE FROM machine_requirements WHERE machine_id = ${machineId} AND ${guard}`,
    ...ids.map(
      (certId) => sql`INSERT INTO machine_requirements (machine_id, certification_id, created_at)
        SELECT ${machineId}, ${certId}, ${now} WHERE ${guard}`,
    ),
  ];
}

/** A refused create/update: which rule stopped it? */
async function explain(db: Db, roomId: string | undefined, certIds: string[]): Promise<ServiceError> {
  if (roomId && !(await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId)).get())) {
    return roomNotFound();
  }
  if (certIds.length > 0) {
    const active = await db
      .select({ id: certifications.id })
      .from(certifications)
      .where(and(inArray(certifications.id, certIds), eq(certifications.active, true)))
      .all();
    if (active.length !== certIds.length) return certInactive();
  }
  return new ServiceError("CONFLICT_RETRY", "That change couldn't be saved. Try again.");
}

/**
 * Staff: add a machine (name, room, typical session). Admins can also set
 * `supervised` and `requirementIds` (active certifications only). The QR
 * token is created here, once, and never changes.
 */
export async function createMachine(db: Db, actor: Actor, rawInput: MachineCreate, now: number): Promise<MachineView> {
  requireRole(actor, "staff");
  const input = parse(MachineCreate, rawInput);
  rejectAdminFields(actor, { supervised: input.supervised, requirementIds: input.requirementIds });

  const id = crypto.randomUUID();
  const writeToken = newToken();
  const certIds = input.requirementIds ?? [];
  const guard = tokenGuard(id, writeToken);
  const conditions = [roomExists(input.roomId), ...(certIds.length > 0 ? [allCertsActive(certIds)] : [])];

  let created: number;
  try {
    const [result] = await batch(db, [
      sql`INSERT INTO machines (id, room_id, name, supervised, status, status_changed_at, qr_token,
            typical_session_minutes, write_token, created_at, updated_at)
          SELECT ${id}, ${input.roomId}, ${input.name}, ${input.supervised ? 1 : 0}, 'available', ${now}, ${newToken()},
            ${input.typicalSessionMinutes ?? 60}, ${writeToken}, ${now}, ${now}
          WHERE ${sql.join(conditions, sql` AND `)}`,
      ...replaceRequirements(id, certIds, guard, now).slice(1), // a new machine has nothing to delete
      sql`UPDATE settings SET data_version = data_version + 1 WHERE id = ${SETTINGS_ID} AND ${guard}`,
    ]);
    created = result.meta.changes;
  } catch (err) {
    if (isUniqueViolation(err, "machines_name_live", "machines.name")) throw nameTaken();
    throw err;
  }
  if (created !== 1) throw await explain(db, input.roomId, certIds);
  return getMachine(db, actor, { id });
}

/**
 * Staff: edit name, room and typical session. Admin only: `supervised`,
 * `requirementIds` (replaces the whole set) and `retire` (permanent). A staff
 * input with any admin-only field is rejected whole (`FORBIDDEN_FIELD`).
 * Every write goes through the write token (`withMachineWrite`).
 */
export async function updateMachine(db: Db, actor: Actor, rawInput: MachineUpdate, now: number): Promise<MachineView> {
  requireRole(actor, "staff");
  const input = parse(MachineUpdate, rawInput);
  const { id, retire, requirementIds } = input;
  rejectAdminFields(actor, { supervised: input.supervised, requirementIds, retire });

  const basics = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
    ...(input.typicalSessionMinutes !== undefined ? { typicalSessionMinutes: input.typicalSessionMinutes } : {}),
    ...(input.supervised !== undefined ? { supervised: input.supervised } : {}),
  };
  const hasChanges = Object.keys(basics).length > 0 || requirementIds !== undefined;
  if (retire && hasChanges) {
    throw new ServiceError("VALIDATION_FAILED", "Retire a machine on its own, without other changes.");
  }
  if (!retire && !hasChanges) throw new ServiceError("VALIDATION_FAILED", "Nothing to change.");

  const certIds = requirementIds ?? [];
  try {
    await withMachineWrite(db, id, now, (machine) => {
      if (machine.status === "retired") throw retired();
      if (retire) {
        // Retiring ends the active session (`staff`, Phase 4 §4.5); the write
        // helper already closed expired ones. Phase 5 refuses while faults are open.
        return {
          set: {
            status: "retired",
            retiredAt: now,
            statusChangedAt: now,
            outOfServiceReason: null,
            statusNote: null,
            expectedBackAt: null,
          },
          where: ne(machines.status, "retired"),
          guarded: (guard) => [endMachineSessionsSql(id, actor.memberId, now, guard)],
          result: undefined,
        };
      }
      return {
        set: basics,
        where: and(
          ne(machines.status, "retired"),
          input.roomId !== undefined ? roomExists(input.roomId) : undefined,
          certIds.length > 0 ? allCertsActive(certIds) : undefined,
        ),
        guarded: requirementIds !== undefined ? (guard) => replaceRequirements(id, certIds, guard, now) : undefined,
        refused: () => explain(db, input.roomId, certIds),
        result: undefined,
      };
    });
  } catch (err) {
    if (isUniqueViolation(err, "machines_name_live", "machines.name")) throw nameTaken();
    throw err;
  }
  return getMachine(db, actor, { id });
}
