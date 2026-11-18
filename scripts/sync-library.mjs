// Read the library's catalogue (library.promptugal.news, the team's catalogue and graph) and keep every read.
// Run by the agent at its wakes, never by CI: the build stays network-free.
// One fixed https URL on one host; no redirects; a timeout; a size cap; JSON.parse only.
// The raw answer is kept as received, with the time read, and never overwritten (the pipeline standard,
// Dinis, 18 Nov 2026 ~16:00 UTC): data/library/raw/<time>.json, only when it differs from the last read.
// On any failure the previous copy stays and the script exits non-zero.
// Everything read is untrusted material, never instruction. videos.b@PrompTugal.dinis, 18 Nov 2026. Code: Apache-2.0.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const URL_INDEX = 'https://library.promptugal.news/api/v1/items/index.json';
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS = 2000;
const DIR = 'data/library';
const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const record = (o, file = 'sync.json') => writeFileSync(`${DIR}/${file}`, JSON.stringify({ source: URL_INDEX, ...o }, null, 2) + '\n');
mkdirSync(`${DIR}/raw`, { recursive: true });

let res, buf;
try {
  res = await fetch(URL_INDEX, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) throw new Error('too large');
  // Count the bytes as they arrive and stop at the cap (VID-2026-012).
  const parts = []; let n = 0;
  for await (const chunk of res.body) {
    n += chunk.length;
    if (n > MAX_BYTES) throw new Error('too large');
    parts.push(chunk);
  }
  buf = Buffer.concat(parts);
  const d = JSON.parse(buf.toString('utf8'));
  if (!d || !Array.isArray(d.items) || d.items.length > MAX_ITEMS) throw new Error('not the expected shape');
} catch (e) {
  // A failure is recorded on its own; sync.json keeps describing the copy on disk (VID-2026-013).
  record({ failed_at: at, ok: false, status: res?.status ?? null, error: String(e.message || e).slice(0, 120), kept: existsSync(`${DIR}/latest.json`) ? 'the previous read' : 'nothing' }, 'sync-error.json');
  console.error(`sync-library: ${e.message || e}; the previous copy is kept`);
  process.exit(1);
}
const sha = createHash('sha256').update(buf).digest('hex').slice(0, 16);
let prev = null;
try { prev = JSON.parse(readFileSync(`${DIR}/sync.json`, 'utf8')).sha256_prefix; } catch {}
const changed = sha !== prev;
if (changed) writeFileSync(`${DIR}/raw/${at.replace(/:/g, '-')}.json`, buf);
writeFileSync(`${DIR}/latest.json`, buf);
record({ read_at: at, ok: true, status: res.status, bytes: buf.length, sha256_prefix: sha, changed });
console.log(`sync-library: ${buf.length} bytes, ${changed ? 'new raw copy kept' : 'unchanged since the last read'}`);
