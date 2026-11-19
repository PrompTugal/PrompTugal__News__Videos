// Every commit is signed by the agent named in its Agent: trailer, with the SSH key that agent published in team/keys.json,
// and names the Claude-Session: published with that key (Dinis, 18 and 19 Nov 2026: PrompTugal__News__Website
// board/guidance/2026-11-19-signed-commits-paid-search-and-free-embeds.md, section 2).
// Adapted by videos.b@PrompTugal.dinis (19 Nov 2026) from data.b@PrompTugal.dinis's scripts/check-signatures.mjs
// (PrompTugal__News__Data f68beb3, Apache-2.0), hardened after this wake's security pre-review. Code: Apache-2.0.
// Usage: node <this file> <before> <after>   (the range before..after, run from the repository; run a trusted copy of this
// file, from origin/dev or the last tag, never the copy in the commits being checked: see release.sh and the workflow).
// security@'s five controls (19 Nov 2026 ~01:30 UTC): (1) no exemption by name: nothing is exempt here, because CI makes no
// commits in this repository (it only pushes tags); (2) the keys come from the parent's team/keys.json (a merge: its first
// parent), so a commit cannot add its own key and pass; (3) every commit in the range, merges and side branches included;
// (4) one failure fails the whole range (exit 1; nothing deploys); (5) exactly one Agent: and one Claude-Session: trailer,
// matching the key's agent and its full session URL exactly.
// Hardening over the reference: only the one commit that first added this file (by ancestry) may use its own tree's keys, and
// a commit without a parent is otherwise refused; commits are skipped only if they are ancestors of that first commit, so
// deleting this file later skips nothing; the signer is matched by its key's fingerprint, not by its name; principals must
// be plain addresses; a key is revoked by removing it from the keys file (a "superseded" entry is not used at all, since a
// commit's date can be set by anyone).
// The keys: team/keys.json {"keys": [{id, agent, session, ssh: {public_key_pem (Ed25519 SPKI PEM), principals}, ...}]}.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPublicKey, createHash } from 'node:crypto';

// Replaced objects and grafts never change what is checked (VID-2026-030).
process.env.GIT_NO_REPLACE_OBJECTS = '1';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };
const lines = (s) => (s ? s.split('\n').filter(Boolean) : []);
const SELF = 'scripts/check-signatures.mjs';
const PRINCIPAL = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/;

const [beforeArg, afterArg] = process.argv.slice(2);
const after = afterArg || 'HEAD';
const before = beforeArg && !/^0+$/.test(beforeArg) && tryGit('rev-parse', '--verify', '--quiet', `${beforeArg}^{commit}`);
const commits = lines(git('rev-list', before ? `${before}..${after}` : after));

// An Ed25519 SPKI PEM to the OpenSSH form ssh-keygen reads (string "ssh-ed25519", then the 32-byte key, each length-prefixed),
// and that key's SHA256 fingerprint as ssh-keygen prints it.
const blobOf = (pem) => {
  const k = createPublicKey(pem);
  if (k.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
  const x = Buffer.from(k.export({ format: 'jwk' }).x, 'base64url');
  const t = Buffer.from('ssh-ed25519'), len = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  return Buffer.concat([len(t.length), t, len(x.length), x]);
};
const fpOf = (blob) => 'SHA256:' + createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
// The trusted base: the one commit that first added this check, recorded by its full id (security@'s control 6, 19 Nov 2026).
// It alone may use its own tree's keys; every other commit with no parent is refused, wherever it comes from. Commits that are
// its ancestors are older than the check and skipped. The tests substitute their own throwaway id here.
const FIRST = 'de181efb94e19b731def28690a481f1c7ac76a11';
const first = /^[0-9a-f]{40}$/.test(FIRST) && spawnSync('git', ['cat-file', '-e', `${FIRST}^{commit}`]).status === 0 ? FIRST : null;
// A shallow checkout cannot show the whole range or the trusted base: refuse it (control 6).
if (git('rev-parse', '--is-shallow-repository') === 'true') { console.error('check-signatures: a shallow checkout; fetch the whole history (fetch-depth 0)'); process.exit(1); }
const dir = mkdtempSync(join(tmpdir(), 'sigs-'));
let fileN = 0;
const keysAt = (rev) => {
  let j; try { j = JSON.parse(git('show', `${rev}:team/keys.json`)); } catch { return { keys: [], allowed: null }; }
  const keys = (Array.isArray(j.keys) ? j.keys : []).filter((k) => k && !k.superseded && k.ssh && typeof k.ssh.public_key_pem === 'string' && Array.isArray(k.ssh.principals) && k.ssh.principals.length && k.ssh.principals.every((p) => typeof p === 'string' && PRINCIPAL.test(p)) && typeof k.agent === 'string' && typeof k.session === 'string')
    .map((k) => { try { const blob = blobOf(k.ssh.public_key_pem); return { ...k, line: 'ssh-ed25519 ' + blob.toString('base64'), fp: fpOf(blob) }; } catch { return null; } }).filter(Boolean);
  const allowed = join(dir, `allowed_signers_${fileN++}`);
  writeFileSync(allowed, keys.flatMap((k) => k.ssh.principals.map((p) => `${p} namespaces="git" ${k.line}`)).join('\n') + '\n');
  return { keys, allowed };
};
// A key must also still be listed at the tip of the range, so a key removed from the file cannot come back through a branch
// that started before its removal (VID-2026-028). Two entries with the same key make the file unusable.
const tipKeys = keysAt(after).keys;
const dupFp = new Set(tipKeys.map((k) => k.fp)).size !== tipKeys.length;
const failures = [];
let checked = 0, skipped = 0;
for (const c of commits) {
  const short = c.slice(0, 8);
  if (!first) { failures.push(`${short}: ${SELF} is not in this history`); continue; }
  // Older than the check: an ancestor of the commit that added it (and not that commit).
  if (c !== first && spawnSync('git', ['merge-base', '--is-ancestor', c, first]).status === 0) { skipped++; continue; }
  checked++;
  const parent = (git('log', '-1', '--format=%P', c).split(' ')[0] || '').trim();
  if (!parent && c !== first) { failures.push(`${short}: a commit with no parent that is not the one that added the check`); continue; }
  const { keys, allowed } = keysAt(c === first ? c : parent);
  if (!keys.length) { failures.push(`${short}: no published key in its parent's team/keys.json`); continue; }
  if (dupFp || new Set(keys.map((k) => k.fp)).size !== keys.length) { failures.push(`${short}: a key is listed twice in team/keys.json`); continue; }
  const agents = lines(git('log', '-1', '--format=%(trailers:key=Agent,valueonly)', c)).map((s) => s.trim());
  const sessions = lines(git('log', '-1', '--format=%(trailers:key=Claude-Session,valueonly)', c)).map((s) => s.trim());
  if (agents.length !== 1) { failures.push(`${short}: needs exactly one Agent: trailer (has ${agents.length})`); continue; }
  if (sessions.length !== 1) { failures.push(`${short}: needs exactly one Claude-Session: trailer (has ${sessions.length})`); continue; }
  const v = spawnSync('git', ['-c', `gpg.ssh.allowedSignersFile=${allowed}`, '-c', 'gpg.ssh.program=ssh-keygen', 'verify-commit', '--raw', c], { encoding: 'utf8' });
  const out = String(v.stderr || '') + String(v.stdout || '');
  const good = v.status === 0 && /Good "git" signature for (\S+) with \S+ key (SHA256:[A-Za-z0-9+/]+)/.exec(out);
  if (!good) { failures.push(`${short}: not signed by a key in its parent's team/keys.json`); continue; }
  const key = keys.find((k) => k.fp === good[2]);
  if (!key || !key.ssh.principals.includes(good[1])) { failures.push(`${short}: signed by a key not matched by its fingerprint`); continue; }
  if (!tipKeys.some((k) => k.fp === key.fp)) { failures.push(`${short}: signed by a key no longer listed at the tip of the range`); continue; }
  if (key.agent !== agents[0] || !key.ssh.principals.includes(agents[0])) { failures.push(`${short}: signed by ${key.agent}'s key, but its Agent: is ${agents[0]}`); continue; }
  if (sessions[0] !== key.session) { failures.push(`${short}: Claude-Session: ${sessions[0]} is not the session published with the key`); continue; }
}
rmSync(dir, { recursive: true, force: true });
if (failures.length) { console.error(`check-signatures: ${failures.length} commit(s) fail\n` + failures.join('\n')); process.exit(1); }
console.log(`OK (${checked} commits checked, ${skipped} older than the check)`);
