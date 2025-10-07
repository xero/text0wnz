# E2E Testing Quick Reference

## Quick Start

```bash
# 1. Install dependencies (first time only)
npm install

# 2. Install Playwright browsers (first time only)
npx playwright install

# 3. Build the application
npm run bake

# 4. Run all E2E tests
npm run test:e2e

# 5. View test report
npx playwright show-report tests/results/playwright-report
```

## Common Commands

```bash
# Run tests in specific browser
npx playwright test --project=Chrome
npx playwright test --project=Firefox
npx playwright test --project=WebKit

# Run specific test file
npx playwright test tests/e2e/canvas.spec.js

# Run tests interactively (UI mode)
npx playwright test --ui

# Run tests with browser visible (headed mode)
npx playwright test --headed

# Debug a specific test
npx playwright test tests/e2e/canvas.spec.js --debug

# Run only failed tests
npx playwright test --last-failed

# Update snapshots (if using visual regression)
npx playwright test --update-snapshots
```

## Test File Quick Reference

| File | Purpose | Test Count |
|------|---------|-----------|
| `canvas.spec.js` | Canvas operations, initialization, drawing | ~18 |
| `tools.spec.js` | Drawing tools (freehand, line, square, etc.) | ~18 |
| `palette.spec.js` | Color palette, character selection | ~15 |
| `file-operations.spec.js` | File I/O, save/load, SAUCE metadata | ~18 |
| `keyboard.spec.js` | Keyboard shortcuts, keyboard mode | ~31 |
| `ui.spec.js` | UI elements, dialogs, layout | ~27 |
| `collaboration.spec.js` | Chat, networking, offline mode | ~18 |

## Test Structure Pattern

```javascript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and wait for app to load
    await page.goto('http://localhost:8080');
    await page.waitForSelector('#canvas-container', { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('should do something', async ({ page }) => {
    // Arrange
    const element = page.locator('#my-element');
    
    // Act
    await element.click();
    await page.waitForTimeout(300);
    
    // Assert
    await expect(element).toBeVisible();
  });
});
```

## Selector Strategies

```javascript
// By ID (preferred)
page.locator('#element-id')

// By multiple selectors (fallback)
page.locator('#primary, .secondary, [data-testid="fallback"]')

// By text content
page.locator('button:has-text("Click Me")')

// By attribute
page.locator('[data-tool="freehand"]')

// First/last/nth element
page.locator('.item').first()
page.locator('.item').last()
page.locator('.item').nth(2)
```

## Common Assertions

```javascript
// Visibility
await expect(element).toBeVisible()
await expect(element).toBeHidden()

// Value/text
await expect(input).toHaveValue('expected value')
await expect(element).toHaveText('expected text')
await expect(element).toContainText('partial text')

// Attributes
await expect(element).toHaveAttribute('class', 'active')
await expect(checkbox).toBeChecked()

// Count
expect(await elements.count()).toBe(5)
expect(await elements.count()).toBeGreaterThan(0)
```

## Useful Patterns

### Handle optional elements
```javascript
const element = page.locator('#optional-element');
if (await element.count() > 0) {
  await element.click();
}
```

### Wait for conditions
```javascript
// Wait for selector
await page.waitForSelector('#element', { timeout: 5000 });

// Wait for network idle
await page.waitForLoadState('networkidle');

// Wait for specific timeout
await page.waitForTimeout(500);
```

### Interact with canvas
```javascript
const canvas = page.locator('#canvas-container canvas').first();
const box = await canvas.boundingBox();

if (box) {
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.up();
}
```

### Handle dialogs
```javascript
page.on('dialog', dialog => {
  expect(dialog.message()).toContain('Are you sure');
  dialog.accept(); // or dialog.dismiss()
});

await page.locator('#delete-button').click();
```

### Keyboard interactions
```javascript
// Single key
await page.keyboard.press('Enter');

// Key combination
await page.keyboard.press('Control+Z');

// Type text
await page.keyboard.type('Hello World');

// Key down/up
await page.keyboard.down('Shift');
await page.keyboard.press('A');
await page.keyboard.up('Shift');
```

## Debugging Tips

### Take screenshots
```javascript
await page.screenshot({ path: 'screenshot.png' });
await element.screenshot({ path: 'element.png' });
```

### Get element info
```javascript
const text = await element.textContent();
const value = await element.inputValue();
const classList = await element.getAttribute('class');
const isVisible = await element.isVisible();
```

### Console output
```javascript
page.on('console', msg => console.log('PAGE LOG:', msg.text()));
page.on('pageerror', error => console.log('PAGE ERROR:', error));
```

### Slow down tests
```javascript
// In playwright.config.js
use: {
  launchOptions: {
    slowMo: 1000 // Wait 1 second between actions
  }
}
```

## CI/CD Configuration

### GitHub Actions Example
```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
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

### Problem: Tests timing out
**Solution**: Increase timeout in config or add explicit waits

### Problem: Element not found
**Solution**: 
1. Use `waitForSelector` before interacting
2. Check element exists with `.count()`
3. Use flexible selectors with multiple fallbacks

### Problem: Flaky tests
**Solution**:
1. Add appropriate waits after actions
2. Use `waitForLoadState('networkidle')`
3. Increase retry count in config

### Problem: Tests fail in CI but pass locally
**Solution**:
1. Ensure browsers installed with `--with-deps`
2. Check for timing issues (add more waits)
3. Verify viewport size matches
4. Check for missing fonts or resources

## Best Practices

✅ **DO:**
- Wait for elements before interacting
- Use descriptive test names
- Test user-visible behavior
- Handle optional elements gracefully
- Add timeouts after interactions
- Keep tests independent
- Use beforeEach for setup

❌ **DON'T:**
- Test implementation details
- Make tests depend on each other
- Use fixed delays without reason
- Ignore timeout errors
- Skip cleanup
- Hard-code test data in production
- Leave console.log statements

## Resources

- 📚 [Full Documentation](tests/e2e/README.md)
- 📊 [Implementation Summary](E2E_TESTING_SUMMARY.md)
- 🌐 [Playwright Docs](https://playwright.dev/)
- 🎯 [Best Practices](https://playwright.dev/docs/best-practices)
