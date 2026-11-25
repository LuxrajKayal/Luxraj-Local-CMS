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
test('discovers nested HTML, assembles native pages and removes stale pages', async t => {
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
  assert.doesNotMatch(wrapper, /<iframe\b/i);
  assert.match(wrapper, /id="luxraj-cms-shell"/);
  assert.match(wrapper, /id="luxraj-cms-workspace"/);
  assert.match(wrapper, /<header class="lc-header">/);
  assert.match(wrapper, /<aside id="luxraj-cms-sidebar"/);
  assert.match(wrapper, /<footer class="lc-footer">/);
  assert.match(wrapper, /href="\.\.\/\.\.\/index\.html"/);
  assert.match(wrapper, /aria-current="page"/);
  assert.match(wrapper, /<style>body\{color:red\}<\/style>/);
  assert.match(wrapper, /<script>window\.test=1<\/script>/);
  assert.equal(await readFile(path.join(dir, 'tool #1.html'), 'utf8'), original);
  assert.equal(await readFile(path.join(f.output, 'tools', 'nested folder', 'data.json'), 'utf8'), '{"test":true}');
  await assert.rejects(readFile(path.join(f.output, 'applications', 'nested folder', 'tool #1.html')), { code: 'ENOENT' });
  assert.match(await readFile(path.join(f.output, 'tools', 'second-tool.htm'), 'utf8'), /<title>Second Tool<\/title>/);
  await rm(path.join(dir, 'tool #1.html'));
  assert.equal(await buildSite(f), 1);
  await assert.rejects(readFile(path.join(f.output, 'tools', 'nested folder', 'tool #1.html')), { code: 'ENOENT' });
  assert.doesNotMatch(await readFile(path.join(f.output, 'index.html'), 'utf8'), /tool%20%231/);
});

test('preserves native document attributes, head policy, scripts and relative resources', async t => {
  const f = await fixture(t);
  const original = '<!doctype html><html lang="en" data-theme="dark"><head><title>Native Tool</title><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'"><style>:root{--accent:red}main{padding:2px}</style><script>const fake = "<body>";</script></head><body class="tool" data-mode="local"><main id="app"><img src="image.svg"><script>const marker = "</body>";</script></main></body></html>';
  await writeFile(path.join(f.source, 'applications', 'native.html'), original);
  await writeFile(path.join(f.source, 'applications', 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  assert.equal(await buildSite(f), 1);
  const page = await readFile(path.join(f.output, 'tools', 'native.html'), 'utf8');
  assert.match(page, /<html lang="en" data-theme="dark">/);
  assert.match(page, /<body class="tool" data-mode="local">/);
  assert.match(page, /Content-Security-Policy/);
  assert.match(page, /<main id="app"><img src="image.svg">/);
  assert.match(page, /const marker = "<\/body>";/);
  assert.match(page, /data-luxraj-cms="shell"/);
  assert.doesNotMatch(page, /<iframe\b/i);
  assert.equal(await readFile(path.join(f.source, 'applications', 'native.html'), 'utf8'), original);
  assert.equal(await readFile(path.join(f.output, 'tools', 'image.svg'), 'utf8'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
});

test('rejects malformed documents before removing the existing output', async t => {
  const f = await fixture(t);
  await buildSite(f);
  const before = await readFile(path.join(f.output, 'index.html'), 'utf8');
  await writeFile(path.join(f.source, 'applications', 'bad.html'), '<html><body>unclosed');
  await assert.rejects(buildSite(f), /expected one HTML document/);
  assert.equal(await readFile(path.join(f.output, 'index.html'), 'utf8'), before);
});
