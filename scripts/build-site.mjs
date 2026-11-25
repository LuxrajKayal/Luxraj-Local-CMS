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


function documentParts(source, relative) {
  const tags = new Map();
  const token = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-z][\w:-]*)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  const raw = new Set(['script','style','title','textarea','xmp','iframe','noembed','noframes']);
  for (let match; (match = token.exec(source));) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    const closing = match[0].startsWith('</');
    if (['html','head','body'].includes(name)) {
      const key = closing ? '/' + name : name;
      if (tags.has(key)) throw new Error(relative + ': duplicate ' + key + ' element.');
      tags.set(key, { start: match.index, end: token.lastIndex });
    } else if (!closing && raw.has(name)) {
      const end = new RegExp('</' + name + '\\s*>', 'gi');
      end.lastIndex = token.lastIndex;
      if (!end.exec(source)) throw new Error(relative + ': unclosed ' + name + ' element.');
      token.lastIndex = end.lastIndex;
    }
  }
  const html = tags.get('html'), htmlEnd = tags.get('/html');
  const head = tags.get('head'), headEnd = tags.get('/head');
  const body = tags.get('body'), bodyEnd = tags.get('/body');
  if (!html || !htmlEnd || !body || !bodyEnd ||
      html.end > body.start || body.end > bodyEnd.start || bodyEnd.end > htmlEnd.start ||
      Boolean(head) !== Boolean(headEnd) ||
      (head && (html.end > head.start || head.end > headEnd.start || headEnd.end > body.start))) {
    throw new Error(relative + ': expected one HTML document with a complete body and optional head.');
  }
  return { html, head, headEnd, body, bodyEnd };
}

function assembleApplication(source, parts, chrome, css, script, title) {
  const { html, head, headEnd, body, bodyEnd } = parts;
  const headMarkup = '<style data-luxraj-cms="shell">\n' + css + '\n</style>';
  const headPrefix = head
    ? source.slice(0, headEnd.start) + headMarkup + source.slice(headEnd.start, body.end)
    : source.slice(0, html.end) + '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
      escapeHtml(title) + '</title>' + headMarkup + '</head>' + source.slice(html.end, body.end);
  return headPrefix + '\n<div id="luxraj-cms-shell" class="lc-shell">\n' + chrome.header + '\n' + chrome.sidebar +
    '\n<div id="luxraj-cms-workspace" class="lc-application">' + source.slice(body.end, bodyEnd.start) +
    '</div>\n' + chrome.footer + '\n</div>\n<script data-luxraj-cms="shell">\n' + script + '\n</script>\n' + source.slice(bodyEnd.start);
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
    const parts = documentParts(content, relative);
    apps.push({ relative, content, parts, title: applicationName(content, relative), route: 'tools/' + relative });
  }
  apps.sort((a, b) => a.title.localeCompare(b.title, 'en') || a.relative.localeCompare(b.relative, 'en'));

  const [template, header, sidebar, footer, css, script] = await Promise.all([
    readFile(path.join(source, 'index.html'), 'utf8'),
    ...['header', 'sidebar', 'footer'].map(name => readFile(path.join(source, 'partials', name + '.html'), 'utf8')),
    readFile(path.join(source, 'assets/css/shell.css'), 'utf8'),
    readFile(path.join(source, 'assets/js/shell.js'), 'utf8')
  ]);
  const render = (app = null) => {
    const root = app ? '../'.repeat(app.route.split('/').length - 1) : './';
    const navigation = apps.length ? apps.map(item =>
      '<a class="lc-nav-link" href="' + escapeHtml(root + urlPath(item.route)) + '"' + (item === app ? ' aria-current="page"' : '') + '>' + escapeHtml(item.title) + '</a>'
    ).join('\n') : '<p class="lc-nav-empty">No applications yet</p>';
    const chrome = {
      header: fill(header, { ROOT: root }),
      sidebar: fill(sidebar, { ROOT: root, HOME_CURRENT: app ? '' : ' aria-current="page"', NAVIGATION: navigation }),
      footer
    };
    if (app) return assembleApplication(app.content, app.parts, chrome, css, script, app.title);
    const cards = apps.map(item => '<a class="lc-app-card" href="' + escapeHtml(root + urlPath(item.route)) + '">' + escapeHtml(item.title) + '<small>Open application →</small></a>').join('\n');
    const content = '<p class="lc-eyebrow">Application workspace</p><h1>Applications</h1><p class="lc-subtitle">Open a standalone HTML application.</p>' + (apps.length ? '<div class="lc-app-grid">' + cards + '</div>' : '<section class="lc-empty"><strong>No applications yet</strong><p>Add a standalone HTML file to <code>site/applications/</code> and rebuild. It will appear here automatically.</p></section>');
    return fill(template, {
      TITLE: 'Home', ROOT: root, HEADER: chrome.header, SIDEBAR: chrome.sidebar,
      FOOTER: chrome.footer, WORKSPACE_CLASS: 'lc-home', CONTENT: content
    });
  };

  // Assemble all documents before replacing the previous output.
  const pages = apps.map(app => ({ route: app.route, html: render(app) }));
  const homepage = render();

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(path.join(source, 'assets'), path.join(output, 'assets'), { recursive: true });
  // Keep supporting files beside the native pages so relative URLs still work.
  for (const relative of files.filter(file => !htmlFile.test(file))) {
    const destination = path.join(output, 'tools', relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(applications, relative), destination);
  }
  await writeFile(path.join(output, 'index.html'), homepage);
  for (const page of pages) {
    const destination = path.join(output, page.route);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, page.html);
  }
  await writeFile(path.join(output, '.nojekyll'), '');
  return apps.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Built ' + await buildSite() + ' application page(s).');
}
