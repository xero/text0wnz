# Project Structure

This document provides a detailed overview of the teXt0wnz project file structure, describing the purpose of each directory and key files.

We will begin by explaining our naming conventions.

## Table of Contents

- [Naming Conventions](#naming-conventions)
- [Root Directory](#root-directory)
- [Source Code](#source-code)
- [Documentation](#documentation)
- [Tests](#tests)
- [Configuration Files](#configuration-files)
- [GitHub Actions](#github-actions)

## Naming Conventions

Use `camelCase` names whenever possible, though `ClassName` is also acceptable.

Standalone `_` is used as throwaway parameter for unused required parameters

- `_ => { }`
- `const _ = something`

### Source Files

Sources should use all lowercase or camelCase file names:

- JavaScript: `lowercase.js` (e.g., `canvas.js`, `freehandTools.js`)
- Tests: `module.test.js` or `module.spec.js`
- CSS: `lowercase.css`
- HTML: `lowercase.html`

### CICD / Github Actions

Github actions requires `kebab-case` file names.

- Workflows: `build.yml` or `test-suite.yml`

### Documentation

Markdown powers the wiki, use `kebab-case` for documentation files:

- Markdown: `lowercase-with-hyphens.md`
- All lowercase with hyphens for spaces (URL safe)

### Assets

Font files retain their original release file names. _(yes the spaces are GROSS)_

- Fonts: `fontname size.png` (e.g., `CP437 8x16.png`)

Images are required for favicons, PWA install, opengraph previews, and other SEO. Their file names are vendor specific, and are mostly kebab-case.

- Images: `lowercase-descriptive-name.png/svg/ico`

> [!NOTE]
> All UI images should be in **SVG** format whenever possible, otherwise favor **PNG**.

## Module Import Conventions

### ES Modules

All JavaScript uses ES6 module syntax:

```javascript
// Named exports
export function myFunction() {}
export const myConstant = 42;

// Default export
export default MyClass;

// Imports
import { myFunction, myConstant } from './module.js';
import MyClass from './module.js';
```

### Module Pattern

Some modules use revealing module pattern:

```javascript
const Module = (() => {
	function publicFunction() {}

	return {
		publicFunction: publicFunction,
	};
})();

export default Module;
```

# Project File Structure

## Root Directory

```
text0wnz/
├── .env                    # Environment variables (non-secret build defaults)
├── .git/                   # Git repository
├── .gitattributes          # Git attributes configuration
├── .github/                # GitHub Actions workflows and configs
├── .gitignore              # Git ignore patterns
├── .prettierignore         # Prettier ignore patterns
├── .prettierrc             # Prettier configuration
├── assets/                 # Build inputs (hex fonts, Unicode data)
├── banner                  # ASCII art banner script (displayed on commands)
├── bootup                  # Docker container startup script
├── bun.lock                # Bun lockfile
├── CHANGELOG.md            # Release history
├── Dockerfile              # Production Docker image (Caddy + Bun)
├── Dockerfile.distroless   # Single-binary distroless Docker image
├── docs/                   # Documentation files
├── eslint.config.js        # ESLint configuration
├── LICENSE.txt             # MIT license
├── node_modules/           # Dependencies (gitignored)
├── OSSMETADATA             # Open source metadata
├── package.json            # Package configuration
├── playwright.config.js    # Playwright E2E test configuration
├── postcss.config.js       # PostCSS configuration
├── README.md               # Main project documentation
├── sessions/               # Collaboration session storage (contents gitignored)
├── src/                    # Source code
├── tailwind.config.js      # Tailwind CSS configuration
├── tests/                  # Test files
├── tools/                  # Build and codegen scripts
├── tsconfig.json           # TypeScript configuration
├── vite.config.js          # Vite build configuration
├── vite.singlefile.config.js # Single-file build configuration
└── vitest.config.js        # Vitest unit test configuration
```

## Source Code

### Source Directory Structure

```
src/
├── ansi/                  # Tutorial artwork served by the editor
├── css/
│   └── style.css          # Main Tailwind CSS styles
├── fonts/                 # Bitmap font assets (PNG format)
├── img/                   # Static images and assets
├── index.html             # Main HTML entry point
├── service.js             # PWA service worker (custom, not auto-generated)
└── js/
    ├── client/            # Client-side JavaScript modules
    ├── core/              # Shared pure-TS doc model, codecs, and protocol
    └── server/            # Server-side JavaScript modules
```

### Client Modules

```
src/js/client/
├── main.js                # Application entry point and initialization
├── asciiArena.js          # asciiarena.se in-app browser
├── browserKit.js          # Shared widgets for the archive browsers
├── canvas.js              # 2D chunk renderer (fallback, ?renderer=2d)
├── charsetPicker.js       # Unicode charset picker modal
├── collabWorker.js        # Collaboration transport worker (Moebius frames)
├── colorPanel.js          # Extended color panel (xterm-256, RGB picker)
├── compression.js         # Data compression (RLE) for storage
├── file.js                # File I/O operations (ANSI, BIN, XBIN, PNG)
├── font.js                # Font loading and rendering
├── fontCache.js           # Font caching system
├── frames.js              # Animation frames timeline panel
├── freehandTools.js       # Drawing tools implementation
├── gestures.js            # Touch gesture recognizer
├── glRenderer.js          # WebGL2 renderer (default)
├── hexFontPages.js        # Runtime Unicode glyph source
├── journalStore.js        # OPFS autosave journal store
├── journalWorker.js       # OPFS journal worker
├── keyboard.js            # Keyboard mode and shortcuts
├── lazyFont.js            # Lazy font loading
├── magicNumbers.js        # Constants and magic values
├── messageGuard.js        # Shared postMessage origin guard
├── minimap.js             # Whole-document minimap
├── network.js             # Network layer with non-intrusive connection probe
├── palette.js             # Color palette management
├── plugins.js             # ES-module plugin surface
├── pointer.js             # Pointer Events input normalizer
├── profiler.js            # In-app profiling harness (lazy, ?profile)
├── referenceImage.js      # Reference-image tracing overlay
├── scrollSpike.js         # Scroll measurement rig (lazy, ?spike)
├── sixteenColors.js       # 16colo.rs in-app browser
├── state.js               # Global application state
├── storage.js             # IndexedDB persistence
├── testBridge.js          # Playwright test bridge (lazy, ?test)
├── toolbar.js             # Toolbar management
├── ui.js                  # User interface components
└── zoom.js                # Zoom controller
src/service.js             # Service worker (separate from client bundle)
```

#### Client Module Descriptions

**service.js** - Service Worker (PWA)

Located at `src/service.js` (root level, separate from client modules)

- Workbox-based precaching with custom manifest injection (js, css, html, woff2, UI svgs, favicons)
- One runtime route: stale-while-revalidate for images (`img-cache`)
- Activation janitor for legacy caches, with a recovery path for installs stuck on an old worker
- Share Target API handler for Android file sharing
- File Handlers API support for Desktop "Open with"
- Stale shared file cleanup on activation
- Cache API for temporary file storage
- Exports: Service worker runtime (no exports, runs independently)

**main.js** - Application Bootstrap

- Initializes all modules
- Sets up event listeners
- Handles application startup
- Manages mode selection (local vs collaborative)

**canvas.js** - Canvas System (2D chunk renderer)

- Fallback renderer (`?renderer=2d`, or wherever WebGL2 is unavailable)
- Offscreen canvas rendering
- Dirty region tracking
- Character and color rendering
- Mirror mode support
- Grid overlay
- Cursor positioning
- Exports: `createTextArtCanvas()`

**glRenderer.js** - WebGL2 Renderer

- The editor's default renderer
- Falls back to the 2D chunk renderer where WebGL2 is unavailable

**compression.js** - Data Compression

- Run-length encoding (RLE)
- Canvas data compression for storage
- Decompression for restoration
- Exports: `Compression` object

**file.js** - File Operations

- ANSI format (.ans, .utf8.ans) support
- Binary format (.bin) support
- XBIN format (.xb) support
- NFO format (.nfo) support
- Plain text (.txt) support
- PNG export with canvas rendering
- SAUCE metadata support
- Font name conversions
- Exports: `Load`, `Save`

**font.js** - Font System

- Load fonts from PNG images
- XB font data parsing
- Glyph rendering
- Letter spacing (9px mode)
- Alpha channel support
- Exports: `loadFontFromImage()`, `loadFontFromXBData()`

**fontCache.js** - Font Caching

- LRU cache for fonts
- Memory management
- Preloading support
- Exports: `FontCache` class

**freehandTools.js** - Drawing Tools

- Halfblock/Block tool
- Character brush
- Shading brush (░▒▓)
- Line tool with conflict resolution
- Rectangle tool (outline/filled)
- Circle/Ellipse tool (outline/filled)
- Fill tool with smart attributes
- Selection tool (copy/cut/paste/move/flip)
- Sample tool (color picker)
- Tool controller pattern
- Exports: Tool objects with `enable()`/`disable()` methods

**keyboard.js** - Keyboard System

- Keyboard mode toggle
- Text input handling
- Arrow key navigation
- Special character insertion (F-keys)
- Canvas editing shortcuts
- Cursor movement
- Exports: keyboard controller functions

**lazyFont.js** - Lazy Loading

- On-demand font loading
- Loading state management
- Error handling
- Exports: `createLazyFont()`

**magicNumbers.js** - Constants

- Canvas dimensions
- File format signatures
- Color codes
- Character codes
- Exports: Constant values

**network.js** - Network Layer

- WebSocket client management
- Worker initialization and state management
- Non-intrusive connection testing
- Connection state management
- Message protocol handling
- Canvas synchronization
- Chat functionality with repositionable window
- Server log message display (join/leave/nick)
- Desktop notifications
- Collaboration mode selection
- Exports: `createWorkerHandler()`, `createChatController()`

**palette.js** - Color Management

- 16-color ANSI palette
- ICE colors support (extended backgrounds)
- RGB to ANSI conversion
- Color conflict resolution
- Custom palettes (XBIN)
- Palette UI
- Exports: palette component functions

**state.js** - State Management

- Global application state
- Canvas configuration
- Current tool selection
- Color selection
- Font and palette state
- Canvas instance
- Undo/redo history
- Exports: `State` object

**storage.js** - Persistence Layer

- IndexedDB operations
- Canvas data storage
- Editor settings storage
- Auto-save with debouncing
- Restore on startup
- Exports: `Storage` object

**toolbar.js** - Toolbar System

- Tool registration
- Tool switching
- UI state management
- Button highlighting
- Exports: `Toolbar` object

**ui.js** - User Interface

- Modal dialogs
- Menu systems
- Dropdown menus
- Toggle buttons
- Character picker
- Shading panel
- Status bar
- Exports: UI component functions

**collabWorker.js** - Collaboration Transport Worker

- Runs in a module Web Worker thread (bundled by Vite)
- Owns the WebSocket and speaks Moebius-native `{type, data}` frames
- Mandatory initialization sequence (`init` first)
- Same-origin default server URL; explicit `ws://`/`wss://` URLs for remote dial
- Silent probe: a nickless CONNECTED proves a server exists, then closes
- Message guard on both sides of the page RPC
- Keeps UI responsive
- Exports: Worker message protocol

### Core Modules

Shared pure-TypeScript code used by the client, the collaboration worker, and the server.

```
src/js/core/
├── index.ts               # Entry point (re-exports everything)
├── doc.ts                 # Document model
├── editor.ts              # Editing operations over the doc model
├── convert.ts             # Conversions between doc representations
├── cellops.ts             # Cell-level operations
├── journal.ts             # Autosave journal format
├── migrate.ts             # Legacy data migration
├── mapping.ts             # Pointer-to-cell mapping
├── paste.ts               # Paste handling
├── patchArena.ts          # Patch buffer
├── width.ts               # Character width handling
├── charsets.ts            # Charset tables
├── cp437.ts               # CP437 mapping
├── hexfont.ts             # Hex font parsing
├── formatBudget.ts        # Format budget tables
├── blocksData.ts          # Block character data
├── eawData.ts             # East Asian width data
├── codecs/                # File format codecs (SAUCE, BIN, XBIN, ANSI, Tundra, durdraw, .0wnz envelope, zip)
└── protocol/              # Collab protocol (Moebius dialect, extension suite, timelapse)
```

### Server Modules

```
src/js/server/
├── main.js                # Server entry point and CLI
├── config.js              # Configuration parsing
├── moebiusServer.js       # Bun.serve WebSocket layer and routing
├── room.js                # Collaboration room semantics
├── persistence.js         # Room persistence and backups
├── bridge.js              # Bridge to plaintext desktop servers
└── utils.js               # Utility functions
```

#### Server Module Descriptions

**main.js** - Entry Point

- CLI argument processing
- Server startup and room restoration
- Autosave timer and shutdown saves (SIGINT and SIGTERM)
- Doubles as its own Docker healthcheck probe
- Exports: None (executable)

**config.js** - Configuration

- Parse CLI arguments
- Parse server environment variables (room passwords, resize walls)
- Provide defaults
- Exports: `parseArgs()`

**moebiusServer.js** - WebSocket Layer

- Bun.serve HTTP/WebSocket listener (plus optional plaintext listener)
- Path-based room routing (`/` and `/server` reach the default room)
- Frame intake hardening, heartbeat, connection limits
- Optional static file serving and `/healthz`
- Exports: `createMoebiusServer()`

**room.js** - Collaboration Room

- Moebius-native protocol semantics (transport-free)
- User tracking and message broadcasting
- Canvas settings sync and room passwords
- Extension suite for caps-aware clients
- Exports: `createRoom()`

**persistence.js** - Room Persistence

- Saves rooms as native `.0wnz` envelopes with a JSON sidecar
- Loads legacy v2 `.bin` session files as the migration path
- Hourly sha1-deduped timestamped backups
- Exports: `saveRoom()`, `loadRoomDoc()`, `backupRoom()`

**bridge.js** - Collaboration Bridge

- Byte pipe from browser connections to plaintext desktop servers
- Mode gating (`off`, `local`, `port`, `allow`) with address vetting
- Exports: `createBridgePipe()`, `resolveBridgeTarget()`

**utils.js** - Utilities

- Logging functions
- Data sanitization
- Helper functions
- Exports: Utility functions

## Documentation

```
docs/
├── README.md                      # Documentation index
├── architecture.md                # System architecture
├── browser-compatibility-analysis-guide.md # Browser compatibility guide
├── building-and-developing.md     # Development guide
├── cicd.md                        # CI/CD pipeline
├── code_of_conduct.md             # Code of conduct
├── collab-protocol-migration.md   # Collaboration protocol migration
├── collaboration-server.md        # Server documentation (historical)
├── contributing.md                # Contribution guide
├── docker.md                      # Docker guide
├── environment-variables.md       # Environment variable reference
├── examples/                      # Sample artwork
│   ├── ansi/                      # ANSI examples
│   │   ├── x0-defcon25.ans
│   │   ├── x0-grandpa-dan.ans
│   │   └── x0-outlaw-research.ans
│   └── xbin/                      # XBIN examples
│       ├── xz-divinestylers.xb
│       ├── xz-neuromancer.xb
│       └── xz-xero.xb
├── fonts.md                       # Font reference
├── install-pwa.md                 # PWA installation
├── logos.md                       # Project logos
├── manual.md                      # Frontend documentation
├── other-tools.md                 # Additional tools
├── pre-commit                     # Git pre-commit hook
├── privacy.md                     # Privacy policy
├── project-structure.md           # This file
├── sauce-format.md                # SAUCE specification
├── security.md                    # Security policy
├── testing.md                     # Testing guide
├── tutorials.md                   # Tutorials
├── webserver-configuration.md     # Webserver setup
└── xb-format.md                   # XBIN specification
```

## Tests

```
tests/
├── canvasShim.js                 # Canvas API shim for tests
├── setupTests.js                 # Test environment setup
├── unit/                         # Vitest unit tests
│   ├── README.md                 # Unit test documentation
│   ├── asciiArena.test.js        # asciiarena.se browser tests
│   ├── canvas.test.js            # Canvas module tests
│   ├── canvasJournal.test.js     # Canvas autosave journal tests
│   ├── collabWorker.test.js      # Collaboration worker tests
│   ├── compression.test.js       # Compression tests
│   ├── engineParity.test.js      # Engine parity tests
│   ├── file.test.js              # File I/O tests
│   ├── fileAdvanced.test.js      # File I/O - Advanced operations tests
│   ├── fileDocNative.test.js     # Native document format tests
│   ├── fileFormats.test.js       # File I/O - Formats and Parsing tests
│   ├── fileLatin1.test.js        # Latin-1 txt fallback tests
│   ├── fileLoad.test.js          # File I/O - Load and Save tests
│   ├── fileUtf8.test.js          # UTF-8 file handling tests
│   ├── font.test.js              # Font system tests
│   ├── fontCache.test.js         # Font cache tests
│   ├── frames.test.js            # Animation frames tests
│   ├── freehandAdvanced.test.js  # Drawing tools - Advanced tools
│   ├── freehandPanels.test.js    # Drawing tools - Panels and Cursors
│   ├── freehandShapes.test.js    # Drawing tools - Shapes and Fill
│   ├── freehandTools.test.js     # Drawing tools tests
│   ├── freehandToolsExtended.test.js # Drawing tools - Extended coverage
│   ├── gestures.test.js          # Touch gesture tests
│   ├── hexFontPages.test.js      # Unicode glyph source tests
│   ├── journalStore.test.js      # Journal store tests
│   ├── journalWorker.test.js     # Journal worker tests
│   ├── keyboard.test.js          # Keyboard tests
│   ├── keyboardExtended.test.js  # Keyboard - Extended coverage
│   ├── lazyFont.test.js          # Lazy loading tests
│   ├── magicNumbers.test.js      # Constants tests
│   ├── main.test.js              # Main module tests
│   ├── messageGuard.test.js      # postMessage guard tests
│   ├── minimap.test.js           # Minimap tests
│   ├── network.test.js           # Network tests
│   ├── palette.test.js           # Palette tests
│   ├── plugins.test.js           # Plugin surface tests
│   ├── pointer.test.js           # Pointer input tests
│   ├── pressure.test.js          # Pen pressure tests
│   ├── referenceImage.test.js    # Reference image tests
│   ├── server/                   # Server-specific tests
│   │   ├── bridge.test.js        # Bridge tests
│   │   ├── config.test.js        # Config tests
│   │   ├── persistence.test.js   # Persistence tests
│   │   ├── room.test.js          # Room protocol tests
│   │   ├── serverIntegration.test.js # Server integration tests
│   │   └── utils.test.js         # Server utils tests
│   ├── service.test.js           # Service worker tests
│   ├── sixteenColors.test.js     # 16colo.rs browser tests
│   ├── state.test.js             # State management tests
│   ├── storage.test.js           # Storage tests
│   ├── toolbar.test.js           # Toolbar tests
│   ├── ui.test.js                # UI tests
│   ├── uiBasic.test.js           # UI - Basic utilities tests
│   ├── uiComponents.test.js      # UI - Components tests
│   ├── uiControls.test.js        # UI - Controls and controllers tests
│   ├── uiModals.test.js          # UI - Advanced utilities tests
│   ├── utils.test.js             # Client utils tests
│   ├── xbinCompression.test.js   # XBIN compression tests
│   ├── xbinPersistence.test.js   # XBIN persistence tests
│   ├── zoom.test.js              # Zoom tests
│   └── zoomController.test.js    # Zoom controller tests
├── core/                         # Vitest tests for the shared TS core
│   ├── moebius.test.ts           # Moebius protocol codec tests
│   ├── extensions.test.ts        # Protocol extension suite tests
│   ├── envelope.test.ts          # .0wnz envelope codec tests
│   ├── codecs.test.ts            # File format codec tests
│   └── ...                       # doc, editor, journal, mapping, and more
├── dom/                          # Testing Library DOM tests
│   ├── README.md                 # DOM test documentation
│   ├── canvas.test.js            # Canvas DOM tests
│   ├── fontPreview.test.js       # Font preview tests
│   ├── fullscreen.test.js        # Fullscreen tests
│   ├── keyboard.test.js          # Keyboard DOM tests
│   ├── menu.test.js              # Menu tests
│   ├── modal.test.js             # Modal tests
│   ├── palette.test.js           # Palette DOM tests
│   ├── toggleButton.test.js      # Toggle button tests
│   ├── toolbar.test.js           # Toolbar DOM tests
│   └── toolPreview.test.js       # Tool preview tests
├── e2e/                          # Playwright E2E tests
│   ├── README.md                 # E2E test documentation
│   ├── helpers/                  # Shared E2E helpers
│   ├── canvas.spec.js            # Canvas E2E tests
│   ├── clipboard.spec.js         # Clipboard tests
│   ├── collaboration.spec.js     # Collaboration tests
│   ├── collabRoundTrip.spec.js   # Collaboration round-trip tests
│   ├── editor-file-open-and-scroll.spec.js # File loading and scrolling
│   ├── editor-keybinds.spec.js   # Keybind coverage
│   ├── fileOperations.spec.js    # File operations tests
│   ├── gestures.spec.js          # Touch gesture tests
│   ├── keyboard.spec.js          # Keyboard E2E tests
│   ├── mapping.spec.js           # Pointer-to-cell mapping tests
│   ├── palette.spec.js           # Palette E2E tests
│   ├── pwaManifest.spec.js       # PWA manifest tests
│   ├── tools.spec.js             # Tools E2E tests
│   ├── ui.spec.js                # UI E2E tests
│   └── undoRedo.spec.js          # Undo/redo tests
├── golden/                       # Playwright pixel-golden tests
├── gl/                           # Playwright WebGL renderer tests
├── perf/                         # Performance capture scripts
├── interop/                      # Cross-editor protocol interop tests
├── corpus/                       # Round-trip generators
├── parity/                       # v2 reference engine for parity tests
├── baselines/                    # Performance baselines (JSON)
├── fixtures/                     # Shared fixtures
└── results/                      # Test results (gitignored)
    ├── coverage/                 # Unit test coverage
    ├── e2e/                      # E2E artifacts
    └── playwright-report/        # Playwright HTML report
```

## Configuration Files

### Build and Development

**vite.config.js** - Vite Build Configuration

- Entry points
- Output directory and structure
- Asset handling
- Code splitting strategy
- Plugin configuration (PWA, sitemap, static copy, HTML minifier)
- Development server settings

**vite.singlefile.config.js** - Single-File Build Configuration

- Builds the editor as one self-contained file (`bun bake:singlefile`)

**tsconfig.json** - TypeScript Configuration

- Compiler options for the TypeScript sources
- Checked with `bun types:check` (`tsc --noEmit`)

**postcss.config.js** - PostCSS Configuration

- Tailwind CSS processing
- CSS minification (cssnano)
- Advanced optimization

**tailwind.config.js** - Tailwind CSS Configuration

- Content scanning paths
- Dark mode configuration
- Theme customization
- Plugin configuration

**eslint.config.js** - ESLint Configuration

- Linting rules
- HTML linting
- Stylistic rules
- File patterns

**.prettierrc** - Prettier Configuration

```json
{
	"printWidth": 80,
	"tabWidth": 2,
	"useTabs": true,
	"semi": true,
	"singleQuote": true,
	"trailingComma": "all",
	"arrowParens": "avoid",
	"endOfLine": "lf"
}
```

**.prettierignore** - Prettier Ignore Patterns

- `node_modules/`
- `dist/`
- `sessions/`
- `banner`
- `*.js` and `*.html` (ESLint owns JS and HTML formatting)
- `tests/interop/fixtures/`

### Testing

**vitest.config.js** - Vitest Configuration

- Test environment (jsdom)
- Setup files
- Coverage settings
- Threads configuration
- Isolation settings

**playwright.config.js** - Playwright Configuration

- Test directory and match patterns (e2e, golden, gl)
- Timeout settings
- Retry configuration
- Output directory
- Browser projects (Chrome, Firefox, WebKit, plus Chromium golden/GL rails)
- Web server settings

### Docker

**Dockerfile** - Production Container

- Multi-stage build
- Bun + Caddy + Alpine base
- Security hardening
- Non-root user
- Health checks
- Environment variables

**Dockerfile.distroless** - Single-Binary Container

- Multi-stage Bun build
- Compiles the server to one binary on a distroless non-root base
- The binary serves the PWA, collab WebSockets, the bridge, and `/healthz`

**.github/ci.Dockerfile** - CI Container

- Based on Playwright image
- Pre-installed browsers
- Bun runtime
- Development tools

### Git

**.gitignore** - Git Ignore Patterns

- `node_modules/`
- `dist/`
- `tests/results/`
- `sessions/*.bin` and `sessions/*.json`
- `src/fonts/u/` (generated font pages)
- `build/bin/` and `dist-singlefile/`
- OS and editor noise

**.gitattributes** - Git Attributes

- Line ending normalization
- Binary file handling

### Package Management

**package.json** - Package Configuration

- Project metadata
- Dependencies
- Scripts
- Engine requirements
- Repository information

**bun.lock** - Lockfile

- Dependency versions
- Integrity hashes
- Resolution information

## GitHub Actions

```
.github/
├── ci.Dockerfile              # CI container image
├── CODE_OF_CONDUCT.md         # Code of conduct
├── CONTRIBUTING.md            # Contribution guide
├── copilot-instructions.md    # Copilot setup instructions
├── dependabot.yml             # Dependabot configuration
├── FUNDING.yml                # Funding/sponsorship info
├── SECURITY.md                # Security policy
└── workflows/                 # GitHub Actions workflows
    ├── build.yml              # Build verification
    ├── ci-docker-build.yml    # CI image builder
    ├── copilot-setup-steps.yml # Copilot setup workflow
    ├── deploy.yml             # GitHub Pages deployment
    ├── docker-build.yml       # Docker image builder
    ├── e2e.yml                # E2E tests
    ├── golden-update.yml      # Pixel golden refresher
    ├── lint.yml               # Code linting
    ├── merge-reports.yml      # E2E report merger
    ├── pages-preview.yml      # GitHub Pages preview
    ├── release.yml            # Release pipeline
    ├── test-suite.yml         # Main test orchestrator
    ├── unit.yml               # Unit tests
    └── wiki.yml               # Wiki documentation sync
```

> [!NOTE]
> See [CI/CD Pipeline](cicd.md) for detailed workflow documentation.

## Build Output

```
dist/                          # Generated by `bun bake`
├── index.html                 # Main entry point
├── site.webmanifest           # PWA manifest
├── service.js                 # Service worker
├── collabWorker-[hash].js     # Collaboration worker (hashed)
├── journalWorker-[hash].js    # OPFS journal worker (hashed)
├── ansi/                      # Tutorial artwork
├── robots.txt                 # Search engine directives
├── sitemap.xml                # Site map
├── humans.txt                 # Humans.txt
├── favicon.ico                # Favicon
└── ui/                        # UI assets
    ├── stylez-[hash].css      # Minified CSS (hashed)
    ├── icons-[hash].svg       # Icon sprite (hashed)
    ├── topazplus_1200.woff2   # UI font
    ├── fonts/                 # Bitmap fonts (PNG)
    ├── img/                   # Images and icons
    └── js/                    # JavaScript bundles (hashed)
        ├── editor-[hash].js   # Main entry
        ├── core-[hash].js     # Core modules
        ├── canvas-[hash].js   # Canvas system
        ├── tools-[hash].js    # Drawing tools
        ├── fileops-[hash].js  # File operations
        ├── network-[hash].js  # Collaboration
        ├── palette-[hash].js  # Color palette
        ├── profiler-[hash].js # Profiling harness (lazy)
        ├── scrollSpike-[hash].js # Scroll measurement rig (lazy)
        ├── testBridge-[hash].js  # Test bridge (lazy)
        └── rolldown-runtime-[hash].js # Bundler runtime
```

## Related Documentation

- [Architecture](architecture.md) - System architecture and design
- [Building and Developing](building-and-developing.md) - Development workflow
- [Testing](testing.md) - Test structure and guidelines
- [CI/CD Pipeline](cicd.md) - Continuous integration and deployment
