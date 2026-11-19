// No symbolic links (security@'s control 10, 19 Nov 2026), unless listed with a reason in scripts/link-exceptions.json as it
// stands in the anchor A's tree. Usage, from the repository root: node <a trusted copy of this file> <A> <AFTER> [<site dir>]
// Refused, unless listed: any entry whose mode is a link (or a gitlink) that is added or changed in any commit of A..AFTER,
// merges included (diff-tree -m), even if a later commit removes it; any such entry in AFTER's own tree; any link in the
// checkout. A gitlink (a submodule) can never be an exception. In the built site no link, FIFO, device or unreadable folder
// is allowed at all; in the checkout special files are refused too, except inside its own .git. Paths and targets are compared as
// raw bytes (the exceptions hold them as hex), never line by line (events.b@'s 44d5402; library.b@'s LIB-2026-069). Names
// are printed hex-escaped to stderr, so a file name cannot speak to the CI log. Node built-ins only.
// videos.b@PrompTugal.dinis, 19 Nov 2026, after this wake's security pre-review. Code: Apache-2.0.
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readlinkSync } from 'node:fs';

process.env.GIT_NO_REPLACE_OBJECTS = '1';
const HEX40 = /^[0-9a-f]{40}$/;
const [A, AFTER, SITE] = process.argv.slice(2);
const fail = (m) => { console.error(`check-links: ${m}: refusing`); process.exit(1); };
if (!HEX40.test(A || '') || !HEX40.test(AFTER || '')) fail('A and AFTER must be full commit ids');
const git = (...a) => execFileSync('git', ['-c', 'diff.renames=false', '-c', 'core.quotePath=true', ...a], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
const show = (b) => JSON.stringify(b.toString('hex'));
const isLinkMode = (m) => { const n = parseInt(m, 8); return Number.isFinite(n) && ((n & 0o170000) === 0o120000 || (n & 0o170000) === 0o160000); };

// The exceptions, from A only: a plain file (mode 100644) holding [{path_hex, target_hex, reason}], strictly. Missing: none.
const exceptions = (() => {
  const entry = git('ls-tree', '-z', A, '--', 'scripts/link-exceptions.json').toString('latin1').split('\0').filter(Boolean);
  if (!entry.length) return [];
  if (entry.length !== 1 || !/^100644 blob [0-9a-f]{40}\tscripts\/link-exceptions\.json$/.test(entry[0])) fail('the exceptions file at A is not a plain file');
  let list; try { list = JSON.parse(git('cat-file', 'blob', entry[0].split(' ')[2].split('\t')[0]).toString('utf8')); } catch { fail('the exceptions file at A is not JSON'); }
  if (!Array.isArray(list)) fail('the exceptions file at A is not a list');
  const seen = new Set();
  return list.map((x) => {
    if (!x || typeof x !== 'object' || Object.keys(x).sort().join() !== 'path_hex,reason,target_hex') fail('an exception needs exactly path_hex, target_hex and reason');
    if (!/^(?:[0-9a-f]{2})+$/.test(x.path_hex) || !/^(?:[0-9a-f]{2})+$/.test(x.target_hex) || typeof x.reason !== 'string' || !x.reason.trim()) fail('a malformed exception');
    if (seen.has(x.path_hex)) fail('an exception listed twice');
    seen.add(x.path_hex);
    return { path: Buffer.from(x.path_hex, 'hex'), target: Buffer.from(x.target_hex, 'hex') };
  });
})();
const allowed = (path, target) => exceptions.some((e) => e.path.equals(path) && target && e.target.equals(target));
const problems = [];
const blob = (id) => git('cat-file', 'blob', id);

// (1) Every commit in A..AFTER, each parent of a merge too.
for (const c of git('rev-list', `${A}..${AFTER}`).toString('latin1').split('\n').filter(Boolean)) {
  if (!HEX40.test(c)) fail('rev-list gave something that is not a commit id');
  const parts = git('diff-tree', '-r', '-m', '--root', '-z', '--raw', '--no-renames', '--no-commit-id', c).toString('latin1').split('\0');
  for (let i = 0; i < parts.length; i++) {
    const meta = parts[i];
    if (!meta.startsWith(':')) continue;
    const f = meta.slice(1).split(' ');   // old mode, new mode, old id, new id, status
    const path = Buffer.from(parts[++i] || '', 'latin1');
    if (f.length < 5 || !isLinkMode(f[1]) || /^0+$/.test(f[3])) continue;
    const target = (parseInt(f[1], 8) & 0o170000) === 0o120000 ? blob(f[3]) : null;
    if (!allowed(path, target)) problems.push(`commit ${c.slice(0, 12)} adds or changes a link or gitlink at ${show(path)}`);
  }
}
// (2) AFTER's own tree.
for (const e of git('ls-tree', '-r', '-z', '--full-tree', AFTER).toString('latin1').split('\0').filter(Boolean)) {
  const tab = e.indexOf('\t'); const [mode, , id] = e.slice(0, tab).split(' ');
  if (!isLinkMode(mode)) continue;
  const path = Buffer.from(e.slice(tab + 1), 'latin1');
  if (!allowed(path, (parseInt(mode, 8) & 0o170000) === 0o120000 ? blob(id) : null)) problems.push(`AFTER's tree holds a link or gitlink at ${show(path)}`);
}
// (3) The checkout and (4) the built site, walked with lstat, by raw bytes, nothing pruned, nothing followed.
const SLASH = Buffer.from('/'), GITDIR = Buffer.from('.git');
function walk(dir, rel, inSite) {
  let names;
  try { names = readdirSync(dir, { encoding: 'buffer' }); } catch { problems.push(`cannot read the folder ${show(rel)}`); return; }
  for (const n of names) {
    const full = Buffer.concat([dir, SLASH, n]), r = rel.length ? Buffer.concat([rel, SLASH, n]) : n;
    let s; try { s = lstatSync(full); } catch { problems.push(`cannot read ${show(r)}`); continue; }
    if (s.isSymbolicLink()) {
      if (inSite || !allowed(r, readlinkSync(full, { encoding: 'buffer' }))) problems.push(`${inSite ? 'the built site' : 'the checkout'} holds a link at ${show(r)}`);
    } else if (s.isDirectory()) walk(full, r, inSite);
    // git may keep sockets inside the checkout's own .git (fsmonitor); special files are allowed there only, links never
    else if (!s.isFile() && !(!inSite && (r.equals(GITDIR) || r.subarray(0, GITDIR.length + 1).equals(Buffer.concat([GITDIR, SLASH]))))) problems.push(`a special file (not a file, folder or link) at ${show(r)}`);
  }
}
walk(Buffer.from('.'), Buffer.alloc(0), false);
if (SITE) walk(Buffer.from(SITE), Buffer.alloc(0), true);
if (problems.length) { console.error(`check-links: ${problems.length} problem(s)\n` + problems.join('\n')); process.exit(1); }
console.log(`OK (no links; ${exceptions.length} exception(s) at the anchor)`);
