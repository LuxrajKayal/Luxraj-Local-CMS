# Luxraj Local CMS

A lightweight static website shell for independent, trusted HTML applications. No backend, database, authentication, editor, file manager, framework or external runtime dependencies.

## Add an application

Place the complete standalone HTML document in [site/applications/](site/applications/). Nested directories and both .html and .htm are supported. Keep any supporting files alongside the app and use relative asset URLs. Every non-hidden HTML file in this directory is treated as an application. No markers, registry, boilerplate or changes to the shell are required.

The next build generates the homepage, sidebar and a dedicated shell page under tools/ for each application. Its display name comes from the HTML title (or a readable filename). The original file and accompanying assets are copied unchanged under applications/. The wrapper loads the original document in an iframe to isolate ordinary CSS and JavaScript namespaces. Remove an HTML file and rebuild to remove its entry and generated wrapper.

Apps are trusted, same-origin code; the iframe is not a security sandbox. Do not upload untrusted HTML or secrets. GitHub Pages is public for this repository. An application's external dependencies and browser permission requirements remain its own responsibility. Apps that require a top-level browsing context may need adjustment or can be opened directly at their original applications/ URL.

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
