# End-to-End Testing Documentation

This directory contains comprehensive E2E tests for the text0wnz collaborative text art editor using [Playwright](https://playwright.dev/).

## Test Structure

### Core Test Files

- **`editor.spec.ts`** - Main editor functionality tests
  - Homepage loading and splash dialog
  - Starting the editor (Draw button)
  - Tool selection and options
  - Font selection
  - Color palette interaction
  - Canvas drawing simulation
  - Cursor position display

- **`collaboration.spec.ts`** - Collaboration features
  - Join button functionality
  - Collaboration dialog display
  - Offline mode selection

- **`file-operations.spec.ts`** - File and canvas operations
  - File dialog display
  - Canvas resolution controls
  - File operation cancellation

## Running the Tests

### Prerequisites

1. Build the application:
   ```bash
   bun bake
   ```

2. Install Playwright browsers (if needed):
   ```bash
   npx playwright install
   ```

### Running Tests

- **Run all E2E tests:**
  ```bash
  bun check:e2e
  ```

- **Run with headed browser (visual mode):**
  ```bash
  bun check:e2e:headed
  ```

- **Debug tests interactively:**
  ```bash
  bun check:e2e:debug
  ```

### Test Server

The tests automatically start a local server using the built application in the `dist` directory. The server runs on `http://localhost:3000` during test execution.

## Test Coverage

### Core User Flows Covered

✅ **Homepage Load** - Verifies the landing page loads with splash dialog and key UI elements  
✅ **Font Selection** - Tests font changing and preview updates  
✅ **Drawing** - Simulates drawing on the canvas and verifies interaction  
✅ **Palette Change** - Tests color palette interaction and tool updates  
✅ **Tool Selection** - Verifies different tools can be selected and options appear  
✅ **Collaboration** - Tests collaboration UI elements and offline mode  
✅ **File Operations** - Tests file dialogs and canvas resolution controls

### Key UI Elements Tested

- Main canvas (`#art`)
- Color palette (`#paletteColors`) 
- Current colors display (`#currentColors`)
- Tool buttons (`#brush`, `#blockBrush`, etc.)
- Font controls (`#font`, `#fontName`, `#fontPreview`)
- Splash dialog (`#msg`, `#splash`)
- Collaboration features (`#collab`, `#joint`, `#offline`)
- File operations (`#file`, file buttons)
- Canvas resolution controls

## Test Best Practices

### Selectors Used

The tests use stable selectors in this priority order:
1. **ID selectors** - `#art`, `#brush`, `#paletteColors` (most stable)
2. **Role-based selectors** - `page.getByRole('button', { name: 'Draw' })`
3. **Text content** - `page.locator('button', { hasText: '80 cols x 25 rows' })`

### Test Structure

- Each test file focuses on a specific area of functionality
- Tests are grouped using `test.describe()` for better organization
- Each test is atomic and can run independently
- Tests use `async/await` for proper handling of asynchronous operations

### Error Handling

- Tests wait for elements to be visible before interacting
- Proper timeouts are configured (30 seconds default)
- Retries are enabled (1 retry) for flaky test resilience

## Adding New Tests

When adding new E2E tests:

1. **Place tests in appropriate files** based on functionality area
2. **Use stable selectors** - prefer IDs over complex CSS selectors
3. **Wait for elements** using `await expect(element).toBeVisible()` 
4. **Test real user flows** rather than implementation details
5. **Keep tests focused** - one test should verify one main flow
6. **Add descriptive test names** that explain what is being tested

### Example Test Pattern

```typescript
test('descriptive test name explaining the user flow', async ({ page }) => {
  // Navigate to the page
  await page.goto('/');
  
  // Wait for initial state
  await expect(page.locator('#expectedElement')).toBeVisible();
  
  // Perform user actions
  await page.locator('#actionButton').click();
  
  // Verify expected outcomes
  await expect(page.locator('#resultElement')).toBeVisible();
  await expect(page.locator('#resultElement')).toContainText('Expected Text');
});
```

## Troubleshooting

### Common Issues

1. **Browser not found** - Run `npx playwright install`
2. **Server not starting** - Ensure `bun bake` was run and `dist` directory exists
3. **Timeout errors** - Check if the application is building/loading correctly
4. **Element not found** - Verify selectors match the current HTML structure

### Debug Mode

Use debug mode to step through tests interactively:
```bash
bun check:e2e:debug
```

This opens a browser window where you can see the test execution step by step.