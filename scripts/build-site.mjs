import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlFile = /\.html?$/i;
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const urlPath = value => value.split('/').map(encodeURIComponent).join('/');
const fill = (template, values) => template.replace(/\{\{([A-Z_]+)\}\}/g, (token, key) => Object.hasOwn(values, key) ? values[key] : token);

function applicationName(source, relative) {
  const fallback = path.posix.basename(relative).replace(htmlFile, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const head = source.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] ?? '';
  const title = head.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
  if (!title) return fallback || relative;
  const decoded = title.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, name) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    const key = name.toLowerCase();
    if (Object.hasOwn(named, key)) return named[key];
    const n = key.startsWith('#x') ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : entity;
  }).replace(/\s+/g, ' ').trim();
  return decoded || fallback || relative;
}

async function discover(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...await discover(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error('Unsupported application entry: ' + relative);
  }
  return files.sort();
}

export async function buildSite({ source = path.join(repo, 'site'), output = path.join(repo, '_site') } = {}) {
  source = path.resolve(source);
  output = path.resolve(output);
  const inside = (parent, child) => { const relative = path.relative(parent, child); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
  if (inside(source, output) || inside(output, source)) throw new Error('Source and output must be separate directories.');
  const applications = path.join(source, 'applications');
  const files = await discover(applications);
  const apps = [];
  for (const relative of files.filter(file => htmlFile.test(file))) {
    const content = await readFile(path.join(applications, relative), 'utf8');
    apps.push({ relative, title: applicationName(content, relative), route: 'tools/' + relative });
  }
  apps.sort((a, b) => a.title.localeCompare(b.title, 'en') || a.relative.localeCompare(b.relative, 'en'));

  const [template, header, sidebar, footer] = await Promise.all([
    readFile(path.join(source, 'index.html'), 'utf8'),
    ...['header', 'sidebar', 'footer'].map(name => readFile(path.join(source, 'partials', name + '.html'), 'utf8'))
  ]);
  const render = (app = null) => {
    const root = app ? '../'.repeat(app.route.split('/').length - 1) : './';
    const navigation = apps.length ? apps.map(item =>
      '<a class="nav-link" href="' + escapeHtml(root + urlPath(item.route)) + '"' + (item === app ? ' aria-current="page"' : '') + '>' + escapeHtml(item.title) + '</a>'
    ).join('\n') : '<p class="nav-empty">No applications yet</p>';
    const cards = apps.map(item => '<a class="app-card" href="' + escapeHtml(root + urlPath(item.route)) + '">' + escapeHtml(item.title) + '<small>Open application →</small></a>').join('\n');
    const content = app
      ? '<div class="app-heading"><h1>' + escapeHtml(app.title) + '</h1></div><iframe class="app-frame" title="' + escapeHtml(app.title) + '" src="' + escapeHtml(root + 'applications/' + urlPath(app.relative)) + '" allow="clipboard-read; clipboard-write; fullscreen" allowfullscreen></iframe>'
      : '<p class="eyebrow">Application workspace</p><h1>Applications</h1><p class="subtitle">Open a standalone HTML application.</p>' + (apps.length ? '<div class="app-grid">' + cards + '</div>' : '<section class="empty"><strong>No applications yet</strong><p>Add a standalone HTML file to <code>site/applications/</code> and rebuild. It will appear here automatically.</p></section>');
    return fill(template, {
      TITLE: escapeHtml(app?.title ?? 'Home'), ROOT: root,
      HEADER: fill(header, { ROOT: root }),
      SIDEBAR: fill(sidebar, { ROOT: root, HOME_CURRENT: app ? '' : ' aria-current="page"', NAVIGATION: navigation }),
      FOOTER: footer, WORKSPACE_CLASS: app ? 'application' : 'home', CONTENT: content
    });
  };

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(path.join(source, 'assets'), path.join(output, 'assets'), { recursive: true });
  for (const relative of files) {
    const destination = path.join(output, 'applications', relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(applications, relative), destination);
  }
  await writeFile(path.join(output, 'index.html'), render());
  for (const app of apps) {
    const destination = path.join(output, app.route);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, render(app));
  }
  await writeFile(path.join(output, '.nojekyll'), '');
  return apps.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Built ' + await buildSite() + ' application page(s).');
}
