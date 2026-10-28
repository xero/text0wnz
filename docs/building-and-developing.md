# Building and Developing

This guide covers the build process, development workflow, tooling, and scripts for teXt0wnz.

## Requirements

### System Requirements

- **Node.js** v22.22.2 or higher (but less than v23)
- **Bun** (recommended) or npm
- Modern web browser (Chrome 95+, Firefox 93+, Safari 15+, Edge 95+)

### Installing Bun

This project uses [Bun](https://bun.com) as the preferred package manager and runtime for better performance.

`bun.lock` is the canonical lockfile; it is what CI and the Docker image install from. Do not commit a `package-lock.json`. If `npm install` generates one locally, delete it instead of checking it in.

**Platform install examples**

```sh
# From an existing npm installation:
npm i -g bun

# For UNIX systems like Linux, MacOS, and Open/FreeBSD:
curl -fsSL https://bun.sh/install | bash
# or
wget -qO- https://bun.sh/install | bash

# For Windows:
powershell -c "irm bun.sh/install.ps1 | iex"
```

## Quick Start

```bash
# Install dependencies
bun install

# Build for production
bun bake

# Serve the built application
bun www

# Start collaboration server
bun server
```

## Build Tools

### Vite (Build System)

**Purpose:** Modern build tool for bundling and optimizing the application.

**Configuration:** `vite.config.js`

**Key features:**

- ES module bundling with code splitting
- Automatic code splitting into logical chunks (core, canvas, tools, fileops, network, palette)
- Asset optimization with cache-busting hashes
- Production minification with Terser

There is no dev server script. The workflow is build, then serve `dist/` with `bun www`.

**Build output structure:**

```
dist/
├── index.html              # Main entry point
├── site.webmanifest        # PWA manifest
├── service.js              # Service worker
├── collabWorker-[hash].js  # Collaboration transport worker (module worker)
├── journalWorker-[hash].js # OPFS autosave journal worker
├── ansi/                   # Tutorial artwork
├── robots.txt              # Search engine directives
├── sitemap.xml             # Site map
├── humans.txt              # Humans.txt file
├── favicon.ico             # Favicon
└── ui/
    ├── stylez-[hash].css   # Minified CSS with cache-busting hash
    ├── icons-[hash].svg    # SVG icon sprite (hashed)
    ├── topazplus_1200.woff2  # Font file (UI font)
    ├── fonts/              # Bitmap font assets (PNG format)
    │   └── u/              # Packed Unicode glyph pages plus manifest.json
    ├── img/                # Images and icons
    └── js/                 # Code-split JavaScript bundles
        ├── editor-[hash].js      # Main application entry (most app code)
        ├── core-[hash].js        # Client core group (magicNumbers, state, storage, ui)
        ├── core-[hash].js        # 0wnzlib TypeScript core (doc model, codecs, protocol)
        ├── canvas-[hash].js      # Canvas rendering, fonts, lazy loading, font cache
        ├── tools-[hash].js       # Drawing tools, keyboard, toolbar
        ├── fileops-[hash].js     # File I/O operations
        ├── network-[hash].js     # Collaboration/WebSocket
        ├── palette-[hash].js     # Color palette management
        ├── asciiBrush-[hash].js  # Ascii brush (lazy)
        ├── zoom-[hash].js        # Zoom controller (lazy)
        ├── profiler-[hash].js    # Profiling harness (lazy, ?profile)
        ├── scrollSpike-[hash].js # Scroll measurement rig (lazy, ?spike)
        ├── testBridge-[hash].js  # Test bridge (lazy, ?test)
        └── rolldown-runtime-[hash].js # Bundler runtime shared by chunks
```

Two chunks share the `core-` prefix: the Vite `core` group and the shared TypeScript core under `src/js/core/`, which the bundler names after its directory. A local build emits no `dist/LICENSE.txt`; CI adds it (see [vite-plugin-static-copy](#vite-plugin-static-copy)).

### Vite Plugins

#### vite-plugin-pwa (PWA Support)

**Strategy:** `injectManifest` (custom service worker)

Generates Progressive Web App files:

- `service.js` - Custom service worker with Workbox manifest injection
- `site.webmanifest` - PWA manifest with file handling capabilities
- Workbox runtime for precaching and caching strategies

**Features:**

**Offline & Caching:**

- Workbox-based precaching with `__WB_MANIFEST` injection (js, css, html, woff2, UI svgs, favicons)
- `index.html` precache entry stamped with a content-hash revision so new builds re-fetch it
- One runtime route: stale-while-revalidate for images (`img-cache`)
- Activation janitor deletes legacy runtime caches and self-heals installs stuck on an old worker
- Updates prompt an in-app modal; accepting activates the new worker and reloads once

**File Handling (Multi-Platform):**

- **Desktop (Chrome/Edge):** File Handlers API for OS "Open with" integration
- **Android:** Share Target API for share sheet integration
- **iOS:** Manual file picker with `accept="*/*"` workaround

**Supported File Types:**

- Text art: `.ans`, `.ansi`, `.xb`, `.xbin`, `.bin`, `.nfo`, `.diz`, `.utf8ans`
- Plain text: `.txt`
- MIME types: `text/plain`, `text/*`, `application/octet-stream`

**Share Target Handler:**

- Receives files via POST to `/open`
- Caches files temporarily in `text0wnz-shared-files` cache
- Main app retrieves and deletes cached files after opening
- Stale file cleanup on service worker activation

**Service Worker Location:**

- Source: `src/service.js` (custom, not auto-generated)
- Build output: `dist/service.js`
- Uses `injectManifest` strategy (not `generateSW`)

#### vite-plugin-html-minifier-terser

Minifies `dist/index.html` during production builds.

#### vite-plugin-static-copy

Copies static assets to the build directory:

- `humans.txt`
- `favicon.ico`
- Bitmap font files (`src/fonts/` → `dist/ui/fonts/`)
- Tutorial artwork (`src/ansi/` → `dist/ansi/`)

The plugin also lists a `LICENSE.txt` target, but targets resolve against the Vite root (`src/`), where no such file exists, so a local `bun bake` emits no license file. In CI, `build.yml` appends the repo and site URLs to the root `LICENSE.txt` and copies it into `dist/` after the build.

#### vite-plugin-sitemap

Generates SEO files:

- `sitemap.xml` - Site structure for search engines
- `robots.txt` - Search engine crawler directives

**Configuration:**

- Hostname from `VITE_DOMAIN` environment variable
- Monthly change frequency
- Extensive bot blocking list (AI crawlers, scrapers, etc.)

### PostCSS (CSS Processing)

**Purpose:** Process and optimize CSS.

**Configuration:** `postcss.config.js`

**Plugins:**

- `@tailwindcss/postcss` - Tailwind CSS processing
- `cssnano` - CSS minification and optimization

**Optimization:**

- Advanced preset for maximum compression
- Dead code elimination
- Merging of rules

### Tailwind CSS (Styling Framework)

**Purpose:** Utility-first CSS framework for rapid UI development.

**Configuration:** `tailwind.config.js`

**Features:**

- Dark mode support (class-based)
- Custom content scanning
- Minimal output (only used classes)

**Content sources:**

- `./src/index.html`
- `./src/css/style.css`

## NPM Scripts

### Build Scripts

**`bun bake`** - Build for production

```bash
bun bake
# or
npm run bake
```

- Bakes packed Unicode font pages first (`tools/bakeHexFonts.js`)
- Runs Vite build in production mode
- Minifies JavaScript and CSS
- Generates PWA files and service worker
- Creates sitemap and robots.txt
- Outputs to `dist/` directory

**Related build scripts:**

- `bun fonts:bake` - Regenerate the packed Unicode font pages only
- `bun bake:singlefile` - Single-file build via `vite.singlefile.config.js`
- `bun binaries` - Compile standalone server binaries to `build/bin/` (`tools/compileBinaries.js`)

### Development Scripts

**`bun www`** - Serve built application

```bash
bun www
# or
npm run www
```

- Serves `dist/` directory on port 8060
- Useful for testing production builds
- No hot reload (static server)

**`bun server`** - Start collaboration server

```bash
bun server [port] [options]
# or
npm run server [port] [options]
```

- Starts the Bun collaboration server
- Default port: 1337

> [!NOTE]
> See [collaboration-server.md](collaboration-server.md) for options

### Code Quality Scripts

**`bun fix`** - Auto-fix all code issues

```bash
bun fix
# or
npm run fix
```

- Runs Prettier on CSS, Markdown, and TypeScript
- Runs ESLint with auto-fix on HTML and JavaScript
- Runs oxlint with auto-fix over the TypeScript in `src` and `tests` (warnings denied)

**`bun lint:check`** - Check for linting issues

```bash
bun lint:check
# or
npm run lint:check
```

- Checks JavaScript and HTML with ESLint, then TypeScript with oxlint (`--deny-warnings`)
- Reports issues without fixing
- Exits with error if issues found

**`bun lint:fix`** - Auto-fix linting issues

```bash
bun lint:fix
# or
npm run lint:fix
```

- Runs ESLint with auto-fix, then oxlint with auto-fix
- Fixes code style and syntax issues

**`bun format:check`** - Check code formatting

```bash
bun format:check
# or
npm run format:check
```

- Checks CSS, Markdown, and TypeScript formatting with Prettier
- Reports unformatted files
- Doesn't modify files

**`bun format:fix`** - Auto-fix formatting

```bash
bun format:fix
# or
npm run format:fix
```

- Formats CSS, Markdown, and TypeScript with Prettier
- Applies consistent style

**`bun types:check`** - Check TypeScript types

```bash
bun types:check
# or
npm run types:check
```

- Runs `tsc --noEmit` over the TypeScript sources

### Testing Scripts

**`bun test:unit`** - Run unit tests

```bash
bun test:unit
# or
npm run test:unit
```

- Runs every Vitest suite: `tests/unit`, `tests/core`, `tests/dom`, `tests/corpus`, and `tests/interop`
- Generates coverage report

> [!NOTE]
> See [testing.md](testing.md) for details

**`bun test:dom`** - Run DOM/component tests

```bash
bun test:dom
# or
npm run test:dom
```

- Runs the Testing Library suites in `tests/dom/`

**`bun test:e2e`** - Run end-to-end tests

```bash
bun test:e2e
# or
npm run test:e2e
```

- Runs Playwright E2E tests
- Tests in Chrome, Firefox, and WebKit, plus the Chromium `golden`, `golden-gl`, and `chromium-gl` projects
- Golden pixel assertions run only in CI; locally the flows run and the screenshots are skipped

> [!NOTE]
> See [testing.md](testing.md) for details

**`bun test:install`** - Install test dependencies

```bash
bun test:install
# or
npm run test:install
```

- Installs Playwright browsers
- Required before first E2E test run

### Performance Scripts

**`bun perf:baseline`** - Capture renderer baselines

```bash
bun bake
bun perf:baseline
```

- Drives the in-app profiling harness (`?profile`) in headless Chromium against the production build
- Writes `tests/baselines/p0-perf.json` (the 2D chunk renderer); `PERF_QUERY='?profile&renderer=gl' PERF_OUT=tests/baselines/p1-gl-perf.json` captures the GL renderer
- Numbers are machine-dependent snapshots with a hardware descriptor, evidence for before and after comparisons, not a CI gate

**`bun perf:spike`** - Capture scroll spike numbers

```bash
bun bake
bun perf:spike
```

- Drives the in-app scroll spike (`?spike`) and writes `tests/baselines/p1-scroll-spike.json`
- Device captures (iPad, Android) are manual: open `/?profile` or `/?spike` on the device and run the harness there

## Environment Variables

Configure the build with environment variables in `.env` file:

```env
VITE_DOMAIN='https://text.0w.nz'
VITE_UI_DIR='ui/'
VITE_FONT_DIR='fonts/'
```

### Variable Reference

**`VITE_DOMAIN`**

- Used for sitemap.xml and robots.txt generation
- All app URLs are relative (domain only for SEO)
- Default: `https://text.0w.nz`

**`VITE_UI_DIR`**

- Directory for UI assets in build output
- Trailing slash required
- Default: `ui/`

**`VITE_FONT_DIR`**

- Directory for bitmap font assets, read by the client at runtime
- Default: `fonts/`

## Development Workflow

### Initial Setup

```bash
# Clone repository
git clone https://github.com/xero/teXt0wnz.git
cd teXt0wnz

# Install dependencies
bun install

# Build the application
bun bake

# Serve and test
bun www
```

### Development Iteration

For client-side changes:

```bash
# Make changes to files in src/

# Build
bun bake

# Test
bun www
# Visit http://localhost:8060
```

For server-side changes:

```bash
# Make changes to files in src/js/server/

# Restart server
bun server 1337
```

### Before Committing

> [!IMPORTANT]
> Always format and lint your code before committing, then fix any issues ESLint may have.

```bash
# Fix all issues
bun fix

# Verify everything passes
bun lint:check
bun format:check
bun types:check

# Run tests
bun test:unit
```

The house rules in [AGENTS.md](https://github.com/xero/text0wnz/blob/main/AGENTS.md) apply to code comments, docs, commit messages, and UI copy alike: comments explain why, never what, and nothing uses an em dash or an en dash.

## Linting and Formatting

### ESLint (Code Linting)

**Configuration:** `eslint.config.js`

**Purpose:**

- Enforce code quality standards
- Catch potential bugs
- Maintain consistent style

**Plugins:**

- `@html-eslint/eslint-plugin` - HTML linting
- `@stylistic/eslint-plugin` - Code style rules

**Usage:**

```bash
# Check for issues
bun lint:check

# Auto-fix issues
bun lint:fix
```

### Prettier (Code Formatting)

**Configuration:** `.prettierrc`

> [!NOTE]
> Prettier formats CSS, Markdown, and TypeScript. ESLint stylistic rules own JavaScript and HTML formatting, and `.prettierignore` excludes those files so editor integrations don't fight ESLint. TypeScript correctness linting runs through oxlint (`.oxlintrc.json`), since typescript-eslint cannot load TypeScript 7's compiler; tsc still owns the types.

**Purpose:**

- Consistent code formatting
- Automatic style application
- Reduces formatting debates

**Ignore patterns:** `.prettierignore`

**Usage:**

```bash
# Check formatting
bun format:check

# Fix formatting
bun format:fix
```

## Project Structure

### Source Directory (`src/`)

```
src/
├── index.html          # Main HTML template
├── humans.txt          # Humans.txt file
├── service.js          # PWA service worker
├── ansi/               # Tutorial artwork
├── css/
│   └── style.css       # Tailwind CSS styles
├── fonts/              # Font assets (PNG format)
├── img/                # Static images and icons
│   └── manifest/       # PWA icons
└── js/
    ├── core/           # Shared pure-TS doc model, codecs, and protocol
    ├── client/         # Client-side modules
    │   ├── main.js
    │   ├── canvas.js        # 2D chunk renderer (fallback)
    │   ├── glRenderer.js    # WebGL2 renderer (default)
    │   ├── keyboard.js
    │   ├── ui.js
    │   ├── palette.js
    │   ├── file.js
    │   ├── freehandTools.js
    │   ├── toolbar.js
    │   ├── state.js
    │   ├── storage.js       # IndexedDB storage system
    │   ├── font.js
    │   ├── lazyFont.js      # Lazy glyph generation
    │   ├── fontCache.js     # Font caching system
    │   ├── magicNumbers.js
    │   ├── collabWorker.js  # Collaboration transport worker
    │   ├── network.js       # Network layer with silent probe
    │   └── ...              # See project-structure.md for the full list
    └── server/         # Server-side modules
        ├── main.js
        ├── config.js
        ├── moebiusServer.js
        ├── room.js
        ├── authGate.js
        ├── persistence.js
        ├── bridge.js
        └── utils.js
```

> [!NOTE]
> See [Project Structure](project-structure.md) for the complete, annotated module list.

### Build Output (`dist/`)

Generated by `bun bake`. Do not edit files in this directory manually.

### Tests Directory (`tests/`)

```
tests/
├── unit/               # Vitest unit tests (server tests nested in server/)
├── core/               # Vitest tests for the shared TS core
├── dom/                # Testing Library tests
├── e2e/                # Playwright E2E tests
├── golden/             # Playwright pixel-golden tests
├── gl/                 # Playwright WebGL renderer tests
├── perf/               # Performance capture scripts
├── interop/            # Cross-editor protocol interop tests
├── corpus/             # Round-trip generators
├── parity/             # v2 reference engine for parity tests
├── baselines/          # Performance baselines (JSON)
├── fixtures/           # Shared fixtures
├── results/            # Test results (not committed)
├── canvasShim.js       # Canvas API shim for tests
└── setupTests.js       # Test setup configuration
```

### Documentation (`docs/`)

```
docs/
├── manual.md                   # Frontend app documentation
├── building-and-developing.md  # This file
├── privacy.md                  # Privacy policy
├── ...                         # Other files
└── examples/                   # Sample artwork
    ├── ansi/
    └── xbin/
```

## Build Process Details

### 1. Asset Processing

**Code Splitting:**

- Automatic chunking into logical modules (core, canvas, tools, fileops, network, palette)
- Lazy loading of non-critical code
- Shared dependencies extracted to reduce duplication

**Fonts:**

- Copied from `src/fonts/` to `dist/ui/fonts/`
- PNG format (bitmap fonts for text art)
- No transformation applied
- `fonts/u/` holds packed Unicode glyph pages baked by `tools/bakeHexFonts.js`
- Lazy glyph generation (only creates character images when needed)
- Font caching system for instant switching between common fonts

**Images:**

- Icons and manifest images
- Multiple sizes for different devices
- Stable (unhashed) filenames under `ui/img/`, cached at runtime by the service worker

**CSS:**

- Processed with Tailwind CSS
- Minified with cssnano advanced preset
- Output: `dist/ui/stylez-[hash].css` (hashed for cache busting)

**JavaScript:**

- Bundled with Vite/Rolldown into code-split chunks
- Minified with Terser for production
- Each chunk has a unique hash for cache invalidation
- Main entry: `dist/ui/js/editor-[hash].js`

### 2. PWA Generation

**Service Worker (`service.js`):**

- **Custom implementation** using `injectManifest` strategy
- Source: `src/service.js` (manually written, not auto-generated)
- Workbox manifest (`__WB_MANIFEST`) injected at build time; precaches js, css, html, woff2, UI svgs, and favicons
- `index.html` precache entry gets a content-hash revision so new builds re-fetch it
- One runtime route: images served `StaleWhileRevalidate` → `img-cache`
- Activation janitor deletes the legacy `html-cache`, `app-cache`, `style-cache`, and `asset-cache` caches
- Recovery path detects installs stuck on an old worker and force-reloads only pages that do not answer a ping
- Share Target API handler for Android file sharing
- File Handlers API support for Desktop file opening
- Stale shared file cleanup on activation

**Manifest (`site.webmanifest`):**

- App metadata: name, description, theme colors
- Icons and screenshots for install prompts
- **Share Target configuration:**
  - Action: `/open` (POST endpoint)
  - Accepts: Text art files, plain text, any text MIME type
- **File Handlers configuration:**
  - Desktop "Open with" integration
  - Registered file extensions and MIME types
  - Launches app when files are opened from OS

**Build Configuration:**

```javascript
VitePWA({
	strategies: 'injectManifest', // Custom service worker
	srcDir: '.', // Source at root level
	filename: 'service.js', // Service worker filename
	// ...
});
```

### 3. SEO Files

**Sitemap:**

- Auto-generated from routes
- Hostname from environment variable
- Monthly update frequency

**Robots.txt:**

- Search engine directives
- Blocks AI crawlers and scrapers
- Allows legitimate search engines

## Debugging

### Development Build

For debugging, create a development build with source maps:

```bash
# Set environment to development
NODE_ENV=development bun bake
```

This adds source maps (`sourcemap` in `vite.config.js` keys off `NODE_ENV`). Everything else stays as in a release build: `bake` always passes `--mode production`, and `minify: 'terser'` is unconditional, so the output is still minified. Read the original code through the source maps.

### Browser DevTools

1. Open browser DevTools (F12)
2. Go to Sources tab
3. Find `src/` in source maps
4. Set breakpoints in original code
5. Inspect variables and call stack

### Server Debugging

Enable debug mode:

```bash
bun server 1337 --debug
```

This logs:

- Connection attempts
- Message routing
- State changes
- Error details

## Performance Optimization

### Build Performance

- Use Bun instead of npm (faster package management)
- Enable parallel processing in Vite
- Cache dependencies in CI/CD

### Runtime Performance

**Code Splitting:**

- Automatic chunking into logical modules (core, canvas, tools, fileops, network, palette)
- Lazy loading of non-critical code reduces initial bundle size
- Shared dependencies extracted to minimize duplication

**Font Optimization:**

- Lazy glyph generation: Only creates character glyphs when first needed
- Font caching system: Preloads common fonts (CP437, Topaz) for instant switching
- In-memory glyph cache prevents regeneration
- Significantly reduces memory footprint compared to pre-generating all 65,536 possible glyph combinations

**Storage Optimization:**

- IndexedDB for large binary canvas data (the `Uint16Array` snapshot is stored as is, no encoding step)
- localStorage for small configuration settings
- Auto-save on canvas changes without blocking the UI

**Asset Optimization:**

- PNG fonts (small bitmap files)
- CSS minification with cssnano advanced preset
- JavaScript minification with Terser
- Gzip/Brotli compression in nginx
- Hashed filenames enable aggressive browser caching

**PWA Optimization:**

**Service Worker:**

- Custom `injectManifest` strategy for full control
- Workbox precaching for critical assets
- Single stale-while-revalidate runtime route for images
- Regex-safe UI directory path construction from env vars

**File Handling:**

- Temporary cache for shared files (auto-cleanup)
- Stale file cleanup on service worker activation
- Non-blocking file operations (Cache API)
- Platform-specific optimizations (iOS `accept="*/*"`)

**Cache Strategy:**

- Hashed static assets served from the Workbox precache
- Font cache for instant font switching (client-side)
- IndexedDB for canvas persistence
- Aggressive browser caching with hashed filenames

## Troubleshooting

### Build Fails

**Node version mismatch:**

```bash
node --version  # Should be 22.22.2+
nvm use 22      # Or install correct version
```

**Missing dependencies:**

```bash
rm -rf node_modules
bun install
```

**Permission errors:**

```bash
# Fix permissions
chmod -R 755 src/
chmod -R 755 dist/
```

### Bun Issues

**Bun not found:**

```bash
# Reinstall Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc  # Reload shell config
```

**Version conflicts:**

```bash
bun upgrade  # Update to latest version
```

### Build Output Issues

**Assets not copied:**

- Check `vite.config.js` static copy targets
- Verify source file paths
- Rebuild with `bun bake`

**CSS not updating:**

- Clear browser cache
- Check Tailwind content paths
- Rebuild CSS with `bun bake`

**Service worker cache:**

- Clear service worker in browser DevTools
- Unregister old service worker
- Hard reload (Ctrl+Shift+R)

## See Also

- [Testing](testing.md) - Testing framework details
- [Collaboration Server](collaboration-server.md) - Server configuration
- [Client Editor Manual](manual.md) - Visual guide to the Frontend text art editor
- [Other Tools](other-tools.md) - Additional development tools
- [Changelog](https://github.com/xero/text0wnz/blob/main/CHANGELOG.md) - Release history
