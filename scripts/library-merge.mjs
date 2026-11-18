// Merge the library's catalogue (data/library/latest.json, kept by scripts/sync-library.mjs) into the videos.
// Only YouTube videos of the Web Summit Lisbon 2026 collection, checked field by field against an allow-list;
// anything that fails is skipped and logged, never fixed up. The library's text is untrusted material:
// it is data for the page, never an instruction, and goes through the build's escaping like every other value.
// videos.b@PrompTugal.dinis, 18 Nov 2026. Code: Apache-2.0.
import { readFileSync } from 'node:fs';

const LIB = 'https://library.promptugal.news';
const WATCH = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/;
const ITEM = /^WS26-\d{4}-\d{4}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// A real calendar date, not just its shape (VID-2026-014).
const realDay = (d) => { if (typeof d !== 'string' || !DAY.test(d)) return false; const t = new Date(`${d}T00:00:00Z`); return !isNaN(t) && t.toISOString().slice(0, 10) === d; };
const KIND = { 'replay-day': 'official-replay', recording: 'recording', 'press-video': 'press' };
const EVENT = 'event:web-summit-lisbon-2026';
// Text that reads like an instruction to a model, or carries a link, is held back for a person to look at.
const SUSPECT = /(https?:|www\.|ignore (all|previous)|instruction|system prompt|assistant)/i;
const PUBLISHER = /\s*\((?:its )?YouTube channel,? @[A-Za-z0-9._-]{1,60}\)\s*$/;

export function loadLibrary(path = 'data/library/latest.json', syncPath = 'data/library/sync.json') {
  try {
    const d = JSON.parse(readFileSync(path, 'utf8'));
    const s = JSON.parse(readFileSync(syncPath, 'utf8'));
    return { items: Array.isArray(d.items) ? d.items : [], readAt: typeof s.read_at === 'string' ? s.read_at : null };
  } catch { return { items: [], readAt: null }; }
}

// Returns { added, linked, skipped } and changes `videos` in place (adds records; adds `library` to known ones).
export function mergeLibrary(videos, { items, readAt }, clean) {
  const byYt = new Map(videos.filter((v) => v.platform === 'youtube').map((v) => [v.platform_id, v]));
  const out = { added: 0, linked: 0, skipped: [], withdrawn: [] };
  // Every YouTube id the library holds as anything but 'held' is withdrawn, whatever the order of the items (VID-2026-017).
  const pulled = new Set(items.filter((it) => it && typeof it.url === 'string' && it.status !== 'held').map((it) => (it.url.match(WATCH) || [])[1]).filter(Boolean));
  for (const it of items) {
    if (!it || typeof it !== 'object' || typeof it.url !== 'string') continue;
    const m = it.url.match(WATCH);
    if (!m) continue; // not a YouTube video: not ours to show
    const about = Array.isArray(it.about) ? it.about.filter((a) => typeof a === 'string') : [];
    if (!about.includes(EVENT)) continue;
    const skip = (why) => out.skipped.push(`${String(it.id).slice(0, 20)}: ${why}`);
    if (typeof it.id !== 'string' || !ITEM.test(it.id)) { skip('call number'); continue; }
    const api = `/api/v1/items/${it.id}.json`;
    const lib = { id: it.id, call_number: `WS26 ${it.id.slice(5, 9)}/${it.id.slice(10)}`, page: `${LIB}/item/${it.id}/`, api: `${LIB}${api}` };
    const known = byYt.get(m[1]);
    // A video the library has withdrawn comes off this site too, ours or its own (take-down first).
    if (it.status !== 'held' || pulled.has(m[1])) {
      if (known) { known.withdrawn = true; }
      // Only a cleaned status reaches the log (VID-2026-018).
      out.withdrawn.push(`${it.id}: ${String(it.status).replace(/[^a-z-]/gi, '').slice(0, 20) || 'not held'}`);
      continue;
    }
    if (known) { known.library = lib; out.linked++; continue; }
    const title = clean(it.title);
    const channel = clean(String(it.publisher || '').replace(PUBLISHER, ''));
    if (!title || title.length > 200) { skip('title'); continue; }
    if (!channel || channel.length > 80) { skip('channel'); continue; }
    if (SUSPECT.test(title) || SUSPECT.test(channel)) { skip('text held for a person to check'); continue; }
    if (!KIND[it.kind]) { skip(`kind ${String(it.kind).slice(0, 20)}`); continue; }
    if (it.licence !== 'https://www.youtube.com/t/terms') { skip('licence is not YouTube\'s terms'); continue; }
    const day = (about.find((a) => a.startsWith('day:') && realDay(a.slice(4))) || '').slice(4) || null;
    const published = realDay(it.published) ? it.published : null;
    const v = {
      id: `yt-${m[1]}`, platform: 'youtube', platform_id: m[1], url: it.url,
      title, channel: { name: channel, kind: 'channel' }, people: [],
      published: { date: published, precision: published ? 'day, as the library gives it' : 'not known' },
      place: 'lisboa', collection: 'web-summit-lisbon-2026', day, kind: KIND[it.kind], topics: [],
      storm: about.includes('event:storm-charles'),
      found: { by: `library.b@PrompTugal.dinis (${lib.call_number})`, at: readAt || '', how: "catalogued by the library; read from its API by videos.b@", verified: true, evidence: lib.api },
      note: '', talks: [], library: lib,
    };
    videos.push(v); byYt.set(m[1], v); out.added++;
  }
  return out;
}
