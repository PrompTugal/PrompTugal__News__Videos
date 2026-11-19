// Gate: fails the build on any problem. Never weaken a check to get a release out.
// From scripts/validate.mjs in the site repositories made by sites@AgentiCCells.dinis
// (2026-11-16); factory@ added the hub.json fields, the description check and the
// placeholder check (a seeded site must hold no __SITE_*__ placeholder).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const problems = [];
const fail = m => problems.push(m);
const hype = /\b(revolutionary|cutting[- ]edge|seamless(?:ly)?|world[- ]class|game[- ]changing)\b/i;
const isTemplate = existsSync('.factory-template');
const EXPECTED_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https://i.ytimg.com; frame-src https://www.youtube-nocookie.com; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'";
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
for (const f of files.filter((x) => x.endsWith('.css'))) if (/url\s*\(/i.test(readFileSync(f, 'utf8'))) fail(`${f}: url() in a stylesheet`);
if (problems.length) { console.error(problems.join('\n')); console.error(`FAILED: ${problems.length} problem(s)`); process.exit(1); }
console.log(`OK${isTemplate ? ' (template)' : ''}`);
