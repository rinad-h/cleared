#!/usr/bin/env bash
# Reset the DEPLOYMENT's demo data (Phase 7 P7-73, docs/seed.md):
#
#   bash scripts/reset-demo.sh --i-know
#
# 1. refuses unless --i-know is passed AND the makerspace name starts with "Demo"
#    (so it can never wipe a real pilot);
# 2. exports a backup to ~/cleared-backups/cleared-<date>-before-reset.sql
#    (outside the repository: it holds personal data and password hashes);
# 3. clears the business tables and the seeded "Demo …" members (@example.com),
#    never real accounts, and re-seeds, in one transaction.
#
# Real accounts you signed up for the live demo (P7-74) stay, but lose their
# grants and history. Any other argument is rejected, so a mistyped flag can't
# change what runs. The local equivalent is: npm run db:seed -- --reset --i-know
set -euo pipefail
cd "$(dirname "$0")/.."

i_know=false
for arg in "$@"; do
  if [[ "$arg" == "--i-know" ]]; then
    i_know=true
  else
    echo "reset-demo: unexpected argument '$arg'." >&2
    echo "  usage: bash scripts/reset-demo.sh --i-know" >&2
    exit 2
  fi
done

if ! $i_know; then
  echo "reset-demo: this deletes every machine, grant and service record on the deployment." >&2
  echo "  It only runs when the makerspace name starts with \"Demo\". To go ahead: bash scripts/reset-demo.sh --i-know" >&2
  exit 2
fi

exec npx tsx scripts/seed.ts --remote --reset --i-know
