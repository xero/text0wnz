# End-to-End (E2E) Tests

This directory contains Playwright end-to-end tests for the teXt0wnz text art editor.

> [!INFO]
> View the latest [e2e testing report](https://xero.github.io/text0wnz/tests/e2e/)

---

## Overview

The E2E tests validate the application's functionality in a real browser environment, testing user interactions and workflows.

## Test Files

- **canvas.spec.js** - Basic canvas functionality and interaction tests
  - Application loading
  - Canvas visibility and initialization
  - Canvas resizing
  - Mouse drawing interactions
  - Tool switching
  - Position information updates

- **tools.spec.js** - Drawing tools functionality tests
  - Freehand drawing tool
  - Character tool
  - Brush tool
  - Line tool
  - Square tool
  - Circle tool
  - Selection tool
  - Fill tool

- **clipboard.spec.js** - Clipboard operations tests
  - Copy, cut, and paste through the selection tool
  - Colors and truecolor cells through the clipboard
  - Paste at the keyboard cursor

- **undoRedo.spec.js** - Undo/redo functionality tests
  - Undo operations
  - Redo operations
  - History management

- **collaboration.spec.js** - Collaboration features tests
  - Multi-user editing
  - Real-time synchronization
  - Chat functionality
  - User presence

- **palette.spec.js** - Color palette and character selection tests
  - Color palette visibility
  - Foreground/background color selection
  - ICE colors toggle
  - Keyboard shortcuts for colors (Ctrl and Alt digits, Q, D)
  - Sample tool (Alt key color picker)
  - Character palette selection

- **fileOperations.spec.js** - File I/O and canvas operations tests
  - New document creation
  - File open dialog
  - Save options (ANSi, Binary, XBin, PNG)
  - SAUCE metadata fields
  - Canvas resize operations
  - ICE colors toggle
  - 9px font spacing toggle
  - Font selection and changes
  - Canvas clearing

- **keyboard.spec.js** - Keyboard shortcuts and keyboard mode tests
  - Undo/redo shortcuts (Ctrl+Z, Ctrl+Y)
  - Tool selection shortcuts (F, B, K keys), and letters typing in keyboard mode
  - Keyboard mode entry/exit
  - Arrow key navigation
  - Function key (F1-F12) shortcuts
  - Copy/paste/cut shortcuts (Ctrl+C, Ctrl+V, Ctrl+X)
  - Ctrl+Backspace and Escape keys
  - Text input in keyboard mode
  - Home, End, PageUp, PageDown navigation
  - Enter and Backspace keys

- **ui.spec.js** - User interface elements and interactions tests
  - Main UI element visibility
  - Responsive layout
  - Position information display
  - Toolbar with drawing tools
  - File operations menu
  - Canvas settings controls
  - Font selection interface
  - Tool highlighting
  - Modal dialogs
  - Help and information panels

- **asciiBrush.spec.js** - Ascii brush strokes in line and square modes
- **autoscroll.spec.js** - Minimap autoscroll stepping and escape
- **collabMoebius.spec.js** - Joins the vendored vanilla Moebius fixture through the Connect form (Chromium only)
- **collabRoundTrip.spec.js** - Two browsers drawing through the bun server
- **editor-file-open-and-scroll.spec.js** - Opening a file and scrolling the canvas
- **editor-keybinds.spec.js** - Editor key bindings end to end
- **gestures.spec.js** - Touch and pointer gestures
- **mapping.spec.js** - Character and color mapping tools
- **panels.spec.js** - Panel docking, shading, pinning, and the phone shell
- **pwaManifest.spec.js** - PWA manifest and service worker registration
- **refimage.spec.js** - Reference image loading, drag, and persistence
- **toolSettings.spec.js** - The unified tool settings window
- **uiprefs.spec.js** - UI preferences and their persistence

## Running the Tests

### Prerequisites

1. Build the application:

```bash
bun bake
```

2. Install Playwright browsers (first time only):

```bash
bun test:install
```

### Run All E2E Tests

```bash
bun test:e2e
```

### Run Tests for Specific Browser

```bash
# Chrome
bunx playwright test --project=Chrome

# Firefox
bunx playwright test --project=Firefox

# WebKit (Safari)
bunx playwright test --project=WebKit
```

### Run Specific Test File

```bash
bunx playwright test tests/e2e/canvas.spec.js
```

### Run Tests in UI Mode (Interactive)

```bash
bunx playwright test --ui
```

### Run Tests in Headed Mode (See Browser)

```bash
bunx playwright test --headed
```

### Debug Tests

```bash
bunx playwright test --debug
```

## Test Configuration

The test configuration is in `playwright.config.js` at the root of the project:

- **Browsers**: Chrome, Firefox, WebKit (Safari)
- **Viewport**: 1280x720
- **Test timeout**: 30 seconds
- **Retries**: 1 (on failure)
- **Screenshots**: On failure
- **Traces**: On the first retry
- **Web server**: `bun www`, which serves `dist/` on port 8060

## Test Results

Test results are saved to:

- **HTML Report**: `tests/results/playwright-report/`
- **JSON Results**: `tests/results/e2e/results.json`
- **Screenshots and traces**: `tests/results/e2e/`

To view the HTML report after running tests:

```bash
npx playwright show-report tests/results/playwright-report
```

## Writing New Tests

When adding new E2E tests:

1. Create a new `.spec.js` file in `tests/e2e/`
2. Import Playwright test utilities:
   ```javascript
   import { test, expect } from '@playwright/test';
   ```
3. Use `test.describe()` to group related tests
4. Use `test.beforeEach()` for common setup (open `/?test`, then
   `await bridgeReady(page)`)
5. Write tests using Playwright's API for user interactions
6. Read cells back through the `window.__t0wnz` bridge, which exists
   only on `/?test` (see `helpers/editorHelpers.js`). A test that only
   counts `.error` elements passes whether or not the action happened
7. Wait on a condition, never on the clock. `bridgeReady` waits for
   the wired editor and the bridge, `clickTool` waits for a lazy tool
   to light, and web-first assertions such as `toHaveClass()` and
   `expect.poll()` retry until the state arrives
8. Assert expected behaviors with `expect()`

### Example Test

```javascript
import { test, expect } from '@playwright/test';
import { bridgeReady, readRegion } from './helpers/editorHelpers.js';

test.describe('My Feature', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('types into the canvas', async ({ page }) => {
		// keyboard mode is the boot tool, its cursor parked at 0,0
		await page.keyboard.type('abc');

		await expect.poll(() => readRegion(page, 0, 0, 2, 0)).toEqual(['abc']);
	});
});
```

## Best Practices

1. **Wait for elements**: Always wait for elements to be visible/ready before interacting
2. **Wait on state, not time**: Poll the bridge or use a web-first assertion. A fixed `waitForTimeout` passes on a fast machine and flakes on a slow one, so keep it for timing the app itself measures, such as the palette's double-tap window
3. **Flexible selectors**: Use multiple selector strategies (ID, class, text, data attributes)
4. **Test isolation**: Each test should be independent and not rely on previous tests
5. **Fail loudly**: Assert that an element exists instead of skipping the check when it is missing. An `isVisible()` guard turns a broken feature into a pass
6. **Clean up**: Use `beforeEach` and `afterEach` for setup and teardown
7. **Meaningful assertions**: Test actual user-visible behavior, not implementation details

## Troubleshooting

### Tests fail with "page.goto: net::ERR_CONNECTION_REFUSED"

- Ensure the application is built: `bun bake`
- The web server should start automatically from the config
- Check that port 8060 is available

### Browsers not installed

- Run: `bun test:install`
- Or with dependencies: `bunx playwright install --with-deps`

### Tests timeout

- Increase timeout in `playwright.config.js`
- Check that the page was opened with `/?test`, or `bridgeReady` waits for a bridge that never loads
- Check if the application is loading slowly

### Tests are flaky

- Replace fixed waits with a condition: `expect.poll()` over a bridge read, a web-first assertion, or `page.waitForFunction()`
- Switch tools through `clickTool`, so a stroke never lands before a lazy tool loads
- Increase retry count in config

## Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Debugging](https://playwright.dev/docs/debug)
