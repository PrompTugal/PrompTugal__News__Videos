// Tests for scripts/check-links.mjs (security@'s control 10), in throwaway repositories. Each failing case asserts its reason.
// videos.b@PrompTugal.dinis, 19 Nov 2026. Code: Apache-2.0.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'check-links.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'linktest-'));
const results = [];
const hex = (s) => Buffer.from(s).toString('hex');
function repo(name) {
  const d = join(tmp, name); mkdirSync(d);
  const g = (...a) => execFileSync('git', a, { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  g('init', '-q', '-b', 'main'); g('config', 'user.name', 't'); g('config', 'user.email', 't@example.test'); g('config', 'commit.gpgsign', 'false');
  const commit = (msg) => { g('add', '-A'); g('commit', '-q', '--allow-empty', '-m', msg); return g('rev-parse', 'HEAD'); };
  const file = (p, c) => { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), c); };
  const link = (p, t) => { mkdirSync(dirname(join(d, p)), { recursive: true }); symlinkSync(t, join(d, p)); };
  const check = (a, b, site) => spawnSync('node', [CHECK, a, b, ...(site ? [site] : [])], { cwd: d, encoding: 'utf8' });
  file('README', 'x');
  const base = commit('base');
  return { d, g, commit, file, link, check, base };
}
const expect = (name, r, ok, why) => {
  const out = (r.stdout + r.stderr);
  results.push({ name, pass: (r.status === 0) === ok && (!why || out.includes(why)), out: out.trim().split('\n').slice(0, 2).join(' | ') });
};
const exc = (...e) => JSON.stringify(e.map(([p, t]) => ({ path_hex: hex(p), target_hex: hex(t), reason: 'a test' })));

{ const r = repo('clean'); r.file('a.txt', '1'); const h = r.commit('a file'); expect('no links passes', r.check(r.base, h), true); }
{ const r = repo('pushed'); r.link('l', 'README'); const h = r.commit('a link'); expect('a pushed link fails', r.check(r.base, h), false, 'adds or changes a link'); }
{ const r = repo('listed'); r.file('scripts/link-exceptions.json', exc(['l', 'README'])); r.link('l', 'README'); const a = r.commit('listed link at A'); r.file('b.txt', '1'); const h = r.commit('later');
  expect('a link listed at A passes', r.check(a, h), true); }
{ const r = repo('pushedlist'); r.file('scripts/link-exceptions.json', exc(['l', 'README'])); r.link('l', 'README'); const h = r.commit('lists its own link');
  expect('a link listed only in the pushed tree fails', r.check(r.base, h), false, 'adds or changes a link'); }
{ const r = repo('merge'); r.g('checkout', '-q', '-b', 'side'); r.file('s.txt', '1'); r.commit('side'); r.g('checkout', '-q', 'main'); r.file('m.txt', '1'); r.commit('main');
  r.g('merge', '-q', '--no-ff', '--no-commit', 'side'); r.link('l', 'README'); r.g('add', '-A'); r.g('commit', '-q', '-m', 'merge with a link'); const h = r.g('rev-parse', 'HEAD'); unlinkSync(join(r.d, 'l'));
  expect('a link added in a merge commit fails', r.check(r.base, h), false, 'adds or changes a link'); }
{ const r = repo('addremove'); r.link('l', 'README'); r.commit('add'); unlinkSync(join(r.d, 'l')); const h = r.commit('remove');
  expect('a link added and removed inside the range fails', r.check(r.base, h), false, 'adds or changes a link'); }
{ const r = repo('newline'); r.file('scripts/link-exceptions.json', exc(['x', 'README'])); const a = r.commit('lists x'); r.link('x\nevil', 'README'); const h = r.commit('a newline name');
  expect('a name of "<listed>\\nevil" fails', r.check(a, h), false, 'adds or changes a link'); }
{ const r = repo('repoint'); r.file('scripts/link-exceptions.json', exc(['l', 'README'])); r.link('l', 'README'); const a = r.commit('listed'); unlinkSync(join(r.d, 'l')); r.link('l', '/etc/passwd'); const h = r.commit('re-pointed');
  expect('a listed link pointed elsewhere fails', r.check(a, h), false, 'adds or changes a link'); }
{ const r = repo('mode'); const blob = r.g('hash-object', '-w', join(r.d, 'README')); const tree = execFileSync('git', ['mktree'], { cwd: r.d, input: `120755 blob ${blob}\tweird\n100644 blob ${blob}\tREADME\n`, encoding: 'utf8' }).trim();
  const h = r.g('commit-tree', tree, '-p', r.base, '-m', 'odd link mode'); expect('a link written with mode 120755 fails', r.check(r.base, h), false, 'adds or changes a link'); }
{ const r = repo('excfile'); r.link('scripts/link-exceptions.json', '../README'); const a = r.commit('exceptions file as a link'); r.file('b.txt', '1'); const h = r.commit('later');
  expect('an exceptions file that is a link at A refuses', r.check(a, h), false, 'not a plain file'); }
{ const r = repo('dup'); r.file('scripts/link-exceptions.json', exc(['l', 'README'], ['l', 'README'])); const a = r.commit('duplicated'); const h = r.commit('later');
  expect('an exception listed twice refuses', r.check(a, h), false, 'listed twice'); }
{ const r = repo('nonutf8'); const name = Buffer.from([0x6e, 0xe9, 0x6c]); r.file('scripts/link-exceptions.json', JSON.stringify([{ path_hex: name.toString('hex'), target_hex: hex('README'), reason: 'a test' }]));
  symlinkSync('README', Buffer.concat([Buffer.from(r.d + '/'), name])); const a = r.commit('a listed non-UTF-8 name'); r.file('b.txt', '1'); const h = r.commit('later');
  expect('a non-UTF-8 name listed by its bytes passes', r.check(a, h), true);
  symlinkSync('README', Buffer.concat([Buffer.from(r.d + '/'), Buffer.from([0x6e, 0xe8, 0x6c])])); const h2 = r.commit('a near miss');
  expect('a near-miss non-UTF-8 name fails', r.check(a, h2), false, 'adds or changes a link'); }
{ const r = repo('inject'); r.link('x\n::stop-commands::tok', 'README'); const h = r.commit('injection');
  const res = r.check(r.base, h); expect('a name cannot speak to the CI log (printed as hex)', res, false, hex('x\n::stop-commands::tok')); if (res.stdout.includes('::stop-commands::') || res.stderr.includes('::stop-commands::')) results.push({ name: 'no raw name in the output', pass: false, out: 'raw name printed' }); }
{ const r = repo('renames'); r.g('config', 'diff.renames', 'copies'); r.file('a', 'same'); r.commit('a'); unlinkSync(join(r.d, 'a')); r.link('a2', 'README'); const h = r.commit('rename to a link');
  expect('a repository diff.renames setting does not hide a link', r.check(r.base, h), false, 'adds or changes a link'); }
{ const r = repo('sitegit'); const h = r.commit('nothing'); mkdirSync(join(r.d, 'site')); symlinkSync('/tmp', join(r.d, 'site', '.git'));
  expect('a .git link in the built site fails (nothing pruned)', r.check(r.base, h, 'site'), false, 'the built site holds a link'); }
{ const r = repo('sitedir'); const h = r.commit('nothing'); mkdirSync(join(r.d, 'site/a'), { recursive: true }); symlinkSync('/etc', join(r.d, 'site', 'a', 'd'));
  expect('a folder link in the built site fails and is not followed', r.check(r.base, h, 'site'), false, 'the built site holds a link'); }
{ const r = repo('fifo'); const h = r.commit('nothing'); mkdirSync(join(r.d, 'site')); execFileSync('mkfifo', [join(r.d, 'site', 'p')]);
  expect('a FIFO in the built site fails', r.check(r.base, h, 'site'), false, 'a special file'); }
{ const r = repo('sitelisted'); r.file('scripts/link-exceptions.json', exc(['site/l', 'README'])); const a = r.commit('lists a site path'); mkdirSync(join(r.d, 'site')); symlinkSync('README', join(r.d, 'site', 'l'));
  const res = spawnSync('node', [CHECK, a, a, 'site'], { cwd: r.d, encoding: 'utf8' }); expect('the built site allows no exception', res, false, 'the built site holds a link'); }

{ const r = repo('treelayer'); r.link('l', 'README'); const a = r.commit('an unlisted link already at A'); r.file('b.txt', '1'); const h = r.commit('later');
  expect('an unlisted link already in the tree fails (the tree layer)', r.check(a, h), false, "AFTER's tree holds a link"); }
{ const r = repo('checkoutlayer'); const h = r.commit('nothing'); symlinkSync('README', join(r.d, 'untracked-link'));
  expect('an untracked link in the checkout fails (the checkout layer)', r.check(r.base, h), false, 'the checkout holds a link'); }
{ const r = repo('gitlink'); const tree = execFileSync('git', ['mktree'], { cwd: r.d, input: `160000 commit ${r.base}\tsub\n`, encoding: 'utf8' }).trim();
  const h = r.g('commit-tree', tree, '-p', r.base, '-m', 'a submodule'); expect('a gitlink (submodule) fails', r.check(r.base, h), false, 'adds or changes a link or gitlink'); }
{ const r = repo('inrange'); r.file('scripts/link-exceptions.json', exc(['l', 'README'])); const a = r.commit('lists l at A'); r.link('l', 'README'); const h = r.commit('adds the listed link');
  expect('a link listed at A and added in the range passes', r.check(a, h), true); }
rmSync(tmp, { recursive: true, force: true });
const bad = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'pass' : 'FAIL'}  ${r.name}${r.pass ? '' : `  [${r.out}]`}`);
if (bad.length) { console.error(`test-check-links: ${bad.length} of ${results.length} failed`); process.exit(1); }
console.log(`OK (${results.length} cases)`);
