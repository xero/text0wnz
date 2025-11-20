# teXt.0w.nz

**Your browser is the canvas**. Draw, edit, and collaborate on ANSI, ASCII, NFO, and XBIN art in a retro text art editor rebooted for the modern web. Offline-first with auto-save/restore and local storage, plus optional real-time sessions. Crafted for keyboard-centric artists and creators using mouse or touch, _on any device_. Built with modern tools and automated testing for a seamless experience for text artists and developers.

![preview](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/preview.png)

## Draw in your browser now!

| Domain                          | Status                                             |
|:--------------------------------|:---------------------------------------------------|
| https://text.0w.nz              | The main domain. Collab server may be available    |
| https://xero.github.io/text0wnz | Github Pages version of the site. No collab server |

[![MIT Licensed](https://img.shields.io/github/license/xero/text0wnz?logo=wikiversity&logoColor=979da4&labelColor=262a2e&color=b1a268)](https://github.com/xero/text0wnz/blob/main/LICENSE)
[![Version](https://img.shields.io/github/package-json/version/xero/teXt0wnz?labelColor=33383e&logo=npm&&logoColor=979da4&color=6e2aa5)](https://github.com/xero/teXt0wnz/releases/latest)
[![GitHub repo size](https://img.shields.io/github/repo-size/xero/teXt0wnz?labelColor=262a2e&logo=googlecontaineroptimizedos&logoColor=979da4&color=6e2aa5)](https://github.com/xero/teXt0wnz/)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/w/xero/teXt0wnz?labelColor=262a2e&logo=stagetimer&logoColor=979da4&color=6e2aa5)](https://github.com/xero/text0wnz/graphs/commit-activity)
[![GitHub last commit](https://img.shields.io/github/last-commit/xero/teXt0wnz.svg?labelColor=262a2e&logo=git&logoColor=979da4&color=6e2aa5)](https://github.com/xero/text0wnz/commits/main/)
[![OSS Lifecycle](https://img.shields.io/osslifecycle?file_url=https%3A%2F%2Fraw.githubusercontent.com%2Fxero%2FteXt0wnz%2Frefs%2Fheads%2Fmain%2FOSSMETADATA&-square&labelColor=262a2e&logo=checkmarx&logoColor=979da4)](https://github.com/xero/teXt0wnz/blob/main/OSSMETADATA)
[![Latest Test Suite Results](https://github.com/xero/teXt0wnz/actions/workflows/test-suite.yml/badge.svg?branch=main)](https://github.com/xero/teXt0wnz/actions/workflows/test-suite.yml?query=branch%3Amain)
[![Latest Deployment](https://img.shields.io/github/deployments/xero/text0wnz/github-pages?logo=githubactions&logoColor=979da4&label=Pages%20Deployment&labelColor=262a2e)](https://github.com/xero/text0wnz/deployments)
[![Latest Wiki Deployment](https://img.shields.io/badge/success-success?logo=gitbook&logoColor=979da4&labelColor=262a2e&label=Wiki%20Deployment)](https://github.com/xero/text0wnz/wiki)
[![Schema](https://img.shields.io/badge/Valid-Valid?logo=semanticweb&logoColor=979da4&labelColor=262a2e&label=Schema)](https://validator.schema.org/#url=https%3A%2F%2Fraw.githubusercontent.com%2Fxero%2FteXt0wnz%2Frefs%2Fheads%2Fmain%2Fsrc%2Findex.html)
[![Lighthouse Preformance](https://img.shields.io/badge/100%25-lighthouse?logo=lighthouse&logoColor=979da4&label=Lighthouse&labelColor=262a2e)](https://pagespeed.web.dev/analysis/https-text-0w-nz/eo49m2s0eo?hl=en-US&form_factor=desktop)
[![Powered by Bun](https://img.shields.io/badge/Bun-Bun?labelColor=262a2e&logo=bun&logoColor=f9f1e1&label=Powered%20by&color=e47ab4&link=https%3A%2F%2Fbun.js)](https://bun.com)
[![Eslint](https://img.shields.io/badge/Eslint-Eslint?logo=eslint&logoColor=979da4&label=Linting&labelColor=262a2e&color=00aaaa)](https://github.com/xero/teXt0wnz/blob/main/eslint.config.js)
[![Prettier](https://img.shields.io/badge/Prettier-Prettier?logo=prettier&logoColor=979da4&label=Formatting&labelColor=262a2e&color=00aaaa)](https://github.com/xero/teXt0wnz/blob/main/.prettierrc)
[![16colors](https://img.shields.io/badge/16Colors-16Colors?logo=renovate&logoColor=979da4&logoSize=auto&label=ANSI%20Art&labelColor=262a2e&color=ed7a2c)](https://16colo.rs)
[![AsciiArena](https://img.shields.io/badge/AsciiArena-AsciiArena?logo=academia&logoColor=979da4&label=Ascii%20Art&labelColor=262a2e&color=ed7a2c)](https://asciiarena.se)


> ### ,-'2_,-'2_,-'2_,-'2_,-'2_,-'2_,-'2_,-'2_,-'2_,-'2_,-'2_,-'2_
>
> # Table o' Contents
>
> - [Features](#features)
> - [File Types](#supported-file-types)
> - [Browser Support](#browser-support)
> - [Documentation](#documentation)
> - [Drawing & Editing Tools](#drawing--editing-tools)
> - [Key-bindings & Mouse/Touch Controls](#key-bindings--mousetouch-controls)
> - [Tips & Workflow](#tips--workflow)
> - [Build & Development](#build--development)
> - [Collaborative Server](#collaborative-server)
> - [Docker Containerization](#docker-containerization)
> - [Testing Suite](#testing-suite)
> - [Troubleshooting](#troubleshooting)
> - [Project History](#project-history)
> - [License & Greetz](#license--greetz)
>
> ### "7_/"7_/"7_/"7_/"7_/"7_/"7_/"7_/"7_/"7_/"7_/"7_/"7_/"7_/"

## Features

- **Web-based text art drawing, also works offline as a PWA**
  - No install required!
  - But easily [installed as a Progressive Web Application](docs/install-pwa.md) to your device
- **Comprehensive keyboard shortcuts and mouse controls**
  - Draw using the keyboard, mouse, or touch screen
- **Classic and modern fonts**
  - Over 100 fonts from IBM PCs, Amiga, C64, and many more vintage/custom
- **Full suite of drawing tools:**
  - Keyboard, freehand brushes, fills, shapes, selection, and mirror mode
- **Advanced color management**
  - 16-color ANSI, iCE colors, real-time preview, color conflict resolution
  - Custom XBIN color palette support and selection
- **Supported file types:**
  - Import: ANSI, BIN, XBIN, NFO, DIZ, UTF-8 TXT
  - Export: all of the above and PNG
- **Multi-platform file opening**
  - Desktop: OS "Open with" integration (Chrome/Edge)
  - Android: Share sheet integration
  - iPad+iOS: Enhanced file picker
  - Drag-and-drop support for everyone!
- **Canvas operations:**
  - Undo/redo, canvas resizing, font selection, and full SAUCE metadata support
- **Editor options:**
  - Canvas zoom, light/dark mode, and grid overlay
- **Auto Save/Restore**
  - Editor Setting saved to local storage for a consistent drawing sessions
  - Artwork and undo history saved to IndexedDB as you draw, auto-reloads when the app is opened
  - Optimized binary data storage packing for efficient canvas persistence
- **Collaborative server mode**
  - For real-time multi-user editing
  - Optional and opt-in by users. See: [Privacy](docs/privacy.md)
- **Build tools:**
  - Bun, Vite, PostCSS
- **Automated tests:**
  - Playwright, Vitest, Testing Library
- **Robust linting and formatting:**
  - Eslint and Prettier

## Supported File Types

| Extension       | Description                            | Import | Export | [Sauce](docs/sauce-format.md) |
|:----------------|:---------------------------------------|:-----|:-----|:-----|
| **`.ans`**      | ANSI art                               | ░▒▒░ | ░▒▒░ | ░▒▒░ |
| **`.utf8.ans`** | UTF-8 ANSI for terminals               | ░▒▒░ | ░▒▒░ |      |
| **`.bin`**      | DOS-era binary format                  | ░▒▒░ | ░▒▒░ | ░▒▒░ |
| **`.xb`**       | Modern [XBIN](docs/xb-format.md) files | ░▒▒░ | ░▒▒░ | ░▒▒░ |
| **`.nfo`**      | Scene release format                   | ░▒▒░ | ░▒▒░ | ░▒▒░ |
| **`.diz`**      | FILE_ID.DIZ archive metadata files     | ░▒▒░ | ░▒▒░ | ░▒▒░ |
| **`.txt`**      | ASCII or other plain text              | ░▒▒░ | ░▒▒░ |      |
| **`.png`**      | Artwork rendered as an image           |      | ░▒▒░ |      |

## Browser Support

| Browser           | Chrome | Firefox | Safari  | Edge   | Opera  | iOS     | iPadOS | Android |
|:------------------|:-------|:--------|:--------|:-------|:-------|:--------|:-------|:--------|
| Updated: <br> [2025-11-20](https://github.com/Fyrd/caniuse) | <img src="https://raw.githubusercontent.com/wiki/xero/text0wnz/img/chrome.svg" width="50" height="50"> | <img src="https://raw.githubusercontent.com/wiki/xero/text0wnz/img/firefox.svg" width="50" height="50"> | <img src="https://raw.githubusercontent.com/wiki/xero/text0wnz/img/safari.svg" width="50" height="50"> | <img src="https://raw.githubusercontent.com/wiki/xero/text0wnz/img/edge.svg" width="50" height="50"> | <img src="https://raw.githubusercontent.com/wiki/xero/text0wnz/img/opera.svg" width="50" height="50"> | <img src="https://raw.githubusercontent.com/wiki/xero/text0wnz/img/ios.svg" width="50" height="50"> | <img src="https://raw.githubusercontent.com/wiki/xero/text0wnz/img/ipados.svg" width="50" height="50"> | <img src="https://raw.githubusercontent.com/wiki/xero/text0wnz/img/android.svg" width="50" height="50"> |
| **Supported**     | 95.0+  | 93.0+   | 15.0+   | 95.0+  | 81.0+  | 15.0+   | 15.0+  | 95.0+   |
| **Latest Dev**    | Canary | Nightly | Preview | Dev    | -      | -       | -      | -       |
| _**Unsupported**_ | < 94.x | < 92.x  | < 14.x  | < 94.x | < 80.x | < 14.x  | < 14.x | < 94.x  |

## Documentation

> The **[docs](docs/)** folder contains raw markdown documentation files
>
> The **[wiki](https://github.com/xero/text0wnz/wiki)** renders these files into easier to read webpages

**Application Guides**

- **[Editor Manual](docs/manual.md) - Visual guide to the Frontend application** [**↵**](https://github.com/xero/text0wnz/wiki/manual)
  - [Key bindings](docs/manual.md#key-bindings-summary) - Hot keys reference guide [**↵**](https://github.com/xero/text0wnz/wiki/manual#key-bindings-summary)
- [Collaboration Server](docs/collaboration-server.md) - Backend real-time collaboration server [**↵**](https://github.com/xero/text0wnz/wiki/collaboration-server)
- [Architecture](docs/architecture.md) - System architecture and design overview [**↵**](https://github.com/xero/text0wnz/wiki/architecture)
- [PWA Install](docs/install-pwa.md) - Guide to app installing and OS integration for multiple platforms [**↵**](https://github.com/xero/text0wnz/wiki/install-pwa)
- [Privacy Policy](docs/privacy.md) - Privacy and data handling policy [**↵**](https://github.com/xero/text0wnz/wiki/privacy)
- [Security Policy](docs/security.md) - Vulnerability reporting & threat modeling [**↵**](https://github.com/xero/text0wnz/wiki/security)

**Development Guides**

- [Project Structure](docs/project-structure.md) - File and module organization guide [**↵**](https://github.com/xero/text0wnz/wiki/project-structure)
- [Building and Developing](docs/building-and-developing.md) - Development workflow and build process [**↵**](https://github.com/xero/text0wnz/wiki/building-and-developing)
- [Testing](docs/testing.md) - Triple headed testing guide (unit, dom, & e2e) [**↵**](https://github.com/xero/text0wnz/wiki/testing)
- [CI/CD Pipeline](docs/cicd.md) - Continuous integration and deployment [**↵**](https://github.com/xero/text0wnz/wiki/cicd)
- [Webserver Configuration](docs/webserver-configuration.md) - Webserver setup and configuration [**↵**](https://github.com/xero/text0wnz/wiki/webserver-configuration)
- [Docker](docs/docker.md) - Container deployment guide [**↵**](https://github.com/xero/text0wnz/wiki/docker)
- [Other Tools](docs/other-tools.md) - Additional development and deployment tools [**↵**](https://github.com/xero/text0wnz/wiki/other-tools)

**Technical Specifications**

- [SAUCE Format](docs/sauce-format.md) - SAUCE metadata format specification [**↵**](https://github.com/xero/text0wnz/wiki/sauce-format)
- [XBin Format](docs/xb-format.md) - XBin file format specification [**↵**](https://github.com/xero/text0wnz/wiki/xb-format)

**Supplemental**

- [Fonts](docs/fonts.md) - Complete font reference and previews [**↵**](https://github.com/xero/text0wnz/wiki/fonts)
- [Logos](docs/logos.md) - ASCII art logos for the project [**↵**](https://github.com/xero/text0wnz/wiki/logos)
- [Examples](docs/examples/) - Sample artwork to view and edit
  - ANSI artwork by [xeR0](https://16colo.rs/artist/xero)
  - XBin artwork by [Hellbeard](https://16colo.rs/artist/hellbeard)

> [!NOTE]
> **` ↵ `** links to the wiki version of a document

## Drawing & Editing Tools

| Tool Name              | Description                                                                    |
|:-----------------------|:-------------------------------------------------------------------------------|
| **Keyboard Mode**      | Type characters onto the canvas, using full keyboard navigation                |
| **Half Block Brush**   | Draw half-blocks with the mouse or touchscreen, pressure-sensitive             |
| **Shading Brush**      | Draw shading blocks with the mouse or touchscreen, 'reduce mode' with shift    |
| **Character Brush**    | Draw any ASCII/extended character in the font using a mouse, includes a picker |
| **Fill Tool**          | Flood fill for color/text, smart attribute handling                            |
| **Colorizer**          | Paint colors only, hold alt for background colors                              |
| **Line Tool**          | Draw straight lines, with color conflict resolution                            |
| **Square/Circle Tool** | Draw rectangles/circles/ellipses, outline or filled, with a real-time preview  |
| **Selection Tool**     | Select, move, copy, flip, manipulate rectangular areas                         |
| **Sample Tool**        | Color picker for quick selection from artwork                                  |

## Key Bindings & Mouse/Touch Controls

**Main Tool Shortcuts:**

| Key | Tool/Action            |
|:--- |:-----------------------|
| `k` | Keyboard Mode          |
| `f` | Freestyle (half-block) |
| `b` | Character Brush        |
| `n` | Fill Tool              |
| `a` | Attribute Brush        |
| `g` | Grid Toggle            |
| `i` | iCE Colors Toggle      |
| `m` | Mirror Mode            |

**Color & Character:**

| Key/Combo  | Action                             |
|:---------- |:-----------------------------------|
| `d`        | Reset colors to default            |
| `q`        | Swap foreground/background         |
| `0`–`7`    | Select basic color                 |
| `F1`–`F12` | Insert block/character (see below) |

**File & Canvas:**

| Combo                                     | Action                     |
|:----------------------------------------- |:---------------------------|
| `ctrl z` / `ctrl y`                       | Undo / Redo                |
| `ctrl x`/`ctrl c`/`ctrl v`/`ctrl shift v` | Cut/Copy/Paste/SystemPaste |
| `ctrl delete`                             | Delete selection           |

**Navigation (Keyboard Mode):**

| Key                      | Action                  |
|:------------------------ |:------------------------|
| `arrow keys`             | Move cursor             |
| `home`                   | Start of current row    |
| `end`                    | End of current row      |
| `page up` / `page down`  | Move by viewport screen |
| `cmd left` / `cmd right` | Start/end of row        |

**Advanced Editing (alt + key):**

| Combo                           | Action               |
|:------------------------------- |:---------------------|
| `alt up` / `alt down`           | Insert/Delete row    |
| `alt right` / `alt left`        | Insert/Delete column |
| `alt e` / `alt shift e`         | Erase row/col        |
| `alt home` / `alt end`          | Erase to start/end   |
| `alt page up` / `alt page down` | Erase to top/bottom  |

**Selection Operations:**

| Key       | Action         |
|:--------- |:---------------|
| `[` / `]` | Flip selection |
| `m`       | Move mode      |

**Selection Navigation:**

| Key                      | Action                            |
|:------------------------ |:----------------------------------|
| `arrow keys`             | Move selection area by one cell   |
| `shift arrow keys`       | Expand/shrink selection           |
| `home` / `end`           | Expand selection to row start/end |
| `page up` / `page down`  | Move selection by screen height   |
| `cmd left` / `cmd right` | Expand selection to row start/end |

**In Move Mode:**

- `arrow keys`, `page up`, `page down` move selected content

**Function Keys (`F1`–`F12`):** Quick character insert from CP437 font (blocks, symbols, shapes, and more).

**The Classic CP437 ANSI block shortcuts**

| Key   | Character | Description        |
|:----- |:--------- |:-------------------|
| `f1`  | `░`       | Light shade block  |
| `f2`  | `▒`       | Medium shade block |
| `f3`  | `▓`       | Dark shade block   |
| `f4`  | `█`       | Full block         |
| `f5`  | `▀`       | Upper half block   |
| `f6`  | `▄`       | Lower half block   |
| `f7`  | `▌`       | Left half block    |
| `f8`  | `▐`       | Right half block   |
| `f9`  | `■`       | Small solid square [\*](https://16colo.rs/artist/alla%20xul) |
| `f10` | `○`       | Circle             |
| `f11` | `•`       | Bullet             |
| `f12` | `NULL`    | Blank/transparent  |

**Cycling character sets:**

- Use toolbar or shortcuts (`ctrl [`, `ctrl ]`) to cycle predefined sets (blocks, box-drawing, symbols, accents, etc).

### Mouse / Touch Controls

- **Click/Touch:** Draw
- **Drag:** Draw/Shape
- **Alt Click:** Sample color/alternative draw

> [!TIP]
> See: [docs/manual.md](docs/manual.md) for more info.

## Tips & Workflow

1. Start with Keyboard Mode for layout
2. Use Grid for alignment
3. Freestyle for shading/art
4. Character Brush for textures
5. Fill Tool for color blocks
6. Selection Tool for moving/copying
7. Save often (Ctrl+S)
8. F-keys for quick block chars
9. Alt+Click to sample colors
10. Undo/Redo freely (up to 1000 ops)

> [!NOTE]
> See the curated collection of [ANSi Tutorials](https://github.com/xero/ansi-art-tutorials/blob/main/README.md) for tips on drawing styles.

## Build & Development

**Requirements:**

- bun (recommended over npm)
- node.js (v22.19+)

**Quick Start:**

Install [bun](https://bun.com):

```sh
# From an existing npm installation:
npm i -g bun

# For UNIX systems like Linux, MacOS, and Open/FreeBSD:
curl -fsSL https://bun.sh/install | bash

# For Windows:
powershell -c "irm bun.sh/install.ps1 | iex"
```

Install dependencies, build, and serve the app:

```sh
bun i      # or npm install
bun bake   # or npm run bake
bun www    # or npm run www
```

> [!NOTE]
> See: [docs/building-and-developing](docs/building-and-developing.md) for more info

**Scripts:**

| Script             | Purpose                              |
|:-------------------|:-------------------------------------|
| `bake`             | Build for production (Vite)          |
| `server`           | Start collaboration server           |
| `www`              | Serve the `/dist` folder for testing |
| `fix`              | Auto-fix lint and format             |
| `lint:check/fix`   | Lint checking/fixing                 |
| `format:check/fix` | Formatting check/fix`                |
| `test:unit`        | Run unit tests (Vitest)              |
| `test:e2e`         | Run end to end tests (Playwright)    |
| `test:install`     | Install playwright browsers          |

> [!TIP]
> See: [package.json](package.json) for full commands definitions

**Build Process:**

- Uses Vite + plugins for static copy, sitemap, PWA/offline support
- Output: `dist/`
- Files are hashed for cache busting (e.g., `editor-[hash].js`, `stylez-[hash].css`)
- Customizable options via `.env` variables:
  - `VITE_DOMAIN='https://text.0w.nz'`
  - `VITE_UI_DIR='ui/'`
  - `VITE_WORKER_FILE='websocket.js'`

> [!IMPORTANT]
> `VITE_DOMAIN` is _only_ used for robots.txt and sitemap.xml generation, **all app urls are relative**

**Build Output Structure:**

```
dist/
├── index.html              # Main entry point
├── site.webmanifest        # PWA manifest
├── service.js              # Service worker (injectManifest strategy)
├── robots.txt              # Search engine directives
├── sitemap.xml             # Site map
├── humans.txt              # Humans.txt file
├── favicon.ico             # Favicon
└── ui/                     # UI assets directory
    ├── stylez-[hash].css   # Minified CSS (hashed)
    ├── icons-[hash].svg    # Icon sprite (hashed)
    ├── topazplus_1200.woff2  # Font file
    ├── fonts/              # Bitmap fonts (PNG format)
    ├── img/                # Images and icons
    └── js/                 # JavaScript bundles (all hashed)
        ├── editor-[hash].js      # Main entry
        ├── core-[hash].js        # Core modules (state, storage, compression)
        ├── canvas-[hash].js      # Canvas rendering with lazy font loading
        ├── tools-[hash].js       # Drawing tools
        ├── fileops-[hash].js     # File operations
        ├── network-[hash].js     # Collaboration
        ├── palette-[hash].js     # Color palette
        └── websocket.js          # Web Worker (not hashed)
```

**Code Standards & Style**

- **HTML 5**: Semantic tagging
- **CSS 4**: Modern nesting
- **ES6 JavaScript**: Vanilla & framework free
- Sources use all `lowercase` or `camelCase` names

## Collaborative Server

Enable real-time multi-user editing with the built-in server.

**Features:**

- Canvas/chat persistence
- SSL/HTTP support
- Custom session names, save intervals
- Minimal overhead for real-time editing

**Starting the server:**

```sh
bun server [port] [options]
# or
node src/js/server/main.js
```

> [!TIP]
> The server starts on port `1337` by default. _so elite_

**Command-Line Options**

| Option                 | Description                                      | Default            |
|:---------------------- |:------------------------------------------------ |:-------------------|
| `[port]`               | Port to run the server on                        | `1337`             |
| `--ssl`                | Enable SSL (requires certificates in `ssl-dir`)  | Disabled           |
| `--ssl-dir <path>`     | SSL certificate directory                        | `/etc/ssl/private` |
| `--save-interval <n>`  | Auto-save interval in minutes                    | `30` (minutes)     |
| `--session-name <str>` | Session file prefix (for state and chat backups) | `joint`            |
| `--debug`              | Enable verbose logging                           | `false`            |
| `--help`               | Show help message and usage examples             | -                  |

> [!NOTE]
> See: [docs/collaboration-server](docs/collaboration-server) for more info.

## Docker Containerization

**text0wnz** is fully containerized, offering a streamlined deployment experience across different environments and architectures. Our containerization approach focuses on several key areas:

- Multi-Stage Build Architecture
- Security Hardening
- Performance Optimization
- Service Orchestration

### Registry Support

Prebuilt images are avalable in **linux/amd64** & **linux/arm64** flavors from multiple repositories:

**[DockerHub](https://hub.docker.com/r/xerostyle/text0wnz):**

```sh
docker pull xerostyle/text0wnz:latest
```

**[GitHub Container Registry](https://github.com/xero/text0wnz/pkgs/container/text0wnz):**

```sh
docker pull ghcr.io/xero/text0wnz:latest
```

### Building Locally

To build the container locally, you'll need [Docker](https://docs.docker.com/get-docker/) with [Buildx](https://docs.docker.com/buildx/working-with-buildx/) support:

```sh
# Standard build for your local architecture
docker buildx build -t text0wnz:latest .

# Multi-architecture build (requires buildx setup)
docker buildx create --name mybuilder --use
docker buildx build --platform linux/amd64,linux/arm64 -t yourname/text0wnz:latest --push .
```

### Running in Development Mode

Development mode provides hot-reloading and detailed logging for an optimized development experience:

```sh
docker run \
    --cap-add=NET_BIND_SERVICE \
    -e NODE_ENV=development \
    -p 80:80 \
    text0wnz:latest
```

The application will be available at http://localhost with WebSocket collaboration features enabled.

### Running in Production Mode

For production deployments, use this configuration with your domain and a secure session key:

```sh
docker run \
    --cap-add=NET_BIND_SERVICE \
    -e DOMAIN=your.cool.domain.tld \
    -e SESSION_KEY=secure-production-key \
    -e NODE_ENV=production \
    -p 80:80 -p 443:443 \
    text0wnz:latest
```

This setup enables:

- Automatic HTTPS via Caddy's built-in certificate management
- Production-optimized performance settings
- Stricter security headers and content policies

> [!NOTE]
> See: [docs/docker](docs/docker.md) for more info and advanced setup examples.

## Testing Suite

**Triple-Headed:**

- **Vitest:** Unit/integration
- **Testing Library:** DOM/component
- **Playwright:** E2E/browser

> [!TIP]
> view the latest: [unit coverage report](https://xero.github.io/text0wnz/tests/) & [e2e testing report](https://xero.github.io/text0wnz/tests/e2e/)

```sh
bun test:unit  # Run unit tests
bun test:e2e   # Run end2end tests
```

All tests run automatically in [CI/CD](https://github.com/xero/text0wnz/tree/main/.github/workflows). See the [CI/CD Pipeline documentation](docs/cicd.md) for details on the automated testing, building, and deployment process.

> [!NOTE]
> See: [docs/testing](docs/testing.md) for more info.

## Troubleshooting

**Common Issues:**

**Client**
- Build fails: Check Node.js version, reinstall deps
- e2e tests fail: Check you have the playwright browsers installed (`bun test:install`)
- Client can't connect to server: Check server, proxy, firewall settings
- WebSocket drops: Validate webserver headers, note trailing slash in proxy_pass

**Still stuck?**
[Review the wiki](https://github.com/xero/text0wnz/wiki) then [open an issue](https://github.com/xero/teXt0wnz/issues) with error logs and platform details.

**Server:**
- Port in use: Change server port or stop other process
- SSL fails: Check cert/key files and permissions
- Session not saving: Check write permissions, save interval
- Permissions: Confirm systemd user access
- Wrong port: Sync client/server configs

**Tips:**

- Always use a process manager (systemd, forever)
- Lower save interval for busy sessions
- Use SSL in production (Let's Encrypt via Certbot, ACME-nginx, etc)
- WebSocket debugging: browser dev tools
- Restore session: rename backups as needed
- Review logs for details

> [!NOTE]
> See: [docs/trouble_shooting](docs/webserver-configuration.md#troubleshooting) for more help.

## Project History

The story of this project traces back to 2018, when AndyH joined [Blocktronics](https://16colo.rs/group/blocktronics)—the legendary masters of the ANSI art scene. During his early days there, he created the original “ansiedit,” laying the groundwork for this application. However, his focus soon shifted to developing a desktop-only editor, which evolved into Moebius.

Around that time, xeR0 (then a member of [Impure!ASCii](https://16colo.rs/group/impure) and a devoted PabloDraw user) joined Blocktronics shortly after ansiedit’s release. xeR0 played the role of testing and debugging the app alongside Andy as he learned the dark arts of the blocks.

Fast forward a decade: xeR0 found himself sad he was still unable to use the new MoebiusXBIN fork to create text art on his iPad. With Andy’s blessing, xeR0 decided to revive the project—reimagining it from the ground up as a modern Progressive Web App. New features like optimized off-screen canvas', dirty pixel rendering, local storage sync, were added. But without Andy's core math this project would not be possible.

## License & Greetz

<img src="https://gist.githubusercontent.com/xero/cbcd5c38b695004c848b73e5c1c0c779/raw/6b32899b0af238b17383d7a878a69a076139e72d/kopimi-sm.png" align="left" height="222">

Mad love & respect to ▒ [Andy Herbert^67](http://github.com/andyherbert) - [Moebius](https://github.com/blocktronics/moebius) ░ [grmmxi^imp!](https://glyphdrawing.club/) - [MoebiusXBIN](https://github.com/hlotvonen/moebiusXBIN/) ░ [Curtis Wensley](https://github.com/cwensley) - [PabloDraw](https://github.com/cwensley/pablodraw) ░ [Skull Leader^ACiD](https://defacto2.net/p/skull-leader) - [ACiDDRAW](https://www.acid.org/apps/apps.html) ▒ & the art scene!

---

All files and scripts in this repo are released [MIT](https://github.com/xero/teXt0wnz/blob/main/LICENSE) / [kopimi](https://kopimi.com)! In the spirit of _freedom of information_, I encourage you to fork, modify, change, share, or do whatever you like with this project! `^c^v`
