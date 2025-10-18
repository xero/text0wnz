# Project Structure

This document provides a detailed overview of the teXt0wnz project file structure, describing the purpose of each directory and key files.

## Table of Contents

- [Root Directory](#root-directory)
- [Source Code](#source-code)
- [Documentation](#documentation)
- [Tests](#tests)
- [Configuration Files](#configuration-files)
- [GitHub Actions](#github-actions)

## Root Directory

```
text0wnz/
├── .env                    # Environment variables (gitignored, see .env.example)
├── .git/                   # Git repository
├── .gitattributes          # Git attributes configuration
├── .github/                # GitHub Actions workflows and configs
├── .gitignore              # Git ignore patterns
├── .prettierignore         # Prettier ignore patterns
├── .prettierrc             # Prettier configuration
├── banner                  # ASCII art banner script (displayed on commands)
├── bun.lock                # Bun lockfile (gitignored)
├── Dockerfile              # Production Docker image
├── docs/                   # Documentation files
├── eslint.config.js        # ESLint configuration
├── LICENSE.txt             # MIT license
├── node_modules/           # Dependencies (gitignored)
├── OSSMETADATA             # Open source metadata
├── package.json            # Package configuration
├── package-lock.json       # npm lockfile (gitignored)
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
│   ├── README.md          # Font documentation
│   └── *.png              # Individual font files (100+ fonts)
├── humans.txt             # Humans.txt file (credits)
├── img/                   # Static images and assets
│   ├── manifest/          # PWA manifest icons
│   │   ├── android-launchericon-48-48.png
│   │   ├── apple-touch-icon.png
│   │   ├── favicon-96x96.png
│   │   ├── favicon.ico
│   │   └── favicon.svg
│   ├── logo.png           # Application logo
│   ├── screenshot-*.png   # PWA install screenshots
│   └── web-app-manifest-*.png  # PWA icons
├── index.html             # Main HTML entry point
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
├── freehand_tools.js      # Drawing tools implementation
├── keyboard.js            # Keyboard mode and shortcuts
├── lazyFont.js            # Lazy font loading
├── magicNumbers.js        # Constants and magic values
├── network.js             # Network communication and WebSocket client
├── palette.js             # Color palette management
├── state.js               # Global application state
├── storage.js             # IndexedDB persistence
├── toolbar.js             # Toolbar management
├── ui.js                  # User interface components
└── websocket.js           # WebSocket worker (runs in Web Worker)
```

#### Client Module Descriptions

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

**freehand_tools.js** - Drawing Tools
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
- Connection state
- Message protocol handling
- Canvas synchronization
- Chat functionality
- Server communication
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
- WebSocket connection
- Message handling
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
├── editor-client.md               # Client documentation
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
├── interface.md                   # UI guide
├── logos.md                       # Project logos
├── other-tools.md                 # Additional tools
├── pre-commit                     # Git pre-commit hook
├── preview.png                    # Application preview
├── privacy.md                     # Privacy policy
├── sauce-format.md                # SAUCE specification
├── testing.md                     # Testing guide
├── webserver-configuration.md     # Webserver setup
└── xb-format.md                   # XBIN specification
```

## Tests

```
tests/
├── setupTests.js              # Test environment setup
├── unit/                      # Vitest unit tests
│   ├── README.md              # Unit test documentation
│   ├── canvas.test.js         # Canvas module tests
│   ├── client/                # Client-specific tests
│   │   └── worker.test.js     # WebSocket worker tests
│   ├── compression.test.js    # Compression tests
│   ├── file.test.js           # File I/O tests
│   ├── font.test.js           # Font system tests
│   ├── fontCache.test.js      # Font cache tests
│   ├── freehand_tools.test.js # Drawing tools tests
│   ├── keyboard.test.js       # Keyboard tests
│   ├── lazyFont.test.js       # Lazy loading tests
│   ├── magicNumbers.test.js   # Constants tests
│   ├── main.test.js           # Main module tests
│   ├── network.test.js        # Network tests
│   ├── palette.test.js        # Palette tests
│   ├── server/                # Server-specific tests
│   │   ├── config.test.js     # Config tests
│   │   ├── fileio.test.js     # Server file I/O tests
│   │   ├── main.test.js       # Server main tests
│   │   ├── server.test.js     # Express server tests
│   │   ├── text0wnz.test.js   # Collaboration tests
│   │   ├── utils.test.js      # Server utils tests
│   │   └── websockets.test.js # WebSocket tests
│   ├── state.test.js          # State management tests
│   ├── storage.test.js        # Storage tests
│   ├── toolbar.test.js        # Toolbar tests
│   ├── ui.test.js             # UI tests
│   ├── utils.test.js          # Client utils tests
│   ├── websocket.test.js      # WebSocket client tests
│   ├── worker.test.js         # Worker tests
│   └── xbin-persistence.test.js # XBIN tests
├── dom/                       # Testing Library DOM tests
│   ├── README.md              # DOM test documentation
│   ├── keyboard.test.js       # Keyboard DOM tests
│   ├── modal.test.js          # Modal tests
│   ├── palette.test.js        # Palette DOM tests
│   ├── toggleButton.test.js   # Toggle button tests
│   └── toolbar.test.js        # Toolbar DOM tests
├── e2e/                       # Playwright E2E tests
│   ├── README.md              # E2E test documentation
│   ├── canvas.spec.js         # Canvas E2E tests
│   ├── clipboard.spec.js      # Clipboard tests
│   ├── collaboration.spec.js  # Collaboration tests
│   ├── file-operations.spec.js # File operations tests
│   ├── keyboard.spec.js       # Keyboard E2E tests
│   ├── palette.spec.js        # Palette E2E tests
│   ├── tools.spec.js          # Tools E2E tests
│   ├── ui.spec.js             # UI E2E tests
│   └── undo-redo.spec.js      # Undo/redo tests
└── results/                   # Test results (gitignored)
    ├── coverage/              # Unit test coverage
    ├── e2e/                   # E2E artifacts
    └── playwright-report/     # Playwright HTML report
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

See [CI/CD Pipeline](cicd.md) for detailed workflow documentation.

## Build Output

```
dist/                          # Generated by `bun bake`
├── index.html                 # Main entry point
├── site.webmanifest           # PWA manifest
├── service.js                 # Service worker
├── workbox-[hash].js          # Workbox runtime
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

## File Naming Conventions

### Source Files
- JavaScript: `lowercase.js` (e.g., `canvas.js`, `freehand_tools.js`)
- Tests: `module.test.js` or `module.spec.js`
- CSS: `lowercase.css`
- HTML: `lowercase.html`

### Documentation
- Markdown: `lowercase-with-hyphens.md`
- All lowercase with hyphens for spaces

### Assets
- Images: `lowercase-descriptive-name.png/jpg/svg`
- Fonts: `fontname_variant.png` (e.g., `cp437_8x16.png`)

## Module Import Conventions

### ES Modules
All JavaScript uses ES6 module syntax:

```javascript
// Named exports
export function myFunction() { }
export const myConstant = 42;

// Default export
export default MyClass;

// Imports
import { myFunction, myConstant } from './module.js';
import MyClass from './module.js';
```

### Module Pattern (Legacy)
Some modules use revealing module pattern:

```javascript
const Module = (() => {
    "use strict";
    
    function publicFunction() { }
    
    return {
        "publicFunction": publicFunction
    };
})();

export default Module;
```

## Related Documentation

- [Architecture](architecture.md) - System architecture and design
- [Building and Developing](building-and-developing.md) - Development workflow
- [Testing](testing.md) - Test structure and guidelines
- [CI/CD Pipeline](cicd.md) - Continuous integration and deployment
