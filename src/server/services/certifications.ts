import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { certifications, machineRequirements, machines } from "@/db/schema";
import { CertificationCreate, CertificationList, CertificationUpdate } from "@/lib/schemas/catalog";
import { requireMember, requireRole } from "@/server/authz";
import { batch } from "@/server/batch";
import { isUniqueViolation } from "@/server/db-errors";
import type { Actor } from "@/server/domain/actor";
import { ServiceError } from "@/server/domain/errors";
import { parse } from "@/server/domain/parse";
import { bumpVersion } from "@/server/version";

export type Certification = {
  id: string;
  name: string;
  trainingUrl: string | null;
  validityMonths: number | null;
  active: boolean;
};
export type CertificationListItem = Certification & { requiredByCount: number };

const nameTaken = () =>
  new ServiceError("NAME_TAKEN", "A certification with that name already exists.", {
    name: ["A certification with that name already exists."],
  });
const notFound = () => new ServiceError("NOT_FOUND", "That certification doesn't exist.");

const columns = {
  id: certifications.id,
  name: certifications.name,
  trainingUrl: certifications.trainingUrl,
  validityMonths: certifications.validityMonths,
  active: certifications.active,
};

/**
 * Every member can read the active certifications (PRD 10.4); staff and admins
 * can include inactive ones. `requiredByCount` counts non-retired machines.
 */
export async function listCertifications(
  db: Db,
  actor: Actor,
  rawInput: Partial<CertificationList> = {},
): Promise<CertificationListItem[]> {
  requireMember(actor);
  const { includeInactive = false } = parse(CertificationList, rawInput);
  if (includeInactive) requireRole(actor, "staff");
  return db
    .select({
      ...columns,
      requiredByCount: sql<number>`(SELECT COUNT(*) FROM "machine_requirements"
        JOIN "machines" ON "machines"."id" = "machine_requirements"."machine_id"
        WHERE "machine_requirements"."certification_id" = "certifications"."id" AND "machines"."status" <> 'retired')`,
    })
    .from(certifications)
    .where(includeInactive ? undefined : eq(certifications.active, true))
    .orderBy(asc(sql`${certifications.name} COLLATE NOCASE`))
    .all();
}

async function readCertification(db: Db, id: string): Promise<Certification | undefined> {
  return db.select(columns).from(certifications).where(eq(certifications.id, id)).get();
}

/** Admin: add a certification (active). */
export async function createCertification(
  db: Db,
  actor: Actor,
  rawInput: CertificationCreate,
  now: number,
): Promise<Certification> {
  requireRole(actor, "admin");
  const input = parse(CertificationCreate, rawInput);
  const id = crypto.randomUUID();
  try {
    await db.batch([
      db.insert(certifications).values({
        id,
        name: input.name,
        trainingUrl: input.trainingUrl ?? null,
        validityMonths: input.validityMonths ?? null,
        active: true,
        createdAt: now,
        updatedAt: now,
      }),
      bumpVersion(db),
    ]);
  } catch (err) {
    if (isUniqueViolation(err, "certifications_name_unique", "certifications.name")) throw nameTaken();
    throw err;
  }
  const row = await readCertification(db, id);
  if (!row) throw notFound();
  return row;
}

/** Non-retired machines that require the certification (for `CERT_IN_USE`). */
async function machinesRequiring(db: Db, certificationId: string) {
  return db
    .select({ id: machines.id, name: machines.name })
    .from(machineRequirements)
    .innerJoin(machines, eq(machines.id, machineRequirements.machineId))
    .where(and(eq(machineRequirements.certificationId, certificationId), sql`${machines.status} <> 'retired'`))
    .orderBy(asc(sql`${machines.name} COLLATE NOCASE`))
    .all();
}

/**
 * Admin: edit a certification. Deactivating is refused while any non-retired
 * machine requires it (`CERT_IN_USE`, with the machines in `details`), checked
 * inside the UPDATE itself so a machine gaining the requirement at the same
 * moment can't slip past. `validityMonths` changes apply to new grants only.
 */
export async function updateCertification(
  db: Db,
  actor: Actor,
  rawInput: CertificationUpdate,
  now: number,
): Promise<Certification> {
  requireRole(actor, "admin");
  const input = parse(CertificationUpdate, rawInput);
  const { id } = input;
  const changes = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.trainingUrl !== undefined ? { trainingUrl: input.trainingUrl } : {}),
    ...(input.validityMonths !== undefined ? { validityMonths: input.validityMonths } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
  if (Object.keys(changes).length === 0) throw new ServiceError("VALIDATION_FAILED", "Nothing to change.");

  const notInUse = sql`NOT EXISTS (SELECT 1 FROM "machine_requirements"
    JOIN "machines" ON "machines"."id" = "machine_requirements"."machine_id"
    WHERE "machine_requirements"."certification_id" = ${id} AND "machines"."status" <> 'retired')`;

  let changed: number;
  try {
    const [result] = await batch(db, [
      db
        .update(certifications)
        .set({ ...changes, updatedAt: now })
        .where(and(eq(certifications.id, id), input.active === false ? notInUse : undefined)),
      bumpVersion(db),
    ]);
    changed = result.meta.changes;
  } catch (err) {
    if (isUniqueViolation(err, "certifications_name_unique", "certifications.name")) throw nameTaken();
    throw err;
  }

  if (changed !== 1) {
    if (!(await readCertification(db, id))) throw notFound();
    if (input.active !== false) throw new ServiceError("CONFLICT_RETRY", "That change couldn't be saved. Try again.");
    const inUse = await machinesRequiring(db, id);
    const count = inUse.length;
    throw new ServiceError(
      "CERT_IN_USE",
      `${count === 1 ? "1 machine still requires" : `${count} machines still require`} this certification. Remove the requirement or retire ${count === 1 ? "that machine" : "those machines"} first.`,
      undefined,
      { machines: inUse },
    );
  }
  const row = await readCertification(db, id);
  if (!row) throw notFound();
  return row;
}
