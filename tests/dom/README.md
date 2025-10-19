# DOM Testing with Testing Library

This directory contains DOM/component-level tests for the teXt0wnz editor using [@testing-library/dom](https://testing-library.com/docs/dom-testing-library/intro/), [@testing-library/user-event](https://testing-library.com/docs/user-event/intro/), and [@testing-library/jest-dom](https://github.com/testing-library/jest-dom).

> [!INFO]
> View the latest [report](https://xero.github.io/text0wnz/tests/)

---

## Overview

DOM tests validate user interface behavior at the component level, bridging the gap between unit tests (pure logic) and E2E tests (full application flows). These tests ensure that:

- UI components render correctly
- User interactions work as expected
- DOM state changes appropriately
- Accessibility features function properly

## Test Coverage

### Toolbar Tests (`toolbar.test.js`)
Tests for the toolbar component and tool management:
- Toolbar button rendering and accessibility
- Tool activation and switching via clicks
- Visual state management (toolbar-displayed class)
- Programmatic tool switching (switchTool, returnToPreviousTool, getCurrentTool)
- Multiple tool registration and management
- ARIA labels and accessible button roles
- Edge cases (rapid clicking, empty IDs, dynamic buttons)

### Palette Tests (`palette.test.js`)
Tests for color palette and color selection:
- Color palette creation and rendering
- Foreground/background color selection
- Color swatches with accessibility
- Keyboard navigation for color selection
- Color swap and default color reset
- ICE colors (extended palette) support
- Palette preview canvas rendering
- RGBA color value validation
- Edge cases (invalid indices, rapid changes)

### Modal Tests (`modal.test.js`)
Tests for modal dialog functionality:
- Modal dialog rendering and sections
- Opening and closing modals
- Close button interactions
- Focus management (focusEvents callbacks)
- Closing animations and state transitions
- Keyboard navigation (Escape key, Enter on buttons)
- Accessibility (dialog role, headings, focus)
- Error modal display
- Edge cases (rapid open/close, non-existent modals)

### Toggle Button Tests (`toggleButton.test.js`)
Tests for two-state toggle button components:
- Toggle button rendering (left/right states)
- State callbacks on button clicks
- Visual state management (enabled class)
- Programmatic state control (setStateOne, setStateTwo)
- Keyboard accessibility
- Multiple independent toggle buttons
- ARIA attributes (aria-pressed)
- Use cases (on/off toggle, mode selector, view toggle)
- Edge cases (rapid clicking, empty names, undefined callbacks)

### Keyboard Tests (`keyboard.test.js`)
Tests for keyboard shortcuts and navigation:
- Keyboard shortcut triggering (Ctrl+Key combinations)
- Multiple modifier keys (Ctrl, Alt, Shift)
- Function keys (F1, F2, etc.)
- Arrow key navigation
- Tab navigation and focus management
- Home/End key support
- Shortcut visual indicators (kbd elements, tooltips)
- Text input typing and editing
- Accessibility (Enter/Space activation, aria-keyshortcuts)
- Preventing default browser behavior
- Global vs local shortcuts
- Edge cases (special characters, rapid keys, non-character keys)

## Running the Tests

### Run all DOM tests
```bash
npx vitest --dir tests/dom
```

### Run specific test file
```bash
npx vitest tests/dom/toolbar.test.js
```

### Run tests in watch mode
```bash
npx vitest --dir tests/dom --watch
```

### Run with coverage
```bash
npx vitest --dir tests/dom --coverage
```

## Writing DOM Tests

### Test Structure

DOM tests follow this general pattern:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

describe('Component DOM Tests', () => {
  let user;

  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';
    // Create userEvent instance
    user = userEvent.setup();
    // Clear mocks
    vi.clearAllMocks();
  });

  it('should render component', () => {
    // Render component
    const element = document.createElement('button');
    element.textContent = 'Click me';
    document.body.appendChild(element);

    // Assert with Testing Library
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    const onClick = vi.fn();
    const button = document.createElement('button');
    button.textContent = 'Click me';
    button.addEventListener('click', onClick);
    document.body.appendChild(button);

    // Simulate user action
    await user.click(screen.getByText('Click me'));

    // Assert callback was called
    expect(onClick).toHaveBeenCalled();
  });
});
```

### Best Practices

1. **Use Testing Library Queries**
   - Prefer `screen.getByRole()`, `screen.getByLabelText()`, `screen.getByText()`
   - Avoid manual DOM queries (`getElementById`, `querySelector`)
   - Query by what users see and interact with

2. **Use userEvent for Interactions**
   - Prefer `userEvent` over `fireEvent` for more realistic user interactions
   - Always `await` userEvent actions
   - Use `userEvent.setup()` in beforeEach for fresh instances

3. **Clean Up Between Tests**
   - Clear `document.body.innerHTML = ''` in beforeEach
   - Reset mocks with `vi.clearAllMocks()`
   - Ensure tests are isolated and independent

4. **Test Accessibility**
   - Verify ARIA labels and roles
   - Test keyboard navigation
   - Check focus management
   - Use accessible queries (getByRole, getByLabelText)

5. **Assert on User-Visible Behavior**
   - Test what users see and experience
   - Verify visual feedback (CSS classes, content)
   - Check state changes that affect the UI
   - Don't test implementation details

6. **Handle Async Operations**
   - Use `async/await` for user interactions
   - Use `waitFor()` for assertions that may take time
   - Handle animations and timeouts properly

### Custom Matchers

From `@testing-library/jest-dom`:

- `toBeInTheDocument()` - Element exists in the DOM
- `toBeVisible()` - Element is visible (not hidden by CSS)
- `toHaveClass(className)` - Element has CSS class
- `toHaveAttribute(attr, value)` - Element has attribute with value
- `toHaveTextContent(text)` - Element contains text
- `toBeDisabled()` / `toBeEnabled()` - Form element state
- `toHaveFocus()` - Element has focus
- `toHaveValue(value)` - Input/select/textarea value

See [jest-dom documentation](https://github.com/testing-library/jest-dom#custom-matchers) for complete list.

## Integration with Other Tests

### Test Pyramid

```
        E2E Tests (Playwright)
       /                    \
    DOM Tests (Testing Library)
   /                            \
Unit Tests (Vitest)             \
```

- **Unit Tests** (`tests/unit/`) - Pure logic, utilities, state management
- **DOM Tests** (`tests/dom/`) - UI components, user interactions, accessibility
- **E2E Tests** (`tests/e2e/`) - Full application workflows, integration

### When to Write DOM Tests

Write DOM tests when:
- Testing component rendering
- Validating user interactions (clicks, typing, navigation)
- Checking visual feedback (classes, styles, content)
- Verifying accessibility (ARIA, keyboard support)
- Testing state changes that affect the UI
- Ensuring proper focus management

### When NOT to Write DOM Tests

Avoid DOM tests for:
- Pure logic (use unit tests)
- Full user workflows (use E2E tests)
- Server-side functionality (use unit tests)
- File I/O operations (use unit tests)

## Debugging Tests

### Run single test
```bash
npx vitest tests/dom/toolbar.test.js -t "should activate a tool button on click"
```

### Debug with console.log
```javascript
import { screen, debug } from '@testing-library/dom';

// Print DOM tree
debug();

// Print specific element
debug(screen.getByRole('button'));
```

### Use Vitest UI
```bash
npx vitest --ui
```

### Enable verbose output
```bash
npx vitest --dir tests/dom --reporter=verbose
```

## Resources

- [Testing Library Documentation](https://testing-library.com/docs/dom-testing-library/intro/)
- [User Event API](https://testing-library.com/docs/user-event/intro/)
- [jest-dom Matchers](https://github.com/testing-library/jest-dom#custom-matchers)
- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Cheatsheet](https://testing-library.com/docs/dom-testing-library/cheatsheet/)
- [Common Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

## Contributing

When adding new DOM tests:

1. Create a new test file in `tests/dom/` or add to existing file
2. Follow the test structure and naming conventions
3. Use Testing Library queries and userEvent
4. Test for accessibility
5. Include edge cases
6. Run tests and ensure they pass
7. Format and lint: `npm run fix`
8. Update this README if adding new test categories

## Coverage Goals

DOM tests should focus on:
- UI rendering and content
- User interactions (click, type, navigate)
- Visual state changes (CSS classes, visibility)
- Accessibility (ARIA, keyboard, focus)
- Form inputs and validation
- Modal and overlay behavior
- Dynamic content updates

Current coverage: **5 test files, 121 tests**
- toolbar.test.js: 18 tests
- palette.test.js: 19 tests
- modal.test.js: 33 tests
- toggleButton.test.js: 25 tests
- keyboard.test.js: 26 tests
