#!/usr/bin/env bash
# Post-deploy smoke test. The deploy scripts run it automatically.
#
#   bash scripts/smoke-test.sh staging | production
#   bash scripts/smoke-test.sh <base-url> [expected-version] [expected-environment]
#
# Passes when /api/health answers status "ok" with the version this checkout
# builds (scripts/lib/build-sha.cjs) and the right environment, and the app
# shell responds: /help renders and / redirects (307) to /machines.
# Retries for about a minute while the new version propagates.
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:?usage: smoke-test.sh <staging|production|base-url> [expected-version] [expected-environment]}"
case "$target" in
  staging|production)
    base_url="$(node scripts/render-wrangler.mjs --url "$target")"
    expected_env="$target"
    ;;
  *)
    base_url="$target"
    expected_env="${3:-}"
    ;;
esac
expected_version="${2:-$(node scripts/lib/build-sha.cjs)}"
if [[ "$expected_version" == "unknown" ]]; then
  echo "Smoke test: can't tell which version was built (not a git checkout?). Pass it as the second argument." >&2
  exit 1
fi
base_url="${base_url%/}"

for attempt in $(seq 1 12); do
  body="$(curl -fsS --max-time 10 "$base_url/api/health" || true)"
  if result="$(node -e '
    const [body, version, env] = process.argv.slice(1);
    let j = {};
    try { j = JSON.parse(body); } catch {}
    const ok = j.status === "ok" && j.version === version && (!env || j.environment === env);
    console.log(`status=${j.status ?? "-"} version=${j.version ?? "-"} environment=${j.environment ?? "-"}`);
    process.exit(ok ? 0 : 1);
  ' "$body" "$expected_version" "$expected_env")"; then
    help_status="$(curl -sS -o /dev/null --max-time 10 -w '%{http_code}' "$base_url/help" || true)"
    root_redirect="$(curl -sS -o /dev/null --max-time 10 -w '%{http_code} %{redirect_url}' "$base_url/" || true)"
    if [[ "$help_status" == "200" && "$root_redirect" == "307 $base_url/machines" ]]; then
      echo "Smoke test passed: $base_url ($result)"
      exit 0
    fi
    result="$result /help=$help_status /=$root_redirect"
  fi
  echo "Attempt $attempt: $result (want version=$expected_version${expected_env:+ environment=$expected_env}); retrying in 5 s"
  sleep 5
done

echo "Smoke test FAILED: $base_url" >&2
exit 1
