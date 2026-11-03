# Unit Tests

This directory contains Vitest unit tests for the teXt0wnz text art editor.

> [!NOTE]
> View the latest [coverage report](https://xero.github.io/text0wnz/tests/)

> ### Table of Contents
>
> - [Overview](#overview)
> - [Test Files](#test-files)
>   - [Client Modules](#client-modules)
>   - [Server Modules](#server-modules)
>   - [Helpers](#helpers)
> - [Running the Tests](#running-the-tests)
> - [Test Coverage](#test-coverage)
> - [Writing New Tests](#writing-new-tests)
> - [Continuous Integration](#continuous-integration)
> - [Troubleshooting](#troubleshooting)
> - [Resources](#resources)

---

## Overview

The unit tests check one module at a time with its neighbors mocked, so a failure points at the module that broke. Vitest runs them in jsdom, one worker at a time, with `tests/canvasShim.js` stubbing canvas 2D contexts and `tests/setupTests.js` loading the jest-dom matchers. A few server suites opt into Node with a `// @vitest-environment node` header.

---

## Test Files

Each entry names the module under test and the behavior the file pins.

### Client Modules

- **archiveOpen.test.js:** `archiveOpen.js` archive detection, the zip entry picker, LHA opens with Amiga import hints, and archive error reports.
- **artpacks.test.js:** `artpacks.js` landing modal, card routing to each site browser, and the last visited site.
- **asciiArena.test.js:** `asciiArena.js` colly browsing, search, artist and crew views, zip and LHA opens through the core reader, lazy DIZ previews, and stale fetch races.
- **asciiBrush.test.js:** `asciiBrush.js` stroke to ASCII glyph resolution, terminal joins against drawn lines, and a preview that matches the commit.
- **autoScroller.test.js:** `autoScroller.js` scroll engine timing on an injected clock (glides, holds, round trips, dropped frames) and the autoscroll menu.
- **canvas.test.js:** `canvas.js` blink loops, letter spacing, cell reads, chunk paints, dirty regions, area and image data, XBin font and palette rebinding, and resize history.
- **canvasFont.test.js:** `setFont` installs loads in call order, runs every callback, falls back past a stalled load without counting hidden time, carries a 9px toggle and a palette swap made during the load onto the new font, disposes a load that lands past its wait or that its caller disowned, and takes the glyph size only from the font that goes live.
- **canvasJournal.test.js:** The canvas autosave journal restores strokes, undo, ice colors, animation frames, and resizes, stays off during collab sessions and after the profiler stops it, survives the keyframe encode window, the reload restore gate, and a failed append, and lands the last stroke once editing idles or the page hides without splitting a held press or a selection move, which reach the journal as one keyframe per pause or at once on a page hide.
- **collabTarget.test.js:** `collabTarget.js` server address parsing, dial and display forms, the default server URL, and direct versus bridged transport.
- **collabWorker.test.js:** `collabWorker.js` probe, handshake, direct and bridged dials, dial timeouts, refusals, malformed frames, and stale sockets.
- **colorPanel.test.js:** `colorPanel.js` swatch picks by click, Ctrl click, right click, the macOS Ctrl click, and touch or pen hold, including the recent row and the iPadOS double-tap click that lands on the first tap's swatch.
- **engineParity.test.js:** The live canvas, the v2 reference engine, and the v3 editor core stay word-identical through a seeded 400-op script and deep undo.
- **file.test.js:** `file.js` font choice per file (SAUCE, then archive hint, then scene default) and ANSI and BIN opens with their SAUCE records.
- **fileAdvanced.test.js:** `file.js` ANSI, UTF-8, XBin, and BIN save output, plus empty, huge, corrupt, and oddly named files.
- **fileDocNative.test.js:** `.tnd`, PabloDraw 24-bit `.ans`, `.dur`, and `.0wnz` opens and saves through the v3 doc.
- **fileError.test.js:** Corrupt `.dur` and `.0wnz` opens report through `onError`, and allocation ceilings refuse oversized `.ans` and `.bin` opens.
- **fileFormats.test.js:** `file.js` load error handling, FileReader wiring for ANSI, BIN, XBin, and UTF-8 opens, SAUCE extension detection, and parser setup.
- **fileLatin1.test.js:** A `.txt` that is not UTF-8 falls back to the CP437 reader.
- **fileLoad.test.js:** `file.js` SAUCE font name mapping, load setup per extension, and every save format (ANSI, UTF-8, plain text, BIN, XBin, PNG) with its SAUCE record and flags.
- **fileSauceFlags.test.js:** SAUCE comments and flags survive an open and resave, and a BIN save explains why it refuses a 2-column width.
- **fileUtf8.test.js:** UTF-8 ANSI imports round-trip CP437 glyphs and substitute the rest, and exports emit one cell per column.
- **font.test.js:** `font.js` glyph zero blanking, XB font data loading, letter spacing, image font loading, palette rebinding, and parses that leave the glyph size to the install.
- **fontCache.test.js:** `fontCache.js` preload, fetch, and clear through the Cache API and its in-memory fallback.
- **frames.test.js:** `frames.js` frame strip navigation, timing inputs, playback, baud preview, onion skin, and the collab lockout.
- **freehandAdvanced.test.js:** `freehandTools.js` sample tool, line, square, and half-block controllers, and panel state.
- **freehandPanels.test.js:** `freehandTools.js` half-block and shading controllers, shading panel chip picks by mouse and touch, and the character brush panel.
- **freehandShapes.test.js:** `freehandTools.js` flood fill, line, square, circle, and attribute brush controllers, plus selection tool flips.
- **freehandShapeState.test.js:** A shape drag forgets itself when the tool disables mid-drag and still honors a drag back to its start cell.
- **freehandTools.test.js:** Shading strokes advance the ramp once per cell, ignore drags without a down, and close on disable.
- **gestureGuard.test.js:** `gestureGuard.js` routes chrome pinches to the canvas, ignores mice and canvas touches, and blocks Safari page zoom.
- **gestures.test.js:** `gestures.js` touch holds, slop breakouts, two- and three-finger taps for undo and redo, pinch pans, and cancels.
- **glyphScale.test.js:** `glyphScale.js` fits glyph canvases to whole device pixels and re-arms its watch on each pixel ratio change.
- **hexFontPages.test.js:** `hexFontPages.js` lazy hex font block loads, glyph scaling, Unscii then Unifont slot fallback, failed block handling, and preload.
- **historyLabels.test.js:** `historyLabels.js` labels history rows from the pend placed before each stroke.
- **journalStore.test.js:** `journalStore.js` keyframe and stroke persistence, replay, compaction, serialized writes, the per-session baseline, the drops after a failed rewrite or a torn append, and the backend probe that falls back to IndexedDB or memory only where OPFS refuses.
- **journalWorker.test.js:** `journalWorker.js` drops foreign-origin and malformed messages and answers same-context ones.
- **keyboard.test.js:** `keyboard.js` and `fkeys.js` F-key sets, cursor and selection rects, row and column edits, typed glyph order, Tab and Enter, cut, copy, the paste modes, and the selection keys that seed a cell on a bare pick.
- **lazyFont.test.js:** `lazyFont.js` on-demand glyphs, cache bounds, 9px letter spacing glyphs, and idle pre-generation that stops on dispose.
- **magicNumbers.test.js:** `magicNumbers.js` constant values and the relationships between them.
- **main.test.js:** `main.js` boot tiers, font preload, init alerts, the canvas size dialog, the SAUCE dialog, and the 9pt chip after a font change.
- **messageGuard.test.js:** `messageGuard.js` trusts origin-less and same-origin messages and rejects the rest.
- **minimap.test.js:** `minimap.js` visibility toggle, sizing, and tap versus drag handling for mouse and touch.
- **moveMode.test.js:** Selection move mode against a live canvas, covering aborts, restores, transparent blanks, and undo and redo of a move.
- **network.test.js:** `network.js` worker handler (probe, join, connect form, refusals, dropped sessions, EXT_SYNC replay, peer resizes, sends during a font load, server order: peer writes that beat our ack, serialized frames, adoption replay, the glyph wait, vanilla peer font order, the font label after a peer font) and the chat controller.
- **openAccept.test.js:** The File Open picker in `src/index.html` accepts every format the manual lists.
- **palette.test.js:** `palette.js` CP437 to Unicode tables, palette creation and events, the preview, picker input by keyboard, mouse, and touch or pen hold, and which quick picks open the color editor.
- **plugins.test.js:** `plugins.js` plugin API batching, plugin validation, and the plugin manager.
- **pointer.test.js:** `pointer.js` mouse, pen, and touch normalization, pressure, palm rejection, pinch events, and disposal.
- **pressure.test.js:** Pen pressure picks the shading brush shade, and Shift+down draws an attribute brush line.
- **recentList.test.js:** `recentList.js` reads, dedupes, filters, and trims the recent list.
- **referenceImage.test.js:** `referenceImage.js` overlay drag mode, persistence races, and reset.
- **service.test.js:** `src/service.js` SKIP_WAITING messages, wedged-generation recovery, the share target, and runtime cache routes.
- **sixteenColors.test.js:** `sixteenColors.js` year, pack, artist, crew, and search browsing, opens through the mirror zip, and API failures.
- **state.test.js:** `state.js` get and set, dependency waits, the init lifecycle, and UI and font path derivation from the env.
- **stateAutosave.test.js:** The local autosave gate keeps a live session's canvas out of local storage while the viewer's own zoom still saves, and a restore that throws lets go of the loading flag without losing the saved journal.
- **storage.test.js:** `storage.js` settings and merges in localStorage, the shared IndexedDB connection, and its store methods.
- **toolbar.test.js:** `toolbar.js` tool registration, switching, previous tool return, and lazy tool loads.
- **toolSettings.test.js:** `toolSettings.js` section show and hide rules and settings that survive corrupt or throwing storage.
- **touchHold.test.js:** `touchHold.js` long-press detection for fingers and pens, covering hold time, slop on and off the element, second fingers, re-arms, and flush.
- **ui.test.js:** `ui.js` DOM helpers, setting toggles, Enter and Shift+Enter, modals, undo and redo keys, COMNT byte limits, fullscreen, viewport taps, paint shortcuts, drag and drop, grid, tool preview, and font select.
- **uiBasic.test.js:** `ui.js` DOM helpers, setting toggles, event helpers, position info, modals, and undo and redo keys, with Ctrl+Shift+Z and focused text fields.
- **uiComponents.test.js:** `ui.js` viewport two-finger taps, paint shortcuts, the grid, tool preview chunks, the resolution readout, and drag and drop.
- **uiControls.test.js:** `ui.js` COMNT byte counting, `websocketUI`, the fullscreen toggle and icon, and the modal controller.
- **uiModals.test.js:** `ui.js` `$$$`, tool preview, font select, modal double close and backdrop, and `websocketUI`.
- **utils.test.js:** `ui.js` `createCanvas` and the `$` and `$$` selector shorthands.
- **xbinCompression.test.js:** XBin save compression round trips and export modal routing in `file.js`.
- **zoom.test.js:** `lazyFont.js` scale factors, the `ui.js` sidebar zoom control, and scale handoff to the font loaders.
- **zoomController.test.js:** `zoom.js` clamping, half-step snapping, pinch, Ctrl+wheel, and focal anchoring.

### Server Modules

- **server/bridge.test.js:** `bridge.js` private address denial, DNS rebinding defense, the off, local, port, and allow modes, env parsing, and pipe bounds.
- **server/config.test.js:** `config.js` `parseArgs` flags and defaults, room size env knobs, and the allowed origins list.
- **server/persistence.test.js:** `persistence.js` room save and reload, save queues, session case migration, temp file sweeps, legacy `.bin` sessions, backups, and palette fidelity.
- **server/persistenceAtomic.test.js:** Atomic room writes sync the temp file before the rename.
- **server/room.test.js:** `room.js` connect, draw, chat, settings, relay tiers, the extension suite, hostile input, convergence fuzz, and room invariants.
- **server/roomPath.test.js:** `moebiusServer.js` `roomNameFromPath` maps request paths to rooms.
- **server/serverIntegration.test.js:** Spawns the Bun server from `main.js` and tests rooms, passwords, origins, static mode, health checks, the backlog close for a member that stops reading, and the bridge over real sockets. It skips without `bun` on the PATH.
- **server/utils.test.js:** `utils.js` help output, `sanitize`, `callout`, and the auth cooldown.

### Helpers

- **uiMock.js:** `createUiMock()` builds the shared `ui.js` mock for the `freehandAdvanced`, `freehandPanels`, and `freehandTools` suites. It holds no tests.
- **Shared fixtures:** The unit tests also import `tests/corpus/generators.js` (ANSI, BIN, XBin, and SAUCE builders), `tests/corpus/zipFixture.ts` and `tests/corpus/lhaFixture.ts` (archive builders), and `tests/parity/v2ReferenceEngine.js` (the engine `engineParity.test.js` compares against).

---

## Running the Tests

### Prerequisites

Install dependencies with Bun. The server integration suite also spawns `bun`.

```bash
bun i
```

### Run Every Vitest Suite with Coverage

```bash
bun test:unit
```

This runs `vitest run` over `tests/unit`, `tests/core`, `tests/dom`, `tests/corpus`, and `tests/interop` with coverage on, the same command CI runs.

> [!TIP]
> `bun test` without the `:unit` starts Bun's built-in test runner, not Vitest.

### Run This Folder Only

```bash
bunx vitest run tests/unit
bunx vitest run --coverage.enabled=false tests/unit
```

The second form skips coverage. It runs faster and stays clear of the coverage directory when another run holds it.

### Run Tests in Watch Mode

```bash
bunx vitest watch tests/unit
```

### Run Tests Matching a Pattern

```bash
bunx vitest canvas
bunx vitest server
bunx vitest dom
```

A pattern matches any part of a file path in every suite, so `canvas` also runs `tests/dom/canvas.test.js`, and `dom` runs `tests/dom/`.

### Run Specific Test File

```bash
bunx vitest tests/unit/canvas.test.js
bunx vitest tests/unit/server/config.test.js
```

---

## Test Coverage

Coverage is on by default. `vitest.config.js` collects V8 coverage with the `text` and `html` reporters and writes the HTML report to `tests/results/coverage/`. `bun test:unit` measures every Vitest suite at once, so the report covers the core and DOM suites as well as this folder. The report breaks each module down by statements, branches, functions, and lines. No coverage threshold gates CI.

As of 2026-11-03, `bunx vitest run tests/unit` runs 1,263 tests in 76 files. One persistence test skips on macOS, since it needs a case-sensitive filesystem.

### Coverage Reports

After a run with coverage, open the HTML report.

```bash
open tests/results/coverage/index.html # macOS
xdg-open tests/results/coverage/index.html # Linux
start tests/results/coverage/index.html # Windows
```

---

## Writing New Tests

### Test Structure

Tests follow this general structure:

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { functionToTest } from '../../src/js/client/module.js';

describe('module name', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('functionToTest', () => {
		it('returns the expected output for plain input', () => {
			const input = 'test data';

			const result = functionToTest(input);

			expect(result).toBe('expected output');
		});

		it('throws on null input', () => {
			expect(() => functionToTest(null)).toThrow();
		});
	});
});
```

### Mocking

`vi.mock` hoists above the imports, so a factory that shares state with the test body reads it through `vi.hoisted`.

```javascript
const mocks = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock('../../src/js/client/state.js', () => ({
	default: { modal: { open: mocks.open, close: vi.fn() } },
}));

vi.mock('../../src/js/client/ui.js', async () =>
	(await import('./uiMock.js')).createUiMock(),
);

const fn = vi.fn(() => 'mocked value');
const spy = vi.spyOn(object, 'method');
```

### Best Practices

- **Isolation:** Each test stands alone. Reset mocks in `beforeEach` and restore them in `afterEach`.
- **Titles:** A title names the behavior the test pins, in the present tense, without history.
- **Arrange, act, assert:** Set up, run, then check, with a blank line between the phases.
- **Mocks at the edges:** Mock the neighbors of the module under test, never the module itself.
- **Edge cases:** Cover error paths and boundary values.
- **Behavior over internals:** Assert what a caller sees, not how the module gets there.
- **Speed:** Keep unit tests fast, and reach for fake timers instead of real waits.
- **Cleanup:** Remove event listeners and restore mocks after each test.
- **Regressions:** A test written for a fix fails without that fix. Check it before you commit.

### Common Patterns

**Testing DOM Manipulation:**

```javascript
it('writes the new text into the element', () => {
	const el = document.createElement('div');
	updateElement(el, 'new text');
	expect(el.textContent).toBe('new text');
});
```

**Testing Async Code:**

```javascript
it('resolves with the loaded data', async () => {
	await expect(loadData()).resolves.toBeDefined();
});
```

**Testing Events:**

```javascript
import { onClick } from '../../src/js/client/ui.js';

it('hands the event and the element to the handler', () => {
	const div = document.createElement('div');
	const handler = vi.fn();
	onClick(div, handler);

	const click = new window.Event('click');
	div.dispatchEvent(click);

	expect(handler).toHaveBeenCalledWith(click, div);
});
```

**Testing Error Handling:**

```javascript
it('throws on invalid input', () => {
	expect(() => processData(null)).toThrow('Invalid input');
});
```

---

## Continuous Integration

`.github/workflows/test-suite.yml` runs the lint, build, unit, and e2e jobs on every pull request, on pushes to main, and on manual dispatch. Pushes that only touch docs, markdown, or repo metadata skip it. The unit job in `unit.yml` runs `bun test:unit` and uploads the coverage report as an artifact, and each main deploy publishes that report to the link at the top of this page.

---

## Troubleshooting

### Common Issues

**Tests timing out:**

- Set `testTimeout` in `vitest.config.js`, or pass a timeout to the one slow `it`
- Check for unhandled promises
- Look for infinite loops

**Mocks not working:**

- Read shared mock state through `vi.hoisted`, since `vi.mock` hoists above the imports
- Check mock file paths, which resolve relative to the test file
- Verify the mock implementation

**Coverage directory busy:**

- Parallel `vitest run` calls collide on `tests/results/coverage/`
- Pass `--coverage.enabled=false` when another run may be active

**Memory leaks:**

- Clean up event listeners in `afterEach`
- Clear large objects after use
- Use `--coverage.enabled=false` for faster iterations

**Flaky tests:**

- Avoid timing-dependent tests
- Use `vi.useFakeTimers()` and mock `Date.now()` for time-based tests
- Ensure proper cleanup between tests

### Getting Help

- Check the [Vitest documentation](https://vitest.dev/)
- Review existing tests for patterns

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Mocking Guide](https://vitest.dev/guide/mocking.html)
- [Coverage Configuration](https://vitest.dev/guide/coverage.html)
- [DOM tests](../dom/README.md)
- [E2E tests](../e2e/README.md)
