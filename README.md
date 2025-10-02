# teXt.0w.nz

**teXt0wnz** is a collaborative, web-based text art editor and viewer. It supports classic ANSI text art, XBin files, scene NFO, and plain UTF-8 text. The editor itself is a single-page-application that can run locally or on a web-server. The optional server-side components synchronize editor state between clients via WebSockets.

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

# Client Usage

**teXt0wnz** is a comprehensive web-based textmode art editor that operates entirely in the browser. This client-side application provides a full suite of drawing tools, color management, and file operations for creating text-based artwork.

## Features Overview

### Supported File Types/Extensions

- `*.ans`: The standard **ANSI** file format
- `*.utf8.ans`: **UTF8 ANSI** files encoded for terminial output
- `*.bin`: The vintage DOS era **BIN** format
- `*.xbin`: The modern **XBIN** file format
- `*.nfo`: Scene / release **NFO** files
- `*.txt`: Vanilla Plain Text files for **ASCII** art

### Fonts

- All the classic ANSI art fonts
- Popular modern and vintage XBIN fonts

> [!NOTE]
> View them all in the [docs](https://github.com/xero/moebius-web/blob/main/docs/fonts.md) or the [src/fonts](https://github.com/xero/moebius-web/tree/main/src/fonts) directory.

### Drawing Tools

| Tool Name                 | Description and Use                                                                                                                                  |
| :------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Keyboard Mode**         | Text input mode that allows typing characters directly onto the canvas with full keyboard navigation support.                                        |
| **Freehand/Half Block**   | Free drawing tool using half-block characters as large pixels. Supports pressure-sensitive drawing and straight lines when holding Shift.            |
| **Shading Brush**         | Free drawing tool using full shading block characters. Supports pressure-sensitive drawing and _'reduce mode'_ when holding Shift.                   |
| **Character Brush**       | Draw with any character from the extended ASCII character set. Includes a character picker panel for easy selection.                                 |
| **Fill Tool**             | Flood fill that works on single-color text characters or half-block pixels. Respects color boundaries and handles attribute conflicts intelligently. |
| **Color/Attribute Brush** | Paint-only tool that changes foreground/background colors without affecting the character itself. Hold Alt to paint background colors.               |
| **Line Tool**             | Draw straight lines between two points with immediate preview. Supports color conflict resolution.                                                   |
| **Square Tool**           | Draw rectangles with outline or filled modes. Toggle between outline and filled using the floating panel.                                            |
| **Circle Tool**           | Draw circles and ellipses with outline or filled modes. Includes real-time preview during drawing.                                                   |
| **Selection Tool**        | Select rectangular areas for copying, cutting, and manipulation. Includes flip horizontal/vertical and move operations.                              |
| **Sample Tool**          | Color picker that samples colors from existing artwork. Works as a quick color selection method.                                                     |

### Color Management

- **16-color ANSI palette** with foreground/background color selection
- **iCE colors support** for extended color capabilities
- **Color swapping** and default color restoration
- **Real-time color preview** in the palette picker
- **Smart conflict resolution** when overlapping half-block colors

### File Operations

**Supported Import Formats:**
- ANSI (.ans) files
- Binary Text (.bin) files
- XBin (.xb) files

**Supported Export Formats:**
- Save as ANSI (.ans)
- Save as Binary Text (.bin)
- Save as XBin (.xb)
- Export as PNG image
- Export as UTF-8 ANSI (e.g. for shell scripts)

### Canvas Operations

- **Undo/Redo** (up to 1000 operations)
- **Canvas resizing** with width/height controls
- **Grid overlay** for precise alignment
- **SAUCE metadata** editing (title, author, group)
- **Font selection** from multiple character sets

## Comprehensive Key Mappings

### Main Tool Shortcuts
| Key | Tool | Description |
|-----|------|-------------|
| `K` | Keyboard Mode | Enter text input mode with cursor navigation |
| `F` | Freestyle | Free drawing with half-block pixels |
| `B` | Character Brush | Draw with selected ASCII characters |
| `N` | Fill | Flood fill tool |
| `A` | Attribute Brush | Paint colors only (no characters) |
| `G` | Grid Toggle | Show/hide alignment grid |
| `I` | iCE Colors Toggle | Enable/disable extended color palette |
| `M` | Mirror Mode | Toggle horizontal mirror drawing |

### Color Shortcuts
| Key | Action | Description |
|-----|--------|-------------|
| `D` | Default Colors | Reset to default foreground/background |
| `Q` | Swap Colors | Exchange foreground and background colors |
| `0`-`7` | Select Colors | Choose from basic color palette (press again for bright) |

### Special Character Insertion
| Key | Character | Description |
|-----|-----------|-------------|
| `F1`-`F12` | Special Characters | Insert predefined special characters (see table below) |

### File Operations
| Key Combination | Action | Description |
|-----------------|--------|-------------|
| `Ctrl+Z` | Undo | Reverse last operation |
| `Ctrl+Y` | Redo | Restore undone operation |
| `Ctrl+X` | Cut | Cut selected area to clipboard |
| `Ctrl+C` | Copy | Copy selected area to clipboard |
| `Ctrl+V` | Paste | Paste from clipboard |
| `Ctrl+Shift+V` | System Paste | Paste from system clipboard |
| `Ctrl+Delete` | Delete | Delete selected area |

### Keyboard Mode Navigation
| Key | Action | Description |
|-----|--------|-------------|
| `Arrow Keys` | Navigate | Move cursor in text mode |
| `Home` | Line Start | Jump to beginning of line |
| `End` | Line End | Jump to end of line |
| `Page Up/Down` | Page Jump | Move cursor by screen height |
| `Tab` | Tab Character | Insert tab character |
| `Backspace` | Delete Left | Delete character to the left |
| `Enter` | New Line | Move to next line |

### Advanced Editing (Alt + Key)
| Key Combination | Action | Description |
|-----------------|--------|-------------|
| `Alt+Up` | Insert Row | Insert row above cursor |
| `Alt+Down` | Delete Row | Delete current row |
| `Alt+Right` | Insert Column | Insert column at cursor |
| `Alt+Left` | Delete Column | Delete current column |
| `Alt+E` | Erase Row | Clear entire row |
| `Alt+Shift+E` | Erase Column | Clear entire column |
| `Alt+Home` | Erase to Row Start | Clear from cursor to line beginning |
| `Alt+End` | Erase to Row End | Clear from cursor to line end |
| `Alt+Page Up` | Erase to Column Start | Clear from cursor to column top |
| `Alt+Page Down` | Erase to Column End | Clear from cursor to column bottom |

### Selection Operations
| Key | Action | Description |
|-----|--------|-------------|
| `[` | Flip Horizontal | Mirror selection horizontally |
| `]` | Flip Vertical | Mirror selection vertically |
| `M` | Move Mode | Toggle selection move mode |

### Special Function Keys
| Key | Character | Description |
|-----|-----------|-------------|
| `F1` | `░` | Light shade block |
| `F2` | `▒` | Medium shade block |
| `F3` | `▓` | Dark shade block |
| `F4` | `█` | Full block |
| `F5` | `▀` | Upper half block |
| `F6` | `▄` | Lower half block |
| `F7` | `▌` | Left half block |
| `F8` | `▐` | Right half block |
| `F9` | `■` | Small solid square |
| `F10` | `○` | Circle |
| `F11` | `•` | Bullet |
| `F12` | `NULL` | Blank/transparent |

### Menu Access
| Action | Key | Description |
|--------|-----|-------------|
| Canvas Resize | Menu → Edit | Change canvas dimensions |
| Font Selection | Menu → View | Choose character set |
| iCE Colors | Menu → View | Enable extended colors |
| SAUCE Info | Menu → File | Edit artwork metadata |

## Mouse Controls

- **Left Click**: Primary drawing action
- **Drag**: Continue drawing/create shapes
- **Shift+Click**: Draw straight lines in freehand mode
- **Alt+Click**: Color sampling/alternative drawing modes
- **Right Click**: Access context menus

## Tips and Workflow

1. **Start with Keyboard Mode** to lay out text and structure
2. **Use Grid** for precise alignment of elements
3. **Freestyle Tool** is best for artistic details and shading
4. **Character Brush** for textures and patterns
5. **Fill Tool** for quick color blocking
6. **Selection Tool** for moving and copying artwork sections
7. **Save frequently** using Ctrl+S or File menu options
8. **Use F-keys** for quick access to common block characters
9. **Alt+sampling** to pick colors from existing artwork
10. **Undo/Redo** extensively - it's unlimited within the session


## Server Architecture (Collaborative Mode)

The editor supports a collaborative server mode for real-time multi-user ANSI/ASCII/XBIN art editing.
The collaboration engine is implemented in the `src/js/server` directory.

### Key Files

- `main.js` **entry point**
Creates and inits backend server components
- `config.js` **Argument Parser**
Converts command-line argument flags into application options
- `text0wnz.js` **Collaboration engine**
Handles all real-time session management, canvas state, and user synchronization.
- `fileio.js` **File save and loading**
Input/output features for textart files
- `websockets.js` **WebSocket Sever**
Configures WebSocket endpoints.
- `server.js` **Middleware**
'Handles direct and proxied connections (`/` and `/server`).
- `utils.js` **helper functions**

### Features

- **Persistence:**
  Canvas and chat data are auto-saved to disk at configurable intervals, with timestamped backups for recovery.
- **SSL/HTTP Support:**
  Can auto-detect and use SSL certificates for secure connections, or fall back to HTTP.
- **Session Customization:**
  Supports custom session file names and save intervals.
- **Minimal Overhead:**
  Designed for low resource usage—only manages collaborative drawing and session state.

### How it Works
1. **Start the server:**
   ```sh
   bun server [port] [options]
   ```
2. **Clients connect via browser:**
   - Directly, or through a reverse proxy (e.g., nginx).
   - WebSocket endpoints handle all real-time drawing and chat messages.

3. **Session persistence:**
   - Canvas and chat are auto-saved to `{sessionName}.bin` and `{sessionName}.json`.

---

## Server Command-Line Options

| Option                | Description                                                | Default             |
|-----------------------|------------------------------------------------------------|---------------------|
| `[port]`              | Port to run the server on                                  | `1337`              |
| `--ssl`               | Enable SSL (requires certificates in `ssl-dir`)            | Disabled            |
| `--ssl-dir <path>`    | SSL certificate directory                                  | `/etc/ssl/private`  |
| `--save-interval <n>` | Auto-save interval in minutes                              | `30` (minutes)      |
| `--session-name <str>`| Session file prefix (for state and chat backups)           | `joint`             |
| `--debug`             | Display verbose logs                                       | false               |
| `--help`              | Show help message and usage examples                       | -                   |

### Examples:

```sh
# Basic start with defaults
bun server
# or
npm run server

# Start on custom port
bun server 8080
# or
npm run server 8080

# Full example with all options
bun server 8080 --ssl --ssl-dir /etc/letsencrypt --save-interval 15 --session-name myjam --debug
```

---

## Build & Development Instructions

### Requirements

- [Node.js](https://nodejs.org/) (v22.19.0+ recommended, check `engines` in package.json)
- **Suggested** [Bun](https://bun.sh/) package manager and runtime for better performance
- _Alternative_ [npm](https://www.npmjs.com/) package manager

### Quick Start (Local Development)

1. **Install dependencies:**
   ```sh
   bun i
   # or
   npm install
   ```

2. **Build the application:**
   ```sh
   bun bake
   # or
   npm run bake
   ```

3. **Serve the built files:**
   ```sh
   # Any static web server pointed at the dist/ directory
   cd dist
   python3 -m http.server 8080
   # Then open http://localhost:8080 in your browser
   ```

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `bake` | `npm run bake` | Build the application for production (uses Vite) |
| `server` | `npm run server` | Start the collaboration server |
| `fix` | `npm run fix` | Auto-fix both linting and formatting issues |
| `lint:check` | `npm run lint:check` | Check for linting issues only |
| `lint:fix` | `npm run lint:fix` | Auto-fix linting issues |
| `format:check` | `npm run format:check` | Check code formatting |
| `format:fix` | `npm run format:fix` | Auto-fix formatting issues |
| `test:unit` | `npm run test:unit` | Run unit tests with Vitest |

### Build Process Overview

This project uses [Vite](https://vitejs.dev/) as its build tool, with several plugins to enable a modern, flexible, and offline-capable web app.

#### Steps

1. **Environment Configuration**
   - Environment variables are loaded via Vite’s `loadEnv()`.
   - The UI asset directory (`uiDir`) is dynamically set using the `VITE_UI_DIR` environment variable, defaulting to `ui/`.
   - Other variables like `VITE_DOMAIN` and `VITE_WORKER_FILE` are also utilized for domain and worker configuration.

2. **Asset Output Structure**
   - All built assets are placed in a custom UI directory, easily rebranded by changing the environment variable.
   - Only `index.css` is renamed to `stylez.css` for clarity; other assets retain their original names.

3. **Plugins Used**
   - **vite-plugin-static-copy**: Copies worker scripts and fonts into the UI directory at build time, ensuring all necessary files are available offline.
   - **vite-plugin-sitemap**: Generates `sitemap.xml` and `robots.txt` with custom rules for crawler exclusion.
   - **vite-plugin-pwa**: Configures a Service Worker for offline capability, caching strategies, and generates a web app manifest with icon and screenshot references using the UI directory.

4. **Build Targets and Output**
   - Output is set to `dist` with all assets in its root or within the UI directory.
   - No code-splitting or asset inlining is performed; all assets are separate for easier cache control.

5. **Offline PWA Support**
   - Service Worker caches critical assets (`js`, `css`, images, fonts, etc.) using "CacheFirst" strategies.
   - The manifest and screenshots are referenced dynamically via the UI directory, supporting easy repo re-use and branding.
   - The app is installable and works fully offline after the first load.

##### Customization

To change the UI asset directory, set `VITE_UI_DIR` in your `.env` file before building.
Other branding or output customizations can be made by modifying environment variables or the build config.

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
bun server 8060 --session-name myjam --save-interval 10
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

### Environment Variables

You can set the following environment variables before starting the server (especially when using a process manager or systemd):

| Variable      | Description                                 | Example                     |
|---------------|---------------------------------------------|-----------------------------|
| `NODE_ENV`    | Node environment setting                    | `production`                |
| `SESSION_KEY` | (Optional) Session secret key for express   | `supersecretkey`            |

> By default, the session secret is set to `"sauce"`. For production use, set a strong value via `SESSION_KEY` or modify in `server.js`.

### Notes

- The static Front-end files are generated in the `/dist` directory.
  - Make sure your web server (nginx, etc.) points to this as the document root.
- If using SSL, ensure your cert and key files are named as expected or update the code/paths as needed.
- You can run the server as a background process using `systemd`, `forever`, or similar tools for reliability.
- If you want to use this as a local only editor, you can just put the "public" folder on a web-server and you're good to go.

## Process management

### systemd (Recommended for Servers)
- Built-in service manager on most Linux distributions.
- Extremely lightweight, reliable, and secure (no extra processes or userland code to maintain).
- Create a unit file for the server:
```INI
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
- Reload systemd and enable:
```sh
sudo systemctl daemon-reload
sudo systemctl enable --now text0wnz.service
```
- Memory: Minimal—just your Node.js process.
- Monitoring: Use `journalctl -u text0wnz.service` or your system's logging.

## Web Server Configuration

### Nginx Configuration

The server runs on port `1337` by default. You need to setup a web server to serve the `/dist` directory and proxy WebSocket connections to the collaboration server.

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

Enable the site and restart nginx:
```sh
sudo ln -s /etc/nginx/sites-available/text0wnz /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

## Troubleshooting & Tips

### Common Issues

#### 1. Build Failures
- **Symptom:** `npm run bake` fails with module or Vite errors.
- **Solution:**
  - Ensure you have Node.js v22.19.0+ (check `node --version`)
  - Delete `node_modules` and `package-lock.json`, then run `npm install` again

#### 2. Server Fails to Start / Port Already in Use
- **Symptom:** You see `EADDRINUSE` or "address already in use" errors.
- **Solution:**
  - Make sure no other process is using the port (default: 1337).
  - Change the server port with a command-line argument:
    ```sh
    bun server 8080
    ```
  - Or stop the other process occupying the port.

#### 3. SSL/HTTPS Doesn't Work
- **Symptom:** Server crashes or browser reports "insecure" or "cannot connect" with SSL enabled.
- **Solution:**
  - Ensure your SSL cert (`letsencrypt-domain.pem`) and key (`letsencrypt-domain.key`) are present in the specified `--ssl-dir`.
  - Double-check file permissions on the cert/key; they should be readable by the server process.
  - If issues persist, try running without `--ssl` to confirm the server works, then debug SSL config.

#### 4. Cannot Connect to Server from Browser
- **Symptom:** Web client shows "Unable to connect" or no collaboration features appear.
- **Solution:**
  - Make sure the Node.js server is running and accessible on the configured port.
  - Check that your reverse proxy (nginx) forwards WebSocket connections to `/server` with the correct port and trailing slash.
  - Check firewall (ufw, iptables, etc.) for blocked ports.
  - Review browser console and server logs for error details.

#### 5. WebSocket Disconnects or Fails to Upgrade
- **Symptom:** Collaboration features drop out or never initialize.
- **Solution:**
  - Confirm nginx config includes the correct WebSocket headers (`Upgrade`, `Connection`, etc.).
  - Make sure proxy_pass URL ends with a trailing slash (`proxy_pass http://localhost:1337/;`).
  - Try connecting directly to the Node.js server (bypassing nginx) for troubleshooting.

#### 6. Session Not Saving / Data Loss
- **Symptom:** Drawings/chat are not persisted or backups missing.
- **Solution:**
  - Ensure the server process has write permissions in its working directory.
  - Check the value of `--save-interval` (defaults to 30 min); lower it for more frequent saves.
  - Watch for errors in server logs related to disk I/O.

#### 7. Permissions Errors (systemd, PM2, etc.)
- **Symptom:** Server fails to start as a service or can't access files.
- **Solution:**
  - Make sure the `User` in your systemd service file has read/write access to the project directory and SSL keys.
  - Review logs with `journalctl -u text0wnz` for detailed error output.

#### 7. Wrong Port on Client/Server
- **Symptom:** Client can’t connect, even though the server is running.
- **Solution:**
  - The client code (see `public/js/network.js`, line ~113) must use the same port you start the server on.
  - Update both if you change the port.

### General Tips

- **Auto-Restart:**
  Always run the server with a process manager (e.g. systemd, forever) for automatic restarts on crash or reboot.
- **Frequent Saves:**
  Lower the `--save-interval` value for high-collaboration sessions to avoid data loss.
- **SSL Best Practice:**
  Always use SSL in production! Free certs: [let’s encrypt](https://letsencrypt.org/).
  [Automate renewals](https://github.com/nginx/nginx-acme) and always restart the server/service after cert updates.
- **Testing Locally:**
  You can test the server locally with just `npm run server` and connect with `http{s,}://localhost:1337` (or your chosen port).
- **WebSocket Debugging:**
  Use browser dev tools (Network tab) to inspect WebSocket connection details.
- **Session Backups:**
  Periodic backups are written with timestamps. If you need to restore, simply rename the desired `.bin` and `.json` files as the main session.
- **Logs:**
  Review server logs for all connection, error, and save interval events. With systemd, use `journalctl -u text0wnz`.
- **Firewall:**
  Don’t forget to allow your chosen port through the firewall (`ufw allow 1337/tcp`, etc.).

> [!IMPORTANT]
> If you encounter unique issues, please open an issue on [GitHub](https://github.com/xero/moebius-web/issues) with error logs and platform details!

##  Browser Support
>_Works on desktop and mobile devices!_
- Chrome/Chromium 95+
- Firefox 93+
- Safari 15+
- Edge 95+

## License & Greetz

<img src="https://gist.githubusercontent.com/xero/cbcd5c38b695004c848b73e5c1c0c779/raw/6b32899b0af238b17383d7a878a69a076139e72d/kopimi-sm.png" align="left" height="222">

▒ mad love & respect to [Andy Herbert^67](http://github.com/andyherbert) - [Moebius](https://github.com/blocktronics/moebius) ░ [grmmxi^imp!](https://glyphdrawing.club/) - [MoebiusXBIN](https://github.com/hlotvonen/moebiusXBIN/) ░ [Curtis Wensley](https://github.com/cwensley) - [PabloDraw](https://github.com/cwensley/pablodraw) ░ [Skull Leader^ACiD](https://defacto2.net/p/skull-leader) - [ACiDDRAW](https://www.acid.org/apps/apps.html) ▒

---

All files and scripts in this repo are released [MIT](https://github.com/xero/moebius-web/blob/main/LICENSE.txt) / [kopimi](https://kopimi.com)! In the spirit of _freedom of information_, I encourage you to fork, modify, change, share, or do whatever you like with this project! `^c^v`
