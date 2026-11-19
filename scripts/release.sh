#!/usr/bin/env bash
# Run every gate, then rebase on dev and push. Stops at the first failure. Never pipe a gate.
set -euo pipefail
cd "$(dirname "$0")/.."
# Refuse during a hold (finding 3), with uncommitted changes (finding 4: the gates must check what is
# pushed), and check every commit's Agent: trailer before the push, while it can still be amended (finding 5).
[ -e board/HOLD.md ] && { echo "board/HOLD.md exists: no release while it does" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "uncommitted changes: commit or stash them first" >&2; exit 1; }
git fetch -q origin dev
# Signed commits (Dinis, 19 Nov 2026): every commit since origin/dev is signed by its Agent:'s published key. The check runs
# from origin/dev's copy, never from the commits it checks; only the bootstrap push (origin/dev has no copy yet) uses this one.
sigcheck() {
  local d t s=0; d=$(mktemp -d); t="$d/check-signatures.mjs"   # a .mjs name, or node refuses the file (VID-2026-027)
  if git cat-file -e origin/dev:scripts/check-signatures.mjs 2>/dev/null; then git show origin/dev:scripts/check-signatures.mjs > "$t"; else cp scripts/check-signatures.mjs "$t"; fi
  node "$t" origin/dev HEAD || s=$?
  rm -rf "$d"; return "$s"
}
# Our vendored sites bar against the live registry's pin: the one check the repo cannot vouch for itself (VID-2026-022).
node scripts/sync-sites.mjs --check
node scripts/build.mjs
node scripts/validate.mjs
node scripts/test-leak-scan.mjs
node scripts/leak-scan.mjs
node scripts/check-commits.mjs origin/dev HEAD
node scripts/test-check-signatures.mjs
sigcheck
for i in 1 2 3 4 5; do
  git fetch -q origin dev
  git rebase -q origin/dev
  # One gate per line: under set -e a failure inside an && chain does not stop the script (specialist.code@ finding 1).
  node scripts/build.mjs >/dev/null
  node scripts/validate.mjs >/dev/null
  node scripts/test-leak-scan.mjs >/dev/null
  node scripts/leak-scan.mjs >/dev/null
  node scripts/check-commits.mjs origin/dev HEAD >/dev/null
  sigcheck >/dev/null
  if git -c push.negotiate=true push -q origin HEAD:dev; then echo "released $(git rev-parse --short HEAD) to dev"; exit 0; fi
  sleep $((i * 3))
done
echo "release failed after 5 attempts" >&2; exit 1
