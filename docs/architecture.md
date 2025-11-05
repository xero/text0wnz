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
┌─────────────────────────────────────────────────────────────┐
│                      Browser Client                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐       │
│  │  UI Layer   │  │ Canvas Layer │  │ Storage Layer │       │
│  │  (Controls) │  │  (Rendering) │  │  (IndexedDB)  │       │
│  └─────────────┘  └──────────────┘  └───────────────┘       │
│         │                │                   │              │
│         └────────────────┴───────────────────┘              │
│                          │                                  │
│                   State Management                          │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │
                  Optional WebSocket
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                   Collaboration Server                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  WebSocket  │  │ Session Mgmt │  │ File Storage │        │
│  │  Handlers   │  │   (Canvas)   │  │    (Disk)    │        │
│  └─────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## Application Modes

### Client-Only Mode (Standalone)

The default mode when no server is detected or when user chooses local mode.

**Features:**

- Full drawing and editing capabilities
- Local storage persistence (IndexedDB)
- Automatic save/restore
- File import/export
- Offline [PWA support](docs/install-pwa.md)

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
┌─────────────────┴────────────────────────────────────┐
│                      Data Layer                      │
│  Storage (IndexedDB), File I/O, Network (WebSocket)  │
└──────────────────────────────────────────────────────┘
```

### Core Modules

**State Management** (`state.js`)

- Global application state
- Canvas dimensions and configuration
- Current tool and color selection
- Font and palette management
- Undo/redo history

**Canvas Rendering** (`canvas.js`)

- Offscreen canvas for performance
- Dirty region tracking (only redraw changed areas)
- Character and color rendering
- Mirror mode support
- Grid overlay

**Font System** (`font.js`, `lazyFont.js`, `fontCache.js`)

- PNG-based bitmap fonts
- Lazy loading on demand
- Font caching for performance
- Support for 100+ classic fonts
- Letter spacing (9px mode)

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
- NFO format (.nfo)
- Plain text (.txt)
- PNG export
- SAUCE metadata support

**Color Management** (`palette.js`)

- 16-color ANSI palette
- ICE colors (extended backgrounds)
- RGB to ANSI conversion
- Color conflict resolution
- Custom palettes (XBIN)

**Storage** (`storage.js`, `compression.js`)

- IndexedDB for canvas persistence
- Optimized binary compression
- Automatic save/restore
- Editor settings persistence
- Run-length encoding for efficiency

**Network** (`network.js`, `websocket.js`)

- WebSocket client (in Web Worker with security hardening)
- Mandatory worker initialization sequence
- Trusted URL construction from page location
- Silent connection checks (non-intrusive)
- Connection state management
- Message protocol handling with input validation
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

### Express Server Structure

```
┌─────────────────────────────────────────────────────────┐
│                   HTTP/HTTPS Server                     │
│                     (Express 5.x)                       │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────┐
│                  Session Middleware                     │
│                  (express-session)                      │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────┐
│                   WebSocket Routes                      │
│             /        (direct connections)               │
│             /server (proxied connections)               │
└─────────────────┬───────────────────────────────────────┘
                  │
┌─────────────────┴───────────────────────────────────────┐
│              Collaboration Engine                       │
│                  (text0wnz.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Canvas State │  │ User Sessions│  │ Broadcasting │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Server Modules

**Configuration** (`config.js`)

- Parse CLI arguments
- Validate options
- Provide defaults
- Export configuration object

**Server Setup** (`server.js`)

- Express server initialization
- SSL/TLS configuration
- Session middleware setup
- WebSocket routing
- Error handling

**Collaboration Engine** (`text0wnz.js`)

- Canvas state management (imageData object)
- User session tracking
- Message broadcasting
- State persistence
- Canvas settings synchronization

**WebSocket Handling** (`websockets.js`)

- Connection/disconnection handlers
- Message routing
- User cleanup
- Error handling
- Logging

**File I/O** (`fileio.js`)

- Binary file operations
- SAUCE record creation/parsing
- Canvas dimension extraction
- Format conversions
- Timestamped backups

**Utilities** (`utils.js`)

- Logging helpers
- Data validation
- Type conversions
- Helper functions

### Message Protocol

**Client to Server:**

```javascript
const clientProto =
	(['join', username], // Join session
	['nick', newUsername], // Change username
	['chat', message], // Send chat message
	['draw', blocks], // Drawing command
	['resize', { columns, rows }], // Canvas resize
	['fontChange', { fontName }], // Font change
	['iceColorsChange', { iceColors }], // ICE colors toggle
	['letterSpacingChange', { letterSpacing }]); // Letter spacing toggle
```

**Server to Client:**

`start` is the first command run after websocket initialization. It returns the connecting client's session id and the entire shared server state, which the editor caches. If the client chooses to join, the editor is reconfigured with the shared server data and chat features are enabled.

```javascript
const serverProto =
	(['start', sessionData, sessionID, userList], // Canvas data, client id, users
	['join', username, sessionID], // User joined
	['part', sessionID], // User left
	['nick', username, sessionID], // Username changed
	['chat', username, message], // Chat message
	['draw', blocks], // Drawing broadcast
	['resize', { columns, rows }]); // Canvas resize
```

**Chat Message Display:**

The client displays chat messages differently based on context:

- User messages: Displayed with username handle and message text
- Server log messages: Join/leave/nick change events styled as system logs

### State Synchronization

When a user joins:

1. Server sends current canvas state via "start" message
2. Client applies canvas settings (size, font, colors, spacing)
3. Client renders canvas from imageData
4. User is added to session list

When a drawing occurs:

1. Client sends "draw" message with affected blocks
2. Server updates internal imageData
3. Server broadcasts to all other clients
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
│   Canvas    │ (change detected)
│   Changes   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Compress   │ (RLE compression)
│    Data     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Save to   │ (with debouncing)
│  IndexedDB  │
└─────────────┘
```

## Module Structure

### Client Modules

```
src/js/client/
├── main.js              # Application entry point
├── state.js             # Global state management
├── canvas.js            # Canvas rendering engine
├── ui.js                # User interface components
├── toolbar.js           # Toolbar management
├── palette.js           # Color palette
├── keyboard.js          # Keyboard mode and shortcuts
├── freehandTools.js     # Drawing tools
├── file.js              # File I/O operations
├── network.js           # Network communication
├── websocket.js         # WebSocket worker
├── font.js              # Font loading and rendering
├── lazyFont.js          # Lazy font loading
├── fontCache.js         # Font caching
├── storage.js           # IndexedDB persistence
├── compression.js       # Data compression
└── magicNumbers.js      # Constants and magic values
```

### Server Modules

```
src/js/server/
├── main.js              # Entry point
├── config.js            # Configuration
├── server.js            # Express server
├── text0wnz.js          # Collaboration engine
├── websockets.js        # WebSocket handlers
├── fileio.js            # File operations
└── utils.js             # Utilities
```

### Dependency Graph (Client)

```
main.js
  ├── state.js
  ├── canvas.js
  │   ├── font.js
  │   ├── lazyFont.js
  │   └── fontCache.js
  ├── ui.js
  │   └── state.js
  ├── toolbar.js
  ├── palette.js
  ├── keyboard.js
  │   ├── state.js
  │   └── canvas.js
  ├── freehandTools.js
  │   ├── state.js
  │   ├── canvas.js
  │   └── toolbar.js
  ├── file.js
  │   ├── state.js
  │   └── canvas.js
  ├── network.js
  │   ├── state.js
  │   ├── canvas.js
  │   └── websocket.js (web worker)
  ├── storage.js
  │   ├── state.js
  │   └── compression.js
  └── magicNumbers.js
```

## Build System

### Vite Configuration

**Code Splitting:**

```javascript
manualChunks: {
    core:    ['state', 'storage', 'compression', 'ui'],
    canvas:  ['canvas', 'font', 'lazyFont', 'fontCache'],
    tools:   ['freehandTools', 'keyboard', 'toolbar'],
    fileops: ['file'],
    network: ['network'],
    palette: ['palette']
}
```

**Benefits:**

- Faster initial load (progressive loading)
- Better caching (chunks change independently)
- Smaller bundle sizes
- Parallel downloads

**Build Output:**

```
dist/
├── index.html
├── ui/js/
│   ├── editor-[hash].js      # Entry point (~20 KB)
│   ├── core-[hash].js        # Core modules (~80 KB)
│   ├── canvas-[hash].js      # Canvas system (~60 KB)
│   ├── tools-[hash].js       # Drawing tools (~100 KB)
│   ├── fileops-[hash].js     # File operations (~40 KB)
│   ├── network-[hash].js     # Collaboration (~30 KB)
│   ├── palette-[hash].js     # Palette (~15 KB)
│   └── websocket.js          # Worker (no hash)
└── ui/
    ├── stylez-[hash].css     # Styles (~30 KB compressed)
    ├── fonts/                # Bitmap fonts (~2 MB)
    └── img/                  # Images (~500 KB)
```

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

- PNG optimization (fonts)
- SVG sprite generation

## Storage and Persistence

### Client Storage (IndexedDB)

**Database: `textArtDB`**

**Object Stores:**

1. **`canvasData`**
   - Key: `currentCanvas`
   - Value: Compressed canvas data
   - Updates: Debounced (500ms after last change)

2. **`editorSettings`**
   - Key: Various setting names
   - Values: User preferences
   - Examples: `selectedFont`, `iceColors`, `letterSpacing`, `gridVisible`

**Compression:**

- Run-length encoding (RLE)
- Stores only changed regions
- Typical compression: 90%+ for most artwork

**Auto-Save Strategy:**

```javascript
// Debounced save after changes
const saveToIndexedDB = debounce(() => {
	const compressed = compress(canvasData);
	db.put('canvasData', compressed, 'currentCanvas');
}, 500);
```

### Server Storage (File System)

**Session Files:**

1. **`{sessionName}.bin`**
   - Binary canvas data
   - Current state
   - Updated on save interval

2. **`{sessionName}.json`**
   - Chat history
   - Metadata
   - User information

3. **`{sessionName} {timestamp}.bin`**
   - Timestamped backups
   - Created on each save
   - Manual recovery if needed

**File Format (Binary):**

```
Canvas Data:
- Width: 2 bytes (uint16)
- Height: 2 bytes (uint16)
- Data: width * height * 2 bytes (character + attribute per cell)

Attributes Byte:
- Bits 0-3: Foreground color (0-15)
- Bits 4-7: Background color (0-7 or 0-15 with ICE)
- Bit 7: Blink (if not ICE colors)
```

## Design Patterns

### Module Pattern

All modules use the revealing module pattern:

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

The canvas rendering system employs multiple optimization strategies for handling canvases of any size efficiently.

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
	// Create new chunk with canvas, offscreen canvas for blink
	const chunk = {
		canvas: createCanvas(width, height),
		ctx: ...,
		onBlinkCanvas: createCanvas(width, height),
		offBlinkCanvas: createCanvas(width, height),
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
	const bufferZone = chunkSize * fontHeight; // 1 chunk buffer

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
worker.postMessage({ cmd: 'draw', blocks: changes });
```

**Web Worker:**
WebSocket communication in worker thread keeps UI responsive:

```javascript
// Main thread
const worker = new Worker('websocket.js');
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
- **Trusted URL Construction**: WebSocket URLs are constructed only from the worker's own `location` object (protocol, hostname, port)
- **URL Validation**: Malformed WebSocket URLs are detected and rejected using URL constructor validation
- **Input Sanitization**: All error messages and unknown commands sanitize output to prevent injection
- **JSON Parsing Protection**: Invalid JSON from server is caught and safely logged without crashing
- **Silent Connection Check**: Server availability is tested silently before prompting user, avoiding intrusive errors

**Connection Flow:**

```javascript
// 1. Initialize worker with security context
worker.postMessage({ cmd: 'init' });

// 2. Worker establishes trusted parameters from its own location
// allowedHostname = self.location.hostname
// trustedProtocol = self.location.protocol === 'https:' ? 'wss:' : 'ws:'
// trustedPort = self.location.port || (https ? '443' : '80')

// 3. Silent connection check (optional)
worker.postMessage({ cmd: 'connect', silentCheck: true });

// 4. User chooses collaboration or local mode
// 5. Full connection established if user opts in
```

### Storage Optimization

**Compression:**
Run-length encoding reduces storage size:

```javascript
// Before: [1,1,1,1,1,2,2,2,3,3]
// After:  [[1,5],[2,3],[3,2]]
// Savings: 60% typical
```

**Debouncing:**
Avoid excessive saves:

```javascript
const debouncedSave = debounce(saveToIndexedDB, 500);
```

## Related Documentation

- [Editor Client](editor-client.md) - Frontend features and usage
- [Collaboration Server](collaboration-server.md) - Server setup and protocol
- [Building and Developing](building-and-developing.md) - Build process
- [Testing](testing.md) - Test architecture
- [CI/CD Pipeline](cicd.md) - Deployment architecture
