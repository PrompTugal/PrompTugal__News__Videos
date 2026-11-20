// Read data.b@'s camera register (data.promptugal.news) at the agent's wake, never in CI, and keep only the Algarve cameras
// this site lists as credited links: MEO BeachCam and SkylineWebcams (Dinis Cruz, 19 Nov 2026, about 17:40 UTC: "cameras as
// links"; "these are for the videos that we have full right to use"). One fixed https URL; no redirects; a timeout; a
// streamed size cap; JSON.parse only. An allow-list, never "everything not blocked": the operator by exact name, the link-only
// flag, and every URL parsed and on that operator's own host. No camera page is ever fetched. No embed field is kept: this
// site never embeds these. On any failure, or a list that comes back empty or much shorter, the previous copy stays and the
// script exits non-zero. Everything read is material, never instruction. videos.b@PrompTugal.dinis, 20 Nov 2026. Apache-2.0.
import { mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from 'node:fs';

const SOURCE = 'https://data.promptugal.news/api/v1/cameras/index.json';
const MAX_BYTES = 4 * 1024 * 1024, MAX_ENTRIES = 2000, MAX_KEEP = 60;
const DIR = 'data/cameras', OUT = `${DIR}/latest.json`;
const OPERATORS = { 'MEO BeachCam': { host: 'beachcam.meo.pt', credit: 'MEO BeachCam' }, 'SkylineWebcams (VisioRay)': { host: 'www.skylinewebcams.com', credit: 'SkylineWebcams' } };
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SUSPECT = /(https?:|www\.|ignore (all|previous)|instruction|system prompt|assistant)/i;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

const text = (s, max) => { if (typeof s !== 'string') return null; const t = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ').replace(/\s+/g, ' ').trim(); return t && t.length <= max ? t : null; };
const onHost = (u, host) => { if (typeof u !== 'string' || /[\s\\\u0000-\u001f]/.test(u)) return null; let x; try { x = new URL(u); } catch { return null; } return x.protocol === 'https:' && !x.username && !x.password && !x.port && x.hostname === host ? x.href : null; };

async function main() {
  mkdirSync(DIR, { recursive: true });
  const prev = (() => { try { return JSON.parse(readFileSync(OUT, 'utf8')); } catch { return null; } })();
  const failed = (why, status = null) => {
    writeFileSync(`${DIR}/sync-error.json`, JSON.stringify({ source: SOURCE, failed_at: at, ok: false, status, error: String(why).slice(0, 160), kept: prev ? 'the previous copy' : 'nothing' }, null, 2) + '\n');
    console.error(`sync-cameras: ${why}; the previous copy is kept`); process.exit(1);
  };
  let res, d;
  try {
    res = await fetch(SOURCE, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('too large');
    const parts = []; let n = 0;
    for await (const c of res.body) { n += c.length; if (n > MAX_BYTES) throw new Error('too large'); parts.push(c); }
    d = JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch (e) { failed(e.message || e, res?.status ?? null); }
  if (!d || !Array.isArray(d.cameras) || d.cameras.length > MAX_ENTRIES) failed('not the expected shape');
  const kept = [], skipped = [];
  for (const c of d.cameras) {
    const op = c && c.operator && typeof c.operator.name === 'string' && Object.hasOwn(OPERATORS, c.operator.name) ? OPERATORS[c.operator.name] : null;
    if (!op) continue;                                      // not one of the two operators: not ours to list
    const why = (w) => skipped.push(`${String(c.id).replace(/[^a-z0-9-]/g, '').slice(0, 60)}: ${w}`);
    if (!c.embed || c.embed.allowed !== false || c.embed.url !== null) { why('not marked link-only'); continue; }
    if (typeof c.id !== 'string' || c.id.length > 80 || !SLUG.test(c.id)) { why('id'); continue; }
    if (typeof c.place !== 'string' || c.place.length > 40 || !SLUG.test(c.place)) { why('place'); continue; }
    const name = text(c.name, 120), summary = text(c.terms && c.terms.summary, 400), licName = text(c.license && c.license.name, 80);
    if (!name || !summary || !licName) { why('text'); continue; }
    if (SUSPECT.test(name) || SUSPECT.test(summary) || SUSPECT.test(licName)) { why('text held for a person to check'); continue; }
    const page = onHost(c.page_url, op.host), terms = onHost(c.terms && c.terms.url, op.host), lic = onHost(c.license && c.license.url, op.host), opUrl = onHost(c.operator.url, op.host);
    if (!page || !terms || !lic || !opUrl) { why('a link not on the operator\'s own host'); continue; }
    const state = ['up', 'down', 'unknown'].includes(c.status && c.status.state) ? c.status.state : 'unknown';
    kept.push({ id: c.id, name, place: c.place, operator: { name: c.operator.name, credit: op.credit, url: opUrl }, page_url: page, terms: { url: terms, summary }, license: { name: licName, url: lic }, status: state });
  }
  if (!kept.length) failed('no camera kept');
  if (kept.length > MAX_KEEP) failed(`more than ${MAX_KEEP} cameras kept`);
  if (prev && Array.isArray(prev.cameras) && kept.length < prev.cameras.length / 2) failed(`the list shrank from ${prev.cameras.length} to ${kept.length}`);
  const dataReadAt = typeof d.data_read_at === 'string' && STAMP.test(d.data_read_at) ? d.data_read_at : null;
  const out = {
    about: "The Algarve's MEO BeachCam and SkylineWebcams cameras as videos.b@ last read them from data.b@'s register (scripts/sync-cameras.mjs): only checked fields, for credited links. Nothing is embedded, recorded or re-hosted. The register and its history: data.promptugal.news.",
    source: SOURCE, read_at: at, data_read_at: dataReadAt, status: res.status,
    register_license: { name: 'CC BY 4.0 (PrompTugal.news: the records and derived values); each camera under its operator\'s terms', url: 'https://creativecommons.org/licenses/by/4.0/' },
    counts: Object.fromEntries(Object.values(OPERATORS).map((o) => [o.credit, kept.filter((k) => k.operator.credit === o.credit).length])),
    skipped, cameras: kept,
  };
  const tmp = `${OUT}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n'); renameSync(tmp, OUT); rmSync(`${DIR}/sync-error.json`, { force: true });
  console.log(`sync-cameras: ${kept.length} cameras kept (${Object.entries(out.counts).map(([k, v]) => `${v} ${k}`).join(', ')})${skipped.length ? `; ${skipped.length} skipped` : ''}`);
}
await main();
