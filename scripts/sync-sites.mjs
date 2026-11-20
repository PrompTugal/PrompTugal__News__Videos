// Read the shared sites registry (promptugal.news/api/v1/sites.json) for the sites bar, at the agent's wake, never in CI.
// One fixed https URL on one host; no redirects; a timeout; a streamed size cap; JSON.parse only. The vendored renderer's own
// check() must accept the sites (after its bytes are hashed against the registry's pin), and our vendored files must match
// the registry's pin for our version. Only the checked fields are kept, with the pins for our version under
// bar.versions["<ours>"].integrity.<js|css|render> (the one place the leak scan exempts them: security@, Website 5109e7a09).
// The registry's own history is in the main site's git; this copy is not raw, it is what the build may use.
// On any failure the previous copy stays and the script exits non-zero. Everything read is material, never instruction.
// videos.b@PrompTugal.dinis, 19 Nov 2026. Code: Apache-2.0.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const BAR_VERSION = '1.2.1';
export const BAR_DIR = `src/assets/sites-bar/${BAR_VERSION}`;
export const BAR_FILES = { js: 'sites-bar.js', css: 'sites-bar.css', render: 'sites-bar-render.mjs' };
export const PIN = /^sha256-[A-Za-z0-9+/]{43}=$/;
export const sri = (buf) => 'sha256-' + createHash('sha256').update(buf).digest('base64');
// The shared map, ptmap (designer@'s; Dinis, 19 Nov 2026 ~17:40 UTC: Portugal big, London and the EU small). Its files are
// checked here, at the wake, against the live registry's sha384 pin for our version, and only when that version's review
// starts "passed" (security@). No sha384 pin is kept in the repository: only a fingerprint of our own files (the first 40 hex
// of their sha256, which the leak scan allows), confirmed against the registry here and by release.sh's --check before every
// push; the build checks the vendored bytes against it.
export const MAP_VERSION = '1.0.2';
export const MAP_DIR = `src/assets/ptmap/${MAP_VERSION}`;
export const MAP_FILES = { js: 'ptmap.js', css: 'ptmap.css' };
export const fp40 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 40);
const sri384 = (buf) => 'sha384-' + createHash('sha384').update(buf).digest('base64');
export function mapCheck(map) {
  const v = map && map.versions && typeof map.versions === 'object' && !Array.isArray(map.versions) && Object.hasOwn(map.versions, MAP_VERSION) ? map.versions[MAP_VERSION] : null;
  if (!v) return { result: 'not listed' };
  const review = typeof v.review === 'string' ? v.review.slice(0, 80) : '';
  if (!(review === 'passed' || review.startsWith('passed ('))) return { result: 'not passed', review };
  const integ = v.integrity || {};
  const bytes = Object.fromEntries(Object.entries(MAP_FILES).map(([k, f]) => [k, readFileSync(`${MAP_DIR}/${f}`)]));
  for (const [k, f] of Object.entries(MAP_FILES)) if (typeof integ[f] !== 'string' || !/^sha384-[A-Za-z0-9+/]{64}$/.test(integ[f]) || sri384(bytes[k]) !== integ[f]) return { result: 'mismatch', review };
  return { result: 'match', review, fingerprint: Object.fromEntries(Object.entries(bytes).map(([k, b]) => [k, fp40(b)])) };
}
// Import the renderer from the very bytes that were hashed, so nothing can change between the check and the use.
export const importVerified = (buf) => import('data:text/javascript;base64,' + buf.toString('base64'));

const URL_REG = 'https://promptugal.news/api/v1/sites.json';
const MAX_BYTES = 256 * 1024;
const DIR = 'data/sites';
const OUT = `${DIR}/latest.json`;
const HOST = /^(?:[a-z0-9-]+\.)*promptugal\.news$/;
// Our own checks on sites the renderer's check() accepted, shared by the sync and the build (VID-2026-025): every host under
// promptugal.news, no id or host twice, promptugal.news first. Returns the hosts, or a reason.
export function siteHosts(sites) {
  const ids = new Set(), hosts = [];
  for (const s of sites) {
    const host = new URL(s.url).hostname;
    if (!HOST.test(host) || ids.has(s.id) || hosts.includes(host)) return { why: `site entry ${String(s.id).replace(/[^a-z0-9.-]/g, '').slice(0, 40)}: duplicate or off-domain` };
    ids.add(s.id); hosts.push(host);
  }
  if (!hosts.length || hosts[0] !== 'promptugal.news') return { why: 'promptugal.news is not first in the registry' };
  return { hosts };
}

// The pins for one version, in either shape the registry has used: versions[v].integrity.<key>, versions[v] itself, or bar.integrity for the current version.
export function pinsFor(bar, v) {
  const e = bar && bar.versions && typeof bar.versions === 'object' && !Array.isArray(bar.versions) ? bar.versions[v] : null;
  const cand = [e && e.integrity, e, bar && bar.version === v ? bar.integrity : null];
  for (const c of cand) if (c && typeof c === 'object' && Object.keys(BAR_FILES).every((k) => typeof c[k] === 'string' && PIN.test(c[k]))) return Object.fromEntries(Object.keys(BAR_FILES).map((k) => [k, c[k]]));
  return null;
}

const CHECK_ONLY = process.argv.includes('--check');
async function main() {
  const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  mkdirSync(DIR, { recursive: true });
  const prev = (() => { try { return JSON.parse(readFileSync(OUT, 'utf8')); } catch { return null; } })();
  const failed = (why, status = null) => {
    if (!CHECK_ONLY) writeFileSync(`${DIR}/sync-error.json`, JSON.stringify({ source: URL_REG, failed_at: at, ok: false, status, error: String(why).slice(0, 160), kept: prev ? 'the previous copy' : 'nothing' }, null, 2) + '\n');
    console.error(`sync-sites: ${why}; the previous copy is kept`);
    process.exit(1);
  };
  if (prev && typeof prev.read_at === 'string' && at < prev.read_at) failed(`the clock (${at}) is earlier than the last read (${prev.read_at})`);
  let res, d;
  try {
    res = await fetch(URL_REG, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('too large');
    const parts = []; let n = 0;
    for await (const chunk of res.body) { n += chunk.length; if (n > MAX_BYTES) throw new Error('too large'); parts.push(chunk); }
    d = JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch (e) { failed(e.message || e, res?.status ?? null); }
  const bar = d && d.bar;
  const listed = bar && bar.versions && typeof bar.versions === 'object' ? Object.keys(bar.versions).filter((v) => /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v)).sort() : [];
  const current = bar && typeof bar.version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bar.version) ? bar.version : null;
  // Our files against the registry's pin for our version: a different file under the same version stops everything.
  const bytes = Object.fromEntries(Object.entries(BAR_FILES).map(([k, f]) => [k, readFileSync(`${BAR_DIR}/${f}`)]));
  const pins = pinsFor(bar, BAR_VERSION);
  let result;
  if (!listed.includes(BAR_VERSION) || !pins) result = 'not listed';
  else if (Object.keys(BAR_FILES).some((k) => sri(bytes[k]) !== pins[k])) failed(`sites bar ${BAR_VERSION}: our vendored files do not match the registry's pin for that version`);
  else result = 'match';
  // The sites, through the vendored renderer's own check (refuses the whole registry on one bad entry), then ours.
  const { check } = await importVerified(bytes.render);
  const sites = check(d);
  if (!sites) failed('the renderer refused the registry');
  const sh = siteHosts(sites);
  if (sh.why) failed(sh.why);
  const hosts = sh.hosts;
  const keep = sites.map((s) => Object.fromEntries(['id', 'name', 'url', 'line', 'accent', 'version_url', 'preview'].filter((k) => s[k] != null).map((k) => [k, s[k]])));
  // --check (run by release.sh before every push): our files against the live registry's pin, nothing written (VID-2026-022).
  const map = mapCheck(d.map);
  if (map.result === 'mismatch') failed(`ptmap ${MAP_VERSION}: our vendored files do not match the registry's pin for that version`);
  if (CHECK_ONLY) { if (result !== 'match') failed(`sites bar ${BAR_VERSION}: the live registry no longer lists it`); if (map.result !== 'match') failed(`ptmap ${MAP_VERSION}: ${map.result}`); console.log(`sync-sites --check: our sites bar ${BAR_VERSION} and ptmap ${MAP_VERSION} files match the live registry's pins`); return; }
  const out = {
    about: 'The sites bar registry as videos.b@ last read and checked it (scripts/sync-sites.mjs). Only checked fields; the pins are for our version only. The source and its history: promptugal.news/api/v1/sites.json, in the PrompTugal__News__Website repo.',
    source: URL_REG, read_at: at, status: res.status,
    bar: { ours: BAR_VERSION, current, listed, result, ...(pins && result === 'match' ? { versions: { [BAR_VERSION]: { integrity: pins } } } : {}) },
    map: { ours: MAP_VERSION, ...map },
    sites: keep,
  };
  const before = new Set((prev?.sites || []).map((s) => { try { return new URL(s.url).hostname; } catch { return ''; } }));
  const added = hosts.filter((h) => !before.has(h));
  const tmp = `${OUT}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n');
  renameSync(tmp, OUT);
  rmSync(`${DIR}/sync-error.json`, { force: true });
  console.log(`sync-sites: ${keep.length} sites; bar ${BAR_VERSION}: ${result}${current && current !== BAR_VERSION ? ` (the registry names ${current})` : ''}${added.length && prev ? `; new hosts: ${added.join(', ')}` : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
