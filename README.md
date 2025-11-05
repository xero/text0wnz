# teXt.0w.nz

**Your browser is the canvas**—draw, edit, and collaborate on ANSI, ASCII, NFO, and XBIN art in a retro text art editor rebooted for the modern web. Offline-first with auto-save/restore and local storage, plus optional real-time sessions. Crafted for keyboard-centric artists and creators using mouse or touch—_on any device_. Built with modern tools and automated testing for a seamless experience.

![preview](https://raw.githubusercontent.com/xero/teXt0wnz/refs/heads/main/docs/preview.png)

## Draw in your browser now!

| Domain                          | Status                                             |
| :------------------------------ | :------------------------------------------------- |
| https://text.0w.nz              | The main domain. Collab server may be available    |
| https://xero.github.io/text0wnz | Github Pages version of the site. No collab server |

&nbsp;

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
[![Lighthouse Preformance](https://img.shields.io/badge/99%25-lighthouse?logo=lighthouse&logoColor=979da4&label=Lighthouse&labelColor=262a2e)](https://pagespeed.web.dev/analysis/https-text-0w-nz/eo49m2s0eo?hl=en-US&form_factor=desktop)
[![Powered by Bun](https://img.shields.io/badge/Bun-Bun?labelColor=262a2e&logo=bun&logoColor=f9f1e1&label=Powered%20by&color=e47ab4&link=https%3A%2F%2Fbun.js)](https://bun.com)
[![Eslint](https://img.shields.io/badge/Eslint-Eslint?logo=eslint&logoColor=979da4&label=Linting&labelColor=262a2e&color=00aaaa)](https://github.com/xero/teXt0wnz/blob/main/eslint.config.js)
[![Prettier](https://img.shields.io/badge/Prettier-Prettier?logo=prettier&logoColor=979da4&label=Formatting&labelColor=262a2e&color=00aaaa)](https://github.com/xero/teXt0wnz/blob/main/.prettierrc)
[![16colors](https://img.shields.io/badge/16Colors-16Colors?logo=renovate&logoColor=979da4&logoSize=auto&label=ANSI%20Art&labelColor=262a2e&color=ed7a2c)](https://16colo.rs)
[![AsciiArena](https://img.shields.io/badge/AsciiArena-AsciiArena?logo=academia&logoColor=979da4&label=Ascii%20Art&labelColor=262a2e&color=ed7a2c)](https://asciiarena.se)

# Table o' Contents

- [Features](#features)
- [Supported File Types](#file-types)
- [Project Documentation](#project-documentation)
- [Drawing & Editing Tools](#drawing--editing-tools)
- [Key-bindings & Mouse/Touch Controls](#key-bindings--mousetouch-controls)
- [Tips & Workflow](#tips--workflow)
- [Build & Development](#build--development)
- [Collaborative Server](#collaborative-server)
- [Docker Containerization](#docker-containerization)
- [Testing Suite](#testing-suite)
- [Troubleshooting](#troubleshooting)
- [Browser Support](#browser-support)
- [Project History](#project-history)
- [License & Greetz](#license--greetz)

## Features

- **Web-based text art drawing, also works offline as a PWA**
  - No install required!
  - But easily [installed as a Progressive Web Application](docs/install-pwa.md) to your device
- **Comprehensive keyboard shortcuts and mouse controls**
  - Draw using the keyboard, mouse, or touch screen
- **Classic and modern fonts**
  - Over 100 fonts from IBM PCs, Amiga, C64, and many more vintage/custom
- **Full suite of drawing tools:**
  - Keyboard, freehand brushes, fills, shapes, selection, and color picker
- **Advanced color management**
  - 16-color ANSI, iCE colors, real-time preview, color conflict resolution
- **Import/export:**
  - ANSI, BIN, XBIN, NFO, UTF-8 TXT, PNG
- **Canvas operations:**
  - Undo/redo, resizing, grid overlay, font selection, and full SAUCE metadata support
- **Auto Save/Restore**
  - Editor Setting saved to local storage for a consistent drawing sessions
  - Artwork saved to IndexedDB as you draw, auto-reloaded when the app is opened
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

## File Types

- `*.ans`: ANSI art
- `*.utf8.ans`: UTF-8 ANSI for terminals
- `*.bin`: DOS-era BIN
- `*.xbin`: Modern XBIN
- `*.nfo`: Scene/release NFO
- `*.txt`: ASCII or other plain text
- `*.png`: Image (export support only)

## Project Documentation
- The [docs](docs/) folder of this repo contains the raw markdown documentation files as well as example artwork to view and play around with.
- The [wiki](https://github.com/xero/text0wnz/wiki) renders these files into easier to read webpages. The wiki also hosts the documentation images to keep the repo size more manageable.

**Application Guides**

- [Interface](docs/interface.md) - Visual guide to the user interface and options
- [Editor Client](docs/editor-client.md) - Frontend text art editor application
  - [Hotkeys](docs/editor-client.md#key-bindings--mouse-controls) - Editor shortcuts reference
- [Collaboration Server](docs/collaboration-server.md) - Backend real-time collaboration server
- [Architecture](docs/architecture.md) - System architecture and design overview
- [PWA Install](docs/install-pwa.md) - Guide to installing the app on multiple platforms
- [Privacy Policy](docs/privacy.md) - Privacy and data handling policy

**Development Guides**

- [Project Structure](docs/project-structure.md) - File and module organization guide
- [Building and Developing](docs/building-and-developing.md) - Development workflow and build process
- [Testing](docs/testing.md) - Triple headed testing guide (unit, dom, & e2e)
- [CI/CD Pipeline](docs/cicd.md) - Continuous integration and deployment
- [Webserver Configuration](docs/webserver-configuration.md) - Webserver setup and configuration
- [Docker](docs/docker.md) - Container deployment guide
- [Other Tools](docs/other-tools.md) - Additional development and deployment tools

**Technical Specifications**

- [SAUCE Format](docs/sauce-format.md) - SAUCE metadata format specification
- [XBin Format](docs/xb-format.md) - XBin file format specification

**Supplemental**

- [Fonts](docs/fonts.md) - Complete font reference and previews
- [Logos](docs/logos.md) - ASCII art logos for the project
- [Examples](docs/examples/) - Sample artwork to view and edit
  - ANSI artwork by [xeR0](https://16colo.rs/artist/xero)
  - XBin artwork by [Hellbeard](https://16colo.rs/artist/hellbeard)

## Drawing & Editing Tools

| Tool Name          | Description                                                                    |
| ------------------ | ------------------------------------------------------------------------------ |
| Keyboard Mode      | Type characters onto the canvas, using full keyboard navigation                |
| Half Block Brush   | Draw half-blocks with the mouse or touchscreen, pressure-sensitive             |
| Shading Brush      | Draw shading blocks with the mouse or touchscreen, 'reduce mode' with shift    |
| Character Brush    | Draw any ASCII/extended character in the font using a mouse, includes a picker |
| Fill Tool          | Flood fill for color/text, smart attribute handling                            |
| Colorizer          | Paint colors only, hold alt for background colors                              |
| Line Tool          | Draw straight lines, with color conflict resolution                            |
| Square/Circle Tool | Draw rectangles/circles/ellipses, outline or filled, with a real-time preview  |
| Selection Tool     | Select, move, copy, flip, manipulate rectangular areas                         |
| Sample Tool        | Color picker for quick selection from artwork                                  |

## Key Bindings & Mouse/Touch Controls

> [!NOTE]
> See: [docs/editor-client](docs/editor-client.md) for more info.

### Main Shortcuts

| Key | Action/Tool            |
| --- | ---------------------- |
| k   | Keyboard Mode          |
| f   | Freestyle (half-block) |
| b   | Character Brush        |
| n   | Fill                   |
| a   | Attribute Brush        |
| g   | Grid Toggle            |
| i   | iCE Colors Toggle      |
| m   | Mirror Mode            |

### Color & Character

| Key/Combo         | Action                                            |
| ----------------- | ------------------------------------------------- |
| d                 | Reset colors to default                           |
| Q                 | Swap foreground/background                        |
| 0–7               | Select foreground color (again for bright)        |
| alt/option + 0–7  | Select background color (again for bright)        |
| F1–F12 (function) | Insert specific characters (see keyboard toolbar) |
| ctrl + [ / ]      | Cycle Function Key ANSI character sets            |

### File & Canvas

| Key Combo       | Action                      |
| --------------- | --------------------------- |
| ctrl+z / ctrl+y | Undo / Redo                 |
| ctrl+x          | Cut                         |
| ctrl+c          | Copy                        |
| ctrl+v          | Paste                       |
| ctrl+shift+v    | Paste from system clipboard |
| ctrl+delete     | Delete selection            |

### Canvas Editing

| Combo          | Action              |
| -------------- | ------------------- |
| alt+up/down    | Insert/Delete row   |
| alt+right/left | Insert/Delete col   |
| alt+e/shift+e  | Erase row/col       |
| alt+home/end   | Erase to start/end  |
| alt+pgUp/pgDn  | Erase to top/bottom |

### Navigation (Keyboard Mode)

| Key           | Action                 |
| ------------- | ---------------------- |
| arrow keys    | Move cursor            |
| home/end      | Line start/end         |
| page up/down  | Page jump              |
| tab/backspace | Insert tab/delete left |
| enter         | New line               |

### Selection Tool

| Key | Action         |
| --- | -------------- |
| [,] | Flip selection |
| M   | Move mode      |

### Mouse / Touch

- **Click/Touch:** Draw
- **Drag:** Draw/Shape
- **Alt+Click:** Sample color/alt draw

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

## Build & Development

**Requirements:**

- node.js (v22.19+)
- bun (recommended) or npm

**Quick Start:**

install [bun](https://bun.com)

```sh
npm i -g bun
```

install, build, and serve the app:

```sh
bun i      # or npm install
bun bake   # or npm run bake
bun www    # or npm run www
```

> [!NOTE]
> See: [docs/building-and-developing](docs/building-and-developing.md) for more info.

**Scripts:**

| Script           | Purpose                              |
| ---------------- | ------------------------------------ |
| bake             | Build for production (Vite)          |
| server           | Start collaboration server           |
| www              | Serve the `/dist` folder for testing |
| fix              | Auto-fix lint and format             |
| lint:check/fix   | Lint checking/fixing                 |
| format:check/fix | Formatting check/fix                 |
| test:unit        | Run unit tests (Vitest)              |
| test:e2e         | Run end to end tests (Playwright)    |
| test:install     | Install playwright browsers          |

**Build Process:**

- Uses Vite + plugins for static copy, sitemap, PWA/offline support
- Output: `dist/`
- Files are hashed for cache busting (e.g., `editor-[hash].js`, `stylez-[hash].css`)
- Customizable options via `.env` variables:
  - `VITE_DOMAIN='https://text.0w.nz'`
  - `VITE_UI_DIR='ui/'`
  - `VITE_WORKER_FILE='websocket.js'`

**Build Output Structure:**

```
dist/
├── index.html              # Main entry point
├── site.webmanifest        # PWA manifest
├── service.js              # Service worker
├── workbox-[hash].js       # Workbox runtime for caching
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

> [!IMPORTANT]
> `DOMAIN` is only used for robots.txt and sitemap.xml generation, all app urls are relative

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
| ---------------------- | ------------------------------------------------ | ------------------ |
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

- Build fails: Check Node.js version, reinstall deps
- Port in use: Change server port or stop other process
- SSL fails: Check cert/key files and permissions
- Client can't connect: Check server, proxy, firewall settings
- WebSocket drops: Validate nginx headers, trailing slash in proxy_pass
- Session not saving: Check write permissions, save interval
- Permissions: Confirm systemd user access
- Wrong port: Sync client/server configs

**Still stuck?**
[Open an issue](https://github.com/xero/teXt0wnz/issues) with error logs and platform details.

**Tips:**

- Always use a process manager (systemd, forever)
- Lower save interval for busy sessions
- Use SSL in production (Let's Encrypt via Certbot, ACME-nginx, etc)
- WebSocket debugging: browser dev tools
- Restore session: rename backups as needed
- Review logs for details

> [!NOTE]
> See: [docs/trouble_shooting](docs/webserver-configuration.md#troubleshooting) for more help.

## Browser Support

> _Works on desktop and mobile!_

- Chrome/Chromium 95+
- Firefox 93+
- Safari 15+
- Edge 95+

## Project History

The story of this project traces back to 2018, when AndyH joined [Blocktronics](https://16colo.rs/group/blocktronics)—the legendary masters of the ANSI art scene. During his early days there, he created the original “ansiedit,” laying the groundwork for this application. However, his focus soon shifted to developing a desktop-only editor, which evolved into Moebius.

Around that time, xeR0 (then a member of [Impure!ASCii](https://16colo.rs/group/impure) and a devoted PabloDraw user) joined Blocktronics shortly after ansiedit’s release. xeR0 played the role of testing and debugging the app alongside Andy as he learned the dark arts of the blocks.

Fast forward a decade: xeR0 found himself sad he was still unable to use the new MoebiusXBIN fork to create text art on his iPad. With Andy’s blessing, xeR0 decided to revive the project—reimagining it from the ground up as a modern Progressive Web App. New features like optimized off-screen canvas', dirty pixel rendering, local storage sync, were added. But without Andy's core math this project would not be possible.

## License & Greetz

<img src="https://gist.githubusercontent.com/xero/cbcd5c38b695004c848b73e5c1c0c779/raw/6b32899b0af238b17383d7a878a69a076139e72d/kopimi-sm.png" align="left" height="222">

mad love & respect to ▒ [Andy Herbert^67](http://github.com/andyherbert) - [Moebius](https://github.com/blocktronics/moebius) ░ [grmmxi^imp!](https://glyphdrawing.club/) - [MoebiusXBIN](https://github.com/hlotvonen/moebiusXBIN/) ░ [Curtis Wensley](https://github.com/cwensley) - [PabloDraw](https://github.com/cwensley/pablodraw) ░ [Skull Leader^ACiD](https://defacto2.net/p/skull-leader) - [ACiDDRAW](https://www.acid.org/apps/apps.html) ▒ & the scene!

---

All files and scripts in this repo are released [MIT](https://github.com/xero/teXt0wnz/blob/main/LICENSE) / [kopimi](https://kopimi.com)! In the spirit of _freedom of information_, I encourage you to fork, modify, change, share, or do whatever you like with this project! `^c^v`
