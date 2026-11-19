// The leak scan. Must print OK before every commit and in the Pages workflow.
// Node built-ins only. Written by security@agenticcells.dinis, 2026-11-15.
// Site template version (factory@AgentiCCells.dinis, 2026-11-16): scans _site/ instead
// of site/, skips the vault's ciphertext under .sg_vault/bare/, fails on any tracked
// file from .sg_vault/local/, and fails if this checkout's own vault key or token
// appears anywhere (the last two from the site repositories made by sites@).
//
// Scans every file git knows about (tracked, plus untracked files that are not
// ignored, so a new file is caught before its first commit) and the built _site/.
// It looks for secret shapes and reports the file, the line and the kind of
// shape. It never prints the matched text: a finding is described, never quoted.
//
// Usage:
//   node scripts/leak-scan.mjs            scan the working tree and _site/
//   node scripts/leak-scan.mjs --history    scan every commit reachable in this
//                                         clone (git log -p --all); fetch more
//                                         history first in a shallow clone
//
// Public keys are allowed only in team/keys.json and team/keys/*.json, and only
// when those files hold no private part. Any change to the allowlist below must
// be narrow (one path, one kind) and say why.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Built from parts so that this file does not match its own patterns.
const DASHES = '-'.repeat(5);
const PRIVATE_BLOCK = new RegExp(`${DASHES}BEGIN [A-Z0-9 ]*PRIVATE KEY( BLOCK)?${DASHES}`);
const PUBLIC_BLOCK = new RegExp(`${DASHES}BEGIN (?:RSA |EC )?PUBLIC KEY${DASHES}[\\s\\S]*?${DASHES}END (?:RSA |EC )?PUBLIC KEY${DASHES}`, 'g');
const PUBLIC_BEGIN = new RegExp(`${DASHES}BEGIN (?:RSA |EC |PGP )?PUBLIC KEY( BLOCK)?${DASHES}`);

// Exact shapes: [kind, regex]. Order matters only for the report.
const SHAPES = [
  ['private key block', PRIVATE_BLOCK],
  ['AWS access key id', /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[0-9A-Z]{16}\b/],
  ['AWS secret access key assignment', /aws_?secret_?(?:access_?)?key\s*["']?\s*[:=]\s*["']?[A-Za-z0-9\/+]{40}(?![A-Za-z0-9\/+])/i],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{22,}/],
  ['sgit vault or read key', /\bsgit_(?:private_vault|private_read|vk1|rk1)_[A-Za-z0-9:]{8,}/],
  ['JSON Web Token', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['Google OAuth access token', /\bya29\.[A-Za-z0-9_-]{20,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Anthropic or OpenAI API key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/],
  // An SSH public key as a line, anywhere: ours is published only as a PEM block in team/keys.json, so no SSH line is ever
  // expected (security@, Website 1acd10498; library.b@'s LIB-2026-060: ecdsa-sha2-* and sk- forms too; certificates too).
  ['SSH public key line', /\b(?:sk-)?(?:ssh-(?:ed25519|rsa|dss)|ecdsa-sha2-nistp(?:256|384|521))(?:-cert-v01)?(?:@openssh\.com)?\s+AAAA[A-Za-z0-9+/]{16,}/],
];

// sgit vault key without its prefix: {passphrase}:{vault_id}. sgit generates a
// 24-character lowercase alphanumeric passphrase and an 8-character vault id.
// The passphrase side must mix letters and digits and not be pure hex, so that
// "sha256:<fingerprint>" and "<commit>:<path>" do not count.
const VAULT_PAIR = /(?<![A-Za-z0-9_\/.-])([a-z0-9]{16,64}):([a-z0-9]{4,24})(?![A-Za-z0-9_\/.-])/g;
function vaultPair(line) {
  for (const m of line.matchAll(VAULT_PAIR)) {
    const p = m[1];
    if (/[a-z]/.test(p) && /[0-9]/.test(p) && !/^[0-9a-f]+$/.test(p)) return true;
  }
  return false;
}

// A secret-looking value assigned to a secret-looking name.
const ASSIGN = /\b(?:pass(?:word|phrase)|secret|token|api_?key|private_?key|access_?key)\w*["']?\s*[:=]\s*["']?([A-Za-z0-9\/+_=.-]{16,})/gi;

function entropy(s) {
  const n = {};
  for (const c of s) n[c] = (n[c] || 0) + 1;
  let h = 0;
  for (const k in n) { const p = n[k] / s.length; h -= p * Math.log2(p); }
  return h;
}

// Long high-entropy strings. Pure hex of 40 characters is a git object id and
// is allowed (pinned actions, commit references); longer hex is flagged.
const LONG = /[A-Za-z0-9+\/_-]{32,}={0,2}/g;
function highEntropy(line) {
  for (const m of line.matchAll(LONG)) {
    const s = m[0].replace(/=+$/, '');
    if (/^[0-9a-f]+$/i.test(s)) { if (s.length >= 48 && entropy(s) >= 3.5) return true; continue; }
    if (s.includes('/') && !/[+=]/.test(m[0]) && s.split('/').some((seg) => /^[a-z][a-z.-]*$/.test(seg))) continue; // a path or URL
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter((r) => r.test(s)).length;
    if (classes >= 3 && entropy(s) >= 4.3) return true;
  }
  return false;
}

// Narrow allowlist: [path, kind, reason]. Keep each entry to one file and one kind.
const ALLOW = [
  // (none yet)
];
// Narrow pattern allowlist: [path pattern, kind, reason]. One folder, one kind.
const ALLOW_PATTERN = [
  // Detached signatures of release manifests (sgit pki sign, ECDSA P-256, base64) are high-entropy by nature
  // and public by design: they prove the agent signed the manifest. Only *.sig files directly in this folder,
  // and only for 'long high-entropy string'; every other check still applies to them.
  // Dinis Cruz, in videos.b@'s session, 18 Nov 2026 ~23:29 UTC: "yes, allow board/team/videos/signed/*.sig in the leak scan".
  [/^board\/team\/videos\/signed\/[0-9TZ-]+\.json\.sig$/, 'long high-entropy string', 'release-manifest signatures (Dinis, 18 Nov 2026)'],
];
// The sites bar's pins in our registry copy (security@'s ruling, Website 5109e7a09, last addendum): exempt only by all of these
// together: this one file; the field bar.versions["<ours>"].integrity, where <ours> is bar.ours, holding exactly the keys js, css
// and render (found by parsing the JSON, not by the line); each value exactly sha256-<43 base64>=; and each equal to the
// fingerprint of our own vendored file of that version (VID-2026-023). So the exemption can only ever hide the three public
// fingerprints of files in this repository. Anything else in the file, any other version, or any other key-shaped string
// still fails (scripts/test-leak-scan.mjs). Lines are blanked, keeping their numbers, before the checks run.
export const PIN_FILE = 'data/sites/latest.json';
const PIN_VALUE = /^sha256-[A-Za-z0-9+/]{43}=$/;
const BAR_FILE = { js: 'sites-bar.js', css: 'sites-bar.css', render: 'sites-bar-render.mjs' };
const fingerprint = (buf) => 'sha256-' + createHash('sha256').update(buf).digest('base64');
// read(path) returns a Buffer or null: the working tree, or a commit in the history scan.
function blankPins(text, read) {
  let d; try { d = JSON.parse(text); } catch { return text; }
  const ours = d && d.bar && typeof d.bar.ours === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(d.bar.ours) ? d.bar.ours : null;
  const integ = ours && d.bar.versions && typeof d.bar.versions === 'object' && d.bar.versions[ours] && d.bar.versions[ours].integrity;
  if (!integ || typeof integ !== 'object' || Array.isArray(integ) || Object.keys(integ).sort().join() !== 'css,js,render') return text;
  for (const [k, f] of Object.entries(BAR_FILE)) {
    const buf = read(`src/assets/sites-bar/${ours}/${f}`);
    if (typeof integ[k] !== 'string' || !PIN_VALUE.test(integ[k]) || !buf || fingerprint(buf) !== integ[k]) return text;
  }
  const want = new Map(Object.keys(BAR_FILE).map((k) => [`${k}\t${integ[k]}`, 1]));
  // Only a line that is exactly "<key>": "<that value>" inside an integrity object, once each.
  let inInteg = false;
  return text.split('\n').map((line) => {
    if (/^\s*"integrity": \{\s*$/.test(line)) { inInteg = true; return line; }
    if (inInteg && /^\s*\},?\s*$/.test(line)) { inInteg = false; return line; }
    const m = inInteg && line.match(/^\s*"(js|css|render)": "([^"]+)",?\s*$/);
    const key = m && `${m[1]}\t${m[2]}`;
    if (key && want.get(key) > 0) { want.set(key, 0); return ''; }
    return line;
  }).join('\n');
}
const readTree = (p) => { try { return readFileSync(join(root, p)); } catch { return null; } };
const allowed = (path, kind) => ALLOW.some(([p, k]) => p === path && k === kind) || ALLOW_PATTERN.some(([re, k]) => re.test(path) && k === kind);

const PUBLIC_KEY_FILES = (p) => p === 'team/keys.json' || /^team\/keys\/[a-z0-9-]+\.json$/.test(p);

// Returns a list of {line, kind} for one file's text. Never returns the match.
export function scanText(path, text, read = readTree) {
  const found = [];
  const add = (line, kind) => { if (!allowed(path, kind)) found.push({ line, kind }); };
  let body = path === PIN_FILE ? blankPins(text, read) : text;
  if (PUBLIC_KEY_FILES(path)) {
    if (/private|passphrase|secret|seed/i.test(text)) add(0, 'public key file mentions a private part');
    // Each public key block must be a real public key (videos.b@'s pre-review, 19 Nov 2026), so nothing else can hide inside one.
    // Re-exported, it must give the same bytes, so nothing can ride after the key inside the block (VID-2026-031).
    const pemBody = (s) => s.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    for (const b of text.match(PUBLIC_BLOCK) || []) {
      let ok = false;
      try { const k = createPublicKey(b.replace(/\\n/g, '\n')); ok = ['ed25519', 'rsa', 'ec'].includes(k.asymmetricKeyType) && pemBody(k.export({ type: "spki", format: "pem" })) === pemBody(b); } catch { ok = false; }
      if (!ok) add(0, 'public key block that is not a valid public key');
    }
    // Blank the allowed public key blocks, keeping line numbers.
    body = text.replace(PUBLIC_BLOCK, (b) => b.replace(/[^\n]/g, ' '));
  }
  body.split('\n').forEach((line, i) => {
    const n = i + 1;
    for (const [kind, re] of SHAPES) if (re.test(line)) add(n, kind);
    if (PUBLIC_BEGIN.test(line)) add(n, 'public key outside team/keys');
    if (vaultPair(line)) add(n, 'sgit vault key shape (passphrase:vault_id)');
    for (const m of line.matchAll(ASSIGN)) {
      const v = m[1];
      if (/[0-9]/.test(v) && /[A-Za-z]/.test(v) && entropy(v) >= 3.5) { add(n, 'secret-looking value assigned to a secret name'); break; }
    }
    if (highEntropy(line)) add(n, 'long high-entropy string');
  });
  return found;
}

function isBinary(buf) { return buf.subarray(0, 8000).includes(0); }

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function scanTree() {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root })
    .toString().split('\0').filter(Boolean);
  const siteDir = join(root, '_site');
  if (!existsSync(join(siteDir, 'index.html'))) return { errors: ['_site/ is not built: run node scripts/build.mjs first'], count: 0 };
  const paths = [...new Set([...files, ...walk(siteDir).map((p) => p.slice(root.length + 1))])];
  const errors = [];
  let count = 0, skipped = 0;
  // The vault's own secrets, when this checkout holds them, must appear nowhere.
  const secrets = [];
  for (const k of ['.sg_vault/local/vault_key', '.sg_vault/local/token']) {
    const f = join(root, k);
    if (existsSync(f)) { const v = readFileSync(f, 'utf8').trim(); secrets.push(v, v.split(':')[0]); }
  }
  for (const p of paths) {
    if (p.startsWith('.sg_vault/local/')) { errors.push(`${p}: a file from .sg_vault/local/ is in the tree (it holds vault keys)`); continue; }
    if (p.startsWith('.sg_vault/bare/')) { skipped++; continue; } // ciphertext, protected by the vault key
    const full = join(root, p);
    if (!existsSync(full) || statSync(full).isDirectory()) continue; // deleted in the working tree
    const buf = readFileSync(full);
    if (isBinary(buf)) { skipped++; continue; }
    count++;
    const t = buf.toString('utf8');
    for (const f of scanText(p, t)) errors.push(`${p}:${f.line}: ${f.kind}`);
    for (const x of secrets) if (x && x.length >= 8 && t.includes(x)) errors.push(`${p}: holds this checkout's vault key or token`);
  }
  return { errors, count, skipped };
}

function scanHistory() {
  // Added lines only: a removed line was already caught when it was added.
  const log = execFileSync('git', ['log', '-p', '--all', '--no-color', '--no-ext-diff', '--format=commit %H'], { cwd: root, maxBuffer: 1 << 30 }).toString();
  const errors = [];
  let commit = '', file = '', commits = 0;
  const byFile = new Map(); // commit+file -> added lines
  const flush = () => {
    for (const [key, lines] of byFile) {
      const [c, f] = key.split('\t');
      // The pin file is scanned whole at that commit, so its field rule still applies (added lines alone carry no fields).
      const text = f === PIN_FILE ? (() => { try { return execFileSync('git', ['show', `${c}:${f}`], { cwd: root }).toString(); } catch { return lines.join('\n'); } })() : lines.join('\n');
      const atCommit = (p) => { try { return execFileSync('git', ['show', `${c}:${p}`], { cwd: root }); } catch { return null; } };
      const found = scanText(f, text, atCommit);
      for (const x of found) errors.push(`${c.slice(0, 7)} ${f}: ${x.kind}`);
    }
    byFile.clear();
  };
  for (const line of log.split('\n')) {
    if (line.startsWith('commit ')) { flush(); commit = line.slice(7); commits++; file = ''; continue; }
    if (line.startsWith('+++ ')) { file = line.startsWith('+++ b/') ? line.slice(6) : ''; continue; }
    if (file && line.startsWith('+')) {
      const k = `${commit}\t${file}`;
      if (!byFile.has(k)) byFile.set(k, []);
      byFile.get(k).push(line.slice(1));
    }
  }
  flush();
  return { errors: [...new Set(errors)], count: commits };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const history = process.argv.includes('--history');
  const { errors, count, skipped } = history ? scanHistory() : scanTree();
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error(`FAILED (${errors.length}) in ${count} ${history ? 'commits' : 'files'}`);
    process.exit(1);
  }
  console.log(history ? `OK (${count} commits)` : `OK (${count} files, ${skipped} binary skipped)`);
}
