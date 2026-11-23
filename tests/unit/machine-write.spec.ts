// P2-49: the machine write-token compare-and-swap helper (technologies.md §12.2).
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { machineRequirements, machines } from "@/db/schema";
import { ServiceError } from "@/server/domain/errors";
import { newToken } from "@/server/domain/identity";
import { withMachineWrite } from "@/server/machine-write";
import { createMakerspace, dataVersion, resetIdentity } from "../helpers/actors";
import { testDb } from "../helpers/db";
import { resetCatalog, seed } from "../helpers/seed";
import { T0 } from "../helpers/time";

const db = () => testDb();
const noSleep = async () => {};

beforeEach(async () => {
  await resetCatalog();
  await resetIdentity();
  await createMakerspace();
});

async function requirementCount(machineId: string) {
  return (await db().select().from(machineRequirements).where(eq(machineRequirements.machineId, machineId)).all()).length;
}

const insertRequirement = (machineId: string, certId: string) => (guard: ReturnType<typeof sql>) => [
  sql`INSERT INTO machine_requirements (machine_id, certification_id, created_at) SELECT ${machineId}, ${certId}, ${T0} WHERE ${guard}`,
];

describe("withMachineWrite", () => {
  it("concurrent writes: one wins on the first try, the other retries and also succeeds", async () => {
    const m = await seed.machine({ name: "Start" });
    // Both callers read the machine before either writes.
    let reads = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => (release = resolve));
    const attempts: Record<string, number[]> = { a: [], b: [] };

    const write = (label: "a" | "b", minutes: number) =>
      withMachineWrite(
        db(),
        m.id,
        T0,
        async (_machine, attempt) => {
          attempts[label].push(attempt);
          if (attempt === 0 && ++reads === 2) release();
          if (attempt === 0) await bothRead;
          return { set: { typicalSessionMinutes: minutes }, result: label };
        },
        { sleep: noSleep },
      );

    const v0 = await dataVersion();
    expect(await Promise.all([write("a", 30), write("b", 45)])).toEqual(["a", "b"]);
    const all = [...attempts.a, ...attempts.b].sort();
    expect(all).toEqual([0, 0, 1]); // exactly one retry
    const row = await db().select().from(machines).where(eq(machines.id, m.id)).get();
    expect([30, 45]).toContain(row!.typicalSessionMinutes);
    expect(row!.writeToken).not.toBe(m.writeToken);
    expect(await dataVersion()).toBe(v0 + 2); // only the successful batches bumped it
  });

  it("a persistent conflict → CONFLICT_RETRY after 3 retries, and guarded statements never run", async () => {
    const m = await seed.machine();
    const cert = await seed.cert();
    const v0 = await dataVersion();
    let attempts = 0;
    await expect(
      withMachineWrite(
        db(),
        m.id,
        T0,
        async () => {
          attempts++;
          // Someone else writes between our read and our batch, every time.
          await db().update(machines).set({ writeToken: newToken() }).where(eq(machines.id, m.id));
          return { set: { name: "Mine" }, guarded: insertRequirement(m.id, cert.id), result: null };
        },
        { sleep: noSleep },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT_RETRY" });
    expect(attempts).toBe(4);
    expect(await requirementCount(m.id)).toBe(0);
    expect((await db().select().from(machines).where(eq(machines.id, m.id)).get())!.name).toBe(m.name);
    expect(await dataVersion()).toBe(v0);
  });

  it("guarded statements run when the swap succeeds", async () => {
    const m = await seed.machine();
    const cert = await seed.cert();
    await withMachineWrite(db(), m.id, T0 + 7, () => ({ guarded: insertRequirement(m.id, cert.id), result: null }));
    expect(await requirementCount(m.id)).toBe(1);
    expect((await db().select().from(machines).where(eq(machines.id, m.id)).get())!.updatedAt).toBe(T0 + 7);
  });

  it("a refusal by `where` (token unchanged) calls refused() without retrying", async () => {
    const m = await seed.machine();
    let attempts = 0;
    await expect(
      withMachineWrite(db(), m.id, T0, () => {
        attempts++;
        return {
          set: { name: "Nope" },
          where: sql`0`,
          refused: () => new ServiceError("CERT_INACTIVE", "refused"),
          result: null,
        };
      }),
    ).rejects.toMatchObject({ code: "CERT_INACTIVE" });
    expect(attempts).toBe(1);
  });

  it("an unknown machine → NOT_FOUND", async () => {
    await expect(withMachineWrite(db(), crypto.randomUUID(), T0, () => ({ result: null }))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
