# Luxraj Local CMS

A lightweight static website shell for independent, trusted HTML applications. No backend, database, authentication, editor, file manager, framework or external runtime dependencies.

## Add an application

Place the complete standalone HTML document in [site/applications/](site/applications/). Nested directories and both .html and .htm are supported. Keep any supporting files alongside the app and use relative asset URLs. Every non-hidden HTML file in this directory is treated as an application. No markers, registry, boilerplate or changes to the shell are required.

The next build automatically generates the homepage, sidebar and a native page under `tools/` for each application. Its display name comes from the HTML title (or a readable filename). The builder preserves the application document's head, HTML/body attributes and body content, inserts the shared header, sidebar and footer, and runs the application's scripts in the same page. No iframe, wrapper document, manual menu registration or separate app window is used. Supporting non-HTML files are copied next to the generated pages so relative asset and script URLs keep working. The original source remains unchanged in `site/applications/`; only the integrated pages are published. Remove an HTML file and rebuild to remove its entry and page.

Applications are trusted native page code, not a security sandbox. Do not upload untrusted HTML or secrets. GitHub Pages is public for this repository. Provide a complete HTML document with a body; the head is optional. The shell uses reserved `luxraj-cms-*` IDs and `lc-*` classes. Applications should avoid those names, avoid document-wide destructive DOM operations, and keep global CSS compatible with shared chrome. Shared shell CSS and JavaScript are inserted inline on application pages so a monolithic app can run without additional shell asset requests; an app's own CSP must permit those inline styles/scripts. Browser permission and external dependency requirements remain the application's responsibility.

## Build locally

Use Node.js 22 or newer. No npm install is required.

    npm test
    npm run build

Serve the generated _site directory with a local HTTP server, for example:

    python -m http.server 8000 --directory _site

Open http://localhost:8000/.

## GitHub Pages

In Settings → Pages, choose GitHub Actions as the source. The workflow tests and builds on pushes to main and pull requests, and deploys successful main builds only. Manual workflow dispatch is supported. The generated _site directory is not committed.

## Structure

- site/index.html — shell template
- site/partials/ — common header, sidebar, footer
- site/assets/ — shell CSS and JavaScript
- site/applications/ — standalone application source
- scripts/build-site.mjs — dependency-free static builder
- tests/ — temporary-fixture build tests
- .github/workflows/pages.yml — validation and deployment

The shell deliberately contains no application-specific functionality.
