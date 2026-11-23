#!/usr/bin/env bash
# Build, check and deploy the app (there is one deployment), then smoke-test it.
#
#   npm run deploy          scripts/deploy.sh
#   npm run deploy:first    scripts/deploy.sh --first
#
# Extra arguments are rejected, so a mistyped flag can't change what deploys.
#
# --first also generates and uploads the Worker's one secret, BETTER_AUTH_SECRET.
# It refuses to run if the Worker already has it, because replacing it signs
# everyone out.
set -euo pipefail
cd "$(dirname "$0")/.."

first=false
for arg in "$@"; do
  if [[ "$arg" == "--first" ]]; then
    first=true
  else
    echo "deploy: unexpected argument '$arg'." >&2
    echo "  usage: npm run deploy (or npm run deploy:first for the very first deploy)" >&2
    exit 2
  fi
done

config=(--config wrangler.deploy.jsonc)

echo "==> Deploying"
node scripts/render-wrangler.mjs

better_auth_secret=""
if $first; then
  command -v openssl >/dev/null || { echo "deploy: openssl is required" >&2; exit 1; }

  # Refuse to replace the existing secret. `secret list` fails when the Worker
  # doesn't exist yet, which is exactly the first-deploy case.
  if existing="$(npx wrangler secret list --format json "${config[@]}" 2>/dev/null)" \
    && grep -q 'BETTER_AUTH_SECRET' <<<"$existing"; then
    echo "deploy: the Worker already has BETTER_AUTH_SECRET; a first deploy would replace it and sign everyone out." >&2
    echo "  Deploy code with: npm run deploy" >&2
    exit 1
  fi

  better_auth_secret="$(openssl rand -base64 32)"
  if [[ -z "$better_auth_secret" ]]; then echo "deploy: openssl rand failed" >&2; exit 1; fi
fi

echo "==> Building"
# The secret never needs to be in the build's environment.
env -u BETTER_AUTH_SECRET \
  npx opennextjs-cloudflare build "${config[@]}"

echo "==> Checking the build"
if $first; then
  # Also look for a literal copy of the secret about to be uploaded.
  BETTER_AUTH_SECRET="$better_auth_secret" node scripts/check-bundle.mjs
else
  node scripts/check-bundle.mjs
fi

echo "==> Uploading"
if $first; then
  secrets_file="$(mktemp)"
  chmod 600 "$secrets_file"
  trap 'rm -f "$secrets_file"' EXIT
  {
    printf 'BETTER_AUTH_SECRET=%s\n' "$better_auth_secret"
  } > "$secrets_file"
  npx opennextjs-cloudflare deploy "${config[@]}" --secrets-file "$secrets_file"
else
  npx opennextjs-cloudflare deploy "${config[@]}"
fi

echo "==> Smoke test"
bash scripts/smoke-test.sh
