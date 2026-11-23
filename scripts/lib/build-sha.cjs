// The version string baked into a build and reported by /api/health.
// Shared by next.config.ts (build) and scripts/smoke-test.sh (deploy check) so
// both always agree.
//
//   BUILD_SHA env var            → used as is
//   clean git tree               → commit SHA
//   uncommitted changes          → "<sha>-dirty-<hash of the changes>", so a
//                                  deploy of different uncommitted work is
//                                  distinguishable from the previous one
//   not a git checkout           → "unknown"
//
// CommonJS on purpose: next.config.ts can require it on every Node 22 release.

const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");

function git(args) {
  return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).toString();
}

function buildSha() {
  if (process.env.BUILD_SHA) return process.env.BUILD_SHA;
  let head;
  try {
    head = git(["rev-parse", "HEAD"]).trim();
  } catch {
    return "unknown";
  }
  const status = git(["status", "--porcelain"]);
  if (status === "") return head;
  const hash = createHash("sha256").update(status).update(git(["diff", "HEAD", "--binary"])).digest("hex");
  return `${head}-dirty-${hash.slice(0, 12)}`;
}

module.exports = { buildSha };

if (require.main === module) console.log(buildSha());
