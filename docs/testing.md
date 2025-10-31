# Testing

teXt0wnz uses a comprehensive three-part testing strategy: unit tests with Vitest, DOM/component tests with Testing Library, and end-to-end tests with Playwright.

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
│       ├── fileio.test.js
│       └── ...
├── dom/                           # Testing Library tests
│   ├── canvas.test.js
│   ├── fontPreview.test.js
│   └── ...
├── e2e/                           # Playwright E2E tests
│   ├── canvas.spec.js
│   ├── tools.spec.js
│   └── ...
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
	'tests/e2e/**',
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

### Test Coverage

**Current status:**

- Overall: ~45% statement coverage
- Client modules: 45% average
- Server modules: 51% average

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

- WebSocket connection
- Message handling
- Chat functionality
- User session management
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

**worker.test.js** - Web Worker

- Worker message handling
- Data processing algorithms
- Block deduplication logic
- Message processing

**xbinPersistence.test.js** - XBin format persistence

- Embedded font handling
- Palette persistence
- File roundtrip testing

> [!NOTE]
> **Test File Organization Best Practices**
>
> Test files should be **small and focused** on testing specific features rather than entire sections of the editor. Each test file should:
>
> - Focus on a single module or feature area (e.g., `file-load.test.js` for loading, `file-formats.test.js` for parsing)
> - Keep file size under ~500 lines for maintainability
> - Group related functionality logically (e.g., UI controls vs. UI components)
> - Make it easy to locate and run tests for specific features
> - Enable faster test execution when working on specific areas
>
> Large monolithic test files (1000+ lines) should be split into focused, feature-specific files as demonstrated by:
>
> - `ui-*.test.js` - Split by UI feature groups (basic, controls, components, modals)
> - `file-*.test.js` - Split by operation type (load, formats, advanced)
> - `freehand-*.test.js` - Split by tool categories (panels, shapes, advanced)

#### Server Modules

**server/config.test.js** - Server configuration

- Configuration parsing
- Default values
- Validation

**server/fileio.test.js** - Server file operations

- SAUCE record creation and parsing
- Binary data conversions
- File format validation
- Canvas dimension extraction
- Data type conversions

**server/main.test.js** - Server main module

- Module structure validation
- Configuration integration
- Component exports
- Dependency integration

**server/server.test.js** - Express server

- Server initialization
- Route handling
- Middleware setup
- SSL configuration

**server/text0wnz.test.js** - Collaboration engine

- Session management
- User tracking
- Canvas state synchronization
- Message broadcasting

**server/utils.test.js** - Server utilities

- Helper functions
- Data validation
- Format conversions

**server/websockets.test.js** - WebSocket handlers

- Connection handling
- Message routing
- Session cleanup
- Error handling

### Writing Unit Tests

> [!IMPORTANT]
> **Vitest v4 requires regular functions (not arrow functions) for constructor mocks**
>
> When mocking constructors, you must use the `function` keyword or `class` syntax. Arrow functions will cause a "not a constructor" error.
>
> For more details, see the [Vitest v4 migration guide](https://vitest.dev/guide/migration.html#vitest-4).
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

## Testing Library (DOM/Component Testing)

### Setup

Testing Library is integrated with Vitest for DOM manipulation testing.

**Configuration:** `tests/setupTests.js`

```javascript
import '@testing-library/jest-dom';
```

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
	testDir: './tests/e2e',
	timeout: 30000,
	retries: 1,
	outputDir: 'tests/results/e2e',
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
		{ name: 'Chrome', use: { channel: 'chrome' } },
		{ name: 'Firefox', use: { browserName: 'firefox' } },
		{ name: 'WebKit', use: { browserName: 'webkit' } },
	],
});
```

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

## Continuous Integration

Tests run automatically on:

- Every pull request
- Every commit to main branch
- Scheduled daily runs

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
- Add `/* eslint-disable prefer-arrow-callback */` at the top of test files

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
- [Vitest v4 Migration Guide](https://vitest.dev/guide/migration.html#vitest-4)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Debugging](https://playwright.dev/docs/debug)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)

### Additional Resources

- [Testing Library jest-dom Matchers](https://github.com/testing-library/jest-dom)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [Vitest API Reference](https://vitest.dev/api/)

## See Also

- [Building and Developing](building-and-developing.md) - Build process and tools
- [Editor Client](editor-client.md) - Frontend application details
- [Collaboration Server](collaboration-server.md) - Backend server details
