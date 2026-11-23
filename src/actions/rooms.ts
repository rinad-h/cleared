"use server";

import { action } from "@/lib/server-action";
import { RoomCreate, RoomMove, RoomUpdate } from "@/lib/schemas/catalog";
import * as rooms from "@/server/services/rooms";

export const createRoom = action(RoomCreate, (actor, input, now, db) => rooms.createRoom(db, actor, input, now));

export const updateRoom = action(RoomUpdate, (actor, input, now, db) => rooms.updateRoom(db, actor, input, now));

export const moveRoom = action(RoomMove, (actor, input, now, db) => rooms.moveRoom(db, actor, input, now));
