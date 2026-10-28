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
├── .dockerignore           # Paths kept out of the Docker build context
├── .env                    # Environment variables (non-secret build defaults)
├── .git/                   # Git repository
├── .gitattributes          # Git attributes configuration
├── .github/                # GitHub Actions workflows and configs
├── .gitignore              # Git ignore patterns
├── .oxlintrc.json          # oxlint rules for the TypeScript sources
├── .prettierignore         # Prettier ignore patterns
├── .prettierrc             # Prettier configuration
├── AGENTS.md               # House rules for agents and humans (comments, punctuation)
├── assets/                 # Build inputs (hex fonts, Unicode data)
│   ├── hexfonts/           # sha256-pinned unscii and Unifont sources, OFL text, README
│   └── ucd/                # Unicode Blocks and EastAsianWidth tables, README
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
├── tools/                  # Build and codegen scripts (run under bun)
│   ├── bakeHexFonts.js     # Packs assets/hexfonts/ into src/fonts/u/ block pages
│   ├── compileBinaries.js  # bun --compile server binary matrix into build/bin/
│   ├── genEawRanges.js     # Regenerates an East Asian Width range table from assets/ucd/
│   └── genUnicodeBlocks.js # Regenerates src/js/core/blocksData.ts from assets/ucd/
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
├── archiveOpen.js         # Native zip and lha open path with picker modal
├── artpacks.js            # Browse Artpacks landing fronting both site browsers
├── asciiArena.js          # asciiarena.se in-app browser
├── asciiBrush.js          # Applies the ascii stamp engine to the document (brush, line, shapes)
├── autoScroller.js        # Compo-style autoscroll playback of the artwork
├── browserKit.js          # Shared widgets for the archive browsers
├── canvas.js              # 2D chunk renderer (fallback, ?renderer=2d)
├── charsetPicker.js       # Unicode charset picker modal
├── collabTarget.js        # Collab server address grammar and transport choice
├── collabWorker.js        # Collaboration transport worker (Moebius frames)
├── colorPanel.js          # Extended color panel (xterm-256, RGB picker)
├── file.js                # File I/O operations (ANSI, BIN, XBIN, PNG)
├── fkeys.js               # F-key character set bar in the keyboard tool settings
├── flyouts.js             # Rail flyouts anchored beside their opener button
├── font.js                # Font loading and rendering
├── fontCache.js           # Font caching system
├── frames.js              # Animation frames timeline panel
├── freehandTools.js       # Drawing tools implementation
├── gestureGuard.js        # Off-canvas touch guard: pinches drive editor zoom, page zoom suppressed
├── gestures.js            # Touch gesture recognizer
├── glRenderer.js          # WebGL2 renderer (default)
├── glyphScale.js          # Pixel-exact sizing for glyph preview canvases
├── hexFontPages.js        # Runtime Unicode glyph source
├── historyLabels.js       # Client-side labels for the undo history
├── journalStore.js        # Autosave journal store (OPFS, else IndexedDB, else memory)
├── journalWorker.js       # OPFS journal worker
├── keyboard.js            # Keyboard mode and shortcuts
├── lazyFont.js            # Lazy font loading
├── magicNumbers.js        # Constants and magic values
├── messageGuard.js        # Shared postMessage origin guard
├── minimap.js             # Whole-document minimap
├── network.js             # Collab session, Connect form, and chat
├── palette.js             # Color palette management
├── panels.js              # Panel layout registry: drag, shade, dock, reset, persisted layout
├── plugins.js             # ES-module plugin surface
├── pointer.js             # Pointer Events input normalizer
├── profiler.js            # In-app profiling harness (lazy, ?profile)
├── recentList.js          # Bounded recent list in localStorage
├── referenceImage.js      # Reference-image tracing overlay
├── scrollSpike.js         # Scroll measurement rig (lazy, ?spike)
├── selectionBar.js        # Floating action bar over an active selection
├── sixteenColors.js       # 16colo.rs in-app browser
├── state.js               # Global application state
├── storage.js             # IndexedDB persistence
├── testBridge.js          # Playwright test bridge (lazy, ?test)
├── toolbar.js             # Toolbar management
├── toolSettings.js        # Unified tool settings panel; sections swap with the tool
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

**asciiBrush.js** - Ascii Line Brush

- Applies the core ascii stamp engine (`src/js/core/asciiStamp.ts`) to the document
- Additive contact merges, background preservation, and tip and root junction voicing
- Shared by the freehand brush and the line and shape tools
- `commit()` writes to the canvas; `preview()` runs the same pipeline and captures the writes for a ghost
- Exports: `createAsciiBrushController()`, `createAsciiStrokePainter()`

**autoScroller.js** - Autoscroll Playback

- Glides the viewport to the bottom of the artwork, holds, glides back, and repeats a set count or forever
- Speed in rows per second, so playback reads the same at any zoom or font size
- A manual scroll anywhere pauses playback in place
- Scroll speed persists; mode, count, and transport state are session-only

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

**network.js** - Collab Session

- Worker lifecycle and the silent same-origin probe
- The launch invitation and the Connect form (server, password, handle, group, recent servers)
- One attempt object per dial: adopt, refuse, dead socket, dismissal
- Session adoption, extension suite negotiation, resync and timelapse requests
- Remote cursors, chat window, server log lines, desktop notifications
- Exports: `createWorkerHandler()`, `createChatController()`

**collabTarget.js** - Server Addresses

- Parses `host[:port][/room]` or a full `ws://`/`wss://` url the way Moebius's dialog does
- Display spelling that round-trips, the room name for the bridge, the same-origin default
- `resolveTransport()`: direct from plain pages, through the host's `/bridge` from https pages
- Exports: `parseTarget()`, `formatTarget()`, `targetToUrl()`, `targetRoom()`, `defaultServerUrl()`, `resolveTransport()`

**recentList.js** - Recent Lists

- Bounded most-recent-first list in localStorage, tolerant of blocked or corrupt storage
- Shared by the color panel's recent swatches and the Connect form's servers
- Exports: `createRecentList()`

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

- One shared IndexedDB connection (database `text0wnz`, version 4) with the `canvasData`, `fontData`, `undoHistory`, and `refImage` stores
- Canvas snapshots (`Uint16Array` plus columns and rows) stored directly, no transform on the way in or out
- Embedded XBin font bytes and the reference image (raw bytes plus MIME type, never a Blob)
- Editor settings in `localStorage` under `text0wnz-settings`
- Imports nothing; `state.js` decides when to save and restore
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

**panels.js** - Panel Layout

- One data object says where every movable panel lives; one `layout()` applies it
- Drag, shade, close, focus, dock, and reset all mutate the data and call `layout()`; the DOM is never the source of truth
- Persists under one versioned key with a tolerant merge, so new modules never reset a saved layout
- Below a width threshold the layout becomes the phone shell
- Exports: `createPanelManager()`, `isPhone()`, `promoteRowLead()`

**flyouts.js** - Rail Flyouts

- Fixed panels that anchor beside their opener and only show and hide, never reparent
- First click on a group opens its flyout without switching tools; the same button or an outside press closes it
- Arrow keys walk the items; Escape closes and hands focus back to the opener

**selectionBar.js** - Selection Action Bar

- Adopts the selection toolbar element so every button id and handler rides along
- Centers above the selection rect, flips below when there is no headroom, clamps to the canvas area
- Follows the selection, viewport scroll, zoom, and window resizes
- Exports: `createSelectionBar()`

**toolSettings.js** - Tool Settings Panel

- One panel whose sections swap with the selected tool
- A tool with settings calls `show(section)` from its enable; a tool without settings calls `hide()`
- Single owner of the persisted settings values (`toolSettings` key); placement belongs to `panels.js`
- Exports: `createToolSettings()`

**fkeys.js** - F-Key Character Bar

- Twelve one-tap glyph slots riding the active charset page, with pager buttons
- Pages follow the durdraw model: `{label, chars}`, where 0-255 draws the classic font and negative values address the hex fonts and the doc glyph table
- Lives in the keyboard section of the tool settings panel
- Exports: `createFKeys()`

**glyphScale.js** - Glyph Preview Sizing

- Keeps preview canvases at the base glyph size and gives them a CSS size that is a whole multiple of device pixels
- Shares one 1x font for all previews so zoom never scales or crops them
- Exports: `fitGlyphCanvas()`, `fitGlyphs()`, `get1xFont()`, `armPixelRatioWatch()`

**historyLabels.js** - Undo History Labels

- Mirrors the core patch arena stroke by stroke: one label row per commit, truncated with the redo tail
- Tools register a better name than their rail id just before they draw; everything else labels from the active tool
- Consecutive typing within 2.5 seconds displays as one step
- Exports: `createHistoryLabels()`

**gestureGuard.js** - Global Gesture Guard

- Owns every touch that starts outside the canvas; the canvas recognizer keeps its own
- Off-canvas pinches drive the editor zoom through the same `onTextCanvasPinch*` events `zoom.js` consumes
- Suppresses Safari's page zoom so an off-target pinch or double tap cannot skew the layout
- Exports: `createGestureGuard()`

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
├── asciiStamp.ts          # Ascii line stamp engine (freehand path to line art glyphs)
├── circleStamp.ts         # Circle stamp for the ruled shape tools
├── width.ts               # Character width policy (Intl.Segmenter based)
├── charsets.ts            # Charset tables
├── cp437.ts               # CP437 mapping
├── hexfont.ts             # Hex font parsing
├── formatBudget.ts        # Format budget tables
├── blocksData.ts          # Unicode block names and ranges (generated by tools/genUnicodeBlocks.js)
├── codecs/                # File format codecs
│   ├── ans.ts             # ANSI (.ans, .utf8.ans)
│   ├── bin.ts             # BinaryText (.bin)
│   ├── dur.ts             # durdraw
│   ├── envelope.ts        # Native .0wnz envelope
│   ├── flate.ts           # DEFLATE and gzip in plain TS, native streams where they work
│   ├── lha.ts             # LHA/LZH archives
│   ├── pkzip1.ts          # PKZIP 1.x Shrink and Implode decoders
│   ├── sauce.ts           # SAUCE records
│   ├── tundra.ts          # TundraDraw
│   ├── util.ts            # Shared byte helpers and CodecError
│   ├── xbin.ts            # XBin (.xb)
│   └── zip.ts             # Zip archives
└── protocol/              # Collab protocol
    ├── moebius.ts         # Moebius dialect codec
    ├── extensions.ts      # Extension suite for caps-aware clients
    └── timelapse.ts       # Timelapse frames
```

### Server Modules

```
src/js/server/
├── main.js                # Server entry point and CLI
├── config.js              # Configuration parsing
├── moebiusServer.js       # Bun.serve WebSocket layer and routing
├── room.js                # Collaboration room semantics
├── authGate.js            # Per-client password backoff and room guess budget
├── persistence.js         # Room persistence and backups
├── bridge.js              # Bridge to plaintext desktop servers
└── utils.js               # Utility functions
```

#### Server Module Descriptions

**main.js** - Entry Point

- CLI argument processing
- Server startup and room restoration
- Autosave timer and shutdown saves (SIGINT and SIGTERM)
- Validates the bridge environment at boot
- Doubles as its own Docker healthcheck probe
- Exports: None (executable)

**config.js** - Configuration

- Parse CLI arguments
- Parse server environment variables (room passwords, resize walls, the guess budget in `ROOM_MAX_GUESSES`, and trusted proxies in `TRUST_PROXY`)
- Provide defaults
- Exports: `parseArgs()`

**moebiusServer.js** - WebSocket Layer

- Bun.serve HTTP/WebSocket listener (plus optional plaintext listener)
- Path-based room routing (`/` and `/server` reach the default room, `/server/<room>` and `/<room>` a named one)
- Pre-room password gate with backoff, Origin allowlist, frame intake hardening, heartbeat, connection limits
- The `/bridge` endpoint with an always-on audit line per open, close, and refusal
- Optional static file serving and `/healthz`
- Exports: `createMoebiusServer()`

**room.js** - Collaboration Room

- Moebius-native protocol semantics (transport-free)
- User tracking and message broadcasting
- Canvas settings sync and room passwords
- Extension suite for caps-aware clients
- Exports: `createRoom()`

**authGate.js** - Password Backoff

- A gate per room name for the pre-room password check in `moebiusServer.js`, and one inside each room
- Each client backs off alone (two tries free, then a refusal window doubling up to 30 seconds), and a room's budget for every address together is a burst of 20 wrong passwords, refilling one every 3 seconds (`ROOM_MAX_GUESSES` sets the 20)
- Keys on a salted hash of the client address, with IPv6 cut to its /64; the address itself is never kept
- Believes `X-Real-IP` or the last `X-Forwarded-For` hop only from loopback or a `TRUST_PROXY` peer, and counts a request as the proxy's own when the two headers disagree
- Exports: `createAuthGate()`, `clientAddress()`, `addressKey()`

**persistence.js** - Room Persistence

- Saves rooms as native `.0wnz` envelopes with a JSON sidecar
- Loads legacy v2 `.bin` session files as the migration path
- Hourly sha1-deduped timestamped backups
- Exports: `saveRoom()`, `loadRoomDoc()`, `backupRoom()`

**bridge.js** - Collaboration Bridge

- Byte pipe from browser connections to plaintext desktop servers
- Mode gating (`off`, `local`, `port`, `allow`) with address vetting and bounded lookups
- Delivery bounds in both directions (ping-confirmed toward the server, progress-based toward the browser), idle reaper, dial timeout
- Exports: `createBridgePipe()`, `resolveBridgeTarget()`, `bridgeConfigFromEnv()`, `validateBridgeConfig()`, `addressKind()`, `isPrivateAddress()`, `vetResolvedAddresses()`

**utils.js** - Utilities

- Logging functions
- Data sanitization
- Helper functions
- Exports: Utility functions

## Documentation

```
docs/
├── 0wnz-format.md                 # Native .0wnz envelope specification
├── README.md                      # Documentation index
├── architecture.md                # System architecture
├── browser-compatibility-analysis-guide.md # Browser compatibility guide
├── building-and-developing.md     # Development guide
├── cicd.md                        # CI/CD pipeline
├── code_of_conduct.md             # Code of conduct
├── collab-protocol-migration.md   # Collaboration protocol migration
├── collaboration-server.md        # Running the collaboration server
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
├── lha-format.md                  # Amiga archive support and decoder notes
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
│   ├── archiveOpen.test.js       # Native archive open tests
│   ├── artpacks.test.js          # Browse Artpacks landing tests
│   ├── asciiArena.test.js        # asciiarena.se browser tests
│   ├── asciiBrush.test.js        # Ascii brush controller and stroke painter tests
│   ├── autoScroller.test.js      # Autoscroll state machine tests
│   ├── canvas.test.js            # Canvas module tests
│   ├── canvasJournal.test.js     # Canvas autosave journal tests
│   ├── collabTarget.test.js      # Server address grammar tests
│   ├── collabWorker.test.js      # Collaboration worker tests
│   ├── engineParity.test.js      # Scripted-stroke identity gate (live canvas, frozen v2, v3 core)
│   ├── file.test.js              # File I/O tests
│   ├── fileAdvanced.test.js      # File I/O - Advanced operations tests
│   ├── fileDocNative.test.js     # Native document format tests
│   ├── fileError.test.js         # Corrupt file error surfacing tests
│   ├── fileFormats.test.js       # File I/O - Formats and Parsing tests
│   ├── fileLatin1.test.js        # Latin-1 txt fallback tests
│   ├── fileLoad.test.js          # File I/O - Load and Save tests
│   ├── fileSauceFlags.test.js    # SAUCE flag round-trip tests
│   ├── fileUtf8.test.js          # UTF-8 file handling tests
│   ├── font.test.js              # Font system tests
│   ├── fontCache.test.js         # Font cache tests
│   ├── frames.test.js            # Animation frames tests
│   ├── freehandAdvanced.test.js  # Drawing tools - Advanced tools
│   ├── freehandPanels.test.js    # Drawing tools - Panels and Cursors
│   ├── freehandShapes.test.js    # Drawing tools - Shapes and Fill
│   ├── freehandShapeState.test.js # Shape drag state lifecycle tests
│   ├── freehandTools.test.js     # Drawing tools tests
│   ├── freehandToolsExtended.test.js # Drawing tools - Extended coverage
│   ├── gestureGuard.test.js      # Global gesture guard ownership tests
│   ├── gestures.test.js          # Touch gesture tests
│   ├── glyphScale.test.js        # Glyph preview sizing tests
│   ├── hexFontPages.test.js      # Unicode glyph source tests
│   ├── historyLabels.test.js     # Undo history label tests
│   ├── journalStore.test.js      # Journal store tests
│   ├── journalWorker.test.js     # Journal worker tests
│   ├── keyboard.test.js          # Keyboard tests
│   ├── keyboardExtended.test.js  # Keyboard - Extended coverage
│   ├── lazyFont.test.js          # Lazy loading tests
│   ├── magicNumbers.test.js      # Constants tests
│   ├── main.test.js              # Main module tests
│   ├── messageGuard.test.js      # postMessage guard tests
│   ├── minimap.test.js           # Minimap tests
│   ├── moveMode.test.js          # Selection move mode abort contract tests
│   ├── network.test.js           # Network tests
│   ├── openAccept.test.js        # File Open picker accept list tests
│   ├── palette.test.js           # Palette tests
│   ├── plugins.test.js           # Plugin surface tests
│   ├── pointer.test.js           # Pointer input tests
│   ├── pressure.test.js          # Pen pressure tests
│   ├── recentList.test.js        # Recent list tests
│   ├── referenceImage.test.js    # Reference image tests
│   ├── server/                   # Server-specific tests
│   │   ├── authGate.test.js      # Per-client password backoff and room guess budget tests
│   │   ├── bridge.test.js        # Bridge tests
│   │   ├── config.test.js        # Config tests
│   │   ├── persistence.test.js   # Persistence tests
│   │   ├── persistenceAtomic.test.js # Atomic write durability tests
│   │   ├── room.test.js          # Room protocol tests
│   │   ├── roomPath.test.js      # Path to room mapping tests
│   │   ├── serverIntegration.test.js # Server integration tests
│   │   └── utils.test.js         # Server utils tests
│   ├── service.test.js           # Service worker tests
│   ├── sixteenColors.test.js     # 16colo.rs browser tests
│   ├── state.test.js             # State management tests
│   ├── storage.test.js           # Storage tests
│   ├── toolbar.test.js           # Toolbar tests
│   ├── toolSettings.test.js      # Tool settings panel controller tests
│   ├── ui.test.js                # UI tests
│   ├── uiBasic.test.js           # UI - Basic utilities tests
│   ├── uiComponents.test.js      # UI - Components tests
│   ├── uiControls.test.js        # UI - Controls and controllers tests
│   ├── uiMock.js                 # Shared ui.js mock for the freehand suites
│   ├── uiModals.test.js          # UI - Advanced utilities tests
│   ├── utils.test.js             # Client utils tests
│   ├── xbinCompression.test.js   # XBIN compression tests
│   ├── xbinPersistence.test.js   # XBIN persistence tests
│   ├── zoom.test.js              # Zoom tests
│   └── zoomController.test.js    # Zoom controller tests
├── core/                         # Vitest tests for the shared TS core
│   ├── ansCompliance.test.ts     # ANSI escape compliance
│   ├── asciiStamp.test.ts        # Ascii stamp engine goldens
│   ├── cellops.test.ts           # Cell operations
│   ├── charsets.test.ts          # Charset tables
│   ├── circleStamp.test.ts       # Circle stamp
│   ├── codecs.test.ts            # File format codecs
│   ├── convert.test.ts           # Doc representation conversions
│   ├── cp437.test.ts             # CP437 mapping
│   ├── doc.test.ts               # Document model
│   ├── dur.test.ts               # durdraw codec
│   ├── editorFrames.test.ts      # Editor frame operations
│   ├── envelope.test.ts          # .0wnz envelope codec
│   ├── extensions.test.ts        # Protocol extension suite
│   ├── flate.test.ts             # Plain-TS DEFLATE and gzip: hand-built corner streams, caps, native round trips
│   ├── flateWiring.test.ts       # Native or plain codec path under each faked engine
│   ├── formatBudget.test.ts      # Format budget tables
│   ├── hexfont.test.ts           # Hex font parsing
│   ├── journal.test.ts           # Autosave journal format
│   ├── lha.test.ts               # LHA decoder
│   ├── loadDoc.test.ts           # Document loading
│   ├── mapping.test.ts           # Pointer-to-cell mapping
│   ├── migrate.test.ts           # Legacy data migration
│   ├── mirrorParity.test.ts      # u16 mirror path independence
│   ├── moebius.test.ts           # Moebius protocol codec
│   ├── paste.test.ts             # Paste handling
│   ├── patchArena.test.ts        # Patch buffer
│   ├── pkzip1.test.ts            # PKZIP 1.x Shrink and Implode decoders
│   ├── securityCaps.test.ts      # Security caps
│   ├── timelapse.test.ts         # Timelapse protocol
│   ├── tundra.test.ts            # TundraDraw codec
│   ├── width.test.ts             # Character width policy
│   └── zip.test.ts               # Zip codec
├── dom/                          # Testing Library DOM tests
│   ├── README.md                 # DOM test documentation
│   ├── canvas.test.js            # Canvas DOM tests
│   ├── chatEnter.test.js         # Chat input Enter and IME handling tests
│   ├── fontPreview.test.js       # Font preview tests
│   ├── fullscreen.test.js        # Fullscreen tests
│   ├── keyboard.test.js          # Keyboard DOM tests
│   ├── menu.test.js              # Menu tests
│   ├── modal.test.js             # Modal tests
│   ├── palette.test.js           # Palette DOM tests
│   ├── panels.test.js            # Panel manager tests
│   ├── segmentedControl.test.js  # Segmented control (radiogroup) tests
│   ├── toolbar.test.js           # Toolbar DOM tests
│   └── toolPreview.test.js       # Tool preview tests
├── e2e/                          # Playwright E2E tests
│   ├── README.md                 # E2E test documentation
│   ├── helpers/                  # Shared E2E helpers
│   │   ├── archiveFixtures.js    # Zip and durdraw fixtures built in node
│   │   ├── editorHelpers.js      # Editor readiness, focus, tool, and scroll helpers
│   │   └── openFile.js           # File opening helpers
│   ├── asciiBrush.spec.js        # Ascii brush and brush modes for line and shape tools
│   ├── autosave.spec.js          # Autosave journal restore across a reload
│   ├── autoscroll.spec.js        # Minimap autoscroll playback
│   ├── canvas.spec.js            # Canvas E2E tests
│   ├── clipboard.spec.js         # Clipboard tests
│   ├── collaboration.spec.js     # Chat window tests (skip without a live session)
│   ├── collabMoebius.spec.js     # Join a vanilla Moebius server through the Connect form
│   ├── collabRoundTrip.spec.js   # Collaboration round-trip tests
│   ├── compressionFallback.spec.js # Zips, movies, .0wnz saves, and autosave without compression streams
│   ├── damagedArchives.spec.js   # A damaged zip entry opens as far as it decodes, with a note
│   ├── editor-file-open-and-scroll.spec.js # File loading and scrolling
│   ├── editor-keybinds.spec.js   # Keybind coverage
│   ├── fileOperations.spec.js    # File operations tests
│   ├── gestures.spec.js          # Touch gesture tests
│   ├── keyboard.spec.js          # Keyboard E2E tests
│   ├── mapping.spec.js           # Pointer-to-cell mapping tests
│   ├── palette.spec.js           # Palette E2E tests
│   ├── panels.spec.js            # Panel docking and phone layout
│   ├── pwaManifest.spec.js       # PWA manifest tests
│   ├── refimage.spec.js          # Reference image overlay
│   ├── toolSettings.spec.js      # Tool settings panel
│   ├── tools.spec.js             # Tools E2E tests
│   ├── ui.spec.js                # UI E2E tests
│   ├── uiprefs.spec.js           # UI preferences (theme and view toggles)
│   └── undoRedo.spec.js          # Undo/redo tests
├── golden/                       # Playwright pixel-golden tests
│   ├── golden.spec.js            # Screenshot matrix and real-art shots
│   ├── testcard.js               # Deterministic BIN and XBin test cards
│   └── golden.spec.js-snapshots/ # 26 CI-generated goldens (*-golden-linux.png)
├── gl/                           # Playwright WebGL renderer tests
│   ├── contextLoss.spec.js       # Context loss and restore gate
│   └── renderer.spec.js          # WebGL2 availability under SwiftShader
├── perf/                         # Performance capture scripts
│   ├── captureBaseline.js        # Drives ?profile and writes tests/baselines/p0-perf.json
│   └── captureScrollSpike.js     # Drives ?spike and writes tests/baselines/p1-scroll-spike.json
├── interop/                      # Cross-editor protocol interop tests
│   ├── moebius.test.js           # Against the vendored vanilla Moebius 1.0.29 server
│   ├── moebiusxbin.test.js       # Against the vendored moebiusXBIN 2.2.0 server
│   └── fixtures/                 # The vendored servers, their shims, and launchers
├── corpus/                       # Round-trip corpus
│   ├── roundtrip.test.js         # Vitest harness: committed artwork and synthetic fixtures
│   ├── flateZlib.test.js         # Plain-TS DEFLATE checked against node's zlib
│   ├── generators.js             # Seeded synthetic fixture generators
│   ├── generators.d.ts           # Types for the generators
│   ├── lhaFixture.ts             # LHA archive fixtures
│   ├── pkzip1Fixture.ts          # Test-side Shrink and Implode encoders
│   └── zipFixture.ts             # Zip archive fixtures
├── parity/                       # Frozen v2 engine for parity tests
│   └── v2ReferenceEngine.js      # Verbatim v2 doc-mutation subset, read by engineParity.test.js
├── baselines/                    # Performance baselines (JSON: p0-perf, p1-gl-perf, p1-scroll-spike, per device)
├── fixtures/                     # Corpus tiers and automation rules
│   └── README.md
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

- Content scanning paths (`src/index.html`, `src/css/style.css`)
- Class-based dark mode
- Nothing else; Tailwind v4 runs through `@tailwindcss/postcss`

**eslint.config.js** - ESLint Configuration

- Linting rules
- HTML linting
- Stylistic rules
- File patterns

**.oxlintrc.json** - oxlint Configuration

- Correctness rules for the TypeScript sources (`src` and `tests`); `bun lint:check` denies warnings
- Ignores `*.js`, `*.mjs`, and `tests/parity/`, which ESLint owns
- Exists because typescript-eslint cannot load TypeScript 7's compiler; `tsc` still owns the types

**.prettierrc** - Prettier Configuration

```json
{
	"printWidth": 80,
	"tabWidth": 2,
	"useTabs": true,
	"semi": true,
	"singleQuote": true,
	"quoteProps": "consistent",
	"trailingComma": "all",
	"bracketSpacing": true,
	"bracketSameLine": false,
	"arrowParens": "avoid",
	"endOfLine": "lf",
	"overrides": [
		{
			"files": "*.html",
			"options": {
				"printWidth": 400
			}
		}
	]
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

- Based on the Playwright image (`mcr.microsoft.com/playwright:v1.64.0-jammy`)
- Pre-installed browsers
- Bun runtime
- ESLint and Prettier

**.dockerignore** - Docker Build Context

- Keeps `.git`, `node_modules`, `dist`, `tests/results`, session data, `.claude`, and `.env*.local` out of the image build context

### Git

**.gitignore** - Git Ignore Patterns

- `node_modules/`
- `dist/`
- `tests/results/`
- `sessions/*.bin`, `sessions/*.json`, `sessions/*.0wnz`, and `sessions/backups/`
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
├── CODE_OF_CONDUCT.md         # Symlink to ../docs/code_of_conduct.md
├── CONTRIBUTING.md            # Symlink to ../docs/contributing.md
├── copilot-instructions.md    # Copilot setup instructions
├── dependabot.yml             # Dependabot configuration
├── FUNDING.yml                # Funding/sponsorship info
├── SECURITY.md                # Symlink to ../docs/security.md
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
> The three policy files are symlinks, so `docs/` is the single source of truth; edit the files there. See [CI/CD Pipeline](./cicd.md) for detailed workflow documentation.

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
    │   └── u/                 # Packed Unicode glyph pages plus manifest.json
    ├── img/                   # Images and icons
    └── js/                    # JavaScript bundles (hashed)
        ├── editor-[hash].js   # Main entry
        ├── core-[hash].js     # Client core group (magicNumbers, state, storage, ui)
        ├── core-[hash].js     # 0wnzlib TypeScript core (doc model, codecs, protocol)
        ├── canvas-[hash].js   # Canvas system
        ├── tools-[hash].js    # Drawing tools
        ├── fileops-[hash].js  # File operations
        ├── network-[hash].js  # Collaboration
        ├── palette-[hash].js  # Color palette
        ├── asciiBrush-[hash].js # Ascii brush (lazy)
        ├── zoom-[hash].js     # Zoom controller (lazy)
        ├── profiler-[hash].js # Profiling harness (lazy)
        ├── scrollSpike-[hash].js # Scroll measurement rig (lazy)
        ├── testBridge-[hash].js  # Test bridge (lazy)
        └── rolldown-runtime-[hash].js # Bundler runtime
```

Two chunks share the `core-` prefix: the Vite `core` group from `vite.config.js` holds the listed client modules, and the shared TypeScript core under `src/js/core/` lands in its own chunk named after that directory.

## Related Documentation

- [Architecture](architecture.md) - System architecture and design
- [Building and Developing](building-and-developing.md) - Development workflow
- [Testing](testing.md) - Test structure and guidelines
- [CI/CD Pipeline](cicd.md) - Continuous integration and deployment
