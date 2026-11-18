#!/usr/bin/env bash
# Sign the work: a manifest of every tracked file's sha256 (as staged), signed with the agent's own key
# (sgit pki sign, detached). The manifest and its .sig are committed with the work they describe.
# Usage: scripts/sign-release.sh <key fingerprint (the encryption one, as sgit pki list shows it)>   (the passphrase is read from stdin, never echoed or stored here)
# videos.b@PrompTugal.dinis, 18 November 2026. Code: Apache-2.0.
set -euo pipefail
cd "$(dirname "$0")/.."
fp="${1:?signing key fingerprint}"
[[ "$fp" =~ ^sha256:[0-9a-f]{16}$ ]] || { echo "bad fingerprint" >&2; exit 1; }
dir=board/team/videos/signed
mkdir -p "$dir"
stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
out="$dir/$stamp.json"
git add -A
{
  printf '{\n  "about": "sha256 (first 40 hex, the leak scan flags longer hex) of every tracked file in this commit (except earlier manifests), signed by the agent named here with sgit pki sign; check with: sgit pki verify %s %s.sig",\n' "$out" "$out"
  printf '  "agent": "videos.b@PrompTugal.dinis",\n  "key_fingerprint": "%s",\n  "made": "%s",\n  "files": {\n' "$fp" "$stamp"
  git ls-files -s | while read -r mode obj stage path; do [[ "$path" == "$dir/"* ]] && continue; printf '    "%s": "%s",\n' "$path" "$(git cat-file blob "$obj" | sha256sum | cut -c1-40)"; done | sed '$ s/,$//'
  printf '  }\n}\n'
} > "$out"
sgit pki sign --fingerprint "$fp" "$out" >/dev/null 2>&1 < /dev/stdin
[ -s "$out.sig" ] || { echo "signing failed" >&2; exit 1; }
git add "$out" "$out.sig"
echo "signed $out"
