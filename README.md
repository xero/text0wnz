# teXt.0w.nz

**teXt0wnz** is a web-based textmode art editor for ANSI, ASCII, XBIN, NFO and more. Create, edit, and share text-based artwork in your browser—with full support for auto-save/restore with local storage, real-time collaborative editing, modern build tools, and automated testing.

![preview](https://raw.githubusercontent.com/xero/moebius-web/refs/heads/new_ui/docs/preview.png)

## URLs

| Domain                             | Status                                                      |
| ---------------------------------- | ----------------------------------------------------------- |
| https://text.0w.nz                 | The final prod domain. I dev here, so it will be broken lot |
| https://xero.github.io/moebius-web | The github pages version of the site is guaranteed to work  |

[![Version](https://img.shields.io/github/package-json/version/xero/moebius-web?labelColor=%2333383e&logo=npm&&logoColor=%23979da4&color=#5db85b)](https://github.com/xero/moebius-web/releases/latest)
[![GitHub repo size](https://img.shields.io/github/repo-size/xero/moebius-web?labelColor=%23262a2e&logo=googlecontaineroptimizedos&logoColor=%23979da4&color=#5db85b)](https://github.com/xero/moebius-web/)
[![Last Test Suite Results](https://github.com/xero/moebius-web/actions/workflows/test-suite.yml/badge.svg?branch=main)](https://github.com/xero/moebius-web/actions/workflows/test-suite.yml?query=branch%3Amain)
[![pages-build-deployment](https://github.com/xero/moebius-web/actions/workflows/pages/pages-build-deployment/badge.svg)](https://github.com/xero/moebius-web/actions/workflows/pages/pages-build-deployment)
![GitHub commit activity](https://img.shields.io/github/commit-activity/w/xero/moebius-web?labelColor=%23262a2e&logo=stagetimer&logoColor=%23979da4&color=#5db85b)
![GitHub last commit](https://img.shields.io/github/last-commit/xero/moebius-web.svg?labelColor=%23262a2e&logo=git&logoColor=%23979da4&color=#5db85b)
[![OSS Lifecycle](https://img.shields.io/osslifecycle?file_url=https%3A%2F%2Fraw.githubusercontent.com%2Fxero%2Fmoebius-web%2Frefs%2Fheads%2Fmain%2FOSSMETADATA&-square&labelColor=%23262a2e&logo=checkmarx&logoColor=%23979da4)](https://github.com/xero/moebius-web/blob/new_ui/OSSMETADATA)
![CII Best Practices](https://img.shields.io/cii/summary/1?logo=asciinema&labelColor=%23262a2e)
[![Schema](https://img.shields.io/badge/Valid-Valid?logo=semanticweb&logoColor=%23979da4a&labelColor=%23262a2e&label=Schema&color=%235db85b)](https://validator.schema.org/#url=https%3A%2F%2Fraw.githubusercontent.com%2Fxero%2Fmoebius-web%2Frefs%2Fheads%2Fmain%2Fsrc%2Findex.html)
[![Lighthouse Preformance](https://img.shields.io/badge/91%25-lighthouse?logo=lighthouse&logoColor=%23979da4&label=Lighthouse&labelColor=%23262a2e)](https://pagespeed.web.dev/analysis/https-text-0w-nz/p2w1cpoqty?hl=en-US&form_factor=mobile)
[![Eslint](https://img.shields.io/badge/Eslint-Eslint?logo=eslint&logoColor=%23979da4&label=Linting&labelColor=%23262a2e&color=%2300AAAA)](https://github.com/xero/moebius-web/blob/main/eslint.config.js)
[![Prettier](https://img.shields.io/badge/Prettier-Prettier?logo=prettier&logoColor=%23979da4&label=Formatter&labelColor=%23262a2e&color=%2300AAAA)](https://github.com/xero/moebius-web/blob/main/.prettierrc)
[![Powered by Bun](https://img.shields.io/badge/Bun-Bun?labelColor=%23262a2e&logo=bun&logoColor=%23f9f1e1&label=Powered%20by&color=%23e47ab4&link=https%3A%2F%2Fbun.js)](https://bun.com)
[![16colors](https://img.shields.io/badge/16colors-16colors?logo=renovate&logoColor=%23979da4&logoSize=auto&label=Text%20Mode&labelColor=%23262a2e&color=%238afcfd&link=https%3A%2F%2F16colo.rs)](https://16colo.rs)

---

## Table of Contents

- [Features](#features)
- [Supported File Types & Fonts](#supported-file-types--fonts)
- [Documentation & Links](#documentation--links)
- [Drawing & Editing Tools](#drawing--editing-tools)
- [Key Bindings & Mouse Controls](#key-bindings--mouse-controls)
- [Tips & Workflow](#tips--workflow)
- [Collaborative Server](#collaborative-server)
- [Build & Development](#build--development)
- [Testing](#testing)
- [Deployment & Operations](#deployment--operations)
- [Troubleshooting](#troubleshooting)
- [Browser Support](#browser-support)
- [Other Useful Tools](#other-useful-tools)
- [Project Structure](#project-structure)
- [License & Greetz](#license---greetz)

---

## Features

- **Web-based textmode art editing**—no install required!
- **Classic and modern fonts** for ANSI/XBIN/ASCII
- **Full suite of drawing tools:** keyboard, freehand, brush, fill, line, shapes, selection, color picker
- **Advanced color management** (16-color ANSI, iCE colors, real-time preview, color conflict resolution)
- **Import/export:** ANSI, BIN, XBIN, UTF-8, PNG
- **Canvas operations:** undo/redo, resizing, grid overlay, SAUCE metadata, font selection
- **Comprehensive keyboard shortcuts and mouse controls**
- **Auto Save/Restore** artwork saved to localstorage as you draw, and reloaded when the app is opened.
- **Works offline as a PWA**
- **Collaborative server mode** for real-time multi-user editing
- **Build tools:** Vite, Bun, npm
- **Automated tests:** Playwright, Vitest, Testing Library
- **Robust linting and formatting:** Eslint and Prettier

---

## Supported File Types & Fonts

### File Types

- `*.ans`: ANSI art
- `*.utf8.ans`: UTF-8 ANSI for terminals
- `*.bin`: DOS-era BIN
- `*.xbin`: Modern XBIN
- `*.nfo`: Scene/release NFO
- `*.txt`: ASCII
- any other plain text file

### Fonts

- Classic ANSI art fonts
- Modern and vintage XBIN fonts
- [Font listings in docs](docs/fonts.md) and [src/fonts](src/fonts)

## Documentation & Links

- [Project documentation](docs/)
- [Font reference](docs/fonts.md)
- [Issues & support](https://github.com/xero/moebius-web/issues)

---

## Drawing & Editing Tools

| Tool Name          | Description                                                                                         |
|--------------------|-----------------------------------------------------------------------------------------------------|
| Keyboard Mode      | Type characters onto the canvas, full keyboard navigation                                           |
| Freehand/Half Block| Draw with half-blocks, pressure-sensitive, straight lines with Shift                                |
| Shading Brush      | Draw with shading blocks, pressure-sensitive, 'reduce mode' with Shift                              |
| Character Brush    | Draw with any ASCII/extended character, includes picker                                             |
| Fill Tool          | Flood fill for color/text, smart attribute handling                                                 |
| Color/Attribute    | Paint colors only (hold Alt for background)                                                         |
| Line Tool          | Draw straight lines, color conflict resolution                                                      |
| Square/Circle Tool | Draw rectangles/circles/ellipses, outline or filled, real-time preview                              |
| Selection Tool     | Select, move, copy, flip, manipulate rectangular areas                                              |
| Sample Tool        | Color picker for quick selection from artwork                                                       |

---

## Key Bindings & Mouse Controls

### Main Shortcuts

| Key      | Action/Tool                |
|----------|----------------------------|
| K        | Keyboard Mode              |
| F        | Freestyle (half-block)     |
| B        | Character Brush            |
| N        | Fill                       |
| A        | Attribute Brush            |
| G        | Grid Toggle                |
| I        | iCE Colors Toggle          |
| M        | Mirror Mode (drawing)      |

### Color & Character

| Key/Combo   | Action                     |
|-------------|----------------------------|
| D           | Reset colors to default    |
| Q           | Swap foreground/background |
| 0–7         | Select basic color         |
| F1–F12      | Insert special block chars |

### File & Canvas

| Key Combo           | Action                      |
|---------------------|-----------------------------|
| Ctrl+Z / Ctrl+Y     | Undo / Redo                 |
| Ctrl+X/C/V/Shift+V  | Cut/Copy/Paste/System Paste |
| Ctrl+Delete         | Delete selection            |

### Navigation (Keyboard Mode)

| Key              | Action                  |
|------------------|-------------------------|
| Arrow Keys       | Move cursor             |
| Home/End         | Line start/end          |
| Page Up/Down     | Page jump               |
| Tab/Backspace    | Insert tab/delete left  |
| Enter            | New line                |

### Advanced Editing (Alt + Key)

| Combo             | Action            |
|-------------------|-------------------|
| Alt+Up/Down       | Insert/Delete row |
| Alt+Right/Left    | Insert/Delete col |
| Alt+E/Shift+E     | Erase row/col     |
| Alt+Home/End      | Erase to start/end|
| Alt+PgUp/PgDn     | Erase to top/bottom|

### Selection

| Key      | Action         |
|----------|---------------|
| [ / ]    | Flip selection |
| M        | Move mode      |

### Mouse

- **Left Click:** Draw
- **Drag:** Draw/Shape
- **Shift+Click:** Straight line (freehand)
- **Alt+Click:** Sample color/alt draw
- **Right Click:** Context menu

---

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

---

## Collaborative Server

Enable real-time multi-user editing with the built-in server.

**Key files:**
- `main.js`: Entry point
- `config.js`: CLI args
- `text0wnz.js`: Collaboration engine
- `fileio.js`: File I/O
- `websockets.js`: WebSocket server
- `server.js`: Middleware
- `utils.js`: Helpers

**Features:**
- Canvas/chat persistence
- SSL/HTTP support
- Custom session names, save intervals
- Minimal overhead for real-time editing

**Starting the server:**

```sh
bun server [port] [options]
```
See [Server Command-Line Options](#deployment--operations).

---

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
bun i        # or npm install
bun bake     # or npm run bake
bun www      # or npm run www
```

**Scripts:**

| Script          | Purpose                              |
|-----------------|--------------------------------------|
| bake            | Build for production (Vite)          |
| server          | Start collaboration server           |
| www             | Serve the `/dist` folder for testing |
| fix             | Auto-fix lint and format             |
| lint:check/fix  | Lint checking/fixing                 |
| format:check/fix| Formatting check/fix                 |
| test:unit       | Run unit tests (Vitest)              |
| test:e2e        | Run end to end tests (Playwright)    |
| test:install    | Install playwright browsers          |

**Build Process:**
- Uses Vite + plugins for static copy, sitemap, PWA/offline support
- Output: `dist/`, `ui/`, `fonts/`, etc.
- Customizable via `.env` variables (`VITE_UI_DIR`, etc.)

---

## Testing

**Triple-Headed:**
- **Vitest:** Unit/integration
- **Testing Library:** DOM/component
- **Playwright:** E2E/browser

```sh
bun test:unit           # Run unit tests
bunx vitest --coverage  # Coverage
```
Test files in `tests/unit/`.
All tests run in CI/CD.

---

## Deployment & Operations

### Server Options

| Option                | Description                 | Default |
|-----------------------|----------------------------|---------|
| [port]                | Server port                | 1337    |
| --ssl                 | Enable SSL                 | Disabled|
| --ssl-dir <path>      | SSL cert directory         | /etc/ssl/private |
| --save-interval <n>   | Autosave interval (min)    | 30      |
| --session-name <str>  | Session file prefix        | joint   |
| --debug               | Verbose logging            | false   |
| --help                | Show usage                 | -       |

**Examples:**
```sh
bun server 8080 --ssl --ssl-dir /etc/letsencrypt --save-interval 15 --session-name myjam --debug
```

### Environment Variables

| Variable      | Description                         | Example          |
|---------------|-------------------------------------|------------------|
| NODE_ENV      | Node environment                    | production       |
| SESSION_KEY   | Session secret for express          | supersecretkey   |

> By default, the session secret is set to `"sauce"`. For production use, set a strong value via `SESSION_KEY` or modify in `server.js`.

### Systemd Service

Sample unit file:
```ini
[Unit]
Description=teXt0wnz Collaboration Server
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/text0wnz/src/js/server/main.js 1337
Restart=always
User=youruser
Environment=NODE_ENV=production
WorkingDirectory=/path/to/text0wnz/
StandardOutput=syslog
StandardError=syslog

[Install]
WantedBy=multi-user.target
```
Reload with:
```sh
sudo systemctl daemon-reload
sudo systemctl enable --now text0wnz.service
```

### Webserver Configuration

The server runs on port `1337` by default. You need to setup a web server to serve the `/dist` directory and proxy WebSocket connections to the collaboration server.

#### Nginx Example:

Create or edit an nginx config: `/etc/nginx/sites-available/text0wnz`

```nginx
server {
    listen 80;
    listen 443 ssl;

    root /path/to/text0wnz/dist;
    index index.html;

    server_name text.0w.nz;  # Replace with your domain

    # Include your SSL configuration
    include snippets/ssl.conf;

    location ~ /.well-known {
        allow all;
    }

    # Serve static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy WebSocket connections for collaboration
    location /server {
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_redirect off;
        proxy_pass http://localhost:1337/;  # Note the trailing slash
    }
}
```

**Key Points:**
- The document root should point to the built `/dist` directory
- The `proxy_pass` should match your server port with a trailing slash
- WebSocket upgrade headers are required for real-time collaboration

### SSL Configuration

Make sure you define your SSL settings in `/etc/nginx/snippets/ssl.conf`:

```nginx
ssl_certificate /etc/ssl/private/letsencrypt-domain.pem;
ssl_certificate_key /etc/ssl/private/letsencrypt-domain.key;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;
```

---

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

**Tips:**
- Always use a process manager (systemd, forever)
- Lower save interval for busy sessions
- Use SSL in production (Let's Encrypt)
- WebSocket debugging: browser dev tools
- Restore session: rename backups as needed
- Review logs for details

**Still stuck?**
[Open an issue](https://github.com/xero/moebius-web/issues) with error logs and platform details.

---

## Browser Support

> _Works on desktop and mobile!_

- Chrome/Chromium 95+
- Firefox 93+
- Safari 15+
- Edge 95+

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

tests/                  # Unit tests
├── dom                 # Testing Library: DOM/component
├── e2e                 # Playwright: E2E/browser
├── unit                # Vitest: Unit/integration
└── results             # Test results

docs/                   # Documentation
├── examples/           # Files to test with
│   ├── ansi/           # ANSI artwork
│   └── xbin/           # XBin artwork
├── fonts.md            # Previews all app fonts
├── logos.txt           # ASCii art logos for the project
├── pre-commit          # Git pre-commit hook
├── sauce-format.md     # Sauce metadata spec
└── xb-format.md        # Xbin format spec

dist/                   # Built application (generated)
```
---

## Other Useful Tools

- [pin-github-action](https://github.com/mheap/pin-github-action): Automatically pins actions dependencies to a specific SHA, _note:_ this repo requires pinned hashes in all workflows.
  - install: `bun i -g pin-github-action`
  - usage: `pin-github-action /path/to/.github/workflows/your-name.yml`
- [npm-check-updates](https://github.com/raineorshine/npm-check-updates): Upgrades your package.json dependencies to the latest versions, ignoring the existing specified versions.
  - install: `bun i npm-check-updates`
  - usage: `ncu -u`

## License & Greetz

<img src="https://gist.githubusercontent.com/xero/cbcd5c38b695004c848b73e5c1c0c779/raw/6b32899b0af238b17383d7a878a69a076139e72d/kopimi-sm.png" align="left" height="222">

▒ mad love & respect to [Andy Herbert^67](http://github.com/andyherbert) - [Moebius](https://github.com/blocktronics/moebius) ░ [grmmxi^imp!](https://glyphdrawing.club/) - [MoebiusXBIN](https://github.com/hlotvonen/moebiusXBIN/) ░ [Curtis Wensley](https://github.com/cwensley) - [PabloDraw](https://github.com/cwensley/pablodraw) ░ [Skull Leader^ACiD](https://defacto2.net/p/skull-leader) - [ACiDDRAW](https://www.acid.org/apps/apps.html) ▒

---

All files and scripts in this repo are released [MIT](https://github.com/xero/moebius-web/blob/main/LICENSE.txt) / [kopimi](https://kopimi.com)! In the spirit of _freedom of information_, I encourage you to fork, modify, change, share, or do whatever you like with this project! `^c^v`
