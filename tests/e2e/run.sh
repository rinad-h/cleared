#!/usr/bin/env bash
# E2E harness: an isolated `next dev` on a throwaway local D1, then Playwright.
#
#   npm run test:e2e                 all specs
#   npm run test:e2e -- shell.spec   extra arguments go to `playwright test`
#
# Safe to run next to `npm run dev`: its own port, build dir (.next-e2e) and D1
# state. It fails if your own local D1 (.wrangler/state) changes during the run,
# or if the dev server logs an error.
set -euo pipefail
cd "$(dirname "$0")/../.."

tmp="$(mktemp -d)"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$tmp"
  # Route types generated for .next-e2e go stale when routes change and would
  # break `npm run typecheck`; the next E2E run regenerates them.
  rm -rf .next-e2e/types .next-e2e/dev/types
}
trap cleanup EXIT

# Start from an empty build dir. Turbopack persists its dev cache there, and a
# cache left by an interrupted run can put every page into an endless
# "HMR hash mismatch" reload loop. A cold start costs a few seconds; the
# warm-up below and in auth.spec.ts absorbs it.
rm -rf .next-e2e

port="${E2E_PORT:-$(node -e 'const s=require("node:net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')}"
base_url="http://127.0.0.1:${port}"
export D1_STATE_DIR="$tmp/d1"
# Signed-in browser state saved by auth.spec.ts for the other specs.
export E2E_STATE_DIR="$tmp/state"
touch "$tmp/started"

echo "E2E: applying migrations to a throwaway D1 in $D1_STATE_DIR"
npx wrangler d1 migrations apply DB --local --persist-to "$D1_STATE_DIR" > "$tmp/migrate.log" 2>&1 \
  || { cat "$tmp/migrate.log"; exit 1; }

echo "E2E: starting next dev on $base_url"
NEXT_DIST_DIR=.next-e2e \
E2E=1 \
ENVIRONMENT=test \
PUBLIC_BASE_URL="$base_url" \
BETTER_AUTH_URL="$base_url" \
BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-e2e-only-secret-$(node -e 'console.log(crypto.randomUUID())')}" \
NEXT_TELEMETRY_DISABLED=1 \
  npx next dev -H 127.0.0.1 --port "$port" > "$tmp/server.log" 2>&1 &
server_pid=$!

# Wait for OUR server (environment "test"), not something else that grabbed the port.
ready=false
for _ in $(seq 1 120); do
  if curl -fsS "$base_url/api/health" 2>/dev/null | grep -q '"environment":"test"'; then ready=true; break; fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "E2E: dev server exited early" >&2; cat "$tmp/server.log" >&2; exit 1
  fi
  sleep 1
done
if ! $ready; then echo "E2E: server not ready" >&2; cat "$tmp/server.log" >&2; exit 1; fi

# Compile every route once before the browsers start. On a cold dev server,
# Turbopack compiling routes under parallel tests triggers full page reloads
# ("execution context was destroyed") and flaky failures.
echo "E2E: warming up routes"
for path in /machines /me/certifications /help /m/warm-up /console /console/faults \
  /console/rooms /console/machines /console/machines/new /console/labels /console/door-poster \
  /console/certifications /sign-in /sign-up /setup /join/warm-up /definitely-not-a-page; do
  curl -sS -o /dev/null --max-time 120 "$base_url$path" || true
done

set +e
E2E_BASE_URL="$base_url" E2E_EXPECTED_VERSION="$(node scripts/lib/build-sha.cjs)" npx playwright test "$@"
status=$?
set -e

# Server-side errors (e.g. a URL hook or session read outside <Suspense>, which
# dev's Cache Components reports, or an error logged by log()) don't always fail
# a page visibly. Fail on them.
sleep 1
error_pattern="digest: '|^[A-Za-z]*Error: |⨯ |\"level\":\"error\""
if grep -qE "$error_pattern" "$tmp/server.log"; then
  echo "E2E: the dev server logged errors:" >&2
  { grep -nE -A12 "$error_pattern" "$tmp/server.log" || true; } | head -n 80 >&2 || true
  status=1
fi

# The run must not touch your own local database.
if [[ -d .wrangler/state ]] && [[ -n "$(find .wrangler/state -type f -newer "$tmp/started" 2>/dev/null | head -n 1)" ]]; then
  echo "E2E: your local D1 in .wrangler/state changed during the run; the throwaway database wasn't used" >&2
  status=1
fi

if [[ $status -ne 0 ]]; then
  echo "E2E: last server log lines:" >&2
  tail -n 40 "$tmp/server.log" >&2 || true
fi
exit $status
