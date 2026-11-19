#!/usr/bin/env bash
# Run every gate, then rebase on dev and push. Stops at the first failure. Never pipe a gate.
set -euo pipefail
cd "$(dirname "$0")/.."
# Refuse during a hold (finding 3), with uncommitted changes (finding 4: the gates must check what is
# pushed), and check every commit's Agent: trailer before the push, while it can still be amended (finding 5).
[ -e board/HOLD.md ] && { echo "board/HOLD.md exists: no release while it does" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "uncommitted changes: commit or stash them first" >&2; exit 1; }
git fetch -q origin dev
# The anchor (security@'s sixth ruling, 19 Nov 2026): the newest commit a passing run verified: the head_sha of the newest run of
# the Pages workflow on dev, from a push, that concluded success, read from GitHub's API (only GitHub Actions creates runs; this
# repository is public, so no token is needed). Every security check runs from the anchor's copy (control 7, widened), never from
# the commits it checks, over anchor..HEAD; the copy is written into scripts/ under an ignored name so each finds the repository
# as it always has; no anchor or no copy, no push.
ANCHOR=$(curl -fsS -m 20 --max-redirs 0 -H 'Accept: application/vnd.github+json' -H 'User-Agent: videos-release' 'https://api.github.com/repos/PrompTugal/PrompTugal__News__Videos/actions/workflows/pages.yml/runs?branch=dev&event=push&status=success&per_page=20' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=(JSON.parse(s).workflow_runs||[]).find(x=>x.path===".github/workflows/pages.yml"&&x.head_branch==="dev"&&x.event==="push"&&x.conclusion==="success");if(!r||!/^[0-9a-f]{40}$/.test(r.head_sha))process.exit(1);console.log(r.head_sha)})') || { echo "cannot read the anchor (the last successful run): refusing" >&2; exit 1; }
GIT_NO_REPLACE_OBJECTS=1 git cat-file -e "$ANCHOR^{commit}" 2>/dev/null || { echo "the anchor $ANCHOR is not in this clone: refusing" >&2; exit 1; }
trusted() {
  local name=$1 t s=0; shift; t="scripts/trusted-$name"
  rm -f "$t"   # never write through a link left at that path
  if ! GIT_NO_REPLACE_OBJECTS=1 git show "$ANCHOR:scripts/$name" > "$t" 2>/dev/null; then rm -f "$t"; echo "the anchor has no scripts/$name: refusing" >&2; return 1; fi
  NODE_OPTIONS= node "$t" "$@" || s=$?
  rm -f "$t"; return "$s"
}
# The trailer check reads scripts/commit-exemptions.json from the tree: a push may not add or change it (a person exempts a commit).
exemptions_unchanged() { GIT_NO_REPLACE_OBJECTS=1 git diff --quiet "$ANCHOR" HEAD -- scripts/commit-exemptions.json || { echo "scripts/commit-exemptions.json changed since the anchor: refusing" >&2; return 1; }; }
# The push must build on the anchor.
refuse_unless_forward() { GIT_NO_REPLACE_OBJECTS=1 git merge-base --is-ancestor "$ANCHOR" HEAD || { echo "the anchor is not an ancestor of HEAD: refusing" >&2; return 1; }; }
trusted sync-sites.mjs --check
node scripts/build.mjs
node scripts/validate.mjs
node scripts/test-leak-scan.mjs
trusted leak-scan.mjs
exemptions_unchanged
trusted check-commits.mjs "$ANCHOR" HEAD
node scripts/test-check-signatures.mjs
trusted check-signatures.mjs "$ANCHOR" HEAD
for i in 1 2 3 4 5; do
  git fetch -q origin dev
  git rebase -q origin/dev
  # One gate per line: under set -e a failure inside an && chain does not stop the script (specialist.code@ finding 1).
  node scripts/build.mjs >/dev/null
  node scripts/validate.mjs >/dev/null
  node scripts/test-leak-scan.mjs >/dev/null
  trusted leak-scan.mjs >/dev/null
  refuse_unless_forward
  exemptions_unchanged
  trusted check-commits.mjs "$ANCHOR" HEAD >/dev/null
  trusted check-signatures.mjs "$ANCHOR" HEAD >/dev/null
  if git -c push.negotiate=true push -q origin HEAD:dev; then echo "released $(git rev-parse --short HEAD) to dev"; exit 0; fi
  sleep $((i * 3))
done
echo "release failed after 5 attempts" >&2; exit 1
