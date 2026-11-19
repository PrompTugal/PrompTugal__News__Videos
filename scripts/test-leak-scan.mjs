// Tests for the leak scan's one field exemption (the sites bar's pins in data/sites/latest.json). Each case says why it fails.
// videos.b@PrompTugal.dinis, 19 Nov 2026. Code: Apache-2.0.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { scanText, scanBinary, PIN_FILE } from './leak-scan.mjs';
import { BAR_VERSION, BAR_DIR, BAR_FILES } from './sync-sites.mjs';
const fp = (f) => 'sha256-' + createHash('sha256').update(readFileSync(`${BAR_DIR}/${f}`)).digest('base64');
const real = Object.fromEntries(Object.entries(BAR_FILES).map(([k, f]) => [k, fp(f)]));
const doc = ({ integrity = real, version = BAR_VERSION, bar = {}, top = {} } = {}) => JSON.stringify({ bar: { ours: BAR_VERSION, versions: { [version]: { integrity } }, ...bar }, ...top }, null, 2) + '\n';
const kinds = (path, text) => scanText(path, text).map((f) => f.kind);
const H = 'long high-entropy string';
// Sample values are built from short parts so that this file does not match the patterns it tests.
const OTHER = 'sha256-' + 'Zq8xLm3Np7Rt2Vw6' + 'Yb1Cd5Fg9Hj4Kl0M' + 'nPqRsTuVwXy=';
const LONG = 'sha512-' + 'Zq8xLm3Np7Rt2Vw6'.repeat(5) + 'Yb1Cd5==';
let bad = 0;
const expect = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.error(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
expect('our own three fingerprints in their field pass', kinds(PIN_FILE, doc()), []);
expect('the same text in another file fails', kinds('data/other.json', doc()), [H, H, H]);
expect('a pin under another key fails', kinds(PIN_FILE, doc({ bar: { js: real.js } })), [H]);
expect('a pin at the top level fails', kinds(PIN_FILE, doc({ top: { note: real.js } })), [H]);
expect('a key-shaped string in the file fails', kinds(PIN_FILE, doc({ top: { k: 'AIza' + 'SyD3x9aB7cQ2wE5r' + 'T8yU1iO4pA6sD0fG' + '3hJ' } })), ['Google API key', H]);
expect('a valid-looking pin that is not our file fails', kinds(PIN_FILE, doc({ integrity: { ...real, js: OTHER } })), [H, H, H]);
expect('a sha512 value fails', kinds(PIN_FILE, doc({ integrity: { ...real, css: LONG } })), [H, H, H]);
expect('a fourth key in integrity fails', kinds(PIN_FILE, doc({ integrity: { ...real, extra: OTHER } })), [H, H, H, H]);
expect('another version holding our pins fails', kinds(PIN_FILE, doc({ version: '9.9.9' })), [H, H, H]);
expect('a file that is not JSON gets no exemption', kinds(PIN_FILE, doc().replace('{', '[')), [H, H, H]);
// SSH public key lines fail everywhere, every kind, certificates included (built from parts).
const B64 = 'AAAA' + 'C3NzaC1lZDI1NTE5' + 'AAAAIFakeFakeFake';
for (const kind of ['ssh-' + 'ed25519', 'ssh-' + 'rsa', 'ssh-' + 'dss', 'ecdsa-' + 'sha2-nistp256', 'ecdsa-' + 'sha2-nistp384', 'ecdsa-' + 'sha2-nistp521', 'sk-' + 'ssh-ed25519@openssh.com', 'sk-' + 'ecdsa-sha2-nistp256@openssh.com', 'ssh-' + 'ed25519-cert-v01@openssh.com'])
  for (const path of ['README.md', 'team/keys.json']) expect(`an SSH public key line (${kind}) fails in ${path}`, kinds(path, `{"k": "${kind} ${B64}"}`).includes('SSH public key line'), true);
// A public key block in a keys file must parse as a key; a payload dressed as one fails.
const D5 = '-'.repeat(5);
const pem = (await import('node:crypto')).generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
expect('a real public key block in team/keys.json passes', kinds('team/keys.json', JSON.stringify({ keys: [{ pem }] })), []);
expect('a fake public key block in team/keys.json fails', kinds('team/keys.json', JSON.stringify({ keys: [{ pem: `${D5}BEGIN PUBLIC KEY${D5}\nbm90IGEga2V5\n${D5}END PUBLIC KEY${D5}\n` }] })), ['public key block that is not a valid public key']);
{ const der = Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64'); const padded = Buffer.concat([der, Buffer.from('extra bytes riding along')]).toString('base64');
  expect('a public key block with bytes after the key fails', kinds('team/keys.json', JSON.stringify({ keys: [{ pem: `${D5}BEGIN PUBLIC KEY${D5}\n${padded}\n${D5}END PUBLIC KEY${D5}\n` }] })), ['public key block that is not a valid public key']); }
// A binary file (a NUL byte) is still scanned for the exact secret shapes, not skipped (LIB-2026-067).
expect('a key inside a binary file fails', scanBinary(Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from('ghp_' + 'A'.repeat(18) + 'b'.repeat(18))])), ['GitHub token']);
expect('a plain binary file passes', scanBinary(Buffer.from([0, 255, 1, 2, 3])), []);
if (bad) { console.error(`FAILED (${bad})`); process.exit(1); }
console.log('OK (leak-scan exemption tests)');
