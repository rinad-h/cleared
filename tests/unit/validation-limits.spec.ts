// P6-07 (FR-19 "all input validated"): every text-length CHECK in drizzle/*.sql
// has a Zod schema with exactly the same limits. A new CHECK without an entry
// here fails the test.
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { CertificationCreate, MachineCreate, RoomName } from "@/lib/schemas/catalog";
import { CreateCheckupInput } from "@/lib/schemas/checkups";
import { LogServiceInput, ReportFaultInput, SetOutOfServiceInput } from "@/lib/schemas/faults";
import { RevokeInput } from "@/lib/schemas/grants";
import { DisplayName, MakerspaceName, MemberPatch } from "@/lib/schemas/identity";

const migrations = import.meta.glob<string>("../../drizzle/*.sql", { query: "?raw", import: "default", eager: true });

type Limit = { column: string; min: number | null; max: number };

function lengthChecks(): Limit[] {
  const out = new Map<string, Limit>();
  const re = /length\("(\w+)"\."(\w+)"\)\s*(?:BETWEEN\s+(\d+)\s+AND\s+(\d+)|<=\s*(\d+))/g;
  for (const text of Object.values(migrations)) {
    for (const m of text.matchAll(re)) {
      const column = `${m[1]}.${m[2]}`;
      out.set(column, m[5] ? { column, min: null, max: Number(m[5]) } : { column, min: Number(m[3]), max: Number(m[4]) });
    }
  }
  return [...out.values()].sort((a, b) => a.column.localeCompare(b.column));
}

/** A valid value of exactly `n` characters for the column. */
type Field = { schema: z.ZodType; make?: (n: number) => string };
const text = (n: number) => "a".repeat(n);
const url = (n: number) => `https://example.test/${"a".repeat(Math.max(0, n - 21))}`;

const FIELDS: Record<string, Field> = {
  "certifications.name": { schema: CertificationCreate.shape.name },
  "certifications.training_url": { schema: CertificationCreate.shape.trainingUrl, make: url },
  "checkups.instructions": { schema: CreateCheckupInput.shape.instructions },
  "checkups.name": { schema: CreateCheckupInput.shape.name },
  "faults.description": { schema: ReportFaultInput.shape.description },
  "grants.revoke_reason": { schema: RevokeInput.shape.reason },
  "machines.name": { schema: MachineCreate.shape.name },
  "machines.status_note": { schema: SetOutOfServiceInput.shape.note },
  "members.display_name": { schema: DisplayName },
  "members.suspension_reason": { schema: MemberPatch.shape.suspensionReason },
  "rooms.name": { schema: RoomName },
  "service_records.external_technician": { schema: LogServiceInput.shape.externalTechnician },
  "service_records.parts_used": { schema: LogServiceInput.shape.partsUsed },
  "service_records.work_done": { schema: LogServiceInput.shape.workDone },
  "settings.name": { schema: MakerspaceName },
};

describe("Zod limits match the database CHECKs", () => {
  const checks = lengthChecks();

  it("finds the length CHECKs", () => {
    expect(checks.length).toBeGreaterThanOrEqual(15);
  });

  it.each(checks.map((c) => [c.column, c] as const))("%s", (column, { min, max }) => {
    const field = FIELDS[column];
    expect(field, `${column} has a length CHECK but no Zod schema listed in this test`).toBeDefined();
    const make = field.make ?? text;
    const ok = (n: number) => field.schema.safeParse(make(n)).success;
    expect(ok(max), `${column}: ${max} characters should pass`).toBe(true);
    expect(ok(max + 1), `${column}: ${max + 1} characters should fail`).toBe(false);
    if (min !== null && min > 1) {
      expect(ok(min), `${column}: ${min} characters should pass`).toBe(true);
      expect(ok(min - 1), `${column}: ${min - 1} characters should fail`).toBe(false);
    }
  });
});
