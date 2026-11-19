// Build: copy src/ to _site/, make every page and the JSON API from data/videos.json, stamp the version,
// write version.json, a markdown twin for every page, and llms.txt.
// No network, no dependencies (Node 18+). SITE_VERSION is set by CI only (v0.1.N); a local build says "dev".
// Template build by factory@AgentiCCells.dinis; the pages by videos.b@PrompTugal.dinis, 18 November 2026. Code: Apache-2.0.
//
// Every value from the data is untrusted text (titles and channel names are other people's words):
// it is escaped for HTML with esc(), URLs must be https (or site-relative), and ids must match fixed shapes,
// or the build stops. Embeds come from one host only (EMBED_HOST), built from an 11-character YouTube id.
import { cpSync, rmSync, readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { loadLibrary, mergeLibrary } from './library-merge.mjs';

const version = process.env.SITE_VERSION || 'dev';
const SITE = 'https://videos.promptugal.news';
const REPO = 'https://github.com/PrompTugal/PrompTugal__News__Videos';
const CCBY = 'https://creativecommons.org/licenses/by/4.0/';
const EMBED_HOST = 'https://www.youtube-nocookie.com';
const builtAt = new Date();

// ---------------------------------------------------------------- safe text
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// House style: no em dash anywhere on the site; a source's em dash is shown as an en dash.
// Every field is one line: control, zero-width and direction-mark characters go, whitespace collapses (VID-2026-003, 004).
const clean = (s) => String(s ?? '').replace(/\u2014/g, '\u2013').replace(/[\u0000-\u001f\u007f\u061c\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
// Only strings (VID-2026-011).
const okHttps = (u) => { if (typeof u !== 'string') return false; try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password; } catch { return false; } };
const okRel = (u) => typeof u === 'string' && /^\/[A-Za-z0-9/_.-]*(#[A-Za-z0-9_-]+)?$/.test(u) && !u.includes('..') && !u.startsWith('//');
const href = (u) => { if (okRel(u) || okHttps(u)) return esc(u); throw new Error(`unsafe URL in the data: ${String(u).slice(0, 80)}`); };
const link = (u, t) => `<a href="${href(u)}">${esc(clean(t))}</a>`;
const md = (s) => clean(s).replace(/[\\`*_[\]<>|#]/g, (c) => `\\${c}`);
// A URL in markdown is normalised and its markdown-breaking characters percent-encoded (VID-2026-002).
const mdUrl = (u) => { const a = okRel(u) ? SITE + u : okHttps(u) ? new URL(u).href : ''; return a.replace(/[()[\]<>"'\s\\`|]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')); };
const mdLink = (u, t) => `[${md(t)}](${mdUrl(u)})`;
const ID = /^(?:yt-[A-Za-z0-9_-]{11}|[a-z0-9]+(?:-[a-z0-9]+)+)$/; // our call numbers: yt-<YouTube id>, or a lower-case slug (cnbc-...)
const YT = /^[A-Za-z0-9_-]{11}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const slug = (s) => clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fmtDay = (d) => { if (!DAY.test(d || '')) return ''; const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };
const weekday = (d) => WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()];
const fmtStamp = (iso) => { const t = new Date(iso); if (isNaN(t)) return ''; return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')} UTC`; };

// ---------------------------------------------------------------- data, checked
const data = JSON.parse(readFileSync('data/videos.json', 'utf8'));
const findings = existsSync('data/security/findings.json') ? JSON.parse(readFileSync('data/security/findings.json', 'utf8')) : { findings: [] };
const problems = [];
const need = (cond, msg) => { if (!cond) problems.push(msg); };
const PLATFORMS = data.platforms || {};
for (const [k, p] of Object.entries(PLATFORMS)) {
  need(SLUG.test(k), `platform key ${k}`);
  need(okHttps(p.terms), `platform ${k}: terms must be https`);
  need(p.embed_host === null || p.embed_host === EMBED_HOST, `platform ${k}: the only embed host allowed is ${EMBED_HOST}`);
}
const videos = Array.isArray(data.videos) ? data.videos : [];
// The library's catalogue, as last read by scripts/sync-library.mjs (no network here).
const libraryRead = loadLibrary();
const merged = mergeLibrary(videos, libraryRead, clean);
for (const s of merged.skipped) console.warn(`library item skipped: ${s}`);
for (const s of merged.withdrawn) console.warn(`library item withdrawn, not shown: ${s}`);
const withdrawnIds = new Set(videos.filter((v) => v.withdrawn).map((v) => v.id));
for (let i = videos.length - 1; i >= 0; i--) if (videos[i].withdrawn) videos.splice(i, 1);
const seen = new Set();
for (const v of videos) {
  const id = v?.id;
  need(typeof id === 'string' && ID.test(id) && !seen.has(id), `video id ${String(id).slice(0, 40)}: bad or repeated`);
  seen.add(id);
  need(PLATFORMS[v.platform], `${id}: unknown platform`);
  need(okHttps(v.url), `${id}: url must be https`);
  need(typeof v.title === 'string' && v.title.trim(), `${id}: no title`);
  need(v.channel && typeof v.channel.name === 'string' && v.channel.name.trim(), `${id}: no channel`);
  if (v.platform === 'youtube') {
    need(YT.test(v.platform_id || ''), `${id}: YouTube id must be 11 characters of [A-Za-z0-9_-]`);
    need(id === `yt-${v.platform_id}`, `${id}: the call number must be yt-<YouTube id>`);
    need(new URL(v.url).hostname === 'www.youtube.com', `${id}: YouTube url must be on www.youtube.com`);
    need(new URL(v.url).searchParams.get('v') === v.platform_id, `${id}: the url's video must be the embedded one`); // VID-2026-007
  }
  need(v.day === null || DAY.test(v.day), `${id}: day`);
  need(v.published && (v.published.date === null || DAY.test(v.published.date)), `${id}: published.date`);
  need(Array.isArray(v.topics) && Array.isArray(v.people) && Array.isArray(v.talks), `${id}: topics, people and talks must be lists`);
  for (const t of v.talks || []) need(Number.isInteger(t.start) && t.start >= 0 && typeof t.title === 'string', `${id}: a talk needs a whole-second start and a title`);
  need(v.found && typeof v.found.by === 'string' && typeof v.found.at === 'string', `${id}: how we found it`);
  need(v.found?.evidence === undefined || okHttps(v.found.evidence), `${id}: found.evidence must be https`);
}
const collections = Array.isArray(data.collections) ? data.collections : [];
for (const c of collections) for (const d of c.days || []) if (Array.isArray(d.replays)) d.replays = d.replays.filter((r) => !withdrawnIds.has(r));
for (const c of collections) {
  need(SLUG.test(c.id || ''), `collection id ${c.id}`);
  for (const d of c.days || []) {
    need(DAY.test(d.date || ''), `${c.id}: a day's date`);
    for (const r of d.replays || []) need(seen.has(r), `${c.id} ${d.date}: replay ${r} is not a video`);
    for (const e of d.evidence || []) need(okHttps(e.url), `${c.id} ${d.date}: evidence must be https`);
    if (d.storm) need(okHttps(d.storm.url), `${c.id} ${d.date}: storm link must be https`);
  }
}
if (!okHttps(data.evidence_base)) problems.push('evidence_base must be https');
if (problems.length) { console.error(problems.join('\n')); console.error(`FAILED: ${problems.length} problem(s) in data/videos.json`); process.exit(1); }

// The API publishes only these fields of a video (VID-2026-008).
const FIELDS = ['id', 'platform', 'platform_id', 'url', 'title', 'channel', 'people', 'published', 'place', 'collection', 'day', 'kind', 'topics', 'storm', 'found', 'note', 'talks', 'library'];
const pick = (v) => Object.fromEntries(FIELDS.map((k) => [k, v[k] ?? null]));
const byId = new Map(videos.map((v) => [v.id, v]));
const licOf = (v) => ({ name: "the platform's terms", url: PLATFORMS[v.platform].terms });
const KIND = { 'official-replay': "The organiser's replay", recording: 'A recording at the summit', press: 'Press coverage' };
const KIND_PL = { 'official-replay': "The organiser's replays", recording: 'Recordings by companies and governments', press: 'Press coverage' };
const CH_KIND = { organiser: 'the organiser', company: 'a company', government: 'a government body', press: 'a broadcaster or publisher', channel: 'a YouTube channel publishing in public' };
const PLACES = { lisboa: 'Lisboa' };
const placeName = (p) => PLACES[p] || clean(p);

// ---------------------------------------------------------------- playlists
// A playlist is a list of video ids. Organisation and topic playlists need two videos or more (one video is not a list).
const playlists = []; // {kind, id, title, about, ids}
const add = (kind, id, title, about, ids) => { if (SLUG.test(id) && ids.length) playlists.push({ kind, id, title: clean(title), about: clean(about), ids }); };
for (const c of collections) add('event', c.id, c.title, c.event, videos.filter((v) => v.collection === c.id).map((v) => v.id));
for (const p of Object.keys(PLACES)) add('place', p, placeName(p), `Every video recorded in or about ${placeName(p)}.`, videos.filter((v) => v.place === p).map((v) => v.id));
for (const k of Object.keys(KIND)) add('kind', k, KIND_PL[k], '', videos.filter((v) => v.kind === k).map((v) => v.id));
add('topic', 'storm-charles', 'Storm Charles', 'The storm that cancelled Day Two: the videos about it. The full record of the storm is on weather.promptugal.news.', videos.filter((v) => v.storm).map((v) => v.id));
const orgs = new Map();
for (const v of videos) { const k = slug(v.channel.name); if (!orgs.has(k)) orgs.set(k, { name: clean(v.channel.name), kind: v.channel.kind, ids: [] }); orgs.get(k).ids.push(v.id); }
for (const [k, o] of [...orgs].sort((a, b) => a[1].name.localeCompare(b[1].name))) if (o.ids.length >= 2) add('organisation', k, o.name, `Videos published by ${o.name}, ${CH_KIND[o.kind] || 'a channel'}.`, o.ids);
const topics = new Map();
for (const v of videos) for (const t of v.topics) { if (t === 'Storm Charles') continue; const k = slug(t); if (!topics.has(k)) topics.set(k, { name: clean(t), ids: [] }); topics.get(k).ids.push(v.id); }
for (const [k, t] of [...topics].sort((a, b) => b[1].ids.length - a[1].ids.length || a[1].name.localeCompare(b[1].name))) if (t.ids.length >= 2) add('topic', k, t.name, `Videos about ${t.name}, as tagged when they were found.`, t.ids);
const plPath = (p) => `/playlists/${p.kind}/${p.id}/`;
const playlistsOf = (vid) => playlists.filter((p) => p.ids.includes(vid) && p.kind !== 'event' && p.kind !== 'place');
const PL_KINDS = [['event', 'By event'], ['kind', 'By kind'], ['organisation', 'By organisation'], ['topic', 'By topic'], ['place', 'By place']];

// ---------------------------------------------------------------- the page frame
rmSync('_site', { recursive: true, force: true });
cpSync('src', '_site', { recursive: true });
const SITES = [['Videos', 'https://videos.promptugal.news/'], ['Library', 'https://library.promptugal.news/'], ['Live', 'https://live.promptugal.news/'], ['Events', 'https://events.promptugal.news/'], ['Weather', 'https://weather.promptugal.news/'], ['Civic', 'https://civic.promptugal.news/'], ['Startups', 'https://startups.promptugal.news/'], ['Travel', 'https://travel.promptugal.news/'], ['Data', 'https://data.promptugal.news/']];
const NAV = [['/', 'Videos'], ['/collections/web-summit-lisbon-2026/', 'Web Summit 2026'], ['/playlists/', 'Playlists'], ['/videos/', 'Every video'], ['/how/', 'How it works'], ['/api/', 'Data']];
const CSP = `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; frame-src ${EMBED_HOST}; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'`;
const pages = [];
function page({ path, title, description, section, body, mdBody }) {
  if (!okRel(path)) throw new Error(`bad page path ${path}`);
  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${esc(CSP)}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(clean(title))}</title>
<meta name="description" content="${esc(clean(description))}">
<link rel="canonical" href="${SITE}${path}">
<link rel="alternate" type="text/markdown" href="${path}index.md">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:image" content="${SITE}/preview.png">
<meta property="og:title" content="${esc(clean(title))}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/site.css?v=${esc(version)}">
<script defer src="/assets/player.js?v=${esc(version)}"></script>
</head>
<body>
<a class="skip" href="#main">Skip to the content</a>
<div class="version-bar"><span>Version ${esc(version)}</span><span><a href="${path}index.md">This page as markdown</a></span></div>
<header class="masthead">
  <div class="masthead-row">
    <a class="brand" href="/" aria-label="PrompTugal.news Videos, home"><span class="wm">Promp<span class="t">T</span><span class="g">ugal</span>.<i>news</i></span><span class="sub">· Videos</span></a>
    <a class="tool meter" href="https://promptugal.news/account/" title="Free: this site carries no billing. Only promptugal.news bills (Dinis Cruz, 18 November 2026). The videos are other people's, played in their own platform's player. Your PrompTugal.news balance is kept on promptugal.news."><span class="meter-label">Pay for what you read · </span><b>free here</b></a>
  </div>
  <nav class="nav" aria-label="Sections">${NAV.map(([h, t]) => `<a href="${h}"${h === section ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
</header>
<nav class="em-net" aria-label="The PrompTugal.news sites"><span>Also from <a href="https://promptugal.news/">PrompTugal.news</a></span>${SITES.map(([t, u]) => `<a href="${u}"${t === 'Videos' ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
<main id="main">
${body}
</main>
<footer class="footer">
  <p>Part of <a href="https://promptugal.news/">PrompTugal.news</a>: Portugal, town by town. Every video here is someone else's: it plays in its platform's own player, from the platform, and is never copied, downloaded or hosted by us. Its title and channel are shown as published.</p>
  <p class="licences">Licences: our pages, words and records <a class="lic" href="${CCBY}">CC BY 4.0</a>; each video stays under its platform's terms, linked on its card.</p>
  <p class="disclaimer"><b>Your video, your say.</b> If you think we should not show your video or your data, <a href="${REPO}/issues/new">open an issue</a> and we take it down while we talk.</p>
  <p class="principles-line"><b>We aim to be accurate and never to present anything as other than it is; mistakes happen, and we correct them as soon as we can.</b> <a href="https://promptugal.news/principles/">Our principles</a> · <a href="https://promptugal.news/report/">Report a mistake</a> · <a href="/security/">Security</a> · <a href="/how/">How it works</a></p>
  <p class="small">How this page was made: code (<code>scripts/build.mjs</code>) built it from <code>data/videos.json</code>; the code and words are by videos.b@PrompTugal.dinis, an AI agent (Claude, Opus), for Dinis Cruz; no person has checked this page yet.</p>
  <p class="small">Version ${esc(version)} · Built ${esc(fmtStamp(builtAt.toISOString()))} · <a href="${REPO}">Source</a> · Code Apache-2.0, text CC BY 4.0 · <a href="/llms.txt">llms.txt</a></p>
</footer>
</body>
</html>
`;
  const file = join('_site', path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  writeFileSync(join('_site', path, 'index.md'), `# ${md(title)}\n\n> ${md(description)}\n\n${mdBody.trim()}\n\n---\nPart of PrompTugal.news. Version ${version}. Our text and records: CC BY 4.0 (${CCBY}); each video stays under its platform's terms, linked on its card. HTML: ${SITE}${path}\n`);
  pages.push({ path, title: clean(title), description: clean(description) });
}
function api(path, obj) {
  const file = join('_site', path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 1).replace(/\u2014/g, '\u2013') + '\n');
}

// ---------------------------------------------------------------- pieces
const when = (v) => v.published.date ? `${fmtDay(v.published.date)} <span class="small">(${esc(clean(v.published.precision))})</span>` : `<span class="small">${esc(clean(v.published.precision))}</span>`;
const people = (v) => v.people.length ? v.people.map((p) => `${esc(clean(p.name))}${p.role ? ` <span class="small">(${esc(clean(p.role))})</span>` : ''}`).join(', ') : '';
function player(v, start = 0) {
  if (v.platform !== 'youtube') return `<div class="player player-link"><p>This video is on ${esc(PLATFORMS[v.platform].name)}'s own site; we only embed from YouTube.</p><p>${link(v.url, `Watch it on ${PLATFORMS[v.platform].name}`)}</p></div>`;
  return `<div class="player" data-yt="${esc(v.platform_id)}" data-title="${esc(clean(v.title))}"${start ? ` data-start="${start}"` : ''}>
<button type="button" class="play"><span class="tri" aria-hidden="true"></span><span>Play here, in YouTube's player</span></button>
<p class="small">Nothing is loaded from YouTube until you press play (then YouTube's privacy-enhanced player, <code>youtube-nocookie.com</code>, under <a href="${href(PLATFORMS.youtube.terms)}">YouTube's terms</a>). Or ${link(v.url, 'watch it on YouTube')}.</p>
</div>`;
}
function card(v, { heading = 'h3', showDay = true } = {}) {
  return `<li class="vid vid-${esc(v.kind)}">
<p class="badge">${esc(KIND[v.kind] || 'Video')}${v.storm ? ' · Storm Charles' : ''}${v.found.verified ? '' : ' · not fully checked'}</p>
<${heading} class="vid-title"><a href="/videos/${esc(v.id)}/">${esc(clean(v.title))}</a></${heading}>
<dl class="facts"><dt>Who</dt><dd>${esc(clean(v.channel.name))}${v.people.length ? `; with ${people(v)}` : ''}</dd>
<dt>When</dt><dd>${v.published.date ? esc(fmtDay(v.published.date)) : 'date not known'}${showDay && v.day ? ` · <span class="small">${esc(dayLabel(v))}</span>` : ''}</dd>
<dt>Where</dt><dd>${esc(PLATFORMS[v.platform].name)}${v.platform === 'youtube' ? ', played here' : ', linked'}</dd></dl>
</li>`;
}
function dayLabel(v) { const c = collections.find((x) => x.id === v.collection); const d = c?.days?.find((x) => x.date === v.day); return d ? `${d.label}, ${weekday(d.date)}` : ''; }
const cards = (ids, o) => ids.length ? `<ul class="vids">${ids.map((i) => card(byId.get(i), o)).join('\n')}</ul>` : '<p class="none">None yet.</p>';
const mdList = (ids) => ids.map((i) => { const v = byId.get(i); return `- ${mdLink(`/videos/${v.id}/`, v.title)}: ${md(v.channel.name)}${v.published.date ? `, ${fmtDay(v.published.date)}` : ''}`; }).join('\n');
const fromLibrary = videos.filter((v) => /^library\./.test(v.found.by)).length;
const libraryNote = libraryRead.readAt ? ` The library's catalogue was last read ${esc(fmtStamp(libraryRead.readAt))}.` : '';
const seed = `<p class="fresh">The catalogue is a seed: ${videos.length - fromLibrary} videos copied from the team's own record of the summit's coverage (found ${esc(fmtStamp('2026-11-10T18:48Z'))} to ${esc(fmtStamp('2026-11-10T20:53Z'))}, each checked then with YouTube's oEmbed)${fromLibrary ? ` and ${fromLibrary} from ${link('https://library.promptugal.news/', 'the library')}'s catalogue` : ''}. It is not everything that was published.${libraryNote} ${link('/how/', 'How it works')}.</p>`;

// ---------------------------------------------------------------- the collection
const C = collections[0];
const official = videos.filter((v) => v.kind === 'official-replay');
const others = videos.filter((v) => v.kind !== 'official-replay');
function dayBlock(d) {
  const head = `<h3 id="day-${esc(d.date)}">${esc(clean(d.label))} <span class="n">${esc(weekday(d.date))} ${esc(fmtDay(d.date))}</span></h3>`;
  if (d.state === 'cancelled') {
    return `<div class="day day-cancelled">${head}
<p class="cancelled"><b>Cancelled.</b> ${esc(clean(d.why))}</p>
<p>${link(d.storm.url, d.storm.title)}: the storm's warnings, its timeline and its data, on weather.promptugal.news.</p>
<p class="small">The evidence: ${d.evidence.map((e) => `${link(e.url, e.title)} (${esc(clean(e.publisher))})`).join('; ')}.</p>
<p class="small">The videos about the storm: ${link('/playlists/topic/storm-charles/', 'the Storm Charles playlist')}.</p></div>`;
  }
  const rs = (d.replays || []).map((r) => byId.get(r));
  const replay = rs.length ? rs.map((v) => `<div class="replay"><p class="badge">The organiser's replay</p><p class="vid-title"><a href="/videos/${esc(v.id)}/">${esc(clean(v.title))}</a></p>${player(v)}${d.note ? `<p class="small">${esc(clean(d.note))}</p>` : ''}<p class="small">Talks by timestamp: not listed yet (${link('/how/#talks', 'why')}).</p></div>`).join('') : `<p class="none">${esc(clean(d.gap || 'No replay found yet.'))}</p>`;
  const same = others.filter((v) => v.day === d.date).map((v) => v.id);
  return `<div class="day">${head}${replay}${same.length ? `<h4>Also recorded that day</h4>${cards(same, { heading: 'h5', showDay: false })}` : ''}</div>`;
}
function dayMd(d) {
  if (d.state === 'cancelled') return `### ${md(d.label)}, ${weekday(d.date)} ${fmtDay(d.date)}: cancelled\n\n${md(d.why)}\n\n- ${mdLink(d.storm.url, d.storm.title)}\n${d.evidence.map((e) => `- ${mdLink(e.url, e.title)} (${md(e.publisher)})`).join('\n')}`;
  const rs = (d.replays || []).map((r) => byId.get(r));
  return `### ${md(d.label)}, ${weekday(d.date)} ${fmtDay(d.date)}\n\n${rs.length ? rs.map((v) => `The organiser's replay: ${mdLink(`/videos/${v.id}/`, v.title)} (<${mdUrl(v.url)}>)`).join('\n') : md(d.gap || 'No replay found yet.')}\n\n${mdList(others.filter((v) => v.day === d.date).map((v) => v.id))}`;
}
const undated = others.filter((v) => !v.day).map((v) => v.id);
const pi = C.private_items;
page({
  path: `/collections/${C.id}/`, section: `/collections/${C.id}/`, title: `${C.title}: the replays by day · PrompTugal.news Videos`,
  description: `${C.title}, ${C.event.replace(/^.*?, /, '')}: the organiser's replays by day, Day Two cancelled by Storm Charles, and ${others.length} recordings by companies, governments and the press.`,
  body: `<p class="crumbs"><a href="/">Videos</a> › Collections</p>
<p class="kicker">Collection · Lisboa · 9 to 12 November 2026</p>
<h1>${esc(C.title)}</h1>
<p class="standfirst">${esc(clean(C.summary))}</p>
${seed}
<p class="note">The replays are the organiser's own streams, played in YouTube's player. <b>Talks by timestamp are not listed yet:</b> ${esc(clean(C.talks_note))}</p>
<section><h2>The days</h2>${C.days.map(dayBlock).join('\n')}</section>
<section><h2>Recordings with no day</h2><p class="small">Published before the sweep of 10 November, 18:48 UTC; the day is not known.</p>${cards(undated, { showDay: false })}</section>
<section><h2>Not listed</h2><p>${esc(String(pi.count))} more videos on ${esc(pi.platform)} by private people, about ${esc(pi.themes.join('; '))}. ${esc(clean(pi.why))}</p></section>
<section><h2>The data</h2><p>${link(`/api/v1/collections/${C.id}.json`, `This collection as JSON`)} · ${link('/api/', 'every endpoint')}.</p></section>`,
  mdBody: `${md(C.summary)}\n\nTalks by timestamp are not listed yet: ${md(C.talks_note)}\n\n## The days\n\n${C.days.map(dayMd).join('\n\n')}\n\n## Recordings with no day\n\n${mdList(undated)}\n\n## Not listed\n\n${pi.count} videos by private people (${md(pi.themes.join('; '))}). ${md(pi.why)}`,
});

// ---------------------------------------------------------------- each video: its reading room
for (const v of videos) {
  const lic = licOf(v);
  const pls = playlistsOf(v.id);
  const talks = v.talks.length ? `<ol class="talks">${v.talks.map((t) => `<li><button type="button" class="seek" data-start="${t.start}">${String(Math.floor(t.start / 3600)).padStart(1, '0')}:${String(Math.floor(t.start / 60) % 60).padStart(2, '0')}:${String(t.start % 60).padStart(2, '0')}</button> ${esc(clean(t.title))}</li>`).join('')}</ol>` : `<p class="none">Not listed yet. ${link('/how/#talks', 'Why')}.</p>`;
  page({
    path: `/videos/${v.id}/`, section: '/videos/',
    title: `${clean(v.title)} · ${clean(v.channel.name)} · PrompTugal.news Videos`,
    description: `${clean(v.title)}, published by ${clean(v.channel.name)}${v.published.date ? ` on ${fmtDay(v.published.date)}` : ''}: played in ${PLATFORMS[v.platform].name}'s own player, with where it came from and how we found it.`,
    body: `<p class="crumbs"><a href="/collections/${esc(v.collection)}/">${esc(C.title)}</a> › <a href="/videos/">Every video</a></p>
<p class="kicker">${esc(KIND[v.kind] || 'Video')}${v.storm ? ' · Storm Charles' : ''}</p>
<h1 class="vid-h1">${esc(clean(v.title))}</h1>
${player(v)}
<section class="card-full"><h2>The card</h2>
<dl class="facts big">
<dt>What</dt><dd>${esc(KIND[v.kind] || 'A video')}${v.note ? `. ${esc(clean(v.note))}` : ''}</dd>
<dt>Who</dt><dd>Published by ${esc(clean(v.channel.name))}, ${esc(CH_KIND[v.channel.kind] || 'a channel')}.${v.people.length ? ` With ${people(v)} (public and professional, as named in the title or by the publisher).` : ''}</dd>
<dt>When</dt><dd>${when(v)}${v.day ? `; ${esc(dayLabel(v))} of the summit` : ''}</dd>
<dt>Where</dt><dd>${esc(placeName(v.place))}, at <a href="/collections/${esc(v.collection)}/">${esc(C.title)}</a></dd>
<dt>Source</dt><dd>${link(v.url, v.url)}</dd>
<dt>Licence</dt><dd><a class="lic" href="${href(lic.url)}">${esc(lic.name)}</a> (${esc(PLATFORMS[v.platform].name)}'s). Our card: <a class="lic" href="${CCBY}">CC BY 4.0</a>.</dd>
<dt>Found</dt><dd>By ${esc(clean(v.found.by))}, ${esc(fmtStamp(v.found.at))}: ${esc(clean(v.found.how))}.${v.found.verified ? '' : ' <b>Not fully checked.</b>'} ${link(v.found.evidence || data.evidence_base, 'The evidence')}.</dd>
<dt>Call number</dt><dd><code>${esc(v.id)}</code> · ${link(`/api/v1/videos/${v.id}.json`, 'as JSON')}${v.library ? ` · in the library as ${link(v.library.page, v.library.call_number)}` : ''}</dd>
</dl></section>
<section><h2 id="talks">Talks by timestamp</h2>${talks}</section>
${pls.length ? `<section><h2>In the playlists</h2><ul>${pls.map((p) => `<li>${link(plPath(p), p.title)} <span class="small">(${p.ids.length})</span></li>`).join('')}</ul></section>` : ''}
<p class="report small">Is this card wrong, or should this video not be here? <a href="${REPO}/issues/new">Tell us</a>.</p>`,
    mdBody: `- What: ${md(KIND[v.kind] || 'A video')}${v.note ? `. ${md(v.note)}` : ''}\n- Who: ${md(v.channel.name)}${v.people.length ? `; with ${v.people.map((p) => md(p.name)).join(', ')}` : ''}\n- When: ${v.published.date ? fmtDay(v.published.date) : 'not known'} (${md(v.published.precision)})\n- Where: ${md(placeName(v.place))}, ${md(C.title)}\n- Source: <${mdUrl(v.url)}>\n- Licence: the platform's terms (<${mdUrl(lic.url)}>); our card CC BY 4.0\n- Found: by ${md(v.found.by)}, ${fmtStamp(v.found.at)}: ${md(v.found.how)}${v.found.verified ? '' : ' (not fully checked)'}\n- Call number: ${v.id}\n\nWatch: <${mdUrl(v.url)}>`,
  });
  api(`api/v1/videos/${v.id}.json`, { ...pick(v), license: lic, page: `${SITE}/videos/${v.id}/`, embed: v.platform === 'youtube' ? `${EMBED_HOST}/embed/${v.platform_id}` : null, evidence: v.found.evidence || data.evidence_base, license_of_this_record: data.license_of_this_record });
}

// ---------------------------------------------------------------- every video
page({
  path: '/videos/', section: '/videos/', title: 'Every video · PrompTugal.news Videos',
  description: `All ${videos.length} videos in the catalogue, the organiser's replays first, each with its card.`,
  body: `<h1>Every video</h1>${seed}${Object.keys(KIND).map((k) => `<section><h2>${esc(KIND_PL[k])}</h2>${cards(videos.filter((v) => v.kind === k).map((v) => v.id))}</section>`).join('\n')}`,
  mdBody: Object.keys(KIND).map((k) => `## ${KIND_PL[k]}\n\n${mdList(videos.filter((v) => v.kind === k).map((v) => v.id))}`).join('\n\n'),
});

// ---------------------------------------------------------------- playlists
page({
  path: '/playlists/', section: '/playlists/', title: 'Playlists · PrompTugal.news Videos',
  description: 'The videos by event, by kind, by organisation, by topic and by place.',
  body: `<h1>Playlists</h1><p class="standfirst">The same videos, gathered by event, kind, organisation, topic and place. An organisation or a topic gets a playlist once it has two videos.</p>
${PL_KINDS.map(([k, t]) => { const ps = playlists.filter((p) => p.kind === k); return ps.length ? `<section><h2>${t}</h2><ul class="pls">${ps.map((p) => `<li>${link(p.kind === 'event' ? `/collections/${p.id}/` : plPath(p), p.title)} <span class="small">${p.ids.length} video${p.ids.length === 1 ? '' : 's'}</span></li>`).join('')}</ul></section>` : ''; }).join('\n')}
<section><h2>Every organisation</h2><p class="small">Each channel with a video here, and what kind of publisher it is.</p><ul class="pls">${[...orgs].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([k, o]) => `<li>${o.ids.length >= 2 ? link(`/playlists/organisation/${k}/`, o.name) : link(`/videos/${o.ids[0]}/`, o.name)} <span class="small">${esc(CH_KIND[o.kind] || '')} · ${o.ids.length}</span></li>`).join('')}</ul></section>`,
  mdBody: PL_KINDS.map(([k, t]) => `## ${t}\n\n${playlists.filter((p) => p.kind === k).map((p) => `- ${mdLink(p.kind === 'event' ? `/collections/${p.id}/` : plPath(p), p.title)} (${p.ids.length})`).join('\n')}`).join('\n\n'),
});
for (const p of playlists) {
  api(`api/v1/playlists/${p.kind}/${p.id}.json`, { ...p, videos: p.ids.map((i) => `${SITE}/api/v1/videos/${i}.json`), license_of_this_record: data.license_of_this_record });
  if (p.kind === 'event') continue; // the collection page is the event's playlist
  page({
    path: plPath(p), section: '/playlists/', title: `${p.title}: a playlist · PrompTugal.news Videos`,
    description: `${p.ids.length} videos${p.about ? `: ${p.about}` : ''}`,
    body: `<p class="crumbs"><a href="/playlists/">Playlists</a> › ${esc(PL_KINDS.find(([k]) => k === p.kind)[1])}</p><h1>${esc(p.title)}</h1>${p.about ? `<p class="standfirst">${esc(p.about)}</p>` : ''}
${p.id === 'storm-charles' ? `<p class="note">Day Two of the summit, Wednesday 11 November, was cancelled for the storm. ${link('https://weather.promptugal.news/storms/charles/', 'The Storm Charles archive')} on weather.promptugal.news has its warnings, timeline and data.</p>` : ''}
${cards(p.ids)}<p class="small">${link(`/api/v1/playlists/${p.kind}/${p.id}.json`, 'This playlist as JSON')}</p>`,
    mdBody: `${md(p.about)}\n\n${mdList(p.ids)}`,
  });
}

// ---------------------------------------------------------------- home
page({
  path: '/', section: '/', title: 'PrompTugal.news Videos: talks and recordings, in their own players',
  description: `Videos about what PrompTugal.news covers, played in each platform's own player: first, Web Summit Lisbon 2026, with the organiser's replays by day and ${others.length} more recordings.`,
  body: `<section class="hero"><p class="kicker">Videos · watch and listen</p>
<h1>Talks and recordings, where they were published</h1>
<p class="standfirst">The videos about what PrompTugal.news covers, each played in its platform's own player and never copied, with a card for each: what it is, who made it, when, where it came from, its licence and how we found it. Audio follows once we have it.</p>
${seed}</section>
<section><h2>${link(`/collections/${C.id}/`, C.title)}</h2>
<p>${esc(clean(C.summary))}</p>
<ul class="days">${C.days.map((d) => `<li class="${d.state === 'cancelled' ? 'is-cancelled' : ''}"><a href="/collections/${esc(C.id)}/#day-${esc(d.date)}"><b>${esc(clean(d.label))}</b> <span class="small">${esc(weekday(d.date))} ${esc(fmtDay(d.date))}</span></a><span class="small">${d.state === 'cancelled' ? 'Cancelled: Storm Charles' : d.replays.length ? "The organiser's replay" : 'Replay not found yet'}</span></li>`).join('')}</ul>
${official.length ? `<h3>The opening night</h3>${player(official[0])}` : ''}
</section>
<section><h2>Recordings and coverage</h2>${cards(others.slice(0, 6).map((v) => v.id))}<p>${link('/videos/', `Every video (${videos.length})`)} · ${link('/playlists/', 'Playlists')}</p></section>
<section><h2>Find more</h2><p>The catalogue and the graph of everything published about what we cover are kept by the library, ${link('https://library.promptugal.news/', 'library.promptugal.news')}; the data by ${link('https://data.promptugal.news/', 'data.promptugal.news')}. This site is where you watch and listen. If you made a video about an event we cover, ${link(`${REPO}/issues/new`, 'send us its link')}: we publish it credited to you.</p></section>`,
  mdBody: `Videos about what PrompTugal.news covers, played in each platform's own player.\n\n## ${md(C.title)}\n\n${C.days.map((d) => `- ${md(d.label)}, ${fmtDay(d.date)}: ${d.state === 'cancelled' ? 'cancelled (Storm Charles)' : d.replays.length ? mdLink(`/videos/${d.replays[0]}/`, "the organiser's replay") : 'replay not found yet'}`).join('\n')}\n\n## Every video\n\n${mdList(videos.map((v) => v.id))}`,
});

// ---------------------------------------------------------------- how it works
const models = existsSync('docs/threat-models') ? readdirSync('docs/threat-models').filter((f) => /^[a-z0-9-]+\.md$/.test(f)).sort() : [];
const modelTitle = (f) => (readFileSync(join('docs/threat-models', f), 'utf8').match(/^# (.+)$/m) || [, f])[1];
const modelLinks = models.map((f) => link(`${REPO}/blob/dev/docs/threat-models/${f}`, modelTitle(f)));
page({
  path: '/how/', section: '/how/', title: 'How it works · PrompTugal.news Videos',
  description: 'Where the videos come from, how they are played, what we never do, the licences, and what is missing.',
  body: `<h1>How it works</h1>
<section><h2>Where the videos come from</h2>
<p>Today, from two places. First, the team's own record of what was published about Web Summit Lisbon 2026, kept by social.watch@PrompTugal.dinis during the summit (${link(data.evidence_base, 'coverage.json')}). Its sweeps of 10 November 2026 searched YouTube and the press for the summit and checked each video's title and channel with YouTube's oEmbed. We copied ${videos.length - fromLibrary} videos from it into <code>data/videos.json</code> by hand on 18 November; nothing was read again. Second, the library (${link('https://library.promptugal.news/', 'library.promptugal.news')}), the team's catalogue: ${fromLibrary} video${fromLibrary === 1 ? '' : 's'} so far, each crediting its catalogue entry as the evidence. Its catalogue is read at each of our wakes by <code>scripts/sync-library.mjs</code>, which keeps every read as received, with its time, in <code>data/library/raw/</code>; the build itself reads nothing from the network.${libraryNote}</p>
<p>Next, read straight from the team's APIs: the library's catalogue (<code>/api/v1/items/</code>) and ${link('https://data.promptugal.news/', 'data.promptugal.news')} (discovery and the platforms' official interfaces, YouTube's Data API once Dinis Cruz adds its key). This site runs no collector of its own.</p>
<p>Organisers and speakers can send their own videos: ${link(`${REPO}/issues/new`, 'open an issue')} with the link. We publish it credited to you and dated.</p></section>
<section><h2>How they are played</h2>
<ul><li><b>The platform's own player only.</b> A YouTube video plays in YouTube's privacy-enhanced player from <code>www.youtube-nocookie.com</code>, the one host this site may frame (the page's Content Security Policy says so).</li>
<li><b>Nothing loads until you press play.</b> Until then your browser makes no request to YouTube. Without JavaScript, each video links to its page on YouTube.</li>
<li><b>Never copied.</b> We never download, copy or host a video, a thumbnail, a still or a transcript. Titles and channel names are shown as published, as a search engine would.</li>
<li>A video on another site (CNBC's own player, for one) is linked, not embedded.</li></ul></section>
<section><h2 id="talks">Talks by timestamp</h2>
<p>Each replay is hours long; the aim is to reach each talk by its start time. ${esc(clean(C.talks_note))} Every card already has the place for them, and the player can start at a given second.</p></section>
<section><h2>What a card says</h2>
<p>What the video is; who published it (an organisation, or a person only as public and professional, as named by the publisher); when (with how precise the date is: most dates come from YouTube's "published N hours ago" at the sweep); where; the source link; the licence ("the platform's terms", linked); how we found it, by whom, when, and the evidence. Private people's videos are counted, never listed.</p></section>
<section><h2>Licences</h2><p>Our pages, words and records: ${link(CCBY, 'CC BY 4.0')}. Each video: its platform's terms (${link(PLATFORMS.youtube.terms, "YouTube's terms")}). Code: Apache-2.0.</p></section>
<section><h2>What we do not use</h2><p>The summit's own website and agenda (websummit.com): its terms forbid automated reading, and since 11 November 2026 the team builds nothing new on Web Summit's data (Dinis Cruz). The organisers' statement on Day Two is linked, never copied.</p></section>
<section><h2>Security</h2><p>Every value from the data is escaped; links must be https; ids must match fixed shapes or the build stops. Threat models: ${modelLinks.length ? modelLinks.join(' · ') : 'none yet'}. ${link('/security/', 'Findings')}.</p></section>
<section><h2>The sources</h2><p>${link('/sources/', 'Every source this site reads')}: what, where from, how often, the licence, what we do with it, and every read kept.</p></section>
<section><h2>For the operator</h2><p>${link('/how/google-api-key/', 'One Google API key for the free APIs')}: YouTube, Fact Check Tools, Knowledge Graph Search, PageSpeed Insights, Books and Web Risk, in one restricted key. ${link('/how/youtube-api-key/', 'The YouTube part on its own')}: how Dinis Cruz creates, restricts, hands over and revokes the key that will let the agents list the official replays and their chapters.</p></section>
<section><h2>Who made it</h2><p>videos.b@PrompTugal.dinis, an AI agent (Claude, Opus, with Sonnet sub-agents for the reviews), started by conductor.b@PrompTugal.dinis at Dinis Cruz's word on 18 November 2026. No person has checked these pages yet.</p></section>`,
  mdBody: `Videos come from the team's coverage record (<${mdUrl(data.evidence_base)}>), copied by hand; next from library.promptugal.news and data.promptugal.news. Played only in the platform's own player (www.youtube-nocookie.com), nothing loaded until you press play; never copied.\n\nTalks by timestamp: ${md(C.talks_note)}\n\nLicences: ours CC BY 4.0; each video its platform's terms.`,
});

// ---------------------------------------------------------------- the operator's page: making the YouTube API key
// Asked for by Dinis Cruz (18 Nov 2026, ~16:55 UTC, in conductor.b@'s session). Checked against Google's own pages on
// 18 Nov 2026 at about 17:45 UTC; where those pages differ from the steps relayed to us, Google's wording is followed.
{
  const G = {
    start: 'https://developers.google.com/youtube/v3/getting-started',
    quota: 'https://developers.google.com/youtube/v3/determine_quota_cost',
    keys: 'https://docs.cloud.google.com/docs/authentication/api-keys',
    use: 'https://docs.cloud.google.com/docs/authentication/api-keys-use',
    console: 'https://console.cloud.google.com/',
  };
  page({
    path: '/how/youtube-api-key/', section: '/how/', title: 'Making the YouTube API key: instructions for the operator · PrompTugal.news Videos',
    description: "How the team's operator creates, restricts, hands over and revokes the YouTube Data API key the agents will use to list the official replays and their chapters.",
    body: `<p class="crumbs"><a href="/how/">How it works</a> › The YouTube API key</p>
<p class="kicker">For the operator, not for readers</p>
<h1>Making the YouTube API key</h1>
<p class="standfirst">Instructions for Dinis Cruz, who asked for this page on 18 November 2026. With this key the agents can list the official replays and read their chapters, so talks can be reached by timestamp.</p>
<p class="note">Since 18 November 2026 (about 18:00 UTC) one key covers YouTube and the other free Google APIs we use: ${link('/how/google-api-key/', 'one Google API key for the free APIs')}. This page stays for the YouTube part.</p>
<p class="note">Checked against Google's own documentation on 18 November 2026, about 17:45 UTC. Where Google's pages and our first draft differed, this page follows Google, and says so. Google changes its console: if a step reads differently there, follow the console and ${link(`${REPO}/issues/new`, 'tell us')}.</p>
<section><h2>The steps</h2><ol>
<li><b>Make a project.</b> Open the ${link(G.console, 'Google Cloud console')}, signed in with the account that should own the key, and create a project (for example <code>promptugal-news</code>). (${link(G.start, "Google: YouTube Data API, getting started")})</li>
<li><b>Turn on the API.</b> In the API Library, find <b>YouTube Data API v3</b> and enable it for that project.</li>
<li><b>Create the key.</b> Open <b>APIs &amp; services</b>, then <b>Credentials</b>, click <b>Create credentials</b> and choose <b>API key</b>. Give it a display name such as <code>promptugal-news-youtube</code>. (${link(G.keys, 'Google: manage API keys')})</li>
<li><b>Restrict it at once.</b> Under API restrictions, allow <b>YouTube Data API v3</b> only. Google also recommends an <b>application restriction</b> (for a server, by IP address) and calls unrestricted keys insecure. The agents' cloud sessions have no fixed IP address, so an IP restriction would block them; the key is therefore restricted by API only, and kept where no agent can read it (step 6). Whether that is acceptable is your call.</li>
<li><b>Know the quota.</b> Google's quota page, as read on 18 November 2026: a default of <b>10,000 units a day</b>; listing videos or a playlist's items costs <b>1 unit</b> a call; <b>search</b> has a separate limit (the page gives 1 unit a call, within 100 searches a day). Our first draft said a search cost 100 units; Google's current page says otherwise. Google's pages do not say whether a billing account is needed; the console says so if it is. (${link(G.quota, 'Google: quota costs')})</li>
<li><b>Hand it over without showing it to anyone.</b> Never paste the key into a chat, a page, a commit, an issue or a message. Add it as a <b>network secret</b> in the cloud environment's settings (the environment menu in a session's title bar, then Edit, then Network secrets, then Add secret): type Bearer, allowed website <code>www.googleapis.com</code>, and under Custom headers change the header name to <code>X-Goog-Api-Key</code>, clear the prefix, and paste the key as the value. Check the resolved curl example shows only that header. The network proxy adds it to requests to that host; no agent ever sees the value. (The Claude app's own secure form cannot send this header, so it is not used.) (${link(G.use, 'Google: use API keys')})</li>
<li><b>What we do with it.</b> Read only: list the official channels' videos (Web Summit's first), read their chapters for talks by timestamp, and organisations' channels as signals. Never upload, comment or change anything. Each call is counted by telemetry.b@PrompTugal.dinis.</li>
<li><b>Revoke or rotate it.</b> On the Credentials page, open the key and delete it, or rotate it (Google keeps a deleted key restorable for 30 days). Then tell conductor.b@PrompTugal.dinis, so the form can be filled again.</li>
</ol></section>
<section><h2>Where this changed from the steps relayed to us</h2><ul>
<li>Search quota: Google's page gives 1 unit a call within 100 searches a day, not 100 units a search.</li>
<li>Application restriction: Google recommends one (an IP restriction for servers); we cannot use it from cloud sessions without a fixed address, so it is left for you to decide.</li>
<li>Billing: Google's pages do not say; we no longer claim none is needed.</li>
</ul></section>`,
    mdBody: `For the operator, not for readers. Checked against Google's documentation on 18 November 2026.\n\n1. Make a project in the Google Cloud console (${G.console}).\n2. Enable YouTube Data API v3 in the API Library.\n3. APIs & services, Credentials, Create credentials, API key; name it promptugal-news-youtube (${G.keys}).\n4. Restrict it to YouTube Data API v3. Google also recommends an application restriction (IP for servers); our cloud sessions have no fixed IP, so it is restricted by API only: your call.\n5. Quota (${G.quota}): 10,000 units a day; list calls 1 unit; search 1 unit a call within 100 a day. Billing: not stated by Google.\n6. Never paste the key anywhere; add it as a network secret in the cloud environment's settings (host www.googleapis.com, header X-Goog-Api-Key, no prefix) (${G.use}).\n7. Read only: official channels' videos, chapters for talks by timestamp, organisations' channels as signals; counted by telemetry.b@.\n8. Revoke or rotate on the Credentials page; tell conductor.b@.`,
  });
}

// ---------------------------------------------------------------- the operator's page: one Google key for the free APIs
// Asked for by Dinis Cruz (18 Nov 2026, ~17:55 UTC, in conductor.b@'s session). Each API checked against Google's own pages
// on 18 Nov 2026, about 18:00 UTC; "not stated" means the pages read did not say.
{
  const APIS = [
    { name: 'YouTube Data API v3', use: "List the official channels' videos (Web Summit first), read their chapters for talks by timestamp, organisations' channels as signals. Read only.", host: 'www.googleapis.com', quota: '10,000 units a day by default; a list call 1 unit; search 1 unit a call within 100 searches a day.', terms: 'Not stated beyond the API terms on the pages read.', docs: 'https://developers.google.com/youtube/v3/determine_quota_cost' },
    { name: 'Fact Check Tools API', use: "Published fact-checks (ClaimReview), for the library's fact-checker.", host: 'factchecktools.googleapis.com', quota: 'Not stated (results default to 10 a page).', terms: "Google's API Terms of Service apply; nothing on caching stated.", docs: 'https://developers.google.com/fact-check/tools/api' },
    { name: 'Knowledge Graph Search API', use: "Entity ids for the library's graph.", host: 'kgsearch.googleapis.com', quota: 'Not stated (up to 500 results a call, 20 by default).', terms: 'Google APIs Terms of Service; images carry their own licences. Google says it is being moved to Cloud Enterprise Knowledge Graph and is "not suitable for use as a production-critical service".', docs: 'https://developers.google.com/knowledge-graph' },
    { name: 'PageSpeed Insights API', use: "Our own sites' performance and accessibility.", host: 'pagespeedonline.googleapis.com (Google\'s samples also use www.googleapis.com)', quota: 'Not stated on the pages read.', terms: 'Not stated. Google plans to stop including Chrome UX Report field data in this API.', docs: 'https://developers.google.com/speed/docs/insights/v5/get-started' },
    { name: 'Books API', use: 'Book records for the library.', host: 'www.googleapis.com', quota: 'Not stated (up to 40 results a call).', terms: 'No fee may be charged for an application using it without a separate agreement; Google attribution ("powered by Google") beside results, a link to Google Books on each, results not reordered or altered.', docs: 'https://developers.google.com/books/terms' },
    { name: 'Web Risk API', use: 'Checking the links our sites send readers to.', host: 'webrisk.googleapis.com', quota: 'Per project: 6,000 lookups a minute (SearchUris), others 600 a minute; submissions 1,000 a day.', terms: 'Not enabled: left off the key for now (Dinis Cruz, 18 November 2026). For when it is: cache each result until its expireTime; "the information returned by the Web Risk must not be redistributed"; a paid Cloud product (we could not read Google\'s pricing page).', docs: 'https://docs.cloud.google.com/web-risk/docs/overview' },
  ];
  // Web Risk is left off the key for now (Dinis Cruz, 18 Nov 2026, ~23:38 UTC), so its host is not handed a key.
  const hosts = ['www.googleapis.com', 'factchecktools.googleapis.com', 'kgsearch.googleapis.com', 'pagespeedonline.googleapis.com'];
  page({
    path: '/how/google-api-key/', section: '/how/', title: "One Google API key for the free APIs: instructions for the operator · PrompTugal.news Videos",
    description: "How the team's operator creates one Google Cloud key for YouTube, Fact Check Tools, Knowledge Graph Search, PageSpeed Insights, Books and Web Risk, restricted to exactly those APIs, and hands it over without anyone seeing it.",
    body: `<p class="crumbs"><a href="/how/">How it works</a> › One Google API key</p>
<p class="kicker">For the operator, not for readers</p>
<h1>One Google API key for the free APIs</h1>
<p class="standfirst">Instructions for Dinis Cruz, who asked for them on 18 November 2026. One Google Cloud project, one key, restricted to exactly the APIs enabled below. The YouTube part is also on ${link('/how/youtube-api-key/', 'its own page')}.</p>
<p class="note">Each API was checked against Google's own pages on 18 November 2026, about 18:00 UTC. "Not stated" means those pages did not say; it does not mean there is no limit. Google changes its console and terms: if anything reads differently there, follow Google and ${link(`${REPO}/issues/new`, 'tell us')}.</p>
<section><h2>The steps</h2><ol>
<li><b>A project of its own.</b> In the ${link('https://console.cloud.google.com/', 'Google Cloud console')}, create a project (for example <code>promptugal-news-apis</code>), kept separate from any project that holds a Gmail or other OAuth client, so this key can never touch mail.</li>
<li><b>Enable only these APIs</b> in that project's API Library: YouTube Data API v3, Fact Check Tools API, Knowledge Graph Search API, PageSpeed Insights API, Books API. <b>Not Web Risk</b>: it is left off the key for now (your decision, 18 November 2026, about 23:38 UTC), as it is a paid Cloud product.</li>
<li><b>Create one key:</b> APIs &amp; services, Credentials, Create credentials, API key; name it <code>promptugal-news-apis</code>.</li>
<li><b>Restrict it at once</b> to exactly the APIs you enabled. Google also recommends an application restriction (by IP for servers); the agents' cloud sessions have no fixed address, so it is restricted by API only, and kept where no agent can read it. Your call (${link('https://docs.cloud.google.com/docs/authentication/api-keys', "Google: manage API keys")}).</li>
<li><b>Hand it over without showing it.</b> Never paste the key into a chat, a page, a commit, an issue or a message. In the cloud environment's settings (the environment menu in a session's title bar, then Edit, then Network secrets, then Add secret): type Bearer; allowed websites ${hosts.map((h) => `<code>${esc(h)}</code>`).join(', ')}; under Custom headers, header name <code>X-Goog-Api-Key</code>, prefix empty, the key as the value; check the resolved curl example shows only that header; save. This is how it was done on 18 November 2026 (Dinis Cruz, between about 23:45 UTC and 00:10 UTC on the 19th); the Claude app's secure form cannot send this header, so it is not used. No agent ever sees the value (${link('https://docs.cloud.google.com/docs/authentication/api-keys-use', "Google's preferred way")}).</li>
<li><b>Revoke or rotate</b> on the Credentials page, then tell conductor.b@PrompTugal.dinis.</li>
</ol></section>
<section><h2>Each API: what we use it for, its limits and terms</h2>
<table><thead><tr><th scope="col">API</th><th scope="col">What for</th><th scope="col">Host</th><th scope="col">Free quota, as Google states it</th><th scope="col">Caching, storage and other terms</th></tr></thead><tbody>
${APIS.map((a) => `<tr><th scope="row">${link(a.docs, a.name)}</th><td>${esc(a.use)}</td><td><code>${esc(a.host)}</code></td><td>${esc(a.quota)}</td><td>${esc(a.terms)}</td></tr>`).join('\n')}
</tbody></table>
<p class="small">Every API is used read only, and every call is counted by telemetry.b@PrompTugal.dinis. Not on the list: the free Safe Browsing API, which Google says is "for non-commercial use only" and deprecated, pointing commercial users to Web Risk (${link('https://developers.google.com/safe-browsing/v4', 'Google: Safe Browsing')}).</p></section>
<section><h2>Open, for you</h2><ul>
<li>Web Risk: left off the key for now (your decision, 18 November 2026). Checking our outbound links waits until you decide otherwise.</li>
<li>Knowledge Graph Search: Google calls it not suitable for production-critical use and is moving it; fine for the library's ids, not for anything that must not break.</li>
<li>Books: Google requires attribution beside results and forbids charging for an application that uses it without an agreement; the library must show "powered by Google" and link each result to Google Books.</li>
</ul></section>`,
    mdBody: `For the operator, not for readers. Checked against Google's pages on 18 November 2026.\n\n1. A Google Cloud project of its own, separate from any OAuth or Gmail project.\n2. Enable only: ${APIS.filter((a) => !/Web Risk/.test(a.name)).map((a) => a.name).join(', ')}. Not Web Risk: left off the key for now (Dinis, 18 November 2026).\n3. One API key, restricted to exactly those APIs.\n4. Never paste it anywhere; add it as a network secret in the cloud environment's settings (type Bearer, allowed websites ${hosts.join(', ')}, header X-Goog-Api-Key, no prefix).\n5. Revoke or rotate on the Credentials page; tell conductor.b@.\n\n${APIS.map((a) => `- ${md(a.name)} (${a.host}): ${md(a.use)} Quota: ${md(a.quota)} Terms: ${md(a.terms)} ${a.docs}`).join('\n')}`,
  });
}

// ---------------------------------------------------------------- the sources this site reads: a home page for each
// The pipeline standard (Dinis, 18 Nov 2026 ~16:00 UTC): what we read, how often, what we do with it, its licence, its history.
// Built from files in this repository only. Raw files are named by a fixed pattern and never read for text: only their
// time (from the name) and their sha256 (computed here) are shown.
{
  const RAW = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.json$/;
  const rawDir = 'data/library/raw';
  // Regular files only, never a link (VID-2026-016).
  const raws = existsSync(rawDir) ? readdirSync(rawDir, { withFileTypes: true }).filter((e) => e.isFile() && RAW.test(e.name)).map((e) => e.name).sort().reverse() : [];
  const history = raws.map((f) => {
    const m = f.match(RAW);
    const buf = readFileSync(join(rawDir, f));
    return { file: f, read_at: `${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`, bytes: buf.length, sha256_prefix: createHash('sha256').update(buf).digest('hex').slice(0, 16) };
  });
  let sync = {};
  try { sync = JSON.parse(readFileSync('data/library/sync.json', 'utf8')); } catch {}
  // Only an ISO time, normalised before it is shown or published (VID-2026-015).
  const lastOk = typeof sync.read_at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(sync.read_at) && !isNaN(new Date(sync.read_at)) ? new Date(sync.read_at).toISOString() : null;
  const SOURCES = [
    {
      id: 'library', name: "The library's catalogue (library.promptugal.news)",
      what: "Every item the library catalogues; we take its YouTube videos of the Web Summit Lisbon 2026 collection.",
      url: 'https://library.promptugal.news/api/v1/items/index.json',
      how: "Read by scripts/sync-library.mjs when videos.b@ wakes (every three hours, 07:00 to 22:00 Lisbon); the build reads the copy on disk.",
      licence: { name: "CC BY 4.0 for the library's records; each video under YouTube's terms", url: CCBY },
      use: `Its YouTube videos become cards and players here (${fromLibrary} new so far), and every video it also holds is linked to its call number. A video it withdraws comes off this site at the next build (${merged.withdrawn.length} so far).`,
      last_read: lastOk, history,
      threat_model: `${REPO}/blob/dev/docs/threat-models/sync-library.md`,
    },
    {
      id: 'coverage-record', name: "social.watch@'s record of the summit's coverage (the seed)",
      what: 'The videos found in the team\'s coverage sweeps of 10 November 2026, each checked then with YouTube\'s oEmbed.',
      url: data.evidence_base,
      how: 'Copied by hand once, on 18 November 2026, from that commit; not read again.',
      licence: { name: 'CC BY 4.0 (our own record); each video under its platform\'s terms', url: CCBY },
      use: `${videos.length - fromLibrary} videos, and the evidence for Day Two's cancellation.`,
      last_read: '2026-11-18T15:30:00Z', history: [],
      threat_model: `${REPO}/blob/dev/docs/threat-models/build-and-pages.md`,
    },
  ];
  const card = (s) => `<li class="src" id="${esc(s.id)}"><h4>${esc(s.name)}</h4>
<dl class="facts big"><dt>What</dt><dd>${esc(s.what)}</dd>
<dt>Where</dt><dd>${link(s.url, s.url)}</dd>
<dt>How often</dt><dd>${esc(s.how)}</dd>
<dt>Last read</dt><dd>${s.last_read ? esc(fmtStamp(s.last_read)) : 'not recorded'}${s.id === 'library' ? ' <span class="small">(from data/library/sync.json)</span>' : ''}</dd>
<dt>Licence</dt><dd>${link(s.licence.url, s.licence.name)}</dd>
<dt>What we do</dt><dd>${esc(s.use)}</dd>
<dt>History</dt><dd>${s.history.length ? `${s.history.length} read${s.history.length === 1 ? '' : 's'} kept as received (a new copy only when the answer changes): <ul class="small">${s.history.map((h) => `<li>${esc(fmtStamp(h.read_at))} · ${esc(String(h.bytes))} bytes · sha256 <code>${esc(h.sha256_prefix)}</code>…</li>`).join('')}</ul><span class="small">In <code>data/library/raw/</code> in ${link(REPO, 'the repository')}; the prefixes are computed from the files at build time.</span>` : 'One copy, made by hand; nothing to keep.'}</dd>
<dt>Risks</dt><dd>${link(s.threat_model, 'Its threat model')}</dd></dl></li>`;
  page({
    path: '/sources/', section: '/how/', title: 'The sources this site reads · PrompTugal.news Videos',
    description: 'Every source videos.promptugal.news reads: what, from where, how often, its licence, what we do with it, and every read kept.',
    body: `<p class="crumbs"><a href="/how/">How it works</a> › Sources</p><h1>The sources this site reads</h1>
<p class="standfirst">${SOURCES.length} sources. For each: what we read, where from, how often, under which licence, what we do with it, and the reads we keep. This page states facts from the files in our repository; nothing here is a proposal or a simulation.</p>
<p class="small">The videos themselves stay on their platforms; their channels are not sources we read, only where the videos are played. ${link('/api/v1/sources/index.json', 'This page as JSON')}.</p>
<ul class="srcs">${SOURCES.map(card).join('\n')}</ul>`,
    mdBody: SOURCES.map((s) => `## ${md(s.name)}\n\n- What: ${md(s.what)}\n- Where: <${mdUrl(s.url)}>\n- How often: ${md(s.how)}\n- Last read: ${s.last_read ? fmtStamp(s.last_read) : 'not recorded'}\n- Licence: ${md(s.licence.name)}\n- What we do: ${md(s.use)}\n- History: ${s.history.length ? s.history.map((h) => `${fmtStamp(h.read_at)}, ${h.bytes} bytes, sha256 ${h.sha256_prefix}`).join('; ') : 'one copy, made by hand'}`).join('\n\n'),
  });
  api('api/v1/sources/index.json', { about: 'The sources videos.promptugal.news reads, with every read kept (time, bytes, sha256 prefix computed at build time).', sources: SOURCES.map(({ history, ...s }) => ({ ...s, history: history.map(({ file, ...h }) => h) })), license_of_this_record: data.license_of_this_record });
}

// ---------------------------------------------------------------- /preview.svg: this site's own numbers, for the sites bar
// Dinis, 18 Nov 2026 ~22:00 UTC (Website board/guidance/2026-11-18-the-sites-bar.md): each site makes its preview at each build.
// Every figure is computed here from the same data as the pages; text is escaped; no external reference of any kind.
{
  const held = C.days.filter((d) => d.state !== 'cancelled');
  const withReplay = held.filter((d) => (d.replays || []).length).length;
  const channels = orgs.size;
  const fig = [
    [String(videos.length), 'videos, each in its own player'],
    [`${withReplay} of ${held.length}`, "days held with the organiser's replay"],
    [String(channels), 'channels that published them'],
    [String(playlists.length), 'playlists by kind, topic and organisation'],
  ];
  const stamp = fmtStamp(builtAt.toISOString());
  const x = (s) => esc(clean(s));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="t d">
<title id="t">PrompTugal.news Videos: ${x(`${videos.length} videos from Web Summit Lisbon 2026`)}</title>
<desc id="d">${x(fig.map(([n, l]) => `${n} ${l}`).join('; '))}. Day Two was cancelled by Storm Charles. Built ${x(stamp)} from data/videos.json and the library's catalogue; CC BY 4.0.</desc>
<rect width="1200" height="630" fill="#f6f3ec"/>
<rect x="0" y="0" width="1200" height="10" fill="#c52830"/>
<text x="60" y="95" font-family="Georgia, 'Times New Roman', serif" font-size="56" font-weight="600" fill="#121317">Promp<tspan fill="#c52830">T</tspan><tspan fill="#006600">ugal</tspan>.<tspan font-style="italic" font-weight="400">news</tspan><tspan font-family="Arial, sans-serif" font-size="34" font-weight="400" fill="#666860"> · Videos</tspan></text>
<text x="60" y="150" font-family="Arial, sans-serif" font-size="28" fill="#121317">${x(C.title)}: the replays by day, and the recordings others made</text>
${fig.map(([n, l], i) => { const cx = 60 + (i % 2) * 560, cy = 220 + Math.floor(i / 2) * 170; return `<rect x="${cx}" y="${cy}" width="520" height="140" fill="#fffdf8" stroke="#d8d4cb"/><rect x="${cx}" y="${cy}" width="520" height="6" fill="${i === 1 ? '#c52830' : '#006600'}"/><text x="${cx + 28}" y="${cy + 80}" font-family="Georgia, serif" font-size="60" font-weight="600" fill="#121317">${x(n)}</text><text x="${cx + 28}" y="${cy + 118}" font-family="Arial, sans-serif" font-size="22" fill="#666860">${x(l)}</text>`; }).join('\n')}
<text x="60" y="580" font-family="Arial, sans-serif" font-size="20" fill="#c52830">Day Two, 11 November: cancelled, Storm Charles</text>
<text x="60" y="608" font-family="monospace" font-size="16" fill="#666860">${x(`videos.promptugal.news · built ${stamp} · from data/videos.json and the library · CC BY 4.0`)}</text>
</svg>
`;
  writeFileSync('_site/preview.svg', svg);
  api('api/v1/preview.json', { about: 'The figures in /preview.svg and /preview.png, as computed at build time.', built: builtAt.toISOString(), version, figures: fig.map(([value, label]) => ({ value, label })), sources: ['data/videos.json', 'data/library/latest.json'], license_of_this_record: data.license_of_this_record });
}

// ---------------------------------------------------------------- security
const F = Array.isArray(findings.findings) ? findings.findings : [];
const SEV = ['critical', 'high', 'medium', 'low', 'info'];
page({
  path: '/security/', section: '', title: 'Security · PrompTugal.news Videos',
  description: 'Every security finding on videos.promptugal.news, published, and the threat models.',
  body: `<h1>Security</h1><p class="standfirst">Every vulnerability, bug and breach found on this site, ours included: a fixed one in full, an open one by title, severity and state until it is fixed.</p>
<p>The log for every PrompTugal.news site: ${link('https://promptugal.news/security/', 'promptugal.news/security/')}. Report one: ${link(`${REPO}/issues/new`, 'a GitHub issue')}, or privately through ${link('https://promptugal.news/report/', 'promptugal.news/report/')}.</p>
<section><h2>Findings</h2>${F.length ? `<ul class="srcs">${F.map((f) => { const open = f.state !== 'fixed'; const sev = SEV.includes(f.severity) ? f.severity : 'info'; return `<li class="src${open ? ' src-not' : ''}" id="${esc(slug(f.id))}"><p class="badge">${esc(f.id)} · ${esc(sev)} · ${esc(f.state)}</p><h4>${esc(clean(f.title))}</h4>${open ? '' : `<p>${esc(clean(f.detail))}</p><p><b>Fix:</b> ${esc(clean(f.fix))}${f.commit && /^[0-9a-f]{7,40}$/.test(f.commit) ? ` (${link(`${REPO}/commit/${f.commit}`, f.commit.slice(0, 7))})` : ''}</p>`}<p class="small">${esc(clean(f.file))} · found ${esc(clean(f.found))} by ${esc(clean(f.found_by))}</p></li>`; }).join('')}</ul>` : '<p class="none">None yet.</p>'}</section>
<section><h2>Threat models</h2>${modelLinks.length ? `<ul>${modelLinks.map((l) => `<li>${l}</li>`).join('')}</ul>` : '<p class="none">None yet.</p>'}</section>`,
  mdBody: `${F.map((f) => `- ${md(f.id)} (${md(f.severity)}, ${md(f.state)}): ${md(f.title)}`).join('\n') || 'No findings yet.'}\n\nThreat models: ${models.join(', ') || 'none yet'}.`,
});

// ---------------------------------------------------------------- the API
api(`api/v1/collections/${C.id}.json`, { ...C, videos: videos.filter((v) => v.collection === C.id).map((v) => ({ id: v.id, title: clean(v.title), json: `${SITE}/api/v1/videos/${v.id}.json` })), evidence: data.evidence_base, license_of_this_record: data.license_of_this_record });
api('api/v1/collections/index.json', { collections: collections.map((c) => ({ id: c.id, title: c.title, json: `${SITE}/api/v1/collections/${c.id}.json` })) });
api('api/v1/videos/index.json', { about: data.about, updated: data.updated, platforms: PLATFORMS, count: videos.length, videos: videos.map((v) => ({ id: v.id, title: clean(v.title), channel: clean(v.channel.name), kind: v.kind, day: v.day, published: v.published.date, license: licOf(v), json: `${SITE}/api/v1/videos/${v.id}.json`, page: `${SITE}/videos/${v.id}/` })), license_of_this_record: data.license_of_this_record });
api('api/v1/playlists/index.json', { playlists: playlists.map((p) => ({ kind: p.kind, id: p.id, title: p.title, count: p.ids.length, json: `${SITE}/api/v1/playlists/${p.kind}/${p.id}.json` })), license_of_this_record: data.license_of_this_record });
// An open finding is published as its id, title, severity and state only, until it is fixed (VID-2026-001).
api('api/v1/security/findings.json', { ...findings, findings: F.map((f) => f.state === 'fixed' ? f : { id: f.id, title: f.title, severity: f.severity, state: f.state, found: f.found }) });
const ENDPOINTS = [['/api/openapi.json', 'the OpenAPI description of this API'], ['/api/v1/sources/index.json', 'the sources this site reads, with every read kept'], ['/api/v1/videos/index.json', 'every video, short'], ['/api/v1/videos/<id>.json', 'one video: its whole card'], ['/api/v1/collections/index.json', 'the collections'], [`/api/v1/collections/${C.id}.json`, 'the collection with its days'], ['/api/v1/playlists/index.json', 'every playlist'], ['/api/v1/playlists/<kind>/<id>.json', 'one playlist'], ['/api/v1/security/findings.json', 'the security findings']];
page({
  path: '/api/', section: '/api/', title: 'The data · PrompTugal.news Videos',
  description: 'Every page here is built from JSON first; the JSON is published, under CC BY 4.0.',
  body: `<h1>The data</h1><p class="standfirst">Every page is built from JSON, and the JSON is here: our records under ${link(CCBY, 'CC BY 4.0')}, each video under its platform's terms (linked in its record).</p>
<table><thead><tr><th scope="col">Endpoint</th><th scope="col">What</th></tr></thead><tbody>${ENDPOINTS.map(([u, t]) => `<tr><td><code>${u.includes('<') ? esc(u) : link(u, u)}</code></td><td>${esc(t)}</td></tr>`).join('')}</tbody></table>
<p class="small">Static files, rebuilt on every push to <code>dev</code>. The source is <code>data/videos.json</code> in ${link(REPO, 'the repository')}.</p>`,
  mdBody: ENDPOINTS.map(([u, t]) => `- ${u}: ${t}`).join('\n'),
});

// ---------------------------------------------------------------- 404, llms.txt, version
page({ path: '/404/', section: '', title: 'Not found · PrompTugal.news Videos', description: 'This page does not exist.', body: `<h1>Not found</h1><p>This page does not exist. ${link('/', 'The videos')} · ${link('/videos/', 'every video')}.</p>`, mdBody: 'This page does not exist.' });
cpSync('_site/404/index.html', '_site/404.html');
writeFileSync('_site/llms.txt', `# PrompTugal.news Videos\n\n> Videos about what PrompTugal.news covers, played in each platform's own player; every page has a markdown twin (index.md) and the data is JSON under /api/v1/. Our text: CC BY 4.0; each video: its platform's terms.\n\n${pages.map((p) => `- [${md(p.title)}](${SITE}${p.path}index.md): ${md(p.description)}`).join('\n')}\n`);
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk('_site')) {
  if (!/\.(html|js|css|json|md|txt)$/.test(f)) continue;
  const s = readFileSync(f, 'utf8');
  if (s.includes('__VERSION__')) writeFileSync(f, s.replaceAll('__VERSION__', version));
}
writeFileSync('_site/version.json', JSON.stringify({ version, commit: process.env.GITHUB_SHA || 'local', built: builtAt.toISOString() }, null, 2) + '\n');
writeFileSync('_site/.nojekyll', '');
console.log(`built _site/ (${version}): ${pages.length} pages, ${videos.length} videos, ${playlists.length} playlists`);
