// Gate: fails the build on any problem. Never weaken a check to get a release out.
// From scripts/validate.mjs in the site repositories made by sites@AgentiCCells.dinis
// (2026-11-16); factory@ added the hub.json fields, the description check and the
// placeholder check (a seeded site must hold no __SITE_*__ placeholder).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const problems = [];
const fail = m => problems.push(m);
const hype = /\b(revolutionary|cutting[- ]edge|seamless(?:ly)?|world[- ]class|game[- ]changing)\b/i;
const isTemplate = existsSync('.factory-template');
// The sites bar (videos.b@, 19 Nov 2026): worked out here on its own from the stored registry copy, not taken from the build.
// On when the copy lists the one version vendored under src/assets/sites-bar/; then the other *.promptugal.news hosts,
// sorted, join img-src and connect-src; off, the CSP is exactly as before, so a build that drops the bar cannot widen it.
const BAR_VERSIONS = existsSync('src/assets/sites-bar') ? readdirSync('src/assets/sites-bar') : [];
let barHosts = null;
try {
  const reg = JSON.parse(readFileSync('data/sites/latest.json', 'utf8'));
  if (BAR_VERSIONS.length === 1 && Array.isArray(reg.bar?.listed) && reg.bar.listed.includes(BAR_VERSIONS[0])) {
    barHosts = [...new Set(reg.sites.map((s) => new URL(s.url).hostname))].filter((h) => /^(?:[a-z0-9-]+\.)*promptugal\.news$/.test(h) && h !== 'videos.promptugal.news').sort().slice(0, 32);
    if (new URL(reg.sites[0].url).hostname !== 'promptugal.news') fail('data/sites/latest.json: promptugal.news is not first');
  }
} catch { barHosts = null; }
// The served bar files must be the vendored bytes the stored pin names, version 1.2.1 only (VID-2026-024).
if (barHosts) {
  const reg = JSON.parse(readFileSync('data/sites/latest.json', 'utf8'));
  const integ = reg.bar?.versions?.[BAR_VERSIONS[0]]?.integrity || {};
  if (BAR_VERSIONS[0] !== '1.2.1') fail(`src/assets/sites-bar/${BAR_VERSIONS[0]}: not the version the build uses (1.2.1)`);
  for (const [k, f] of [['js', 'sites-bar.js'], ['css', 'sites-bar.css'], ['render', 'sites-bar-render.mjs']]) {
    const p = `_site/assets/sites-bar/${BAR_VERSIONS[0]}/${f}`;
    if (!existsSync(p) || 'sha256-' + createHash('sha256').update(readFileSync(p)).digest('base64') !== integ[k]) fail(`${p}: does not match the stored pin`);
  }
}
if (BAR_VERSIONS.length > 1) fail(`src/assets/sites-bar/: more than one version vendored (${BAR_VERSIONS.join(', ')})`);
const B = barHosts ? barHosts.map((h) => ` https://${h}`).join('') : '';
const EXPECTED_CSP = `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https://i.ytimg.com${B}; frame-src https://www.youtube-nocookie.com; connect-src 'self'${B}; base-uri 'none'; form-action 'none'; object-src 'none'`;
const THUMB = /^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/(?:mq|hq)default\.jpg$/;
if (!existsSync('_site')) { console.error('FAILED: _site/ is not built: run node scripts/build.mjs'); process.exit(1); }
const files = walk('_site');
for (const f of [...files, 'hub.json', 'README.md']) {
  if (!existsSync(f) || !/\.(html|js|css|json|md)$/.test(f)) continue;
  const s = readFileSync(f, 'utf8');
  s.split('\n').forEach((line, i) => {
    if (line.includes('—')) fail(`${f}:${i + 1}: em dash`);
    const m = line.match(hype); if (m) fail(`${f}:${i + 1}: hype word "${m[0]}"`);
    if (!isTemplate && /__SITE_[A-Z]+__/.test(line)) fail(`${f}:${i + 1}: template placeholder left in a seeded site`);
  });
  if (f.endsWith('.html')) {
    // YouTube's preview images (videos.b@, 19 Nov 2026; security pre-review of that wake): the CSP is exactly ours,
    // images come only from this site or YouTube's thumbnail path for a checked id, each with no referrer,
    // the credit stands wherever one is shown, and no inline handler appears anywhere.
    const csp = ((s.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    if (csp !== EXPECTED_CSP) fail(`${f}: Content-Security-Policy is not the expected one`);
    let ytImages = 0;
    // Every image tag must carry its src in double quotes and no srcset; picture and source are not used (VID-2026-019).
    if (/<(?:picture|source)\b|\ssrcset\s*=/i.test(s)) fail(`${f}: picture, source or srcset (images must be plain checked img tags)`);
    for (const m of s.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0], src = (tag.match(/\ssrc="([^"]*)"/) || [])[1] || '';
      if (!src || /\ssrc\s*=\s*(?!")/i.test(tag) || /'/.test(tag)) { fail(`${f}: an image whose src is missing, unquoted or single-quoted`); continue; }
      if (/^(https?:)?\/\//.test(src)) {
        if (!THUMB.test(src)) { fail(`${f}: outside image ${src.slice(0, 80)}`); continue; }
        ytImages++;
        if (!/\sreferrerpolicy="no-referrer"/.test(tag)) fail(`${f}: a YouTube image without referrerpolicy="no-referrer"`);
      }
      for (const k of ['alt', 'width', 'height']) if (!new RegExp(`\\s${k}="`).test(tag)) fail(`${f}: an image without ${k}`);
    }
    // One credit per YouTube image: each player and each card carries its own (VID-2026-019).
    const credits = (s.match(/the preview image comes from YouTube/gi) || []).length;
    if (credits < ytImages) fail(`${f}: ${ytImages} YouTube images but ${credits} credits`);
    for (const m of s.matchAll(/\sdata-yt="([^"]*)"/g)) if (!/^[A-Za-z0-9_-]{11}$/.test(m[1])) fail(`${f}: bad data-yt`);
    if (/<[^>]*\son[a-z]+\s*=/i.test(s)) fail(`${f}: inline event handler`);
    // The bar: exactly once, first thing in body, promptugal.news its first link, its own files from this site only.
    const bars = (s.match(/<nav class="ptsb"/g) || []).length;
    if (barHosts) {
      if (bars !== 1 || !/<body>\n<nav class="ptsb"/.test(s)) fail(`${f}: the sites bar is not once and first in body`);
      if (!/<nav class="ptsb"[^>]*><div class="ptsb-w"><span class="ptsb-mark">[\s\S]*?<ul><li><a href="https:\/\/promptugal\.news\/"/.test(s)) fail(`${f}: promptugal.news is not the bar's first link`);
      if (!s.includes(`<script defer src="/assets/sites-bar/${BAR_VERSIONS[0]}/sites-bar.js"></script>`)) fail(`${f}: the bar's script is missing or not deferred`);
      const nav = (s.match(/<nav class="ptsb"[\s\S]*?<\/nav>/) || [''])[0];
      for (const m of nav.matchAll(/\shref="([^"]*)"/g)) { let u; try { u = new URL(m[1]); } catch { u = null; } if (!u || u.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)*promptugal\.news$/.test(u.hostname) || u.port || u.username) fail(`${f}: a sites bar link outside https *.promptugal.news`); }
    } else if (bars) fail(`${f}: a sites bar although the stored registry does not list our version`);
    if (/until you press play|nothing (?:is )?(?:loaded|loads|requested)[^.<]{0,60}until/i.test(s)) fail(`${f}: says nothing loads until play, which the preview image makes untrue`);
    if (!/<title>[^<]+<\/title>/.test(s)) fail(`${f}: no <title>`);
    if (!/<meta name="description" content="[^"]+"/.test(s)) fail(`${f}: no description`);
    if (!/<html lang="/.test(s)) fail(`${f}: no lang on <html>`);
    for (const m of s.matchAll(/<script[^>]+src="([^"]+)"/g)) if (/^(https?:)?\/\//.test(m[1])) fail(`${f}: third-party script ${m[1]}`);
    for (const m of s.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) if (/^(https?:)?\/\//.test(m[1])) fail(`${f}: third-party stylesheet ${m[1]}`);
    for (const m of s.matchAll(/(?:href|src)="([^"#?]+)/g)) {
      const u = m[1]; if (/^(https?:|mailto:|data:|\/\/)/.test(u)) continue;
      const target = u.startsWith('/') ? join('_site', u) : join(dirname(f), u);
      if (!existsSync(target) && !existsSync(join(target, 'index.html'))) fail(`${f}: broken link ${u}`);
    }
  }
}
if (!existsSync('_site/version.json')) fail('no version.json');
if (!existsSync('_site/index.html')) fail('no index.html');
try {
  const h = JSON.parse(readFileSync('hub.json', 'utf8'));
  for (const k of ['name', 'what_it_does', 'owner', 'repository', 'live_address', 'version_from']) if (typeof h[k] !== 'string' || !h[k].trim()) fail(`hub.json: ${k} must be a non-empty string`);
  if (h.version_from !== `${h.live_address}/version.json`) fail(`hub.json: version_from must be ${h.live_address}/version.json (the hub copies it verbatim)`);
  if (h.owner !== 'AgentiCCells') fail('hub.json: owner must be AgentiCCells');
  if (!h.licence || h.licence.code !== 'Apache-2.0' || h.licence.text !== 'CC BY 4.0') fail('hub.json: licence must be code Apache-2.0, text CC BY 4.0');
} catch (e) { fail(`hub.json is missing or not JSON (${e.message})`); }
// No image may come in through the stylesheets: the site's CSS uses no url() at all (VID-2026-019).
for (const f of files.filter((x) => x.endsWith('.css'))) if (/url\s*\(|@import|image-set/i.test(readFileSync(f, 'utf8'))) fail(`${f}: url() or @import in a stylesheet`);
// Our preview image, shown by other sites' bars as an img: no script, foreignObject, event attribute or outside reference (the sites bar spec, point 5).
for (const f of ['src/preview.svg', '_site/preview.svg'].filter((x) => existsSync(x))) {
  const v = readFileSync(f, 'utf8');
  if (/<script|<foreignObject|[\s/]on[a-z]+\s*=|image-set|(?:xlink:)?href\s*=\s*["'](?!#)|url\s*\(\s*["']?(?!#)|@import/i.test(v)) fail(`${f}: a script, foreignObject, event attribute or outside reference`);
}
if (problems.length) { console.error(problems.join('\n')); console.error(`FAILED: ${problems.length} problem(s)`); process.exit(1); }
console.log(`OK${isTemplate ? ' (template)' : ''}`);
