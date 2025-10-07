# End-to-End (E2E) Tests

This directory contains Playwright end-to-end tests for the teXt0wnz ANSI art editor.

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
  - Undo/redo operations
  - Copy/paste operations

- **palette.spec.js** - Color palette and character selection tests
  - Color palette visibility
  - Foreground/background color selection
  - ICE colors toggle
  - Keyboard shortcuts for colors (F, B keys)
  - Sample tool (Alt key color picker)
  - Character palette selection

- **file-operations.spec.js** - File I/O and canvas operations tests
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
  - Tool selection shortcuts (F, C, B, L, S, K keys)
  - Keyboard mode entry/exit
  - Arrow key navigation
  - Function key (F1-F12) shortcuts
  - Copy/paste/cut shortcuts (Ctrl+C, Ctrl+V, Ctrl+X)
  - Delete and Escape keys
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

## Running the Tests

### Prerequisites

1. Build the application:
   ```bash
   npm run bake
   ```

2. Install Playwright browsers (first time only):
   ```bash
   npx playwright install
   ```

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run Tests for Specific Browser

```bash
# Chrome
npx playwright test --project=Chrome

# Firefox
npx playwright test --project=Firefox

# WebKit (Safari)
npx playwright test --project=WebKit
```

### Run Specific Test File

```bash
npx playwright test tests/e2e/canvas.spec.js
```

### Run Tests in UI Mode (Interactive)

```bash
npx playwright test --ui
```

### Run Tests in Headed Mode (See Browser)

```bash
npx playwright test --headed
```

### Debug Tests

```bash
npx playwright test --debug
```

## Test Configuration

The test configuration is in `playwright.config.js` at the root of the project:

- **Browsers**: Chrome, Firefox, WebKit (Safari)
- **Viewport**: 1280x720
- **Test timeout**: 30 seconds
- **Retries**: 1 (on failure)
- **Screenshots**: On failure
- **Videos**: On failure
- **Web server**: Python HTTP server on port 8080 serving the `dist` directory

## Test Results

Test results are saved to:
- **HTML Report**: `tests/results/playwright-report/`
- **JSON Results**: `tests/results/e2e/results.json`
- **Videos/Screenshots**: `tests/results/e2e/`

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
4. Use `test.beforeEach()` for common setup (navigate to page, wait for load)
5. Write tests using Playwright's API for user interactions
6. Use flexible selectors that work even if IDs change
7. Add appropriate waits (`waitForTimeout`, `waitForSelector`)
8. Assert expected behaviors with `expect()`

### Example Test

```javascript
import { test, expect } from '@playwright/test';

test.describe('My Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
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

## Best Practices

1. **Wait for elements**: Always wait for elements to be visible/ready before interacting
2. **Use timeouts**: Add small delays after interactions to allow the UI to update
3. **Flexible selectors**: Use multiple selector strategies (ID, class, text, data attributes)
4. **Test isolation**: Each test should be independent and not rely on previous tests
5. **Error handling**: Tests should gracefully handle missing optional elements
6. **Clean up**: Use `beforeEach` and `afterEach` for setup and teardown
7. **Meaningful assertions**: Test actual user-visible behavior, not implementation details

## CI/CD Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Install dependencies
  run: npm ci

- name: Install Playwright browsers
  run: npx playwright install --with-deps

- name: Build application
  run: npm run bake

- name: Run E2E tests
  run: npm run test:e2e

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: tests/results/playwright-report/
```

## Troubleshooting

### Tests fail with "page.goto: net::ERR_CONNECTION_REFUSED"
- Ensure the application is built: `npm run bake`
- The web server should start automatically from the config
- Check that port 8080 is available

### Browsers not installed
- Run: `npx playwright install`
- Or with dependencies: `npx playwright install --with-deps`

### Tests timeout
- Increase timeout in `playwright.config.js`
- Add longer waits in specific tests
- Check if the application is loading slowly

### Tests are flaky
- Add explicit waits (`waitForTimeout`, `waitForSelector`)
- Use `waitForLoadState('networkidle')` for complex pages
- Increase retry count in config

## Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Debugging](https://playwright.dev/docs/debug)
