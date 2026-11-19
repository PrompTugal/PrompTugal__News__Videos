#!/usr/bin/env bash
# Run every gate, then rebase on dev and push. Stops at the first failure. Never pipe a gate.
set -euo pipefail
cd "$(dirname "$0")/.."
# Refuse during a hold (finding 3), with uncommitted changes (finding 4: the gates must check what is
# pushed), and check every commit's Agent: trailer before the push, while it can still be amended (finding 5).
[ -e board/HOLD.md ] && { echo "board/HOLD.md exists: no release while it does" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "uncommitted changes: commit or stash them first" >&2; exit 1; }
git fetch -q origin dev
# Every security check runs from origin/dev's copy, never from the commits it checks (security@'s control 7, widened, 19 Nov
# 2026): the signatures, the trailers, the leak scan (with its exemptions) and the sites bar's pin. The copy is written into
# scripts/ under an ignored name, so each finds the repository as it always has; no copy on origin/dev, no push (fails closed).
trusted() {
  local name=$1 t s=0; shift; t="scripts/trusted-$name"
  rm -f "$t"   # never write through a link left at that path
  if ! GIT_NO_REPLACE_OBJECTS=1 git show "origin/dev:scripts/$name" > "$t" 2>/dev/null; then rm -f "$t"; echo "origin/dev has no scripts/$name: refusing" >&2; return 1; fi
  NODE_OPTIONS= node "$t" "$@" || s=$?
  rm -f "$t"; return "$s"
}
# The trailer check reads scripts/commit-exemptions.json from the tree: a push may not add or change it (a person exempts a commit).
exemptions_unchanged() { GIT_NO_REPLACE_OBJECTS=1 git diff --quiet origin/dev HEAD -- scripts/commit-exemptions.json || { echo "scripts/commit-exemptions.json changed in this push: refusing" >&2; return 1; }; }
# Our vendored sites bar against the live registry's pin: the one check the repo cannot vouch for itself (VID-2026-022).
trusted sync-sites.mjs --check
node scripts/build.mjs
node scripts/validate.mjs
node scripts/test-leak-scan.mjs
trusted leak-scan.mjs
exemptions_unchanged
trusted check-commits.mjs origin/dev HEAD
node scripts/test-check-signatures.mjs
trusted check-signatures.mjs origin/dev HEAD
for i in 1 2 3 4 5; do
  git fetch -q origin dev
  git rebase -q origin/dev
  # One gate per line: under set -e a failure inside an && chain does not stop the script (specialist.code@ finding 1).
  node scripts/build.mjs >/dev/null
  node scripts/validate.mjs >/dev/null
  node scripts/test-leak-scan.mjs >/dev/null
  trusted leak-scan.mjs >/dev/null
  exemptions_unchanged
  trusted check-commits.mjs origin/dev HEAD >/dev/null
  trusted check-signatures.mjs origin/dev HEAD >/dev/null
  if git -c push.negotiate=true push -q origin HEAD:dev; then echo "released $(git rev-parse --short HEAD) to dev"; exit 0; fi
  sleep $((i * 3))
done
echo "release failed after 5 attempts" >&2; exit 1
