/**
 * `npm run db:seed`: loads clearly fake demo data into the **local** D1.
 *
 * Phase 2: the demo catalog (rooms, certifications, machines with
 * requirements), from the list in docs/phases/phase-7-hardening-and-launch.md
 * P7-70. Run it after completing Setup locally. It is idempotent: rows whose
 * names already exist are skipped, so it never changes your own data.
 * Phase 7 adds demo members, grants, history and `--reset`.
 *
 *   npm run db:seed                          your local D1 (.wrangler/state)
 *   npm run db:seed -- --persist-to <dir>    another local D1 state directory
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);

function wranglerBin(): string {
  const pkg = require.resolve("wrangler/package.json");
  return join(dirname(pkg), JSON.parse(readFileSync(pkg, "utf8")).bin.wrangler);
}

const token = () => randomBytes(16).toString("base64url");
const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

const ROOMS = ["Laser Room", "Wood Shop", "3D Print Lab", "Metal Shop"];
const CERTS: [name: string, validityMonths: number | null][] = [
  ["Laser Cutter — Basic", 12],
  ["Wood Shop — General", 12],
  ["3D Printer — Intro", null],
  ["Lathe — Basic", 6],
];
const MACHINES: { name: string; room: string; requires: string[]; supervised?: boolean; minutes?: number }[] = [
  { name: "Laser Cutter A", room: "Laser Room", requires: ["Laser Cutter — Basic"], minutes: 30 },
  { name: "Laser Cutter B", room: "Laser Room", requires: ["Laser Cutter — Basic"], minutes: 30 },
  { name: "Table Saw", room: "Wood Shop", requires: ["Wood Shop — General"] },
  { name: "Band Saw", room: "Wood Shop", requires: ["Wood Shop — General"] },
  { name: "Drill Press", room: "Wood Shop", requires: ["Wood Shop — General"], minutes: 30 },
  { name: "Wood Lathe", room: "Wood Shop", requires: ["Wood Shop — General", "Lathe — Basic"], supervised: true, minutes: 90 },
  { name: "Prusa MK4 #1", room: "3D Print Lab", requires: ["3D Printer — Intro"], minutes: 120 },
  { name: "Prusa MK4 #2", room: "3D Print Lab", requires: ["3D Printer — Intro"], minutes: 120 },
  { name: "Metal Lathe", room: "Metal Shop", requires: ["Lathe — Basic"], supervised: true, minutes: 90 },
  { name: "Bench Grinder", room: "Metal Shop", requires: [], minutes: 15 },
];

function buildSql(now: number): string {
  const lines: string[] = [];
  ROOMS.forEach((name, i) => {
    lines.push(
      `INSERT INTO rooms (id, name, sort_order, created_at, updated_at) SELECT ${q(randomUUID())}, ${q(name)}, ${i}, ${now}, ${now} WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE name = ${q(name)} COLLATE NOCASE);`,
    );
  });
  for (const [name, months] of CERTS) {
    lines.push(
      `INSERT INTO certifications (id, name, training_url, validity_months, active, created_at, updated_at) SELECT ${q(randomUUID())}, ${q(name)}, NULL, ${months ?? "NULL"}, 1, ${now}, ${now} WHERE NOT EXISTS (SELECT 1 FROM certifications WHERE name = ${q(name)} COLLATE NOCASE);`,
    );
  }
  for (const m of MACHINES) {
    const id = randomUUID();
    lines.push(
      `INSERT INTO machines (id, room_id, name, supervised, status, status_changed_at, qr_token, typical_session_minutes, write_token, created_at, updated_at) SELECT ${q(id)}, r.id, ${q(m.name)}, ${m.supervised ? 1 : 0}, 'available', ${now}, ${q(token())}, ${m.minutes ?? 60}, ${q(token())}, ${now}, ${now} FROM rooms r WHERE r.name = ${q(m.room)} COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM machines WHERE name = ${q(m.name)} COLLATE NOCASE AND status <> 'retired');`,
    );
    for (const cert of m.requires) {
      lines.push(
        `INSERT INTO machine_requirements (machine_id, certification_id, created_at) SELECT ${q(id)}, c.id, ${now} FROM certifications c WHERE c.name = ${q(cert)} COLLATE NOCASE AND EXISTS (SELECT 1 FROM machines WHERE id = ${q(id)});`,
      );
    }
  }
  lines.push(`UPDATE settings SET data_version = data_version + 1;`);
  return lines.join("\n");
}

const dir = mkdtempSync(join(tmpdir(), "cleared-seed-"));
try {
  const file = join(dir, "seed.sql");
  writeFileSync(file, buildSql(Date.now()));
  const at = process.argv.indexOf("--persist-to");
  const persist = at !== -1 && process.argv[at + 1] ? ["--persist-to", process.argv[at + 1]] : [];
  const result = spawnSync(process.execPath, [wranglerBin(), "d1", "execute", "DB", "--local", ...persist, "--file", file], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (result.status !== 0) {
    console.error("db:seed: wrangler d1 execute failed (see above). Run `npm run db:migrate` first.");
    process.exit(result.status ?? 1);
  }
  console.log(`db:seed: demo catalog loaded locally (${ROOMS.length} rooms, ${CERTS.length} certifications, ${MACHINES.length} machines; existing names skipped).`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
