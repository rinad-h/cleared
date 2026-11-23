import "server-only";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { machines } from "@/db/schema";
import { batch, type Batchable } from "@/server/batch";
import { ServiceError } from "@/server/domain/errors";
import { newToken } from "@/server/domain/identity";
import { SETTINGS_ID } from "@/server/version";

/**
 * Machine write-token compare-and-swap (technologies.md §12.2, Phase 2 §4.3).
 *
 *   read machine (token T0) → build a plan → one atomic batch:
 *     1. UPDATE machines SET …, write_token = T1 WHERE id = :id AND write_token = T0 [AND plan.where]
 *     2. plan.guarded(guard): statements guarded by `EXISTS (… write_token = T1)`
 *     3. UPDATE settings SET data_version = data_version + 1 (guarded the same way)
 *   statement 1 changed 0 rows →
 *     token moved on   → someone else wrote first → retry (up to 3 times) → CONFLICT_RETRY
 *     token unchanged  → plan.where refused it    → plan.refused()
 *     row gone         → NOT_FOUND
 *
 * A random token (not a counter) is what makes the guards safe: a guard only
 * matches the token this request wrote. Phases 4 and 5 reuse this for
 * sessions, faults and service records.
 */

export type MachineRow = typeof machines.$inferSelect;
type MachineSet = Partial<Omit<typeof machines.$inferInsert, "id" | "writeToken" | "updatedAt" | "createdAt">>;

export type MachineWritePlan<T> = {
  /** Columns to change on the machine row (write_token and updated_at are set here). */
  set?: MachineSet;
  /** Extra conditions for statement 1, re-checked atomically (e.g. "every certification is active"). */
  where?: SQL;
  /** Statements that run only if this request's token was written. */
  guarded?: (guard: SQL) => Batchable[];
  /** Explain a refusal by `where` (the token didn't move). */
  refused?: () => Promise<ServiceError> | ServiceError;
  /** What the helper returns on success. */
  result: T;
};

export type MachineWriteOptions = {
  /** Retries after the first attempt (default 3). */
  retries?: number;
  /** Backoff between attempts; tests replace it. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `EXISTS (SELECT 1 FROM machines WHERE id = :id AND write_token = :token)`, fully qualified (§12.1). */
export function tokenGuard(machineId: string, token: string): SQL {
  return sql`EXISTS (SELECT 1 FROM "machines" WHERE "machines"."id" = ${machineId} AND "machines"."write_token" = ${token})`;
}

export async function withMachineWrite<T>(
  db: Db,
  machineId: string,
  now: number,
  build: (machine: MachineRow, attempt: number) => MachineWritePlan<T> | Promise<MachineWritePlan<T>>,
  { retries = 3, sleep = defaultSleep }: MachineWriteOptions = {},
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(10 * attempt + Math.floor(Math.random() * 15));

    const machine = await db.select().from(machines).where(eq(machines.id, machineId)).get();
    if (!machine) throw new ServiceError("NOT_FOUND", "That machine doesn't exist.");

    const plan = await build(machine, attempt);
    const t0 = machine.writeToken;
    const t1 = newToken();
    const guard = tokenGuard(machineId, t1);

    const swap = db
      .update(machines)
      .set({ ...plan.set, writeToken: t1, updatedAt: now })
      .where(and(eq(machines.id, machineId), eq(machines.writeToken, t0), plan.where));
    const bump = sql`UPDATE settings SET data_version = data_version + 1 WHERE id = ${SETTINGS_ID} AND ${guard}`;

    const [first] = await batch(db, [swap, ...(plan.guarded?.(guard) ?? []), bump]);
    if (first.meta.changes === 1) return plan.result;

    const after = await db
      .select({ writeToken: machines.writeToken })
      .from(machines)
      .where(eq(machines.id, machineId))
      .get();
    if (!after) throw new ServiceError("NOT_FOUND", "That machine doesn't exist.");
    if (after.writeToken === t0) {
      throw (await plan.refused?.()) ?? new ServiceError("CONFLICT_RETRY", "That change couldn't be saved. Try again.");
    }
    // Someone else wrote first: read again and retry.
  }
  throw new ServiceError("CONFLICT_RETRY", "Someone else changed this machine at the same time. Try again.");
}
