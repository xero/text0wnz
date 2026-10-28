# Architecture

This document provides a comprehensive overview of the teXt0wnz architecture, including application structure, data flow, module organization, and key design decisions.

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Application Modes](#application-modes)
- [Client Architecture](#client-architecture)
- [Server Architecture](#server-architecture)
- [Data Flow](#data-flow)
- [Module Structure](#module-structure)
- [Build System](#build-system)
- [Storage and Persistence](#storage-and-persistence)
- [Design Patterns](#design-patterns)
- [Performance Optimizations](#performance-optimizations)

## High-Level Overview

teXt0wnz is a Progressive Web Application (PWA) for creating and editing text-mode artwork (ANSI, ASCII, XBIN, NFO). The application operates in two distinct modes:

1. **Client-only mode** - Standalone editor with local storage
2. **Collaborative mode** - Real-time multi-user editing via WebSocket server

```
┌────────────────────────────────────────────────────────┐
│                      Browser Client                    │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  UI Layer   │  │ Canvas Layer │  │ Storage Layer │  │
│  │  (Controls) │  │  (Rendering) │  │  (IndexedDB)  │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│         │                │                   │         │
│         └────────────────┴───────────────────┘         │
│                          │                             │
│                   State Management                     │
│                          │                             │
└──────────────────────────┼─────────────────────────────┘
                           │
                  ┌────────┼────────┐
                  │        │        │
         Service Worker    │   File System APIs
         (Offline/Share)   │   (File Handlers)
                           │
                           │
                  Optional WebSocket
                           │
┌──────────────────────────┼────────────────────────────┐
│                   Collaboration Server                │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  WebSocket  │  │ Session Mgmt │  │ File Storage │  │
│  │  Handlers   │  │   (Canvas)   │  │    (Disk)    │  │
│  └─────────────┘  └──────────────┘  └──────────────┘  │
└───────────────────────────────────────────────────────┘
```

## Application Modes

### Client-Only Mode (Standalone)

The default mode when no server is detected or when user chooses local mode.

**Features:**

- Full drawing and editing capabilities
- Local storage persistence (IndexedDB)
- Automatic save/restore
- File import/export
- Offline [PWA support](install-pwa.md)

**Data Flow:**

```
User Action → State Update → Canvas Render → IndexedDB Persist
```

### Collaborative Mode

Activated when connecting to a collaboration server.

**Features:**

- All client-only features plus:
- Real-time multi-user editing
- Synchronized canvas state
- Collaborative chat
- Server-side persistence
- Session management

**Data Flow:**

```
User Action → State Update → Canvas Render → WebSocket Send → Server Broadcast → Other Clients
```

## Client Architecture

### Layer Structure

```
┌──────────────────────────────────────────────────────┐
│                   Presentation Layer                 │
│      UI Components, Modals, Toolbars, Palettes       │
└─────────────────┬────────────────────────────────────┘
                  │
┌─────────────────┴────────────────────────────────────┐
│                   Application Layer                  │
│  Event Handlers, Tool Controllers, State Management  │
└─────────────────┬────────────────────────────────────┘
                  │
┌─────────────────┴────────────────────────────────────┐
│                     Canvas Layer                     │
│  Rendering Engine, Font Management, Dirty Tracking   │
└─────────────────┬────────────────────────────────────┘
                  │
┌─────────────────┴────────────────────────────────────────────────────┐
│                           Data Layer                                 │
│  Storage (IndexedDB), File I/O, Network (WebSocket), PWA (Caching)   │
└──────────────────────────────────────────────────────────────────────┘
```

### Core Modules

**State Management** (`state.js`)

- Global application state
- Canvas dimensions and configuration
- Current tool and color selection
- Font and palette management
- Undo/redo history

**Canvas Rendering** (`glRenderer.js`, `canvas.js`)

- WebGL2 renderer (`glRenderer.js`) is the default
- 2D chunk renderer (`canvas.js`) as fallback (`?renderer=2d`, or wherever WebGL2 is unavailable)
- Dirty region tracking (only redraw changed areas)
- Character and color rendering
- Mirror mode support
- Grid overlay

**Font System** (`font.js`, `lazyFont.js`, `fontCache.js`, `hexFontPages.js`)

- PNG-based bitmap fonts
- Lazy loading on demand
- Font caching for performance
- Support for 100+ classic fonts
- Letter spacing (9px mode)
- Packed Unicode glyph pages fetched on demand (`hexFontPages.js`)

**Drawing Tools** (`freehandTools.js`)

- Halfblock/Block drawing
- Character brush
- Shading brush (░▒▓)
- Line tool with conflict resolution
- Shape tools (rectangle, circle/ellipse)
- Fill tool with smart attributes
- Selection tool with transformations
- Sample tool (color picker)

**Keyboard Mode** (`keyboard.js`)

- Text input handling
- Arrow key navigation
- Special character insertion (F-keys)
- Canvas editing shortcuts

**User Interface** (`ui.js`)

- Modal dialogs
- Toolbar management
- Menu systems
- Color palette UI
- Character picker
- Status bar updates

**File Operations** (`file.js`)

- ANSI format (.ans, .utf8.ans)
- Binary format (.bin)
- XBIN format (.xb)
- Scene release formats (.nfo, .diz)
- Plain text (.txt)
- Full SAUCE metadata support
- PNG export

**File Opening Methods:**

- Traditional file picker (all platforms)
- Drag-and-drop (all platforms)
- OS "Open with" (Desktop Chrome/Edge via File Handlers API)
- Share sheet (Android via Share Target API)
- iOS workaround (`accept="*/*"` for broader file access)

**Service Worker** (`service.js`)

- Offline support and caching
- Share Target API (Android file sharing)
- Workbox-based precaching (js, css, html, woff2, UI svgs, favicons)
- One runtime route: stale-while-revalidate for images
- Legacy cache cleanup and stuck-install recovery on activation
- Stale shared file cleanup

**PWA Capabilities** (`site.webmanifest`)

- File Handlers API (Desktop "Open with" support)
- Share Target API (Mobile share sheet integration)
- Multi-platform file opening:
  - Desktop: OS "Open with" → File Handlers API
  - Android: Share sheet → Share Target API
  - iOS: Manual file picker with `accept="*/*"` hack

**Color Management** (`palette.js`)

- 16-color ANSI palette
- ICE colors (extended backgrounds)
- RGB to ANSI conversion
- Color conflict resolution
- Custom palettes (XBIN)

**Storage** (`storage.js`)

- IndexedDB for canvas persistence: the snapshot (`Uint16Array` plus columns and rows) is stored directly
- One shared database connection; stores for canvas data, embedded XBin font bytes, undo history, and the reference image
- Automatic save/restore driven by `state.js`
- Editor settings in `localStorage`

**Network** (`network.js`, `collabWorker.js`)

- WebSocket client (in a module Web Worker with security hardening)
- Mandatory worker initialization sequence
- Same-origin default server, or any server typed into the Connect form as `host[:port][/room]` or a `ws://`/`wss://` url
- Transport choice per origin: direct from plain pages, through the host's `/bridge` from https pages (plaintext targets)
- Silent connection probe of the same-origin server, or a link's target direct from the browser, never through the bridge
- Connection state management
- Moebius-native protocol handling with input validation
- Canvas synchronization
- Chat functionality

### Event System

Custom events for canvas interaction:

```javascript
document.addEventListener('onTextCanvasDown', handler);
document.addEventListener('onTextCanvasDrag', handler);
document.addEventListener('onTextCanvasUp', handler);
```

This abstraction allows tools to work consistently across:

- Mouse events
- Touch events
- Keyboard events (for cursor position)

### Tool Pattern

Each drawing tool follows this pattern:

```javascript
const createToolController = () => {
	function enable() {
		// Register event listeners
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
		document.addEventListener('onTextCanvasUp', canvasUp);
	}

	function disable() {
		// Unregister event listeners
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		document.removeEventListener('onTextCanvasUp', canvasUp);
	}

	return {
		enable: enable,
		disable: disable,
	};
};
```

Benefits:

- Clean enable/disable without conflicts
- Consistent interface for all tools
- Easy tool switching
- Memory leak prevention

## Server Architecture

### Server Structure

```
┌─────────────────────────────────────────────────────────┐
│                 HTTP/WebSocket Listener                 │
│          (Bun.serve, optional TLS and static)           │
│      + optional plaintext listener (--plain-port)       │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────┐
│                 Path-Based Room Routing                 │
│        /  and  /server  reach the default room          │
│   /server/roomname  and  /roomname  reach a named room  │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────┐
│                 Collaboration Room                      │
│                     (room.js)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Document     │  │ User Sessions│  │ Broadcasting │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Server Modules

**Configuration** (`config.js`)

- Parse CLI arguments
- Parse server environment variables (room passwords, resize walls, the guess budget in `ROOM_MAX_GUESSES`, and trusted proxies in `TRUST_PROXY`)
- Provide defaults
- Export configuration object

**WebSocket Layer** (`moebiusServer.js`)

- Bun.serve listener setup (plus optional plaintext listener)
- TLS configuration
- Path-based room routing
- Frame intake hardening, heartbeat, connection limits
- Optional static file serving and `/healthz`

**Collaboration Room** (`room.js`)

- Moebius-native protocol semantics (transport-free)
- User session tracking
- Message broadcasting
- Canvas settings synchronization
- Extension suite for caps-aware clients

**Password Backoff** (`authGate.js`)

- `moebiusServer.js` keeps a gate per room name for the pre-room password check, and each room keeps its own
- Each client backs off alone; two tries stay free, then its refusal window doubles up to 30 seconds
- A room's budget for every address together is a burst of 20 wrong passwords, refilling one every 3 seconds; `ROOM_MAX_GUESSES` sets the 20, and a spent budget refuses every address but those that have joined before
- Keys on a salted hash of the client address, with IPv6 cut to its /64, never the address itself
- Takes the client address from `X-Real-IP` or the last `X-Forwarded-For` hop only when the peer is loopback or listed in `TRUST_PROXY`; when both headers name different addresses, one is forged, and the request counts as the proxy's own

**Persistence** (`persistence.js`)

- Native `.0wnz` envelope saves with a JSON sidecar
- Legacy v2 `.bin` session migration on first load
- Hourly sha1-deduped timestamped backups

**Bridge** (`bridge.js`)

- Byte pipe from browser connections to plaintext desktop servers
- Mode gating (`off`, `local`, `port`, `allow`) with address vetting and bounded lookups
- Delivery bounds in both directions, an idle reaper, a dial timeout, and an audit line per open, close, and refusal

**Utilities** (`utils.js`)

- Logging helpers
- Data sanitization
- Helper functions

### Message Protocol

The editor and server speak the Moebius collaboration protocol: JSON frames shaped `{type, data}` with the action ids Moebius, moebiusXBIN, and icy_draw use (CONNECTED, JOIN, LEAVE, DRAW, CHAT, SAUCE, ICE_COLORS, USE_9PX_FONT, CHANGE_FONT, SET_CANVAS_SIZE, CHANGE_PALETTE, and friends). The codec lives in `src/js/core/protocol/` and is shared by the browser worker, the Bun server, and the interop tests.

The handshake is client-first: the client sends `CONNECTED {nick, group, pass, caps}`, and the server replies with `CONNECTED {id, doc, users, chat_history, status}` (or `REFUSED`). Caps-aware clients negotiate an extension suite for full-fidelity cells (Unicode glyphs, extended colors); every extension mutation is down-converted to the nearest vanilla frame for caps-less members.

See [Collab Protocol Migration](collab-protocol-migration.md) for protocol details and compatibility notes.

**Chat Message Display:**

The client displays chat messages differently based on context:

- User messages: Displayed with username handle and message text
- Server log messages: Join/leave/nick change events styled as system logs

### State Synchronization

When a user joins:

1. Server replies to `CONNECTED` with the full document (join doc)
2. Client applies canvas settings (size, font, colors, spacing)
3. Client renders the canvas from the document
4. User is added to the session list

When a drawing occurs:

1. Client sends a `DRAW` frame with the affected blocks
2. Server bounds-checks the blocks and updates the room document
3. Server broadcasts to all other clients (the sender applies locally)
4. Other clients update their canvas

## Data Flow

### Drawing Action Flow

```
┌─────────────┐
│ User Action │ (mouse, touch, keyboard)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Tool Handler│ (freehandTools.js)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Calculate  │ (coords, colors, chars)
│   Changes   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Update    │ (State.textArtCanvas)
│   Canvas    │
└──────┬──────┘
       │
       ├──────────────────┐
       │                  │
       ▼                  ▼
┌─────────────┐    ┌─────────────┐
│   Render    │    │   Network   │ (if collaborative)
│  (canvas)   │    │  (websocket)│
└─────────────┘    └──────┬──────┘
                          │
                          ▼
                   ┌─────────────┐
                   │   Server    │
                   │  Broadcast  │
                   └──────┬──────┘
                          │
                          ▼
                   ┌─────────────┐
                   │Other Clients│
                   │   Render    │
                   └─────────────┘
```

### File Save Flow

```
┌─────────────┐
│ User Clicks │ (Save button)
│    Save     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Get Canvas │ (State.textArtCanvas)
│    Data     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Format    │ (ANSI, BIN, XBIN, etc.)
│  Converter  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    Add      │ (if enabled)
│   SAUCE     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Download   │ (Browser download)
│    File     │
└─────────────┘
```

### Auto-Save Flow (Client-Only)

```
┌─────────────┐
│ Undo Group  │ (stroke commit, frame add or remove, view setting change)
│   Closes    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Snapshot   │ (State.saveToLocalStorage: imageData, columns, rows)
│    Doc      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Save to   │ (skipped for a default document or a live collab session)
│  IndexedDB  │
└─────────────┘
```

The autosave journal records the same commits independently (see Storage and Persistence). Undo history is written separately, only on idle, `visibilitychange`, and `pagehide`.

## Module Structure

### Client Modules

```
src/
├── js/client/
│   ├── main.js            # Application entry point
│   ├── state.js           # Global state management
│   ├── glRenderer.js      # WebGL2 renderer (default)
│   ├── canvas.js          # 2D chunk renderer (fallback)
│   ├── ui.js              # User interface components
│   ├── toolbar.js         # Toolbar management
│   ├── palette.js         # Color palette
│   ├── keyboard.js        # Keyboard mode and shortcuts
│   ├── freehandTools.js   # Drawing tools
│   ├── file.js            # File I/O operations
│   ├── network.js         # Network communication
│   ├── collabWorker.js    # Collaboration transport worker
│   ├── font.js            # Font loading and rendering
│   ├── lazyFont.js        # Lazy font loading
│   ├── fontCache.js       # Font caching
│   ├── storage.js         # IndexedDB persistence
│   ├── magicNumbers.js    # Constants and magic values
│   └── ...                # See project-structure.md for the full list
├── js/core/               # Shared pure-TS doc model, codecs, and protocol
└── service.js             # PWA service worker
```

### Server Modules

```
src/js/server/
├── main.js              # Entry point
├── config.js            # Configuration
├── moebiusServer.js     # Bun.serve WebSocket layer
├── room.js              # Collaboration room semantics
├── authGate.js          # Per-client password backoff and room guess budget
├── persistence.js       # Room persistence and backups
├── bridge.js            # Bridge to desktop servers
└── utils.js             # Utilities
```

### Dependency Graph (Client)

Static imports of the main modules. Most of them also import the shared TypeScript core (`src/js/core/`), omitted here; the ten panel, brush, and chrome modules `main.js` wires are listed in [Project Structure](./project-structure.md#client-modules).

```
main.js
  ├── state.js
  │   ├── storage.js        (imports nothing)
  │   └── magicNumbers.js
  ├── canvas.js
  │   ├── glRenderer.js
  │   ├── font.js
  │   │   ├── lazyFont.js
  │   │   └── fontCache.js
  │   ├── hexFontPages.js
  │   ├── journalStore.js
  │   ├── palette.js
  │   ├── pointer.js
  │   ├── zoom.js
  │   ├── ui.js
  │   └── state.js
  ├── ui.js
  │   ├── font.js
  │   ├── zoom.js
  │   └── state.js
  ├── toolbar.js
  │   ├── ui.js
  │   └── state.js
  ├── palette.js
  │   ├── ui.js
  │   └── state.js
  ├── keyboard.js
  │   ├── fkeys.js
  │   ├── toolbar.js
  │   ├── ui.js
  │   └── state.js
  ├── freehandTools.js
  │   ├── asciiBrush.js
  │   ├── glyphScale.js
  │   ├── toolbar.js
  │   ├── ui.js
  │   └── state.js
  ├── file.js
  │   ├── ui.js
  │   └── state.js
  ├── network.js
  │   ├── collabTarget.js
  │   ├── file.js
  │   ├── messageGuard.js
  │   ├── palette.js
  │   ├── recentList.js
  │   ├── ui.js
  │   ├── state.js
  │   └── collabWorker.js   (module web worker, created at runtime)
  └── magicNumbers.js
```

`canvas.js` is the renderer host, not a dependency of the tools: `keyboard.js`, `freehandTools.js`, `file.js`, and `network.js` reach the document through `State.textArtCanvas`.

## Build System

### Vite Configuration

**Code Splitting:**

```javascript
codeSplitting: {
    includeDependenciesRecursively: false,
    groups: [
        { name: 'core',    test: /(magicNumbers|state|storage|ui)\.js$/ },
        { name: 'canvas',  test: /(canvas|font|lazyFont|fontCache)\.js$/ },
        { name: 'tools',   test: /(freehandTools|keyboard|toolbar)\.js$/ },
        { name: 'fileops', test: /file\.js$/ },
        { name: 'network', test: /network\.js$/ },
        { name: 'palette', test: /palette\.js$/ },
    ],
}
```

> [!NOTE]
> Vite 8 bundles with Rolldown, which matches `test` against absolute module ids. The `core` and `canvas` modules import each other, so `includeDependenciesRecursively: false` keeps each chunk to only its listed modules. The `core` group also takes Vite's dynamic import helper, so no chunk imports the entry back.

**Benefits:**

- Faster initial load (progressive loading)
- Better caching (chunks change independently)
- Smaller bundle sizes
- Parallel downloads

**Build Output:**

```
dist/
├── index.html
├── collabWorker-[hash].js        # Collaboration worker
├── journalWorker-[hash].js       # OPFS journal worker
├── ui/js/
│   ├── editor-[hash].js      # Entry point, holds most app code (~150 KB)
│   ├── core-[hash].js        # Client core group: magicNumbers, state, storage, ui (~33 KB)
│   ├── core-[hash].js        # 0wnzlib TypeScript core: doc model, codecs, protocol (~79 KB)
│   ├── canvas-[hash].js      # Canvas system (~26 KB)
│   ├── tools-[hash].js       # Drawing tools (~51 KB)
│   ├── fileops-[hash].js     # File operations (~18 KB)
│   ├── network-[hash].js     # Collaboration (~14 KB)
│   ├── palette-[hash].js     # Palette (~6 KB)
│   ├── asciiBrush-[hash].js  # Ascii brush, lazy (~4 KB)
│   ├── zoom-[hash].js        # Zoom controller, lazy (~3 KB)
│   ├── rolldown-runtime-[hash].js # Bundler runtime (<1 KB)
│   └── ...                   # Opt-in rigs (profiler, scrollSpike, testBridge)
└── ui/
    ├── stylez-[hash].css     # Styles (~90 KB minified)
    ├── fonts/                # Bitmap fonts and packed Unicode pages (~7.4 MB)
    └── img/                  # Images (~1.7 MB)
```

Sizes are from a `bun bake` at the time of writing and drift with every change. Two chunks share the `core-` prefix: the Vite `core` group and the shared TypeScript core under `src/js/core/`, which Rolldown names after its directory.

### Asset Optimization

**CSS:**

- Tailwind JIT compilation
- PostCSS processing
- cssnano minification
- Unused style purging

**JavaScript:**

- Terser minification
- Tree shaking
- Code splitting
- Source maps (dev only)

**Images:**

- PNG bitmap fonts copied as-is
- SVG icon sprite with a cache-busting hash

## Storage and Persistence

### Client Storage (IndexedDB)

**Database: `text0wnz`**

**Object Stores:**

1. **`canvasData`**
   - Key: `currentCanvas`
   - Value: Canvas snapshot (Uint16Array plus metadata)

2. **`fontData`**
   - Key: Font name (e.g. `XBIN`)
   - Value: Embedded font data

3. **`undoHistory`**
   - Key: `currentUndoHistory`
   - Value: none on the current version; the byte-budgeted undo arena does not serialize, so the store stays empty and the undo stack starts fresh each session

4. **`refImage`**
   - Key: `currentRef`
   - Value: the reference image as raw bytes plus MIME type (`{buffer, type}`), never a Blob or File, which Safari drops in a structured clone

The database is at version 4; `storage.js` opens one shared connection and reopens it when a newer tab upgrades the schema. Lightweight editor settings live in `localStorage` (`text0wnz-settings`).

**Snapshot Format:**

- The canvas snapshot goes into `canvasData` as is: `{imageData: Uint16Array, columns, rows}`
- No encoding or compression step on either side; IndexedDB stores the typed array natively
- `state.js` skips the save for a default document and while a collaboration session is connected

**Auto-Save Strategy:**

The autosave journal (`journalStore.js`, with `journalWorker.js` owning the OPFS file) is the source of truth for restoring work in progress. The IndexedDB snapshot is the fallback; restoring it re-seeds the journal.

- `journalStore.js` probes OPFS once per page load and gives up after `OPFS_PROBE_MS` (10 seconds), since every journal call waits on the choice. A failed probe puts the journal in an IndexedDB record log (database `text0wnz-journal`, separate from the snapshot store); where the `indexedDB` global is missing or throws, the journal lives in memory and does not survive a reload
- The `text0wnz-journal-home` flag in `localStorage` records where the profile's journal lives (`opfs` or `idb`) once a backend holds it, and the next boot goes there: a journal in OPFS rides out a failed probe, and one left in IndexedDB by a first probe that ran out of time stays there when a later probe answers, so no boot forks the journal where the next would never look
- `canvas.js` reads the journal as soon as it creates the store, before boot work queues a keyframe of the blank boot document over it (the store runs calls in the order they arrive). `loadBootSnapshot()` hands that read to the restore once, replayed to the native document, and returns null for an empty or unreadable journal, which sends the restore to the IndexedDB snapshot
- When no restore will come (no saved settings, or a launch file opening instead), `releaseBootSnapshot()` lets the snapshot go; it is never dropped on a clock, since a slow boot can reach the restore minutes later

### Service Worker Cache (Cache API)

**Purpose:** Temporary storage for shared files and offline support

**Cache: `text0wnz-shared-files`**

**Usage:**

- Stores files shared via Share Target API (Android)
- Temporary cache cleared after file is opened
- Stale file cleanup on service worker activation

**Cache Strategy:**

```javascript
// Service worker handles POST to /open
self.addEventListener('fetch', event => {
	if (url.pathname === '/open' && event.request.method === 'POST') {
		// Cache shared file temporarily
		event.respondWith(handleShareTarget(event.request));
	}
});
```

**Cache Cleanup:**

- Files deleted immediately after opening in main app
- Stale files cleaned on service worker activation

### Server Storage (File System)

**Session Files** (in `sessions/`):

1. **`{room}.0wnz`**
   - Native envelope with the full-fidelity document
   - Updated on save interval

2. **`{room}.state.json`**
   - Sidecar with full session fidelity
   - Chat history, palette, font bytes, comments, extension cells

3. **`backups/{room}-{timestamp}.0wnz`**
   - Timestamped backups, hourly and sha1-deduped
   - A copy lands only when the content hash changed

Legacy v2 `{room}.bin` session files (BinaryText plus SAUCE) are read on first load and migrate to the native format on the next save.

**File Format (`.0wnz` envelope):**

A versioned JSON envelope, gzipped and gunzipped by `src/js/core/codecs/flate.ts`. That module uses the engine's native streams where they behave (gzip output must decode back to the input, and gunzip output must match the gzip trailer) and its own DEFLATE code otherwise. The envelope holds what the classic formats cannot: Unicode glyph tables, raw-RGB colors, frames with delays, doc mode, and metadata.

## Design Patterns

### Module Pattern

Some modules use the revealing module pattern (`palette.js` and `toolbar.js` among the client modules). The TypeScript core uses plain named exports with `index.ts` re-exporting everything, and most client modules export factory functions (`createTextArtCanvas()`, `createLazyFont()`, `createPanelManager()`) or plain objects (`State`, `Storage`). The pattern, where it appears:

```javascript
const Module = (() => {
	// Private variables
	let privateVar = 0;

	// Private functions
	function privateFunc() {
		// ...
	}

	// Public API
	function publicFunc() {
		// ...
	}

	return {
		publicFunc: publicFunc,
	};
})();
```

### Observer Pattern

Event-driven architecture for loose coupling:

```javascript
// Publish
document.dispatchEvent(
	new CustomEvent('onTextCanvasChange', {
		detail: { x, y, char, fg, bg },
	}),
);

// Subscribe
document.addEventListener('onTextCanvasChange', handler);
```

### Command Pattern

Undo/redo system:

```javascript
const command = {
	execute: () => {
		/* apply change */
	},
	undo: () => {
		/* revert change */
	},
};

State.textArtCanvas.startUndo(); // Push to undo stack
// ... make changes ...
State.textArtCanvas.endUndo(); // Finalize undo entry
```

### Strategy Pattern

Tool system allows runtime tool switching:

```javascript
const tools = {
	keyboard: keyboardTool,
	freehand: freehandTool,
	brush: brushTool,
	// ...
};

function selectTool(toolName) {
	currentTool.disable();
	currentTool = tools[toolName];
	currentTool.enable();
}
```

## Performance Optimizations

### Canvas Rendering

The WebGL2 renderer (`glRenderer.js`) is the default. The strategies below describe the 2D chunk renderer (`canvas.js`), which remains the fallback (`?renderer=2d`, or wherever WebGL2 is unavailable) and employs multiple optimizations for handling canvases of any size efficiently.

#### Virtualized Viewport Rendering

**Lazy Chunk Creation:**
Canvas is divided into 25-row chunks. Only visible chunks (plus a buffer) are created and rendered:

```javascript
const chunkSize = 25;
const canvasChunks = new Map(); // chunkIndex → chunk data
let activeChunks = new Set(); // Currently visible chunks

// Create chunk only when needed
function getOrCreateCanvasChunk(chunkIndex) {
	if (canvasChunks.has(chunkIndex)) {
		return canvasChunks.get(chunkIndex);
	}
	// Create new chunk with its canvas and blink-cell tracking
	const chunk = {
		canvas: createCanvas(width, height),
		ctx: ...,
		blinkCells: new Set(),
		rendered: false
	};
	canvasChunks.set(chunkIndex, chunk);
	return chunk;
}
```

**Viewport Tracking:**
Monitor scroll position to determine which chunks are visible:

```javascript
const viewportState = {
	scrollTop: 0,
	scrollLeft: 0,
	containerHeight: 0,
	visibleStartRow: 0,
	visibleEndRow: 0,
};

function calculateVisibleChunks() {
	const viewportTop = viewportState.scrollTop;
	const viewportBottom = viewportTop + viewportState.containerHeight;
	const bufferZone = chunkSize * 2 * fontHeight; // two chunks of buffer rows

	const startChunk = Math.floor(
		(viewportTop - bufferZone) / (chunkSize * fontHeight),
	);
	const endChunk = Math.floor(
		(viewportBottom + bufferZone) / (chunkSize * fontHeight),
	);

	return { startChunk, endChunk };
}
```

**Dynamic Chunk Management:**
Chunks are attached/detached from DOM as user scrolls:

```javascript
function renderVisibleChunks() {
	const { startChunk, endChunk } = calculateVisibleChunks();

	// Remove chunks outside viewport
	activeChunks.forEach(chunkIndex => {
		if (chunkIndex < startChunk || chunkIndex > endChunk) {
			const chunk = canvasChunks.get(chunkIndex);
			if (chunk.canvas.parentNode) {
				canvasContainer.removeChild(chunk.canvas);
			}
		}
	});

	// Add visible chunks to DOM
	for (let i = startChunk; i <= endChunk; i++) {
		const chunk = getOrCreateCanvasChunk(i);
		if (!chunk.canvas.parentNode) {
			canvasContainer.appendChild(chunk.canvas);
			activeChunks.add(i);
		}
		if (!chunk.rendered) {
			renderChunk(chunk);
		}
	}
}
```

**Performance Impact:**

- 80×200 canvas: ~60% faster initial load (80ms vs 200ms)
- Memory: ~66% reduction (only visible chunks in memory)
- Scalability: Handles canvases up to 2000+ rows efficiently

#### Dirty Region Tracking

Only redraw cells that have changed, not the entire canvas:

```javascript
const dirtyRegions = [];

function enqueueDirtyCell(x, y) {
	dirtyRegions.push({ x, y, w: 1, h: 1 });
	processDirtyRegions();
}

function processDirtyRegions() {
	// Coalesce adjacent regions to minimize draw calls
	const coalesced = coalesceRegions(dirtyRegions);
	dirtyRegions = [];

	coalesced.forEach(region => {
		drawRegion(region.x, region.y, region.w, region.h);
	});
}
```

**Virtualization-Aware Rendering:**
Dirty tracking respects chunk visibility:

```javascript
function redrawGlyph(index, x, y) {
	const chunkIndex = Math.floor(y / chunkSize);
	const chunk = canvasChunks.get(chunkIndex);

	if (!chunk || !activeChunks.has(chunkIndex)) {
		// Mark chunk as dirty for later rendering
		if (chunk) chunk.rendered = false;
		return;
	}

	// Render immediately for visible chunks
	redrawGlyphInChunk(index, x, y, chunk);
}
```

#### RequestAnimationFrame Throttling

**RAF Throttling** (RequestAnimationFrame Throttling) synchronizes expensive operations with the browser's rendering cycle (typically 60fps = 16.67ms per frame). [cite](https://stackoverflow.com/questions/79641790/how-to-throttle-requestanimationframe-efficiently)

**Scroll Event Throttling:**

```javascript
let scrollScheduled = false;
let pendingScrollUpdate = false;

function handleScroll() {
	pendingScrollUpdate = true;

	if (scrollScheduled) return;

	scrollScheduled = true;
	requestAnimationFrame(() => {
		updateViewportState();
		renderVisibleChunks();
		scrollScheduled = false;

		// Handle accumulated scroll events
		if (pendingScrollUpdate) {
			pendingScrollUpdate = false;
			handleScroll();
		}
	});
}

viewportElement.addEventListener('scroll', handleScroll, { passive: true });
```

**Dirty Region Rendering:**

```javascript
let dirtyRegionScheduled = false;

function processDirtyRegions() {
	if (dirtyRegions.length === 0 || processingDirtyRegions) return;

	if (!dirtyRegionScheduled) {
		dirtyRegionScheduled = true;
		requestAnimationFrame(() => {
			processingDirtyRegions = true;
			const coalescedRegions = coalesceRegions(dirtyRegions);
			dirtyRegions = [];

			coalescedRegions.forEach(region => {
				drawRegion(region.x, region.y, region.w, region.h);
			});

			processingDirtyRegions = false;
			dirtyRegionScheduled = false;
		});
	}
}
```

**Benefits:**

- Prevents redundant rendering within same frame
- Syncs updates with browser repaint cycle
- Eliminates jank and tearing
- Maintains smooth 60fps even during rapid changes
- Reduces CPU usage by batching operations

**Progressive Rendering:**
For large canvases, render in batches across multiple frames:

```javascript
function redrawEntireImage(onProgress, onComplete) {
	const totalCells = rows * columns;

	// Dynamic batch sizing
	let batchSize;
	if (totalCells < 10000) {
		batchSize = 10; // Small: 10 rows per frame
	} else if (totalCells < 50000) {
		batchSize = 5; // Medium: 5 rows per frame
	} else {
		batchSize = 3; // Large: 3 rows per frame
	}

	function renderBatch(startRow) {
		const endRow = Math.min(startRow + batchSize, rows);
		drawRegion(0, startRow, columns, endRow - startRow);

		if (onProgress) onProgress(endRow / rows);

		if (endRow < rows) {
			requestAnimationFrame(() => renderBatch(endRow));
		} else if (onComplete) {
			requestAnimationFrame(onComplete);
		}
	}

	renderBatch(0);
}
```

#### Optimized Blink Effect

The blink effect uses selective cell tracking

```javascript
const chunk = {
	canvas: createCanvas(...),
	ctx: canvas.getContext('2d'),
	blinkCells: new Set(),      // Track cells with blink attribute
	startRow: ...,
	endRow: ...
};

// During render, identify cells with blink attribute (background >= 8)
function redrawGlyphInChunk(index, x, y, chunk) {
    // ...
	if (!iceColors && isBlinkBackground) {
		chunk.blinkCells.add(index);  // Track for blink timer
		background -= 8;
		// Draw based on current blink state
        State.font.draw(
            charCode,
            blinkOn ? background : foreground,
            background,
            chunk.ctx,
            x,
            localY
        );
	} else {
		chunk.blinkCells.delete(index);
		State.font.draw(charCode, foreground, background, chunk.ctx, x, localY);
	}
}

// Blink timer only redraws tracked cells
function blink() {
	blinkOn = !blinkOn;
	activeChunks.forEach(chunkIndex => {
		const chunk = canvasChunks.get(chunkIndex);
		if (!chunk || chunk.blinkCells.size === 0) return;

		// Only redraw cells that need blinking
		chunk.blinkCells.forEach(index => {
            // ...
            State.font.draw(
                charCode,
                blinkOn ? background : foreground,
                background,
                chunk.ctx,
                x,
                localY
            );
		});
	});
}
```

**Benefits:**

- No offscreen canvases needed (reduced memory by 66%)
- Only redraws cells that actually blink
- Mutex-based timer prevents race conditions
- Automatically skips chunks with no blinking cells

**Result:** Smooth 60 FPS on canvases of any size (tested with 2000+ row canvases)

### Font Loading

**Lazy Loading:**
Fonts loaded on-demand, not all at once:

```javascript
// Load font when first used
function loadFont(fontName) {
	if (!fontCache.has(fontName)) {
		return fetch(`/ui/fonts/${fontName}.png`).then(img =>
			fontCache.set(fontName, img),
		);
	}
}
```

**Font Cache:**
Keep recently used fonts in memory:

```javascript
const fontCache = new Map(); // LRU cache with size limit
```

### Network Optimization

**Message Batching:**
Multiple canvas changes sent together:

```javascript
const changes = [];
// ... collect changes ...
worker.postMessage({ cmd: 'draw', cells: changes });
```

**Web Worker:**
WebSocket communication in a module worker thread keeps UI responsive:

```javascript
// Main thread
const worker = new Worker(new URL('./collabWorker.js', import.meta.url), {
	type: 'module',
});
// First message MUST be init to establish security context
worker.postMessage({ cmd: 'init' });

// Worker thread
self.onmessage = e => {
	const { cmd, data } = e.data;
	// Handle WebSocket communication
};
```

**Security Features:**

- **Mandatory Initialization**: Worker requires `init` command as first message to establish security context
- **Same-Origin Default**: The default server URL is derived from the worker's own `location` (protocol, hostname, port); explicit `ws://`/`wss://` URLs are accepted only for remote dial
- **Message Guard**: Both sides of the page RPC pass a shared `trustedMessage` check
- **Frame Protection**: Malformed frames fail the shared codec's decode and are dropped without crashing
- **Silent Probe**: Server availability is tested with a nickless CONNECTED that closes immediately; nothing joins and no remote state reaches the page until the user consents

**Connection Flow:**

```javascript
// 1. Initialize worker with security context
worker.postMessage({ cmd: 'init' });

// 2. Worker derives the default server URL from its own location
// protocol = https ? 'wss:' : 'ws:'
// host = self.location.hostname and port
// path = '/server'

// 3. Silent probe (any reply proves a server exists, then it closes)
worker.postMessage({ cmd: 'probe' });

// 4. User chooses collaboration or local mode
// 5. Full connection if the user opts in
worker.postMessage({ cmd: 'connect', nick, group, pass, caps });
```

### Storage Optimization

**Direct typed-array storage:**
The canvas snapshot is written to IndexedDB as the live `Uint16Array`, with no serialization on save or parse on restore:

```javascript
// storage.js
store.put({ imageData, columns, rows }, 'currentCanvas');
```

**Save gating:**
Saves run when an undo group closes, a frame is added or removed, or a view setting changes, and skip when there is nothing worth keeping:

```javascript
// state.js
if (!hasNonDefaultZoom && (this.isDefaultState() || network?.isConnected?.())) {
	return;
}
```

**Deferred heavy writes:**
Undo history is the large write, so `main.js` schedules it through `requestIdleCallback` and on `visibilitychange` and `pagehide` rather than on every stroke.

## Related Documentation

- [Client Editor Manual](manual.md) - Visual guide to the Frontend text art editor
- [Collaboration Server](collaboration-server.md) - Server setup and protocol
- [Building and Developing](building-and-developing.md) - Build process
- [Testing](testing.md) - Test architecture
- [CI/CD Pipeline](cicd.md) - Deployment architecture
