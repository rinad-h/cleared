import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { rooms } from "@/db/schema";
import { RoomCreate, RoomMove, RoomUpdate } from "@/lib/schemas/catalog";
import { requireRole } from "@/server/authz";
import { batch } from "@/server/batch";
import { isUniqueViolation } from "@/server/db-errors";
import type { Actor } from "@/server/domain/actor";
import { ServiceError } from "@/server/domain/errors";
import { parse } from "@/server/domain/parse";
import { bumpVersion } from "@/server/version";

export type Room = { id: string; name: string; sortOrder: number };
export type RoomListItem = Room & { machineCount: number };

const nameTaken = () =>
  new ServiceError("NAME_TAKEN", "A room with that name already exists.", { name: ["A room with that name already exists."] });
const notFound = () => new ServiceError("NOT_FOUND", "That room doesn't exist.");

/** Staff: every room in display order, with its number of non-retired machines. */
export async function listRooms(db: Db, actor: Actor): Promise<RoomListItem[]> {
  requireRole(actor, "staff");
  return db
    .select({
      id: rooms.id,
      name: rooms.name,
      sortOrder: rooms.sortOrder,
      machineCount: sql<number>`(SELECT COUNT(*) FROM "machines" WHERE "machines"."room_id" = "rooms"."id" AND "machines"."status" <> 'retired')`,
    })
    .from(rooms)
    .orderBy(asc(rooms.sortOrder), asc(sql`${rooms.name} COLLATE NOCASE`))
    .all();
}

async function readRoom(db: Db, id: string): Promise<Room | undefined> {
  return db
    .select({ id: rooms.id, name: rooms.name, sortOrder: rooms.sortOrder })
    .from(rooms)
    .where(eq(rooms.id, id))
    .get();
}

/** Staff: add a room at the end of the list. Names are unique regardless of case (`NAME_TAKEN`). */
export async function createRoom(db: Db, actor: Actor, rawInput: RoomCreate, now: number): Promise<Room> {
  requireRole(actor, "staff");
  const { name } = parse(RoomCreate, rawInput);
  const id = crypto.randomUUID();
  try {
    await batch(db, [
      sql`INSERT INTO rooms (id, name, sort_order, created_at, updated_at)
          SELECT ${id}, ${name}, COALESCE(MAX(sort_order), -1) + 1, ${now}, ${now} FROM rooms`,
      bumpVersion(db),
    ]);
  } catch (err) {
    if (isUniqueViolation(err, "rooms_name_unique", "rooms.name")) throw nameTaken();
    throw err;
  }
  const room = await readRoom(db, id);
  if (!room) throw notFound();
  return room;
}

/** Staff: rename a room or set its position. */
export async function updateRoom(db: Db, actor: Actor, rawInput: RoomUpdate, now: number): Promise<Room> {
  requireRole(actor, "staff");
  const input = parse(RoomUpdate, rawInput);
  if (input.name === undefined && input.sortOrder === undefined) {
    throw new ServiceError("VALIDATION_FAILED", "Nothing to change.");
  }
  let changed: number;
  try {
    const [result] = await db.batch([
      db
        .update(rooms)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          updatedAt: now,
        })
        .where(eq(rooms.id, input.id)),
      bumpVersion(db),
    ]);
    changed = result.meta.changes;
  } catch (err) {
    if (isUniqueViolation(err, "rooms_name_unique", "rooms.name")) throw nameTaken();
    throw err;
  }
  if (changed !== 1) throw notFound();
  const room = await readRoom(db, input.id);
  if (!room) throw notFound();
  return room;
}

/**
 * Staff: move a room one place up or down. Every room is renumbered 0…n-1 in
 * one batch, so positions stay distinct even if older rows shared a number.
 */
export async function moveRoom(db: Db, actor: Actor, rawInput: RoomMove, now: number): Promise<void> {
  requireRole(actor, "staff");
  const { id, direction } = parse(RoomMove, rawInput);
  const list = await db
    .select({ id: rooms.id, sortOrder: rooms.sortOrder })
    .from(rooms)
    .orderBy(asc(rooms.sortOrder), asc(sql`${rooms.name} COLLATE NOCASE`))
    .all();
  const index = list.findIndex((r) => r.id === id);
  if (index === -1) throw notFound();
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return; // already first/last
  [list[index], list[target]] = [list[target], list[index]];

  const updates = list
    .map((room, position) => ({ room, position }))
    .filter(({ room, position }) => room.sortOrder !== position)
    .map(({ room, position }) =>
      db.update(rooms).set({ sortOrder: position, updatedAt: now }).where(eq(rooms.id, room.id)),
    );
  if (updates.length === 0) return;
  await batch(db, [...updates, bumpVersion(db)]);
}
