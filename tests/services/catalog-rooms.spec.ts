// P2-41: rooms (FR-04, T10).
import { beforeEach, describe, expect, it } from "vitest";
import { createRoom, listRooms, moveRoom, updateRoom } from "@/server/services/rooms";
import { actors, createMakerspace, dataVersion, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed } from "../helpers/seed";
import { T0 } from "../helpers/time";

const db = () => testDb();

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
});

describe("rooms", () => {
  it("staff create and rename rooms; data_version increments", async () => {
    const staff = await actors.staff();
    const v0 = await dataVersion();
    const room = await createRoom(db(), staff, { name: "  Laser Room " }, T0);
    expect(room).toMatchObject({ name: "Laser Room", sortOrder: 0 });
    expect(await dataVersion()).toBe(v0 + 1);
    const renamed = await updateRoom(db(), staff, { id: room.id, name: "Laser Lab" }, T0 + 1);
    expect(renamed.name).toBe("Laser Lab");
    expect(await dataVersion()).toBe(v0 + 2);
  });

  it("members → FORBIDDEN; non-members NOT_A_MEMBER; anonymous UNAUTHENTICATED", async () => {
    const room = await seed.room();
    const cases = [
      [await actors.member(), "FORBIDDEN"],
      [await actors.nonMember(), "NOT_A_MEMBER"],
      [actors.anonymous(), "UNAUTHENTICATED"],
    ] as const;
    for (const [actor, code] of cases) {
      await expect(listRooms(db(), actor)).rejects.toMatchObject({ code });
      await expect(createRoom(db(), actor, { name: "Wood Shop" }, T0)).rejects.toMatchObject({ code });
      await expect(updateRoom(db(), actor, { id: room.id, name: "X" }, T0)).rejects.toMatchObject({ code });
      await expect(moveRoom(db(), actor, { id: room.id, direction: "up" }, T0)).rejects.toMatchObject({ code });
    }
  });

  it("duplicate names → NAME_TAKEN regardless of case, on create and rename", async () => {
    const staff = await actors.staff();
    await createRoom(db(), staff, { name: "Laser Room" }, T0);
    const other = await createRoom(db(), staff, { name: "Wood Shop" }, T0);
    const v0 = await dataVersion();
    await expect(createRoom(db(), staff, { name: "laser room" }, T0)).rejects.toMatchObject({
      code: "NAME_TAKEN",
      fieldErrors: { name: expect.any(Array) },
    });
    await expect(updateRoom(db(), staff, { id: other.id, name: "LASER ROOM" }, T0)).rejects.toMatchObject({
      code: "NAME_TAKEN",
    });
    expect(await dataVersion()).toBe(v0);
  });

  it("validates names (1–60 characters) and unknown ids", async () => {
    const staff = await actors.staff();
    await expect(createRoom(db(), staff, { name: "  " }, T0)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(createRoom(db(), staff, { name: "x".repeat(61) }, T0)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(updateRoom(db(), staff, { id: crypto.randomUUID(), name: "Nope" }, T0)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("lists in order with machine counts (retired machines not counted); move up/down renumbers", async () => {
    const staff = await actors.staff();
    const a = await createRoom(db(), staff, { name: "A room" }, T0);
    const b = await createRoom(db(), staff, { name: "B room" }, T0);
    const c = await createRoom(db(), staff, { name: "C room" }, T0);
    await seed.machine({ room: b });
    await seed.machine({ room: b });
    await seed.machine({ room: b, retired: true });

    let list = await listRooms(db(), staff);
    expect(list.map((r) => [r.name, r.sortOrder, r.machineCount])).toEqual([
      ["A room", 0, 0],
      ["B room", 1, 2],
      ["C room", 2, 0],
    ]);

    await moveRoom(db(), staff, { id: c.id, direction: "up" }, T0);
    list = await listRooms(db(), staff);
    expect(list.map((r) => r.id)).toEqual([a.id, c.id, b.id]);
    await moveRoom(db(), staff, { id: a.id, direction: "up" }, T0); // already first: no-op
    await moveRoom(db(), staff, { id: a.id, direction: "down" }, T0);
    list = await listRooms(db(), staff);
    expect(list.map((r) => [r.id, r.sortOrder])).toEqual([
      [c.id, 0],
      [a.id, 1],
      [b.id, 2],
    ]);
  });
});
