# Project Structure

This document provides a detailed overview of the teXt0wnz project file structure, describing the purpose of each directory and key files.

We will begin by explaining our naming conventions.

## Table of Contents

- [Naming Conventions](#naming-conventions)
- [Root Directory](#root-directory)
- [Source Code](#source-code)
- [Documentation](#documentation)
- [Tests](#tests)
- [Configuration Files](#configuration-files)
- [GitHub Actions](#github-actions)

## Naming Conventions

Use `camelCase` names whenever possible, though `ClassName` is also acceptable.

Standalone `_` is used as throwaway parameter for unused required parameters

- `_ => { }`
- `const _ = something`

### Source Files

Sources should use all lowercase or camelCase file names:

- JavaScript: `lowercase.js` (e.g., `canvas.js`, `freehandTools.js`)
- Tests: `module.test.js` or `module.spec.js`
- CSS: `lowercase.css`
- HTML: `lowercase.html`

### CICD / Github Actions

Github actions requires `kebab-case` file names.

- Workflows: `build.yml` or `test-suite.yml`

### Documentation

Markdown powers the wiki, use `kebab-case` for documentation files:

- Markdown: `lowercase-with-hyphens.md`
- All lowercase with hyphens for spaces (URL safe)

### Assets

Font files retain their original release file names. _(yes the spaces are GROSS)_

- Fonts: `fontname size.png` (e.g., `CP437 8x16.png`)

Images are required for favicons, PWA install, opengraph previews, and other SEO. Their file names are vendor specific, and are mostly kebab-case.

- Images: `lowercase-descriptive-name.png/svg/ico`

> [!NOTE]
> All UI images should be in **SVG** format whenever possible, otherwise favor **PNG**.

## Module Import Conventions

### ES Modules

All JavaScript uses ES6 module syntax:

```javascript
// Named exports
export function myFunction() {}
export const myConstant = 42;

// Default export
export default MyClass;

// Imports
import { myFunction, myConstant } from './module.js';
import MyClass from './module.js';
```

### Module Pattern

Some modules use revealing module pattern:

```javascript
const Module = (() => {
	function publicFunction() {}

	return {
		publicFunction: publicFunction,
	};
})();

export default Module;
```

# Project File Structure

## Root Directory

```
text0wnz/
├── .env                    # Environment variables
├── .git/                   # Git repository
├── .gitattributes          # Git attributes configuration
├── .github/                # GitHub Actions workflows and configs
├── .gitignore              # Git ignore patterns
├── .prettierignore         # Prettier ignore patterns
├── .prettierrc             # Prettier configuration
├── banner                  # ASCII art banner script (displayed on commands)
├── bun.lock                # Bun lockfile
├── Dockerfile              # Production Docker image
├── docs/                   # Documentation files
├── eslint.config.js        # ESLint configuration
├── LICENSE.txt             # MIT license
├── node_modules/           # Dependencies (gitignored)
├── OSSMETADATA             # Open source metadata
├── package.json            # Package configuration
├── package-lock.json       # npm lockfile
├── playwright.config.js    # Playwright E2E test configuration
├── postcss.config.js       # PostCSS configuration
├── README.md               # Main project documentation
├── src/                    # Source code
├── tailwind.config.js      # Tailwind CSS configuration
├── tests/                  # Test files
├── vite.config.js          # Vite build configuration
└── vitest.config.js        # Vitest unit test configuration
```

## Source Code

### Source Directory Structure

```
src/
├── css/
│   └── style.css          # Main Tailwind CSS styles
├── fonts/                 # Bitmap font assets (PNG format)
├── img/                   # Static images and assets
├── index.html             # Main HTML entry point
├── service.js             # PWA service worker (custom, not auto-generated)
└── js/
    ├── client/            # Client-side JavaScript modules
    └── server/            # Server-side JavaScript modules
```

### Client Modules

```
src/js/client/
├── main.js                # Application entry point and initialization
├── canvas.js              # Canvas rendering engine
├── compression.js         # Data compression (RLE) for storage
├── file.js                # File I/O operations (ANSI, BIN, XBIN, PNG)
├── font.js                # Font loading and rendering
├── fontCache.js           # Font caching system
├── freehandTools.js       # Drawing tools implementation
├── keyboard.js            # Keyboard mode and shortcuts
├── lazyFont.js            # Lazy font loading
├── magicNumbers.js        # Constants and magic values
├── network.js             # Network layer with non-intrusive connection testing
├── palette.js             # Color palette management
├── state.js               # Global application state
├── storage.js             # IndexedDB persistence
├── toolbar.js             # Toolbar management
├── ui.js                  # User interface components
└── websocket.js           # Security-hardened WebSocket worker
src/service.js             # Service worker (separate from client bundle)
```

#### Client Module Descriptions

**service.js** - Service Worker (PWA)

Located at `src/service.js` (root level, separate from client modules)

- Workbox-based precaching with custom manifest injection
- Runtime caching strategies (assets, scripts, styles, HTML)
- Share Target API handler for Android file sharing
- File Handlers API support for Desktop "Open with"
- Stale shared file cleanup on activation
- Cache API for temporary file storage
- Exports: Service worker runtime (no exports, runs independently)

**main.js** - Application Bootstrap

- Initializes all modules
- Sets up event listeners
- Handles application startup
- Manages mode selection (local vs collaborative)

**canvas.js** - Canvas System

- Offscreen canvas rendering
- Dirty region tracking
- Character and color rendering
- Mirror mode support
- Grid overlay
- Cursor positioning
- Exports: `createCanvas()`

**compression.js** - Data Compression

- Run-length encoding (RLE)
- Canvas data compression for storage
- Decompression for restoration
- Exports: `compress()`, `decompress()`

**file.js** - File Operations

- ANSI format (.ans, .utf8.ans) support
- Binary format (.bin) support
- XBIN format (.xb) support
- NFO format (.nfo) support
- Plain text (.txt) support
- PNG export with canvas rendering
- SAUCE metadata support
- Font name conversions
- Exports: `loadFile()`, `saveFile()`, etc.

**font.js** - Font System

- Load fonts from PNG images
- XB font data parsing
- Glyph rendering
- Letter spacing (9px mode)
- Alpha channel support
- Exports: `loadFont()`, `renderGlyph()`

**fontCache.js** - Font Caching

- LRU cache for fonts
- Memory management
- Preloading support
- Exports: `FontCache` class

**freehandTools.js** - Drawing Tools

- Halfblock/Block tool
- Character brush
- Shading brush (░▒▓)
- Line tool with conflict resolution
- Rectangle tool (outline/filled)
- Circle/Ellipse tool (outline/filled)
- Fill tool with smart attributes
- Selection tool (copy/cut/paste/move/flip)
- Sample tool (color picker)
- Tool controller pattern
- Exports: Tool objects with `enable()`/`disable()` methods

**keyboard.js** - Keyboard System

- Keyboard mode toggle
- Text input handling
- Arrow key navigation
- Special character insertion (F-keys)
- Canvas editing shortcuts
- Cursor movement
- Exports: `KeyboardMode` object

**lazyFont.js** - Lazy Loading

- On-demand font loading
- Loading state management
- Error handling
- Exports: `loadFontLazy()`

**magicNumbers.js** - Constants

- Canvas dimensions
- File format signatures
- Color codes
- Character codes
- Exports: Constant values

**network.js** - Network Layer

- WebSocket client management
- Worker initialization and state management
- Non-intrusive connection testing
- Connection state management
- Message protocol handling
- Canvas synchronization
- Chat functionality with repositionable window
- Server log message display (join/leave/nick)
- Desktop notifications
- Collaboration mode selection
- Exports: `Network` object

**palette.js** - Color Management

- 16-color ANSI palette
- ICE colors support (extended backgrounds)
- RGB to ANSI conversion
- Color conflict resolution
- Custom palettes (XBIN)
- Palette UI
- Exports: `Palette` object

**state.js** - State Management

- Global application state
- Canvas configuration
- Current tool selection
- Color selection
- Font and palette state
- Canvas instance
- Undo/redo history
- Exports: `State` object

**storage.js** - Persistence Layer

- IndexedDB operations
- Canvas data storage
- Editor settings storage
- Auto-save with debouncing
- Restore on startup
- Exports: `Storage` object

**toolbar.js** - Toolbar System

- Tool registration
- Tool switching
- UI state management
- Button highlighting
- Exports: `Toolbar` object

**ui.js** - User Interface

- Modal dialogs
- Menu systems
- Dropdown menus
- Toggle buttons
- Character picker
- Shading panel
- Status bar
- Exports: UI component functions

**websocket.js** - WebSocket Worker

- Runs in Web Worker thread
- Security-hardened WebSocket connection
- Mandatory initialization sequence
- Trusted URL construction
- JSON parsing protection and command validation
- Message handling with error protection
- Background communication
- Keeps UI responsive
- Exports: Worker message protocol

### Server Modules

```
src/js/server/
├── main.js                # Server entry point and CLI
├── config.js              # Configuration parsing
├── fileio.js              # File I/O and SAUCE handling
├── server.js              # Express server setup
├── text0wnz.js            # Collaboration engine
├── utils.js               # Utility functions
└── websockets.js          # WebSocket handlers
```

#### Server Module Descriptions

**main.js** - Entry Point

- CLI argument processing
- Server startup
- Help message display
- Configuration integration
- Exports: None (executable)

**config.js** - Configuration

- Parse CLI arguments
- Validate options
- Provide defaults
- Configuration object creation
- Exports: `parseConfig()`

**fileio.js** - File Operations

- Binary file reading/writing
- SAUCE record creation
- SAUCE record parsing
- Canvas dimension extraction
- Data type conversions
- Timestamped backups
- Exports: File I/O functions

**server.js** - Express Server

- Server initialization
- SSL/TLS setup
- Session middleware
- WebSocket routing (/ and /server endpoints)
- Static file serving
- Error handling
- Exports: `createServer()`

**text0wnz.js** - Collaboration Engine

- Canvas state management (imageData)
- User session tracking
- Message broadcasting
- State persistence
- Canvas settings sync
- Auto-save at intervals
- Exports: `CollaborationEngine` class

**utils.js** - Utilities

- Logging functions
- Data validation
- Format conversions
- Helper functions
- Exports: Utility functions

**websockets.js** - WebSocket Layer

- Connection handlers
- Disconnection cleanup
- Message routing
- Session management
- Error handling
- Logging
- Exports: WebSocket setup functions

## Documentation

```
docs/
├── README.md                      # Documentation index
├── architecture.md                # System architecture
├── building-and-developing.md     # Development guide
├── cicd.md                        # CI/CD pipeline
├── collaboration-server.md        # Server documentation
├── docker.md                      # Docker guide
├── examples/                      # Sample artwork
│   ├── ansi/                      # ANSI examples
│   │   ├── x0-defcon25.ans
│   │   ├── x0-grandpa-dan.ans
│   │   └── x0-outlaw-research.ans
│   └── xbin/                      # XBIN examples
│       ├── xz-divinestylers.xb
│       ├── xz-neuromancer.xb
│       └── xz-xero.xb
├── fonts.md                       # Font reference
├── install-pwa.md                 # PWA installation
├── logos.md                       # Project logos
├── manual.md                      # Frontend documentation
├── other-tools.md                 # Additional tools
├── pre-commit                     # Git pre-commit hook
├── privacy.md                     # Privacy policy
├── sauce-format.md                # SAUCE specification
├── testing.md                     # Testing guide
├── webserver-configuration.md     # Webserver setup
└── xb-format.md                   # XBIN specification
```

## Tests

```
tests/
├── canvasShim.js                 # Canvas API shim for tests
├── setupTests.js                 # Test environment setup
├── unit/                         # Vitest unit tests
│   ├── README.md                 # Unit test documentation
│   ├── canvas.test.js            # Canvas module tests
│   ├── client/                   # Client-specific tests
│   │   └── worker.test.js        # WebSocket worker tests
│   ├── compression.test.js       # Compression tests
│   ├── fileLoad.test.js          # File I/O - Load and Save tests
│   ├── fileFormats.test.js       # File I/O - Formats and Parsing tests
│   ├── fileAdvanced.test.js      # File I/O - Advanced operations tests
│   ├── font.test.js              # Font system tests
│   ├── fontCache.test.js         # Font cache tests
│   ├── freehandPanels.test.js    # Drawing tools - Panels and Cursors
│   ├── freehandShapes.test.js    # Drawing tools - Shapes and Fill
│   ├── freehandAdvanced.test.js  # Drawing tools - Advanced tools
│   ├── keyboard.test.js          # Keyboard tests
│   ├── lazyFont.test.js          # Lazy loading tests
│   ├── magicNumbers.test.js      # Constants tests
│   ├── main.test.js              # Main module tests
│   ├── network.test.js           # Network tests
│   ├── palette.test.js           # Palette tests
│   ├── server/                   # Server-specific tests
│   │   ├── config.test.js        # Config tests
│   │   ├── fileio.test.js        # Server file I/O tests
│   │   ├── main.test.js          # Server main tests
│   │   ├── server.test.js        # Express server tests
│   │   ├── text0wnz.test.js      # Collaboration tests
│   │   ├── utils.test.js         # Server utils tests
│   │   └── websockets.test.js    # WebSocket tests
│   ├── state.test.js             # State management tests
│   ├── storage.test.js           # Storage tests
│   ├── toolbar.test.js           # Toolbar tests
│   ├── uiBasic.test.js           # UI - Basic utilities tests
│   ├── uiControls.test.js        # UI - Controls and controllers tests
│   ├── uiComponents.test.js      # UI - Components tests
│   ├── uiModals.test.js          # UI - Advanced utilities tests
│   ├── utils.test.js             # Client utils tests
│   ├── websocket.test.js         # WebSocket client tests
│   ├── worker.test.js            # Worker tests
│   └── xbinPersistence.test.js   # XBIN tests
├── dom/                          # Testing Library DOM tests
│   ├── README.md                 # DOM test documentation
│   ├── canvas.test.js            # Canvas DOM tests
│   ├── fontPreview.test.js       # Font preview tests
│   ├── fullscreen.test.js        # Fullscreen tests
│   ├── keyboard.test.js          # Keyboard DOM tests
│   ├── menu.test.js              # Menu tests
│   ├── modal.test.js             # Modal tests
│   ├── palette.test.js           # Palette DOM tests
│   ├── toggleButton.test.js      # Toggle button tests
│   └── toolbar.test.js           # Toolbar DOM tests
├── e2e/                          # Playwright E2E tests
│   ├── README.md                 # E2E test documentation
│   ├── canvas.spec.js            # Canvas E2E tests
│   ├── clipboard.spec.js         # Clipboard tests
│   ├── collaboration.spec.js     # Collaboration tests
│   ├── fileOperations.spec.js    # File operations tests
│   ├── keyboard.spec.js          # Keyboard E2E tests
│   ├── palette.spec.js           # Palette E2E tests
│   ├── tools.spec.js             # Tools E2E tests
│   ├── ui.spec.js                # UI E2E tests
│   └── undoRedo.spec.js          # Undo/redo tests
└── results/                      # Test results (gitignored)
    ├── coverage/                 # Unit test coverage
    ├── e2e/                      # E2E artifacts
    └── playwright-report/        # Playwright HTML report
```

## Configuration Files

### Build and Development

**vite.config.js** - Vite Build Configuration

- Entry points
- Output directory and structure
- Asset handling
- Code splitting strategy
- Plugin configuration (PWA, sitemap, static copy)
- Development server settings

**postcss.config.js** - PostCSS Configuration

- Tailwind CSS processing
- CSS minification (cssnano)
- Advanced optimization

**tailwind.config.js** - Tailwind CSS Configuration

- Content scanning paths
- Dark mode configuration
- Theme customization
- Plugin configuration

**eslint.config.js** - ESLint Configuration

- Linting rules
- HTML linting
- Stylistic rules
- File patterns

**.prettierrc** - Prettier Configuration

```json
{
	"useTabs": true,
	"singleQuote": true,
	"trailingComma": "es5",
	"printWidth": 100
}
```

**.prettierignore** - Prettier Ignore Patterns

- `node_modules/`
- `dist/`
- `tests/results/`
- `*.min.js`
- `*.lock`

### Testing

**vitest.config.js** - Vitest Configuration

- Test environment (jsdom)
- Setup files
- Coverage settings
- Threads configuration
- Isolation settings

**playwright.config.js** - Playwright Configuration

- Test directory
- Timeout settings
- Retry configuration
- Output directory
- Browser configurations (Chrome, Firefox, WebKit)
- Web server settings
- Sharding support

### Docker

**Dockerfile** - Production Container

- Multi-stage build
- Bun + Caddy + Alpine base
- Security hardening
- Non-root user
- Health checks
- Environment variables

**.github/ci.Dockerfile** - CI Container

- Based on Playwright image
- Pre-installed browsers
- Bun runtime
- Development tools

### Git

**.gitignore** - Git Ignore Patterns

- `node_modules/`
- `dist/`
- `tests/results/`
- `.env`
- `*.lock`
- Build artifacts

**.gitattributes** - Git Attributes

- Line ending normalization
- Binary file handling

### Package Management

**package.json** - Package Configuration

- Project metadata
- Dependencies
- Scripts
- Engine requirements
- Repository information

**bun.lock / package-lock.json** - Lockfiles

- Dependency versions
- Integrity hashes
- Resolution information

## GitHub Actions

```
.github/
├── ci.Dockerfile              # CI container image
├── copilot-instructions.md    # Copilot setup instructions
├── dependabot.yml             # Dependabot configuration
├── FUNDING.yml                # Funding/sponsorship info
└── workflows/                 # GitHub Actions workflows
    ├── build.yml              # Build verification
    ├── ci-docker-build.yml    # CI image builder
    ├── copilot-setup-steps.yml # Copilot setup workflow
    ├── deploy.yml             # GitHub Pages deployment
    ├── docker-build.yml       # Docker image builder
    ├── e2e.yml                # E2E tests
    ├── lint.yml               # Code linting
    ├── merge-reports.yml      # E2E report merger
    ├── test-suite.yml         # Main test orchestrator
    ├── unit.yml               # Unit tests
    └── wiki.yml               # Wiki documentation sync
```

> [!INFO]
> See [CI/CD Pipeline](cicd.md) for detailed workflow documentation.

## Build Output

```
dist/                          # Generated by `bun bake`
├── index.html                 # Main entry point
├── site.webmanifest           # PWA manifest
├── service.js                 # Service worker
├── robots.txt                 # Search engine directives
├── sitemap.xml                # Site map
├── humans.txt                 # Humans.txt
├── favicon.ico                # Favicon
└── ui/                        # UI assets
    ├── stylez-[hash].css      # Minified CSS (hashed)
    ├── icons-[hash].svg       # Icon sprite (hashed)
    ├── topazplus_1200.woff2   # UI font
    ├── fonts/                 # Bitmap fonts (PNG)
    ├── img/                   # Images and icons
    └── js/                    # JavaScript bundles (hashed)
        ├── editor-[hash].js   # Main entry
        ├── core-[hash].js     # Core modules
        ├── canvas-[hash].js   # Canvas system
        ├── tools-[hash].js    # Drawing tools
        ├── fileops-[hash].js  # File operations
        ├── network-[hash].js  # Collaboration
        ├── palette-[hash].js  # Color palette
        └── websocket.js       # Web Worker (not hashed)
```

## Related Documentation

- [Architecture](architecture.md) - System architecture and design
- [Building and Developing](building-and-developing.md) - Development workflow
- [Testing](testing.md) - Test structure and guidelines
- [CI/CD Pipeline](cicd.md) - Continuous integration and deployment
