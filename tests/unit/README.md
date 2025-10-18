# Unit Tests

This directory contains Vitest unit tests for the teXt0wnz text art editor.

## Overview

The unit tests validate individual modules and functions in isolation, ensuring code quality and preventing regressions.

## Test Files

### Client Modules

- **canvas.test.js** - Canvas rendering and manipulation tests
  - Canvas initialization and setup
  - Drawing operations
  - Undo/redo functionality
  - Image data manipulation
  - Dirty region tracking
  - Mirror mode functionality
  - XBin font/palette handling

- **file.test.js** - File loading and saving tests
  - ANSi file format handling
  - Binary (.bin) file support
  - XBin format support
  - SAUCE metadata parsing
  - File export operations
  - PNG image generation
  - Font name conversions

- **font.test.js** - Font loading and rendering tests
  - Font loading from images
  - XB font data parsing
  - Glyph rendering
  - Letter spacing handling
  - Alpha channel rendering
  - Error handling
  - Font dimension validation

- **freehand_tools.test.js** - Drawing tools tests
  - Halfblock/block drawing
  - Character brush
  - Shading brush
  - Line tool
  - Square tool
  - Circle tool
  - Fill tool
  - Tool state management

- **keyboard.test.js** - Keyboard input and shortcuts tests
  - Keyboard mode toggle
  - Text input handling
  - Arrow key navigation
  - Shortcut key handling
  - Cursor movement
  - Special key handling

- **main.test.js** - Application initialization tests
  - Module initialization
  - Event listener setup
  - State management
  - Integration tests

- **network.test.js** - Network and collaboration tests
  - WebSocket connection
  - Message handling
  - Chat functionality
  - User session management
  - Drawing synchronization

- **palette.test.js** - Color palette tests
  - Default palette creation
  - Color selection
  - RGB conversion
  - Ice colors support
  - Palette updates

- **state.test.js** - Global state management tests
  - State initialization
  - State updates
  - Font management
  - Palette management
  - Canvas state

- **toolbar.test.js** - Toolbar interaction tests
  - Tool selection
  - Tool switching
  - Toolbar state management
  - UI updates

- **ui.test.js** - User interface tests
  - UI element creation
  - Event handling
  - DOM manipulation
  - Component interactions

- **utils.test.js** - Utility function tests
  - Helper functions
  - Data manipulation
  - Format conversions

- **worker.test.js** - Web Worker tests
  - Worker message handling
  - Data processing algorithms
  - Block deduplication logic
  - Message processing

- **xbin-persistence.test.js** - XBin format persistence tests
  - Embedded font handling
  - Palette persistence
  - File roundtrip testing

### Client Subdirectories

- **client/worker.test.js** - Additional worker module tests
  - Message protocol validation
  - Binary data handling
  - Connection management

### Server Modules

- **server/config.test.js** - Server configuration tests
  - Configuration parsing
  - Default values
  - Validation

- **server/fileio.test.js** - Server file operations tests
  - SAUCE record creation and parsing
  - Binary data conversions
  - File format validation
  - Canvas dimension extraction
  - Data type conversions

- **server/main.test.js** - Server main module tests
  - Module structure validation
  - Configuration integration
  - Component exports
  - Dependency integration

- **server/server.test.js** - Express server tests
  - Server initialization
  - Route handling
  - Middleware setup
  - SSL configuration

- **server/text0wnz.test.js** - Collaboration engine tests
  - Session management
  - User tracking
  - Canvas state synchronization
  - Message broadcasting

- **server/utils.test.js** - Server utility tests
  - Helper functions
  - Data validation
  - Format conversions

- **server/websockets.test.js** - WebSocket handler tests
  - Connection handling
  - Message routing
  - Session cleanup
  - Error handling

## Running the Tests

### Prerequisites

1. Install dependencies:
```bash
npm install
# or
bun install
```

### Run All Tests

```bash
npm run test:unit
# or
bun test:unit
```

### Run Tests with Coverage

```bash
npm run test:unit -- --coverage
# or
npx vitest run --coverage
```

### Run Tests in Watch Mode

```bash
npx vitest
# or
bunx vitest
```

### Run Tests with Specific Pattern

```bash
npx vitest canvas
npx vitest server
npx vitest dom
```

### Run Specific Test File

```bash
npx vitest tests/unit/canvas.test.js
npx vitest tests/unit/server/config.test.js
```

### Run Tests with UI

```bash
npx vitest --ui
```

## Test Coverage

Current coverage status (as of latest run):

- **Overall**: ~50.62% statement coverage
- **Client modules**: ~50.26% average coverage
- **Server modules**: ~56.76% average coverage
- **Total tests**: 852 tests across 33 test files

### Coverage Goals

- Target minimum 60% statement coverage overall
- Focus on critical paths and edge cases
- Test error handling thoroughly
- Cover all public APIs

### Coverage by Module

**High Coverage (>80%)**:
- `compression.js`: 100%
- `magicNumbers.js`: 100%
- `config.js` (server): 100%
- `utils.js` (server): 100%
- `websockets.js` (server): 100%
- `main.js` (server): 100%
- `lazyFont.js`: 100%
- `fontCache.js`: 98.31%
- `websocket.js` (client): 96.4%
- `storage.js`: 82.19%

**Medium Coverage (50-80%)**:
- `palette.js`: 72.59%
- `state.js`: 68.75%
- `ui.js`: 57.98%
- `toolbar.js`: 55.88%
- `server.js`: 55.4%
- `fileio.js` (server): 53.75%

**Needs Improvement (<50%)**:
- `canvas.js`: 43.1%
- `freehand_tools.js`: 42.35%
- `file.js`: 41.39%
- `keyboard.js`: 41.18%
- `network.js`: 47.53%
- `font.js`: 46.77%
- `text0wnz.js` (server): 30.96%
- `main.js` (client): 17.51%

### Coverage Reports

After running tests with `--coverage`, view the detailed HTML report:

```bash
# Coverage report is generated in tests/results/coverage/ directory
open tests/results/coverage/index.html  # macOS
xdg-open tests/results/coverage/index.html  # Linux
start tests/results/coverage/index.html  # Windows
```

## Writing New Tests

### Test Structure

Tests follow this general structure:

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

### Mocking

Use Vitest's mocking capabilities:

```javascript
// Mock a module
vi.mock('../../src/js/client/state.js', () => ({
  default: {
    font: { /* mock implementation */ },
    palette: { /* mock implementation */ }
  }
}));

// Mock a function
const mockFunction = vi.fn(() => 'mocked value');

// Spy on a method
const spy = vi.spyOn(object, 'method');
```

### Best Practices

1. **Test Isolation**: Each test should be independent
2. **Clear Names**: Use descriptive test names that explain the expected behavior
3. **Arrange-Act-Assert**: Structure tests with clear setup, execution, and assertion phases
4. **Mock Dependencies**: Mock external dependencies to test in isolation
5. **Test Edge Cases**: Include tests for error conditions and boundary values
6. **Avoid Implementation Details**: Test behavior, not implementation
7. **Keep Tests Fast**: Unit tests should run quickly
8. **Clean Up**: Always clean up after tests (remove event listeners, restore mocks)

### Common Patterns

**Testing DOM Manipulation:**
```javascript
it('should update element', () => {
  const element = { textContent: '' };
  updateElement(element, 'new text');
  expect(element.textContent).toBe('new text');
});
```

**Testing Async Code:**
```javascript
it('should load data asynchronously', async () => {
  const result = await loadData();
  expect(result).toBeDefined();
});
```

**Testing Events:**
```javascript
it('should handle events', () => {
  const handler = vi.fn();
  addEventListener('click', handler);
  
  fireEvent('click');
  
  expect(handler).toHaveBeenCalled();
});
```

**Testing Error Handling:**
```javascript
it('should throw error for invalid input', () => {
  expect(() => processData(null)).toThrow('Invalid input');
});
```

## Continuous Integration

Tests run automatically on:
- Every pull request
- Every commit to main branch
- Scheduled daily runs

## Troubleshooting

### Common Issues

**Tests timing out:**
- Increase timeout in vitest.config.js
- Check for unhandled promises
- Look for infinite loops

**Mocks not working:**
- Ensure mocks are defined before imports
- Check mock file paths
- Verify mock implementation

**Memory leaks:**
- Clean up event listeners in afterEach
- Clear large objects after use
- Use --no-coverage for faster iterations

**Flaky tests:**
- Avoid timing-dependent tests
- Mock Date.now() for time-based tests
- Ensure proper cleanup between tests

### Getting Help

- Check Vitest documentation: https://vitest.dev/
- Review existing tests for patterns
- Ask in team discussions

## Test Metrics

Track these metrics to maintain quality:

- **Statement Coverage**: % of code statements executed
- **Branch Coverage**: % of conditional branches taken
- **Function Coverage**: % of functions called
- **Line Coverage**: % of lines executed

Aim for:
- Critical modules: 80%+ coverage
- General modules: 60%+ coverage
- Utility functions: 90%+ coverage

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Mocking Guide](https://vitest.dev/guide/mocking.html)
- [Coverage Configuration](https://vitest.dev/guide/coverage.html)

