"use server";

import { action } from "@/lib/server-action";
import { MachineCreate, MachineUpdate } from "@/lib/schemas/catalog";
import * as machines from "@/server/services/machines";

/** Per-field rules (staff vs admin) live in the service. */
export const createMachine = action(MachineCreate, (actor, input, now, db) =>
  machines.createMachine(db, actor, input, now),
);

export const updateMachine = action(MachineUpdate, (actor, input, now, db) =>
  machines.updateMachine(db, actor, input, now),
);
