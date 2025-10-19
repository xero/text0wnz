# Building and Developing

This guide covers the build process, development workflow, tooling, and scripts for teXt0wnz.

## Requirements

### System Requirements

- **Node.js** v22.19.0 or higher (but less than v23)
- **Bun** (recommended) or npm
- Modern web browser (Chrome 95+, Firefox 93+, Safari 15+, Edge 95+)

### Installing Bun

This project uses [Bun](https://bun.com) as the preferred package manager and runtime for better performance.

**NPM global install:**
```bash
npm i -g bun
```

**NPM local install:**
```bash
npm i bun
```

**Manual install:**
```bash
curl -fsSL https://bun.sh/install | bash
# or
wget -qO- https://bun.sh/install | bash
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
- Development server with hot module replacement
- Production minification with Terser

**Build output structure:**
```
dist/
├── index.html              # Main entry point
├── site.webmanifest        # PWA manifest
├── service.js              # Service worker
├── workbox-[hash].js       # Workbox runtime for caching
├── robots.txt              # Search engine directives
├── sitemap.xml             # Site map
├── humans.txt              # Humans.txt file
├── favicon.ico             # Favicon
└── ui/
    ├── stylez-[hash].css   # Minified CSS with cache-busting hash
    ├── icons-[hash].svg    # SVG icon sprite (hashed)
    ├── topazplus_1200.woff2  # Font file (UI font)
    ├── fonts/              # Bitmap font assets (PNG format)
    ├── img/                # Images and icons
    └── js/                 # Code-split JavaScript bundles
        ├── editor-[hash].js      # Main application entry
        ├── core-[hash].js        # Core modules (state, storage, compression, UI)
        ├── canvas-[hash].js      # Canvas rendering, fonts, lazy loading, font cache
        ├── tools-[hash].js       # Drawing tools, keyboard, toolbar
        ├── fileops-[hash].js     # File I/O operations
        ├── network-[hash].js     # Collaboration/WebSocket
        ├── palette-[hash].js     # Color palette management
        └── websocket.js          # Web Worker (no hash for service worker caching)
```

### Vite Plugins

#### vite-plugin-static-copy

Copies static assets to the build directory:
- Web Worker (`worker.js`)
- Font files (`.png` format)
- Manifest icons
- `humans.txt`

#### vite-plugin-pwa (PWA Support)

Generates Progressive Web App files:
- `service.js` - Service worker for offline support
- `site.webmanifest` - PWA manifest
- Workbox runtime for caching strategies

**Features:**
- Offline support
- Install to home screen
- Auto-update on new versions
- Cache-first strategy for assets

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
- `./src/www/index.html`
- `./src/css/editor.css`

## NPM Scripts

### Build Scripts

**`bun bake`** - Build for production
```bash
bun bake
# or
npm run bake
```
- Runs Vite build in production mode
- Minifies JavaScript and CSS
- Generates PWA files and service worker
- Creates sitemap and robots.txt
- Outputs to `dist/` directory

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
- Starts Node.js collaboration server
- Default port: 1337
- See [collaboration-server.md](collaboration-server.md) for options

### Code Quality Scripts

**`bun fix`** - Auto-fix all code issues
```bash
bun fix
# or
npm run fix
```
- Runs Prettier for formatting
- Runs ESLint with auto-fix
- Applies to HTML, CSS, and JavaScript

**`bun lint:check`** - Check for linting issues
```bash
bun lint:check
# or
npm run lint:check
```
- Checks code with ESLint
- Reports issues without fixing
- Exits with error if issues found

**`bun lint:fix`** - Auto-fix linting issues
```bash
bun lint:fix
# or
npm run lint:fix
```
- Runs ESLint with auto-fix
- Fixes code style and syntax issues

**`bun format:check`** - Check code formatting
```bash
bun format:check
# or
npm run format:check
```
- Checks formatting with Prettier
- Reports unformatted files
- Doesn't modify files

**`bun format:fix`** - Auto-fix formatting
```bash
bun format:fix
# or
npm run format:fix
```
- Formats code with Prettier
- Applies consistent style

### Testing Scripts

**`bun test:unit`** - Run unit tests
```bash
bun test:unit
# or
npm run test:unit
```
- Runs Vitest unit tests
- Generates coverage report
- See [testing.md](testing.md) for details

**`bun test:e2e`** - Run end-to-end tests
```bash
bun test:e2e
# or
npm run test:e2e
```
- Runs Playwright E2E tests
- Tests in Chrome, Firefox, WebKit
- See [testing.md](testing.md) for details

**`bun test:install`** - Install test dependencies
```bash
bun test:install
# or
npm run test:install
```
- Installs Playwright browsers
- Required before first E2E test run

## Environment Variables

Configure the build with environment variables in `.env` file:

```env
VITE_DOMAIN='https://text.0w.nz'
VITE_UI_DIR='ui/'
VITE_FONT_DIR='fonts/'
VITE_WORKER_FILE='websocket.js'
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
- Directory for font files (not currently used)
- Default: `fonts/`

**`VITE_WORKER_FILE`**
- Web Worker filename
- Default: `websocket.js`

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

# Run tests
bun test:unit
```

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
├── css/
│   └── style.css       # Tailwind CSS styles
├── fonts/              # Font assets (PNG format)
├── img/                # Static images and icons
│   └── manifest/       # PWA icons
└── js/
    ├── client/         # Client-side modules
    │   ├── main.js
    │   ├── canvas.js
    │   ├── keyboard.js
    │   ├── ui.js
    │   ├── palette.js
    │   ├── file.js
    │   ├── freehand_tools.js
    │   ├── toolbar.js
    │   ├── state.js
    │   ├── storage.js       # IndexedDB storage system
    │   ├── compression.js   # RLE compression utilities
    │   ├── font.js
    │   ├── lazyFont.js      # Lazy glyph generation
    │   ├── fontCache.js     # Font caching system
    │   ├── magicNumbers.js
    │   ├── websocket.js     # Web Worker for collaboration
    │   └── network.js
    └── server/         # Server-side modules
        ├── main.js
        ├── config.js
        ├── server.js
        ├── text0wnz.js
        ├── websockets.js
        ├── fileio.js
        └── utils.js
```

### Build Output (`dist/`)

Generated by `bun bake`. Do not edit files in this directory manually.

### Tests Directory (`tests/`)

```
tests/
├── unit/               # Vitest unit tests
├── e2e/                # Playwright E2E tests
├── dom/                # Testing Library tests
├── results/            # Test results (not committed)
└── setupTests.js       # Test setup configuration
```

### Documentation (`docs/`)

```
docs/
├── README.md           # Documentation index
├── editor-client.md    # Frontend app documentation
├── collaboration-server.md  # Backend server documentation
├── building-and-developing.md  # This file
├── testing.md          # Testing documentation
├── webserver-configuration.md  # Webserver setup
├── other-tools.md      # Useful tools
├── fonts.md            # Font reference
├── sauce-format.md     # SAUCE spec
├── xb-format.md        # XBin spec
├── privacy.md          # Privacy policy
└── examples/           # Sample artwork
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
- Lazy glyph generation (only creates character images when needed)
- Font caching system for instant switching between common fonts

**Images:**
- Icons and manifest images
- Optimized during build
- Multiple sizes for different devices
- Hashed filenames for cache busting

**CSS:**
- Processed with Tailwind CSS
- Minified with cssnano advanced preset
- Output: `dist/ui/stylez-[hash].css` (hashed for cache busting)

**JavaScript:**
- Bundled with Vite/Rollup into code-split chunks
- Minified with Terser for production
- Each chunk has a unique hash for cache invalidation
- Main entry: `dist/ui/js/editor-[hash].js`

### 2. PWA Generation

**Service Worker:**
- Generated by vite-plugin-pwa
- Precaches critical assets
- Implements offline support
- Cache-first strategy for static assets

**Manifest:**
- `site.webmanifest` with app metadata
- Icons, screenshots, theme colors
- Install prompts and app info

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

This enables:
- Source maps for debugging
- Readable output (not minified)
- Development warnings

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
- IndexedDB for large binary canvas data (efficient storage of Uint16Array)
- localStorage for small configuration settings
- RLE compression for canvas data reduces storage size
- Auto-save on canvas changes without blocking the UI

**Asset Optimization:**
- PNG fonts (small bitmap files)
- CSS minification with cssnano advanced preset
- JavaScript minification with Terser
- Gzip/Brotli compression in nginx
- Hashed filenames enable aggressive browser caching

**Cache Strategy:**
- Service worker caching with cache-first strategy
- Workbox runtime for efficient offline support
- Font cache for instant font switching
- Precaching of critical assets for offline use

## Troubleshooting

### Build Fails

**Node version mismatch:**
```bash
node --version  # Should be 22.19.0+
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
- [Editor Client](editor-client.md) - Frontend application
- [Other Tools](other-tools.md) - Additional development tools
