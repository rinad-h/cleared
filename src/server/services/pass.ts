import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { certifications, grants, machineRequirements, machines, rooms, settings } from "@/db/schema";
import { QrTokenInput } from "@/lib/schemas/catalog";
import { requireUser } from "@/server/authz";
import type { Actor, SignedInActor } from "@/server/domain/actor";
import type { OutOfServiceReason, Role } from "@/server/domain/enums";
import type { GrantRow } from "@/server/domain/grants";
import { parse } from "@/server/domain/parse";
import { computePass, type PassRequirement, type PassResult, type Viewer } from "@/server/domain/pass";
import { SETTINGS_ID } from "@/server/version";

/** What a QR label opens (Phase 3 §5.1). Times are UTC ms; the page turns them into ISO strings. */
export type MachineByToken =
  | { recognized: false }
  | {
      recognized: true;
      serverNow: number;
      makerspace: { name: string; timezone: string };
      machine: {
        id: string;
        name: string;
        roomName: string;
        supervised: boolean;
        status: "available" | "out_of_service";
        /** Filled from Phase 5 on; null while available. */
        outOfService: { reason: OutOfServiceReason; since: number; note: string | null; expectedBackAt: number | null } | null;
      };
      viewer: { displayName: string; membership: "active" | "suspended" | "none"; role: Role | null };
      pass: PassResult;
    };

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

export function viewerOf(actor: SignedInActor): Viewer {
  return actor.kind === "member"
    ? { kind: "member", memberId: actor.memberId, role: actor.role, status: actor.status, displayName: actor.displayName }
    : { kind: "none" };
}

/**
 * The pass context for one QR token in **one batch of reads** (one round
 * trip): the machine with its room and the makerspace, its requirements, and
 * the viewer's grants for those requirements. All indexed lookups.
 */
export async function loadPassContext(db: Db, token: string, viewer: Viewer) {
  const requiredCertIds = db
    .select({ id: machineRequirements.certificationId })
    .from(machineRequirements)
    .innerJoin(machines, eq(machines.id, machineRequirements.machineId))
    .where(eq(machines.qrToken, token));

  const machineQuery = db
    .select({
      id: machines.id,
      name: machines.name,
      status: machines.status,
      supervised: machines.supervised,
      statusChangedAt: machines.statusChangedAt,
      outOfServiceReason: machines.outOfServiceReason,
      statusNote: machines.statusNote,
      expectedBackAt: machines.expectedBackAt,
      // Distinct aliases: a D1 batch returns rows keyed by column name, so two
      // columns called "name" would overwrite each other.
      roomName: sql<string>`${rooms.name}`.as("room_name"),
      makerspaceName: sql<string | null>`${settings.name}`.as("makerspace_name"),
      timezone: sql<string | null>`${settings.timezone}`.as("makerspace_timezone"),
    })
    .from(machines)
    .innerJoin(rooms, eq(rooms.id, machines.roomId))
    .leftJoin(settings, eq(settings.id, SETTINGS_ID))
    .where(eq(machines.qrToken, token));

  const requirementsQuery = db
    .select({ id: certifications.id, name: certifications.name, trainingUrl: certifications.trainingUrl })
    .from(machineRequirements)
    .innerJoin(machines, eq(machines.id, machineRequirements.machineId))
    .innerJoin(certifications, eq(certifications.id, machineRequirements.certificationId))
    .where(eq(machines.qrToken, token))
    .orderBy(asc(sql`${certifications.name} COLLATE NOCASE`));

  const grantsQuery = db
    .select({
      id: grants.id,
      certificationId: grants.certificationId,
      grantedAt: grants.grantedAt,
      expiresAt: grants.expiresAt,
      revokedAt: grants.revokedAt,
    })
    .from(grants)
    .where(
      and(
        // A non-member has no grants: match nothing.
        eq(grants.memberId, viewer.kind === "member" ? viewer.memberId : ""),
        inArray(grants.certificationId, requiredCertIds),
      ),
    );

  const [machineRows, requirements, grantRows] = await db.batch([machineQuery, requirementsQuery, grantsQuery]);
  return {
    machine: machineRows[0] ?? null,
    requirements: requirements satisfies PassRequirement[],
    grants: grantRows satisfies GrantRow[],
  };
}

/**
 * Any signed-in user: the machine a QR label points to and the viewer's pass
 * (FR-09), computed on the server at `now`. Unknown and retired tokens give
 * the same `{ recognized: false }` (Phase 2 D5). Only the viewer's own data is
 * returned: never who else holds a certification or uses the machine.
 */
export async function getMachineByToken(
  db: Db,
  actor: Actor,
  rawInput: { token: string },
  now: number,
): Promise<MachineByToken> {
  requireUser(actor);
  const { token } = parse(QrTokenInput, rawInput);
  if (!TOKEN_SHAPE.test(token)) return { recognized: false };

  const viewer = viewerOf(actor);
  const ctx = await loadPassContext(db, token, viewer);
  const m = ctx.machine;
  if (!m || m.status === "retired" || m.makerspaceName === null || m.timezone === null) {
    return { recognized: false };
  }

  const pass = computePass({
    now,
    machine: { status: m.status, supervised: m.supervised },
    requirements: ctx.requirements,
    viewer,
    grants: ctx.grants,
  });

  return {
    recognized: true,
    serverNow: now,
    makerspace: { name: m.makerspaceName, timezone: m.timezone },
    machine: {
      id: m.id,
      name: m.name,
      roomName: m.roomName,
      supervised: m.supervised,
      status: m.status,
      outOfService:
        m.status === "out_of_service" && m.outOfServiceReason
          ? { reason: m.outOfServiceReason, since: m.statusChangedAt, note: m.statusNote, expectedBackAt: m.expectedBackAt }
          : null,
    },
    viewer:
      actor.kind === "member"
        ? { displayName: actor.displayName, membership: actor.status, role: actor.role }
        : { displayName: actor.name, membership: "none", role: null },
    pass,
  };
}
