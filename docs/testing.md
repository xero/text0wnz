# Testing

teXt0wnz uses a comprehensive three-part testing strategy: unit tests with Vitest, DOM/component tests with Testing Library, and end-to-end tests with Playwright. Vitest also runs the shared core suites, the round-trip corpus, and the upstream interop tests; Playwright also runs the golden screenshot suite and the WebGL rail.

> [!IMPORTANT]
> view the latest [unit coverage report](https://xero.github.io/text0wnz/tests/)
> view the latest [e2e testing report](https://xero.github.io/text0wnz/tests/e2e/)

## Testing Strategy Overview

### Triple-Headed Testing

**Vitest (Unit Tests)**

- Test individual modules and functions in isolation
- Fast execution
- High coverage of business logic
- Mock external dependencies

**Testing Library (DOM/Component Tests)**

- Test DOM manipulation and user interactions
- Focus on behavior over implementation
- User-centric testing approach
- Integration between UI components

**Playwright (E2E Tests)**

- Test complete user workflows in real browsers
- Cross-browser compatibility testing
- Visual regression detection
- Realistic user scenarios

## Directory Structure

```
tests/
├── unit/                          # Vitest unit tests
│   ├── canvas.test.js             # client tests in the root
│   ├── fileLoad.test.js          # File I/O - Load and Save
│   ├── freehandAdvanced.test.js  # Drawing tools - Advanced Tools
│   ├── uiBasic.test.js           # UI - Basic Utilities
│   ├── ...
│   └── server/                    # Server tests nested
│       ├── config.test.js
│       ├── room.test.js
│       └── ...
├── core/                          # Vitest tests for the shared TS core
│   ├── moebius.test.ts
│   ├── envelope.test.ts
│   └── ...
├── dom/                           # Testing Library tests
│   ├── canvas.test.js
│   ├── fontPreview.test.js
│   └── ...
├── e2e/                           # Playwright E2E tests
│   ├── canvas.spec.js
│   ├── tools.spec.js
│   └── ...
├── golden/                        # Playwright pixel-golden tests
│   ├── golden.spec.js             # screenshot matrix and real-art shots
│   ├── testcard.js                # deterministic BIN and XBin test cards
│   └── golden.spec.js-snapshots/  # 26 CI-generated goldens
├── gl/                            # Playwright WebGL renderer tests
│   ├── contextLoss.spec.js        # context loss and restore gate
│   └── renderer.spec.js           # WebGL2 under SwiftShader
├── perf/                          # Performance capture scripts (node, not a test suite)
│   ├── captureBaseline.js         # bun perf:baseline
│   └── captureScrollSpike.js      # bun perf:spike
├── interop/                       # Cross-editor protocol interop tests
│   ├── moebius.test.js            # vendored vanilla Moebius 1.0.29
│   ├── moebiusxbin.test.js        # vendored moebiusXBIN 2.2.0
│   └── fixtures/                  # the servers, shims, and launchers
├── corpus/                        # Round-trip corpus
│   ├── roundtrip.test.js          # committed artwork and synthetic fixtures
│   ├── generators.js              # seeded fixture generators
│   ├── lhaFixture.ts              # LHA archive fixtures
│   └── zipFixture.ts              # Zip archive fixtures
├── parity/                        # Frozen v2 engine for parity tests
│   └── v2ReferenceEngine.js
├── baselines/                     # Performance baselines (JSON, per renderer and device)
├── fixtures/                      # Corpus tiers and automation rules
│   └── README.md
├── results/                       # Test results (gitignored)
│   ├── coverage/                  # Coverage reports
│   ├── e2e/                       # E2E artifacts
│   └── playwright-report/         # Playwright HTML report
├── canvasShim.js                  # Canvas API shim for tests
└── setupTests.js                  # Test environment setup
```

## Vitest (Unit Testing)

### Configuration

**File:** `vitest.config.js`

```javascript
import { defineConfig } from 'vitest/config';

const ignore = [
	'*.config.js',
	'banner',
	'dist',
	'docs',
	'session',
	'node_modules',
	// playwright suites, not vitest
	'tests/e2e/**',
	'tests/golden/**',
	'tests/gl/**',
	'tests/perf/**',
	'src/img/**',
	'src/css/**',
];

export default defineConfig({
	test: {
		environment: 'jsdom',
		setupFiles: ['./tests/canvasShim.js', './tests/setupTests.js'],
		globals: true,
		isolate: true, // Ensure clean state between tests
		maxWorkers: 1, // Single thread to avoid memory multiplication
		exclude: ignore,
		coverage: {
			enabled: true,
			reporter: ['text', 'html'],
			reportsDirectory: 'tests/results/coverage',
			exclude: ignore,
		},
	},
});
```

> [!NOTE]
> Vitest v4 deprecated `threads`/`maxThreads` in favor of `maxWorkers`/`isolate`
> Set maxWorkers: 1 and isolate: true for single-threaded execution.

### Running Unit Tests

**Run all tests:**

```bash
bun test:unit
# or
npm run test:unit
```

**Run tests with coverage:**

```bash
npx vitest run --coverage
# or
bunx vitest run --coverage
```

**Run tests in watch mode:**

```bash
npx vitest
# or
bunx vitest
```

**Run specific test file:**

```bash
npx vitest tests/unit/canvas.test.js
npx vitest tests/unit/server/config.test.js
```

**Run tests matching a pattern:**

```bash
npx vitest canvas
npx vitest server
```

**Run tests with UI:**

```bash
npx vitest --ui
```

### What `bun test:unit` Runs

`vitest run` picks up every `*.test.js` and `*.test.ts` file outside the excludes in `vitest.config.js`. At the time of writing that is 75 files in `tests/unit` (server tests under `server/`), 29 in `tests/core`, 12 in `tests/dom`, 2 in `tests/interop`, and 1 in `tests/corpus`. `bunx vitest list --filesOnly` prints the live list. The Playwright directories (`e2e`, `golden`, `gl`) and the `perf` scripts are excluded.

### Test Coverage

**Current status:**

The published [coverage report](https://xero.github.io/text0wnz/tests/) is the source of truth; `unit.yml` regenerates it on every push to `main`. Locally, `bun test:unit` writes the same report to `tests/results/coverage/`.

**Coverage goals:**

- Critical modules: 80%+ coverage
- General modules: 60%+ coverage
- Utility functions: 90%+ coverage

**View coverage report:**

```bash
# After running tests with --coverage
open tests/results/coverage/index.html      # macOS
xdg-open tests/results/coverage/index.html  # Linux
start tests/results/coverage/index.html     # Windows
```

#### V8 Coverage Improvements in Vitest v4

Vitest v4 uses AST-based coverage analysis for more accurate results.

- More precise coverage mapping with fewer false positives
- Lines without runtime code are automatically excluded
- `coverage.ignoreClassMethods` now supported by V8 provider
- New ignore comment syntax:
  - Single line: `/* v8 ignore next */`
  - Code block: `/* v8 ignore start */` and `/* v8 ignore stop */`

#### Coverage ignore examples

**Ignore a single line:**

```javascript
/* v8 ignore next */
if (DEBUG) console.log('debug info');
```

**Ignore a block:**

```javascript
/* v8 ignore start */
const debug = msg => {
	console.log('debug info:', msg);
};
/* v8 ignore stop */
```

### Test Files

#### Client Modules

**canvas.test.js** - Canvas rendering and manipulation

- Canvas initialization and setup
- Drawing operations
- Undo/redo functionality
- Image data manipulation
- Dirty region tracking
- Mirror mode functionality
- XBin font/palette handling

**fileLoad.test.js** - File I/O: Load and Save operations

- Load module functionality
- Save module operations
- Data type conversions
- Basic file format handling
- ANSI and binary file support

**fileFormats.test.js** - File I/O: Formats and parsing

- Binary data handling
- Error handling
- File class internal logic
- SAUCE record processing
- ANSI parsing engine
- UTF-8 processing

**fileAdvanced.test.js** - File I/O: Advanced operations

- Advanced save operations
- Data conversion functions
- File format edge cases
- Internal data processing
- PNG image generation
- Font name conversions

**font.test.js** - Font loading and rendering

- Font loading from images
- XB font data parsing
- Glyph rendering
- Letter spacing handling
- Alpha channel rendering
- Error handling
- Font dimension validation

**freehandPanels.test.js** - Drawing tools: Panels and cursors

- Panel cursor creation
- Floating panel palette
- Floating panel management
- Brush controller
- Half-block controller
- Shading controller and panel
- Character brush panel

**freehandShapes.test.js** - Drawing tools: Shapes and fill

- Fill controller
- Shapes controller
- Line controller
- Square controller (outline and fill modes)
- Circle controller
- Shape drawing algorithms

**freehandAdvanced.test.js** - Drawing tools: Advanced tools

- Attribute brush controller
- Selection tool
- Sample tool (color picker)
- Line drawing algorithms
- Panel state management
- Event handling edge cases
- Memory management patterns

**keyboard.test.js** - Keyboard input and shortcuts

- Keyboard mode toggle
- Text input handling
- Arrow key navigation
- Shortcut key handling
- Cursor movement
- Special key handling

**main.test.js** - Application initialization

- Module initialization
- Event listener setup
- State management
- Integration tests

**network.test.js** - Network and collaboration

- The probe and the launch invitation
- The Connect form: address parsing, recent servers, refusals, dead and bridged dials, dismissal
- Session adoption, palette depth, extension suite replay
- Chat functionality and user sessions
- Drawing synchronization

**palette.test.js** - Color palette management

- Default palette creation
- Color selection
- RGB conversion
- Ice colors support
- Palette updates

**state.test.js** - Global state management

- State initialization
- State updates
- Font management
- Palette management
- Canvas state

**toolbar.test.js** - Toolbar interactions

- Tool selection
- Tool switching
- Toolbar state management
- UI updates

**uiBasic.test.js** - User interface: Basic utilities

- DOM utilities ($, $$, createCanvas)
- Setting toggles
- Event listener functions (onClick, onReturn, onFileChange)
- Position info display
- Modal functions
- Undo/redo functionality

**uiControls.test.js** - User interface: Controls and controllers

- Toggle button creation
- Generic controller pattern
- Byte enforcement for text fields
- WebSocket UI updates
- Fullscreen toggle
- Modal controller management

**uiComponents.test.js** - User interface: Components

- Viewport tap interactions
- Paint shortcuts system
- Resolution controller
- Drag and drop controller
- Menu controller

**uiModals.test.js** - User interface: Advanced utilities

- Additional DOM utilities ($$$)
- Grid creation and management
- Tool preview rendering
- Font selection interface
- WebSocket connectivity UI

**utils.test.js** - Utility functions

- Helper functions
- Data manipulation
- Format conversions

**collabWorker.test.js** - Collaboration transport worker

- Worker RPC handling (init, probe, connect, send, draw)
- Transport routing: direct or through the bridge, and a probe that never bridges
- The dial timeout and the route carried on errors and closes
- Frame handling and stale socket cleanup

**collabTarget.test.js** - Server address grammar

- Bare hosts, ports, rooms, explicit urls, v6 literals, rejections
- Display spelling round trips
- Transport resolution per page origin

**recentList.test.js** - Recent lists

- Tolerant reads, deduped and trimmed writes, storage failures

**xbinPersistence.test.js** - XBin format persistence

- Embedded font handling
- Palette persistence
- File roundtrip testing

> [!NOTE]
> **Test File Organization Best Practices**
>
> Test files should be **small and focused** on testing specific features rather than entire sections of the editor. Each test file should:
>
> - Focus on a single module or feature area (e.g., `fileLoad.test.js` for loading, `fileFormats.test.js` for parsing)
> - Keep file size under ~500 lines for maintainability
> - Group related functionality logically (e.g., UI controls vs. UI components)
> - Make it easy to locate and run tests for specific features
> - Enable faster test execution when working on specific areas
>
> Large monolithic test files (1000+ lines) should be split into focused, feature-specific files as demonstrated by:
>
> - `ui*.test.js` - Split by UI feature groups (basic, controls, components, modals)
> - `file*.test.js` - Split by operation type (load, formats, advanced)
> - `freehand*.test.js` - Split by tool categories (panels, shapes, advanced)

#### Server Modules

**server/config.test.js** - Server configuration

- CLI argument parsing
- Environment variable parsing
- Default values

**server/room.test.js** - Collaboration room

- Connect, join, and refuse flows
- Draw broadcasting and chat
- Canvas settings sync
- Extension suite and hostile input hardening

**server/persistence.test.js** - Room persistence

- Envelope save and load
- Legacy `.bin` session migration
- Backup deduplication

**server/bridge.test.js** - Collaboration bridge

- Bridge mode gating (off, local, port, allow)
- Target address vetting, strict ports, bounded lookups
- Environment validation at boot
- Pipe bounds: ping-confirmed delivery toward the server, progress toward the browser, the idle reaper

**server/roomPath.test.js** - Path to room

- The default room under every spelling, named rooms bare or behind `/server/`, the grammar

**server/serverIntegration.test.js** - Server integration

- Real sockets against a spawned server: routing, password gate and backoff, Origin allowlist
- The bridge over real sockets, refusals without a reason in the body, audit lines

**server/utils.test.js** - Server utilities

- Helper functions
- Data validation
- Format conversions

**server/persistenceAtomic.test.js** - Atomic writes

- The temp file syncs to disk before the rename makes it the real one, so a power loss cannot keep the rename and drop the data

#### Core Modules

`tests/core/` holds 29 TypeScript suites for the shared core under `src/js/core/`. They run in the same Vitest process as the client tests (`tsconfig.json` includes `tests/**/*.ts`) and import the modules directly. Grouped by area:

- **Document model and editing:** `doc`, `editorFrames`, `cellops`, `convert`, `patchArena`, `paste`, `mapping`, `migrate`, `loadDoc`, `mirrorParity`, `journal`
- **Codecs:** `codecs` (SAUCE, BIN, XBin, ANSI), `ansCompliance`, `dur`, `tundra`, `envelope`, `zip`, `lha`, `formatBudget`
- **Protocol:** `moebius`, `extensions`, `timelapse`, `securityCaps`
- **Text and glyphs:** `cp437`, `charsets`, `width`, `hexfont`, `asciiStamp`, `circleStamp`

### Writing Unit Tests

> [!IMPORTANT]
> **Vitest v4+ requires regular functions (not arrow functions) for constructor mocks**
>
> When mocking constructors, you must use the `function` keyword or `class` syntax. Arrow functions will cause a "not a constructor" error.
>
> For more details, see the [Vitest v4 migration guide](https://v4.vitest.dev/guide/migration#vitest-4).
>
> Since the project's ESLint configuration prefers arrow functions, you may see lint warnings when using regular functions for constructor mocks.
>
> **Best practice:** Only disable ESLint's `prefer-arrow-callback` or `func-names` rules locally, around the specific constructor mock, rather than for the entire file. For example:
>
> ```javascript
> // eslint-disable-next-line prefer-arrow-callback
> const MyMock = function () {
> 	/* ... */
> };
> ```
>
> Or, if you need to disable `func-names` for anonymous constructors:
>
> ```javascript
> // eslint-disable-next-line func-names
> const MyMock = function () {
> 	/* ... */
> };
> ```

> [!IMPORTANT]
> **Vitest v5 requires `vi.stubGlobal()` to mock `document`, `navigator`, or `localStorage`**
>
> In v5, assigning a global also updates the underlying jsdom window, and these properties are getter-only there. Plain assignment like `global.document = mockDocument` throws `Cannot set property document of [object Window] which has only a getter`.
>
> ```javascript
> vi.stubGlobal('document', mockDocument);
> vi.stubGlobal('navigator', { userAgent: 'Chrome/90.0' });
> ```
>
> You can still assign writable globals like `URL`, `Blob`, `FileReader`, and `btoa` directly.
>
> For more details, see the [Vitest v5 migration guide](https://vitest.dev/guide/migration).

**Test structure:**

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { functionToTest } from '../../src/js/client/module.js';

describe('Module Name', () => {
	beforeEach(() => {
		// Setup before each test
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Cleanup after each test
		vi.restoreAllMocks();
	});

	describe('Function Group', () => {
		it('should do something specific', () => {
			// Arrange
			const input = 'test data';

			// Act
			const result = functionToTest(input);

			// Assert
			expect(result).toBe('expected output');
		});

		it('should handle edge cases', () => {
			expect(() => functionToTest(null)).toThrow();
		});
	});
});
```

**Mocking:**

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { functionToTest } from '../../src/js/client/module.js';

// Example of a constructor mock using a regular function:

// eslint-disable-next-line prefer-arrow-callback
const MyConstructorMock = function () {
	// mock implementation
};

// Mock a regular function (arrow functions are OK for regular function mocks, but NOT for constructor mocks)
const mockFunction = vi.fn(() => 'mocked value');

// Mock a constructor - MUST use function keyword or class
global.FileReader = vi.fn(function () {
	return mockReaderInstance;
});

// OR use a class for constructor mocks
global.FileReader = vi.fn(
	class MockFileReader {
		constructor() {
			this.result = null;
		}
		readAsArrayBuffer() {
			// mock implementation
		}
	},
);

// Spy on a method
const spy = vi.spyOn(object, 'method');
```

**Best practices:**

1. Test isolation - each test should be independent
2. Clear names - describe expected behavior
3. Arrange-Act-Assert - structure tests clearly
4. Mock dependencies - test in isolation
5. Test edge cases - include error conditions
6. Avoid implementation details - test behavior
7. Keep tests fast - unit tests should run quickly
8. Clean up - remove event listeners, restore mocks

## Interop (Upstream Servers)

`tests/interop/` runs the codec and the client semantics against the
real upstream servers, vendored verbatim: vanilla Moebius 1.0.29 (the
one the scene runs) and moebiusXBIN 2.2.0. Each fixture directory holds
the upstream `app/server.js` untouched, a minimal `libtextmode` shim
with `compress`, `uncompress`, and `resize_canvas` transcribed from
upstream and a `read_file` that returns a fresh document in that
server's own palette shape (vanilla sends 6-bit `{r, g, b}` objects,
the fork 8-bit), a no-op hourly saver, and a launcher.

The launchers run under node and spawn locally per test run, never
against a shared host. `FIXTURE_FONT_BYTES=1` makes the fork's fixture
ship an embedded font as a node Buffer, which crosses the wire as Buffer
JSON. The suites are part of `bun test:unit`. To boot one by hand:

```sh
node tests/interop/fixtures/moebius/start.js 8000        # joint at /fixture
FIXTURE_FONT_BYTES=1 node tests/interop/fixtures/moebiusxbin/start.js 8001
```

The Chrome-only `tests/e2e/collabMoebius.spec.js` joins the vanilla
fixture through the editor's Connect form and draws both ways.

## Corpus (Round-Trip)

`tests/corpus/roundtrip.test.js` runs under `bun test:unit` and pins the codecs in three tiers:

- **Tier A, committed artwork.** Every piece in `src/ansi/` must decode, re-encode, and decode again to the identical cell grid, and the encoder must be a fixed point (`encode(decode(encode))` is byte-identical).
- **Tier B, synthetic fixtures.** `generators.js` builds seeded, deterministic fixtures for the edge cases wild files cannot guarantee: odd SAUCE records, ice color ANSI, 132-column and large documents, XBin RLE with all four run types, 512-glyph XBin fonts, and UTF-8 multibyte rows. No binary blobs live in the repo. `lhaFixture.ts` and `zipFixture.ts` build archive fixtures for the core and client archive tests.
- **Tier C, bulk conformance.** Not run here. It targets the owner's pinned mirror of the sixteencolors archive and is manual only; `tests/fixtures/README.md` holds the pin, the fetch mechanics, and the rules (never hit `api.16colo.rs` or `asciiarena.se` from automation).

Known codec defects are pinned with `it.fails` and a comment. When a fix lands, the test flips to red; promote it to a plain `it()`.

## Parity (Frozen v2 Engine)

`tests/parity/v2ReferenceEngine.js` is the doc-mutation subset of the v2 `canvas.js`, extracted verbatim minus rendering, collab, and font concerns: the u16 image buffer, draw entry points, half-block painting, mirror tables, the bright-background optimize pass, chunked undo and redo, areas, and network `quickDraw`. It preserves v2 quirks on purpose, including the swapped half-block constant names, and must not be improved.

`tests/unit/engineParity.test.js` runs one seeded op script against the live canvas, this frozen reference, and the v3 editor core, and requires the full u16 image to match word for word after every op. The reference keeps the gate meaningful now that `canvas.js` runs on the v3 core. oxlint ignores the directory (`.oxlintrc.json`).

## Testing Library (DOM/Component Testing)

### Setup

Testing Library is integrated with Vitest for DOM manipulation testing.

**Configuration:** `tests/setupTests.js`

```javascript
import '@testing-library/jest-dom';
import '@testing-library/jest-dom/vitest';
```

`tests/canvasShim.js` runs first and stubs `HTMLCanvasElement.prototype.getContext` with a cached 2D context, skipping files that run without a DOM.

### DOM Testing Patterns

**Testing DOM manipulation:**

```javascript
import { screen } from '@testing-library/dom';

it('should update element', () => {
	const element = document.createElement('div');
	updateElement(element, 'new text');
	expect(element).toHaveTextContent('new text');
});
```

**Testing events:**

```javascript
import { fireEvent } from '@testing-library/dom';

it('should handle events', () => {
	const handler = vi.fn();
	const button = document.createElement('button');
	button.addEventListener('click', handler);

	fireEvent.click(button);

	expect(handler).toHaveBeenCalled();
});
```

**Testing async code:**

```javascript
it('should load data asynchronously', async () => {
	const result = await loadData();
	expect(result).toBeDefined();
});
```

## Playwright (End-to-End Testing)

### Configuration

**File:** `playwright.config.js`

```javascript
export default defineConfig({
	testDir: './tests',
	testMatch: ['e2e/**/*.spec.js', 'golden/**/*.spec.js', 'gl/**/*.spec.js'],
	timeout: 30000,
	retries: 1,
	outputDir: 'tests/results/e2e',
	fullyParallel: true,
	use: {
		baseURL: 'http://localhost:8060',
		viewport: { width: 1280, height: 720 },
		screenshot: 'only-on-failure',
	},
	webServer: {
		command: 'bun www',
		port: 8060,
		reuseExistingServer: !process.env.CI,
	},
	projects: [
		{
			name: 'Chrome',
			testMatch: 'e2e/**/*.spec.js',
			use: { channel: 'chrome' },
		},
		{
			name: 'Firefox',
			testMatch: 'e2e/**/*.spec.js',
			use: { browserName: 'firefox' },
		},
		{
			name: 'WebKit',
			testMatch: 'e2e/**/*.spec.js',
			use: { browserName: 'webkit' },
		},
		{
			name: 'golden',
			testMatch: 'golden/**/*.spec.js',
			use: { browserName: 'chromium' },
		},
		{
			name: 'golden-gl',
			testMatch: 'golden/**/*.spec.js',
			use: { browserName: 'chromium' },
		},
		{
			name: 'chromium-gl',
			testMatch: 'gl/**/*.spec.js',
			use: { browserName: 'chromium' },
		},
	],
});
```

> [!NOTE]
> The snippet is abridged. Chromium-based projects add SwiftShader flags for software WebGL2, and golden screenshot assertions run only in CI, where rendering is deterministic.

### Running E2E Tests

**Prerequisites:**

1. Build the application:

```bash
bun bake
```

2. Install browsers (first time only):

```bash
bun test:install
# or
npx playwright install
```

**Run all E2E tests:**

```bash
bun test:e2e
# or
npx playwright test
```

**Run tests for specific browser:**

```bash
npx playwright test --project=Chrome
npx playwright test --project=Firefox
npx playwright test --project=WebKit
```

**Run specific test file:**

```bash
npx playwright test tests/e2e/canvas.spec.js
```

**Run tests in UI mode (interactive):**

```bash
npx playwright test --ui
```

**Run tests in headed mode (see browser):**

```bash
npx playwright test --headed
```

**Debug tests:**

```bash
npx playwright test --debug
```

### Test Results

Results are saved to:

- **HTML Report:** `tests/results/playwright-report/`
- **JSON Results:** `tests/results/e2e/results.json`
- **Videos/Screenshots:** `tests/results/e2e/`

**View HTML report:**

```bash
npx playwright show-report tests/results/playwright-report
```

### E2E Test Files

**canvas.spec.js** - Basic canvas functionality

- Application loading
- Canvas visibility and initialization
- Canvas resizing
- Mouse drawing interactions
- Tool switching
- Position information updates

**tools.spec.js** - Drawing tools functionality

- Freehand drawing tool
- Character tool
- Brush tool
- Line tool
- Square tool
- Circle tool
- Selection tool
- Fill tool
- Undo/redo operations
- Copy/paste operations

**palette.spec.js** - Color palette and character selection

- Color palette visibility
- Foreground/background color selection
- ICE colors toggle
- Keyboard shortcuts for colors
- Sample tool (color picker)
- Character palette selection

**fileOperations.spec.js** - File I/O and canvas operations

- New document creation
- File open dialog
- Save options (ANSI, Binary, XBin, PNG)
- SAUCE metadata fields
- Canvas resize operations
- ICE colors toggle
- Font selection and changes
- Canvas clearing

**keyboard.spec.js** - Keyboard shortcuts and keyboard mode

- Undo/redo shortcuts
- Tool selection shortcuts
- Keyboard mode entry/exit
- Arrow key navigation
- Function key shortcuts
- Copy/paste/cut shortcuts
- Text input in keyboard mode
- Home, End, PageUp, PageDown navigation

**ui.spec.js** - User interface elements

- Main UI element visibility
- Responsive layout
- Position information display
- Toolbar with drawing tools
- File operations menu
- Canvas settings controls
- Font selection interface
- Tool highlighting
- Modal dialogs

**editor-file-open-and-scroll.spec.js** - File loading and viewport scrolling

- Opening ANSI files via file input (docs/examples/ansi/x0-defcon25.ans)
- PageDown/PageUp keyboard scrolling behavior
- Mouse wheel scrolling of canvas viewport
- Viewport scroll position tracking and validation

**collabRoundTrip.spec.js** - Collaboration round trip

- Two clients drawing through a live collaboration server

**gestures.spec.js** - Touch gestures

- Touch gesture recognition and zoom shortcuts

**mapping.spec.js** - Pointer-to-cell mapping

- Pointer-to-cell mapping identity across zoom and scroll

**pwaManifest.spec.js** - PWA manifest

- Manifest and service worker registration checks

**editor-keybinds.spec.js** - Comprehensive keybind coverage

- Tool activation shortcuts (K, F, B, N, A, M, G, I)
- Navigation in keyboard mode (Arrow keys, Home, End, PageUp, PageDown)
- Undo/redo operations (Ctrl+Z, Ctrl+Y)
- Clipboard operations (Ctrl+C, Ctrl+V, Ctrl+X)
- Function key character insertion (F1-F4)
- Selection transformations (flip horizontal/vertical with [ and ])
- Selection move mode (M key)

**undoRedo.spec.js** - Advanced undo/redo operations

- Undo group boundaries across tools, read back cell by cell

**clipboard.spec.js** - Advanced clipboard operations

- Copy, cut, and paste flows beyond the keybind smoke tests

**collaboration.spec.js** - Collaboration and chat features

- Chat window, collaboration mode detection, and network features; skipped without a live session

**collabMoebius.spec.js** - Vanilla Moebius interop (Chrome only)

- Joins the vendored Moebius 1.0.29 server by typing an address into the Connect form
- Draws both ways against a raw peer on the same joint
- Pins the local/chat button handoff and the dead-dial report

**asciiBrush.spec.js** - Ascii brush

- Browser wiring of the old skool stamp engine: pointer path in, revised cells out, one undo group per stroke, backgrounds preserved
- Brush modes on the line and shape tools

**autoscroll.spec.js** - Minimap autoscroll

- Playback transport and speed through the live viewport, including the manual-scroll escape

**panels.spec.js** - Panel docking

- Top and bottom docks, bar rows and columns, the pull-out threshold, the frames default home, the docking menu, and the phone layout

**toolSettings.spec.js** - Tool settings window

- The context law (each settings tool shows its own section, the rest hide the window), the reopen rule, drag and position persistence, stack focus, and controls driving real ink

**refimage.spec.js** - Reference image

- The tracing overlay through the view toggle, loaded from a real decodable PNG

**uiprefs.spec.js** - UI preferences

- Dark mode and view toggles and their persistence

### E2E Test Helpers

The E2E test suite includes reusable helper modules in `tests/e2e/helpers/`:

**editorHelpers.js** - Common editor utilities

- `waitForEditorReady(page, timeout)` - Wait for canvas container and initialization
- `focusCanvas(page)` - Click viewport to establish keyboard focus
- `getCanvasText(page)` - Retrieve canvas text content (via window API if available)
- `getViewportScrollPosition(page)` - Get current viewport scroll coordinates
- `getPositionInfo(page)` - Read position info text from UI
- `getActiveTool(page)` - Determine which tool is currently active

**openFile.js** - File loading utilities

- `openFile(page, filePath)` - Open file using file input element and setInputFiles
- `openFileViaDragDrop(page, filePath)` - Placeholder for drag-and-drop file opening
- `openFileViaURL(page, fileURL)` - Open file via window.Load API (if exposed)

**Example usage:**

```javascript
import { openFile } from './helpers/openFile.js';
import { getViewportScrollPosition } from './helpers/editorHelpers.js';

test('loads file and scrolls', async ({ page }) => {
	await openFile(page, 'docs/examples/ansi/x0-defcon25.ans');
	const before = await getViewportScrollPosition(page);
	await page.keyboard.press('PageDown');
	const after = await getViewportScrollPosition(page);
	expect(after.scrollTop).toBeGreaterThan(before.scrollTop);
});
```

### Golden Screenshot Suite

`tests/golden/golden.spec.js` is the pixel-regression harness for the renderer. The matrix is fixture (CP437 test card, ice test card, 512-glyph XBin with a custom palette) by font (CP437 8x16, Topaz 1200 8x16) by zoom (1, 2) by letter spacing (8px, 9px), minus the nonsense combinations, plus real artwork from `docs/examples/ansi/x0-defcon25.ans` at three scroll positions and a Unicode test card. `testcard.js` builds the cards deterministically as BIN and XBin so every CP437 glyph is expressible: the plain card keeps every background at 7 or below so nothing blinks, and the ice card uses bright backgrounds with the SAUCE ice flag set.

Two Playwright projects run the same spec. `golden` renders through the 2D chunk renderer (`?renderer=2d`). `golden-gl` renders through the WebGL2 renderer (`?renderer=gl`) and, through its `snapshotPathTemplate`, asserts against the same 26 PNGs in `tests/golden/golden.spec.js-snapshots/` with threshold 0, so the GL renderer must reproduce the 2D output at integer zoom. Two groups run only on `golden-gl`: the 512-glyph XBin shots, because the chunk fallback shows the lossy `?` mirror by design, and the Unicode shots, because Unicode cells render on the GL path only.

Goldens are valid only from the CI container (Linux, SwiftShader, device scale factor 1). Outside CI, `ignoreSnapshots` in `playwright.config.js` runs the flows and skips the pixel assertions. In CI, a shot whose golden has not been seeded yet skips instead of failing. To regenerate, run the `golden-update` workflow, review the uploaded `golden-snapshots` artifact, drop the files into the snapshots directory, and commit. Never generate goldens on a workstation; see [CI/CD Pipeline](./cicd.md#7-golden-updateyml).

### WebGL Rail

`tests/gl/` runs under the `chromium-gl` project with the same SwiftShader flags the goldens use. `renderer.spec.js` proves the CI container exposes a working WebGL2 context: a `WebGL 2.0` version string, a texture ceiling of at least 4096px for the glyph atlas pages, and the SwiftShader renderer name in CI, so GL regressions never have to be untangled from CI plumbing. `contextLoss.spec.js` opens `/?test&renderer=gl`, forces a context loss and restore through `WEBGL_lose_context`, and asserts the renderer comes back drawing real pixels.

### Writing E2E Tests

**Test structure:**

```javascript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should do something', async ({ page }) => {
		const element = page.locator('#my-element');
		await element.click();
		await page.waitForTimeout(300);

		await expect(element).toBeVisible();
	});
});
```

**Best practices:**

1. Wait for elements - ensure elements are ready
2. Use timeouts - add delays after interactions
3. Flexible selectors - use multiple selector strategies
4. Test isolation - each test should be independent
5. Error handling - gracefully handle missing elements
6. Clean up - use beforeEach and afterEach
7. Meaningful assertions - test user-visible behavior

## Performance Captures

`tests/perf/` holds two node scripts, not test suites; `vitest.config.js` excludes the directory and Playwright does not match it. Both drive the production build in headless Chromium through the `playwright` library and need `bun bake` first.

**`bun perf:baseline`** (`captureBaseline.js`) opens the in-app profiling harness (`src/js/client/profiler.js`, `?profile`) and writes `tests/baselines/p0-perf.json`, the 2D chunk renderer baseline. `PERF_QUERY='?profile&renderer=gl' PERF_OUT=tests/baselines/p1-gl-perf.json` captures the GL renderer, and `PERF_PRESET` picks the document size (default `80x3000`).

**`bun perf:spike`** (`captureScrollSpike.js`) opens the scroll spike rig (`src/js/client/scrollSpike.js`, `?spike`), sweeps slack and tolerance parameters, and writes `tests/baselines/p1-scroll-spike.json`.

Every baseline records a host descriptor (CPU, cores, memory, user agent). The numbers are machine-dependent evidence for before and after comparisons and parameter choices, not a CI gate. The per-device files (`-android`, `-ipad`, `-desktop-chrome`, `-desktop-safari`) come from manual runs: open `/?profile` or `/?spike` on the device and press run.

## Continuous Integration

Tests run automatically on:

- Every pull request
- Every commit to main branch

**GitHub Actions workflow:**

- Installs dependencies
- Builds application
- Runs unit tests
- Runs E2E tests
- Generates coverage reports
- Archives test results

## Test Metrics

### Coverage Metrics

- **Statement Coverage:** % of code statements executed
- **Branch Coverage:** % of conditional branches taken
- **Function Coverage:** % of functions called
- **Line Coverage:** % of lines executed

### Quality Goals

- Critical modules: 80%+ coverage
- General modules: 60%+ coverage
- Utility functions: 90%+ coverage
- E2E coverage: All major user workflows

## Troubleshooting

### Unit Tests

**Tests timing out:**

- Increase timeout in vitest.config.js
- Check for unhandled promises
- Look for infinite loops

**Mocks not working:**

- Ensure mocks are defined before imports
- Check mock file paths
- Verify mock implementation
- **Constructor mocks must use `function` keyword or `class`, not arrow functions**
- Disable `prefer-arrow-callback` with `// eslint-disable-next-line` on the constructor mock only, never for the whole file

**"is not a constructor" errors:**

- This occurs when using arrow functions with `vi.fn()` for constructor mocks
- Change `vi.fn(() => ...)` to `vi.fn(function () { ... })` for constructors
- Or use `vi.fn(class MockClass { ... })` syntax
- See the Mocking section for examples

**Memory leaks:**

- Clean up event listeners in afterEach
- Clear large objects after use
- Use --no-coverage for faster iterations

**Flaky tests:**

- Avoid timing-dependent tests
- Mock Date.now() for time-based tests
- Ensure proper cleanup between tests

### E2E Tests

**Tests fail with connection refused:**

- Ensure application is built: `bun bake`
- Check web server starts automatically
- Verify port 8060 is available

**Browsers not installed:**

- Run: `bun test:install`
- Or: `npx playwright install --with-deps`

**Tests timeout:**

- Increase timeout in playwright.config.js
- Add longer waits in specific tests
- Check if application loads slowly

**Tests are flaky:**

- Add explicit waits (waitForTimeout, waitForSelector)
- Use waitForLoadState('networkidle')
- Increase retry count in config

**Screenshots/videos not captured:**

- Check outputDir in playwright.config.js
- Verify write permissions in tests/results/
- Ensure tests actually fail (screenshots only on failure by default)

## Resources

### Documentation

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Documentation](https://testing-library.com/)
- [Playwright Documentation](https://playwright.dev/)

### Guides

- [Vitest Mocking Guide](https://vitest.dev/guide/mocking.html)
- [Vitest Coverage Guide](https://vitest.dev/guide/coverage.html)
- [Vitest v5 Migration Guide](https://vitest.dev/guide/migration)
- [Vitest v4 Migration Guide](https://v4.vitest.dev/guide/migration#vitest-4)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Debugging](https://playwright.dev/docs/debug)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)

### Additional Resources

- [Testing Library jest-dom Matchers](https://github.com/testing-library/jest-dom)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [Vitest API Reference](https://vitest.dev/api/)

## See Also

- [Building and Developing](building-and-developing.md) - Build process and tools
- [Client Editor Manual](manual.md) - Visual guide to the Frontend text art editor
- [Collaboration Server](collaboration-server.md) - Backend server details
