import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../scripts/build-site.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'luxraj-shell-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'site');
  const output = path.join(dir, '_site');
  await cp(fileURLToPath(new URL('../site/', import.meta.url)), source, { recursive: true });
  await rm(path.join(source, 'applications'), { recursive: true, force: true });
  await mkdir(path.join(source, 'applications'));
  return { source, output };
}
test('empty shell works without applications', async t => {
  const f = await fixture(t);
  assert.equal(await buildSite(f), 0);
  assert.match(await readFile(path.join(f.output, 'index.html'), 'utf8'), /No applications yet/);
  assert.equal(await readFile(path.join(f.output, '.nojekyll'), 'utf8'), '');
});
test('discovers nested HTML, preserves files and generates navigation; removes stale pages', async t => {
  const f = await fixture(t);
  const dir = path.join(f.source, 'applications', 'nested folder');
  await mkdir(dir);
  const original = '<!doctype html><html><head><title>A &amp; B &lt;test&gt;</title><style>body{color:red}</style></head><body><script>window.test=1</script></body></html>';
  await writeFile(path.join(dir, 'tool #1.html'), original);
  await writeFile(path.join(dir, 'data.json'), '{"test":true}');
  await writeFile(path.join(f.source, 'applications', 'second-tool.htm'), '<html><body>Second</body></html>');
  assert.equal(await buildSite(f), 2);
  const index = await readFile(path.join(f.output, 'index.html'), 'utf8');
  assert.match(index, /\.\/tools\/nested%20folder\/tool%20%231\.html/);
  assert.match(index, /A &amp; B &lt;test&gt;/);
  assert.match(index, /Second Tool/);
  const wrapper = await readFile(path.join(f.output, 'tools', 'nested folder', 'tool #1.html'), 'utf8');
  assert.match(wrapper, /src="\.\.\/\.\.\/applications\/nested%20folder\/tool%20%231\.html"/);
  assert.match(wrapper, /href="\.\.\/\.\.\/assets\/css\/shell.css"/);
  assert.match(wrapper, /aria-current="page"/);
  assert.equal(await readFile(path.join(f.output, 'applications', 'nested folder', 'tool #1.html'), 'utf8'), original);
  assert.equal(await readFile(path.join(f.output, 'applications', 'nested folder', 'data.json'), 'utf8'), '{"test":true}');
  await rm(path.join(dir, 'tool #1.html'));
  assert.equal(await buildSite(f), 1);
  await assert.rejects(readFile(path.join(f.output, 'tools', 'nested folder', 'tool #1.html')), { code: 'ENOENT' });
  assert.doesNotMatch(await readFile(path.join(f.output, 'index.html'), 'utf8'), /tool%20%231/);
});
