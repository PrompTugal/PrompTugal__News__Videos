# Threat model: signed commits (scripts/check-signatures.mjs, team/keys.json, release.sh, the workflow)

> videos.b@PrompTugal.dinis, 19 November 2026. For review by security@PrompTugal.dinis. Licence: CC BY 4.0.

## What it is
Every commit to this repository is signed, as a git SSH signature, by the agent named in its `Agent:` trailer, with the key that agent published in `team/keys.json`, and names in `Claude-Session:` the session published with that key (Dinis Cruz, 18 and 19 Nov 2026; the guidance's section 2). The check is adapted from data.b@'s (PrompTugal__News__Data f68beb3, Apache-2.0), hardened after this wake's security pre-review. It runs in `release.sh` before every push and inside the rebase-and-push loop, and in CI on the range from the last release tag. One failing commit fails the range, and CI then deploys nothing.

## The key
- Ed25519, made with ssh-keygen in this agent's own cloud session on 19 Nov 2026, kept outside the repository (a folder of mode 700, the key file 600), with no passphrase: the container is the session's own and is reclaimed with it.
- Only its public half is published, as a PEM block in `team/keys.json`, with the agent and the full session URL. The check derives the OpenSSH form itself, so no SSH key line is in the repository, and the leak scan fails any such line anywhere.
- The signer is set for this repository only (`git config --local`: ssh-keygen and this key), because the environment's global signer signs with the environment's key.
- A new session cannot sign with this key. It adds its own in a commit signed by a key already listed, or Dinis adds it; at hand-over this entry is removed. If no listed key is left, only a person can add one, and until then CI fails: that is the recovery path, by design.

## What could go wrong, and the mitigations
| Threat | Mitigation |
|---|---|
| A commit that adds its own key | Each commit is checked against its parent's `team/keys.json`, never its own; only the one commit that first added the check (found in the trusted base's history once it holds the check) uses its own tree. |
| An unrelated history brought in by a merge | Every commit with no parent fails, except the trusted base, recorded in the check by its full id (de181efb94e19b731def28690a481f1c7ac76a11, the commit that turned signing on; security@'s control 6). |
| A shallow checkout hiding part of the range | Refused (control 6); CI fetches the whole history. |
| A push that edits the check | The check runs from the copy at the commit dev pointed to before the push (origin/dev in release.sh; in CI, BEFORE or the last release tag reachable from it), never from the commits it checks (control 7); never from the pushed tree, so a base without a check is refused. The test shows that a copy run from outside ignores a weakened check in the commits; that release.sh and the workflow take the base's copy is in their code, not in a test. The push that brought controls 6 and 7 was itself checked by the previous copy; they apply from the next push. The workflow file itself still comes from the pushed tree: only branch protection with a required check closes that, which is Dinis's to set. |
| Deleting the check | Commits are skipped only as ancestors of the first commit, so a later commit without the check is still checked. |
| A revoked or rotated key | Matched by its fingerprint, not its name; revoked by removing it from the keys file (a "superseded" entry is not used, since a commit date can be set by anyone); a key must also still be listed at the tip of the range, so it cannot come back through a branch that started before its removal. A key listed twice makes the file unusable. |
| A principal that widens the allowed signers | Principals must be plain addresses. |
| Two agents or sessions in one commit | Exactly one `Agent:` and one `Claude-Session:` trailer, compared exactly with the key's. |
| A name that looks like CI's | Nothing is exempt: CI makes no commits here, only tags. |
| Something hidden in a public key block | Each block in a keys file must parse as a public key. |
| A push that weakens another security check | Every security check release.sh and CI run comes from the trusted base's copy (security@'s control 7, widened): the signature check, the trailer check (check-commits.mjs), the leak scan with its exemptions, and in release.sh the sites bar's pin check. Each copy is written into scripts/ under an ignored name (scripts/trusted-*.mjs; anything left at that path, a link included, is removed first) and removed after, pass or fail; a base without one is refused. In CI the trailer and signature checks run before any pushed code; the leak scan needs the built site, so it runs after the pushed build and validator (as it does in release.sh); each step works out the base itself, and `NODE_OPTIONS` is cleared and replaced objects ignored. What they still read from the pushed tree: the trailer check's `scripts/commit-exemptions.json`, which a push may not add or change (refused), and the sites bar's vendored files, which the pin check compares with the live registry. The workflow file and release.sh themselves come from the pushed tree, which only branch protection closes. The build, the validator and the tests stay on the pushed tree (functional gates). Skips are decided only by ancestry of the trusted base (control 8; the test that deletes the check and adds an unsigned commit fails). There is no override of the trusted base. |
| Where the checker comes from (security@'s control 7, third ruling) | From BEFORE, the commit dev pointed to before the push, or from the last release tag reachable from BEFORE (always its ancestor, and released, so checked even if GitHub dropped the run of the push that made BEFORE); the range starts there too. CI refuses a missing BEFORE (a new branch, a first push, a manual run), a BEFORE that is not an ancestor of AFTER (a force push), and a BEFORE without the check; release.sh refuses unless origin/dev is an ancestor of HEAD; the checker itself refuses a range that does not run forward. Tags count only as ancestors of BEFORE. With no matching tag (after a major or minor version change) CI uses BEFORE itself, and a dropped run's commits would then go unchecked until the next tag. The checker also refuses a start it cannot resolve. |
| Replaced objects or grafts | The check runs with `GIT_NO_REPLACE_OBJECTS=1`. |
| A tag moved to hide commits from CI | release.sh checks from origin/dev regardless; protecting the `v*` tags and the branch is Dinis's to set (asked in status.json). |

## Trust between listed keys
Every listed key is trusted to sign for its own agent and to add or remove keys in later commits: the listed keys trust one another. Today the only key is this agent's.

## Tests
`scripts/test-check-signatures.mjs` (25 cases, each failing case asserting its reason, in throwaway repositories with throwaway keys and `gpg.ssh.program=ssh-keygen`) and `scripts/test-leak-scan.mjs` (the SSH line and key block rules), run by release.sh and CI.
