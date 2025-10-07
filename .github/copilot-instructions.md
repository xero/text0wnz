# GitHub Copilot Instructions for moebius-web

>[!NOTE]
>this project, `moebius-web` is being rebranded as `teXt0wnz` or `text.0w.nz`

## Project Overview

teXt0wnz is a web-based text art editor that operates in two modes: server-side (collaborative) and client-side (standalone).

This is a single-page application for creating ANSI/ASCII art with various drawing tools, color palettes, export capabilities, and real-time collaboration features.

# Install bun
- this project uses bun over npm. make sure it's installed before you begin any work. there's a few ways you can install it:

**NPM global install**
```sh
npm i -g bun
```

**NPM local install**
```sh
npm i bun
```

**Manual install**
```sh
curl -fsSL https://bun.sh/install | bash
# or
wget -qO- https://bun.sh/install | bash
```

### Building the App

```sh
bun bake
```

This generates optimized files in the `dist/` directory:
- `index.html` - Main application entry point
- `site.webmanifest` - PWA (Progressive Web App) configuration
- `service.js` - Application service worker
- `workbox-[hash].js` - Runtime/Offline asset management/caching
- `robots.txt` and `sitemap.xml`
- `ui/editor.js` - Minified JavaScript bundle
- `ui/stylez.css` - Minified CSS styles
- `ui/fonts/` - Font assets
- `ui/` - Other static assets (images, icons, etc.)

### Project Structure

```
src/
├── index.html          # Main HTML template
├── css/style.css       # Tailwind CSS styles
├── fonts/              # Font assets (PNG format)
├── img/                # Static images and icons
└── js/
    ├── client/         # Client-side JavaScript modules
    │   ├── main.js     # Application entry point
    │   ├── canvas.js   # Canvas and drawing logic
    │   ├── keyboard.js # Keyboard shortcuts and text input
    │   ├── ui.js       # UI components and interactions
    │   ├── palette.js  # Color palette management
    │   ├── file.js     # File I/O operations
    │   └── ...         # Other client modules
    └── server/         # Server-side collaboration modules
        ├── main.js     # Server entry point
        ├── server.js   # Express server setup
        ├── text0wnz.js # Collaboration engine
        └── ...         # Other server modules

dist/                   # Built application (generated)
tests/                  # Unit tests
docs/                   # Documentation
```

### Documentation

Located in the [/docs](https://github.com/xero/moebius-web/tree/main/docs) folder of the project.

### Linting and Formatting

The project uses ESLint for code linting and Prettier for code formatting:

```sh
# Check for linting issues
bun lint:check

# Auto-fix linting issues
bun lint:fix

# Check code format
bun format:check

# Auto-fix formatting issues
bun format:fix

# Fix both linting and formatting
bun fix
```

>![IMPORTANT]
> Before committing, _ALWAYS_ format and lint your code, then fix any issues Eslint may have.

## Testing

Directory structure and organization

```
tests
├── e2e      # playwright tests
├── results  # all test results
└── unit     # vitetests
```

>![NOTE]
> never commit the `test/results` folder, as it's used for cicd. it's covered by the .gitignore file

### Unit Testing

The project includes comprehensive unit tests using **Vitest** with **jsdom** environment:

```sh
# Run all unit tests and generate coverage report
bun test:unit

# Run tests in watch mode during development
bunx vitest
# or
npx vitest

# Run tests with coverage report
bunx vitest --coverage
```

**Test Coverage Includes:**
- Client-side modules (canvas, keyboard, palette, file I/O, UI components)
- Server-side modules (configuration, WebSocket handling, file operations)
- Utility functions and helper modules
- State management and toolbar interactions

Test files are organized in `tests/unit/` with separate files for each module. The test suite provides excellent coverage for core functionality and helps ensure code quality.

**Test Environment:**
- **Vitest** - Fast unit test runner with ES module support
- **jsdom** - Browser environment simulation for DOM testing
- **@testing-library/jest-dom** - Additional DOM matchers
- **Coverage reporting** with v8 provider

Tests run automatically in CI/CD and should be run locally before committing changes.

### E2E Testing

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
- **Videos**: On failure
- **Web server**: `bunx serve dist -l 8060`

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

## Best Practices

1. **Wait for elements**: Always wait for elements to be visible/ready before interacting
2. **Use timeouts**: Add small delays after interactions to allow the UI to update
3. **Flexible selectors**: Use multiple selector strategies (ID, class, text, data attributes)
4. **Test isolation**: Each test should be independent and not rely on previous tests
5. **Error handling**: Tests should gracefully handle missing optional elements
6. **Clean up**: Use `beforeEach` and `afterEach` for setup and teardown
7. **Meaningful assertions**: Test actual user-visible behavior, not implementation details

---

### Running the Server

The collaboration server can be started with:

```sh
bun server [port] [options]
```

- `[port]` (optional): Port to run the server (default: `1337`)
- See the **Command-Line Options** table above for available flags

#### Example: Basic Start

```sh
bun server
```

#### Example: Custom Port, Session, and Save Interval

```sh
bun server 8080 --session-name myjam --save-interval 10
```

#### Example: With SSL

```sh
bun server 443 --ssl --ssl-dir /etc/letsencrypt
```

> The server will look for `letsencrypt-domain.pem` and `letsencrypt-domain.key` in the specified SSL directory.

#### Example: All Options

```sh
bun server 9001 --ssl --ssl-dir /etc/ssl/private --save-interval 5 --session-name collab
```

**See the project `README.md` for more info

---

## Development Guidelines

### 1. Code Structure Patterns

**Tool Implementation Pattern** (see `src/js/client/freehand_tools.js`):
```javascript
const createToolController = () => {
    "use strict";

    function enable() {
        // Add event listeners
        document.addEventListener("onTextCanvasDown", canvasDown);
        document.addEventListener("onTextCanvasDrag", canvasDrag);
        document.addEventListener("onTextCanvasUp", canvasUp);
    }

    function disable() {
        // Remove event listeners
        document.removeEventListener("onTextCanvasDown", canvasDown);
        // ...
    }

    return {
        "enable": enable,
        "disable": disable
    };
}
```

**Event Handling Pattern**:
```javascript
// Use custom events for canvas interaction
document.addEventListener("onTextCanvasDown", canvasDown);
document.addEventListener("onTextCanvasDrag", canvasDrag);
document.addEventListener("onTextCanvasUp", canvasUp);
```

**UI Integration Pattern**:
```javascript
// Register tools with toolbar
Toolbar.add($(toolId), tool.enable, tool.disable);

// Use $ function for DOM element access
function $(divName) {
    return document.getElementById(divName);
}
```

### 2. Adding New Features

3. **Canvas interaction**: Use the established event system (`onTextCanvasDown`, etc.)
4. **UI integration**: Register with `Toolbar.add()` and create corresponding HTML elements

### 3. Code Style

- Use meaningful variable names (`textArtCanvas`, `characterBrush`, etc.)
- Follow existing indentation (tabs)
- Use explicit returns with named properties: `return { "enable": enable, "disable": disable };`

### 4. Key Application Concepts

**Canvas System:**
- `textArtCanvas` - Main drawing surface
- Uses character-based coordinates (not pixel-based)
- Supports undo/redo operations via `State.textArtCanvas.startUndo()`

**Color Management:**
- `palette` - Color palette management
- Foreground/background color system
- Support for ICE colors (extended palette)

**Drawing Modes:**
- Half-block characters for pixel-like drawing
- Character-based drawing with extended ASCII
- Attribute brushes for color-only changes

**Collaboration System:**
- Silent server connection checking on startup
- User choice between local and collaboration modes
- Real-time canvas settings synchronization (size, font, ice colors, letter spacing)
- WebSocket-based message protocol for drawing commands and state changes
- Automatic server state persistence and session management

## Server-Side Development Guidelines

### 1. Server Architecture

**Express Server (`server.js`):**
- Configurable SSL/HTTP setup with automatic certificate detection
- WebSocket routing for both direct and proxy connections (`/` and `/server` endpoints)
- Session middleware integration with express-session
- Comprehensive logging and error handling
- Configurable auto-save intervals and session naming

**Collaboration Engine (`src/text0wnz.js`):**
- Centralized canvas state management (imageData object)
- Real-time message broadcasting to all connected clients
- Session persistence with both timestamped backups and current state
- User session tracking and cleanup
- Canvas settings synchronization (size, font, colors, spacing)

### 2. WebSocket Message Protocol

**Client-to-Server Messages:**
```javascript
["join", username] - User joins collaboration session
["nick", newUsername] - User changes display name
["chat", message] - Chat message
["draw", blocks] - Drawing command with array of canvas blocks
["resize", {columns, rows}] - Canvas size change
["fontChange", {fontName}] - Font selection change
["iceColorsChange", {iceColors}] - Ice colors toggle
["letterSpacingChange", {letterSpacing}] - Letter spacing toggle
```

**Server-to-Client Messages:**
```javascript
["start", sessionData, sessionID, userList] - Initial session data
["join", username, sessionID] - User joined notification
["part", sessionID] - User left notification
["nick", username, sessionID] - User name change
["chat", username, message] - Chat message broadcast
["draw", blocks] - Drawing command broadcast
["resize", {columns, rows}] - Canvas resize broadcast
["fontChange", {fontName}] - Font change broadcast
["iceColorsChange", {iceColors}] - Ice colors broadcast
["letterSpacingChange", {letterSpacing}] - Letter spacing broadcast
```

### 3. Canvas State Management

**ImageData Object Structure:**
```javascript
{
  columns: number,        // Canvas width in characters
  rows: number,          // Canvas height in characters
  data: Uint16Array,     // Character/attribute data
  iceColours: boolean,   // Extended color palette enabled
  letterSpacing: boolean, // 9px font spacing enabled
  fontName: string       // Selected font name
}
```

**State Synchronization:**
- All canvas settings automatically sync across connected clients
- New users receive current collaboration state instead of broadcasting defaults
- Settings changes are persisted to session files
- Graceful handling of mid-session joins without disrupting existing users

### 4. Session Management

**File Structure:**
- `{sessionName}.bin` - Binary canvas data (current state)
- `{sessionName}.json` - Chat history and metadata
- `{sessionName} {timestamp}.bin` - Timestamped backups

**Configuration Options:**
```bash
node server.js [port] [options]
--ssl                 # Enable SSL (requires certificates)
--ssl-dir <path>      # SSL certificate directory
--save-interval <min> # Auto-save interval in minutes
--session-name <name> # Session file prefix
```

### 5. Adding New Collaboration Features

**Server-Side Message Handler Pattern:**
```javascript
// In src/ansiedit.js message() function
case "newFeature":
  if (msg[1] && msg[1].someProperty) {
    console.log("Server: Updating feature to", msg[1].someProperty);
    imageData.someProperty = msg[1].someProperty;
  }
  break;
```

**Client-Side Integration Pattern:**
```javascript
// In public/js/network.js
const sendNewFeature = value => {
  if (collaborationMode && connected && !applyReceivedSettings && !initializing) {
    worker.postMessage({ "cmd": "newFeature", "someProperty": value });
  }
}

const onNewFeature = value => {
  if (applyReceivedSettings) return; // Prevent loops
  applyReceivedSettings = true;
  // Apply the change to UI/canvas
  applyReceivedSettings = false;
}
```

### 6. Error Handling & Debugging

**Server Logging:**
- Comprehensive WebSocket connection logging with client details
- Message type and payload logging for debugging
- Error tracking with proper cleanup on connection failures
- Client count tracking and connection state monitoring

**Common Issues:**
- WebSocket state validation before sending messages
- Proper client cleanup on disconnection
- Settings broadcast loop prevention with flags
- Silent connection check vs explicit connection handling

## Testing & Development

## How to Run

### build and install

```
npm i -g bun
bun i
bun bake
```

- these commands will setup the node_modules and build the application to the `dist` folder
- Now you need is a static web server pointed at the `dist/` directory.

### Fastest way to run (from the project root):

```sh
cd dist
python3 -m http.server 8080
```

Then open [http://localhost:8080/](http://localhost:8080/) in your browser.

- **Any static web server will work** (e.g. Python, PHP, Ruby, `npx serve`, etc).
- Just make sure your web server's root is the `dist/` directory.

## Summary

- **Just build and serve the `dist/` folder as static files.**

### Local Development Setup
1. **Client-only**: Start local server: `python3 -m http.server 8080` from `public/` directory
2. **With collaboration**: Run `bun server 1337` then access at `http://localhost:1337`
3. Use browser dev tools for debugging
4. Test collaboration with multiple browser tabs/windows

### Testing with Playwright
```javascript
// Basic test structure
await page.goto('http://localhost:8080'); // or 1337 for collaboration
// Test drawing tools, UI interactions, file operations, collaboration
```

### Key Test Scenarios
- Tool selection and canvas interaction
- Keyboard shortcuts (F, B, K, etc.)
- File import/export operations
- Undo/redo functionality
- Color palette operations
- **Collaboration mode selection and canvas settings sync**
- **Multi-user drawing and real-time updates**
- **Server connection handling and graceful fallback**

## Important Notes

- **Always test changes locally** before committing
- **Always run `bun lint:fix`** before committing
- **Preserve existing functionality** - this is a working art editor used by artists
- **Test both local and collaboration modes** when making changes that affect canvas or UI
- **Maintain the established patterns** for consistency and reliability
- **Validate server message protocol changes** with multiple connected clients

## Dependencies & Browser Support

- Pure JavaScript for client-side
- Node.js with Express framework for server-side collaboration
- Works in modern browsers with Canvas, File API, and WebSocket support
- Uses Web Workers for real-time collaboration communication
