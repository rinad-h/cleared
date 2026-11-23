// Run a repo script inside a throwaway copy of the files it needs.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const UUID_A = "11111111-1111-4111-8111-111111111111";
export const UUID_B = "22222222-2222-4222-8222-222222222222";

/** A temp dir with scripts/, wrangler.jsonc and cleared.config.example.json, as a git repo. */
export function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "cleared-script-test-"));
  cpSync(join(repo, "scripts"), join(dir, "scripts"), { recursive: true });
  for (const f of ["wrangler.jsonc", "cleared.config.example.json"]) cpSync(join(repo, f), join(dir, f));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return {
    dir,
    write(path, content) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    },
    track(path) {
      execFileSync("git", ["add", "-f", path], { cwd: dir });
    },
    run(script, args = [], env = {}) {
      const clean = { ...process.env };
      for (const k of ["WORKERS_SUBDOMAIN", "D1_DATABASE_ID", "BETTER_AUTH_SECRET", "CLOUDFLARE_API_TOKEN"]) delete clean[k];
      const r = spawnSync(process.execPath, [join("scripts", script), ...args], { cwd: dir, env: { ...clean, ...env }, encoding: "utf8" });
      return { code: r.status, out: r.stdout + r.stderr };
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
