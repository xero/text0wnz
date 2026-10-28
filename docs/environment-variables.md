# Environment Variables

This document describes all environment variables used in the teXt0wnz project.

## Build-Time Variables (Vite)

These variables are used during the build process and are read from the `.env` file in the project root.

### VITE_DOMAIN

**Default:** `https://text.0w.nz`

**Purpose:** Sets the domain for robots.txt and sitemap.xml generation.

**Usage:**

```bash
VITE_DOMAIN='https://your-domain.com'
```

**Note:** This only affects SEO files. The application itself uses relative URLs and works on any domain.

**Build files affected:**

- `dist/robots.txt` - Sets the sitemap location
- `dist/sitemap.xml` - Uses domain for URL generation

### VITE_UI_DIR

**Default:** `ui/`

**Purpose:** Sets the directory name for UI assets in the build output.

**Usage:**

```bash
VITE_UI_DIR='assets/'
```

**Build output structure:**

```
dist/
├── index.html
└── {VITE_UI_DIR}/
    ├── js/
    ├── img/
    ├── fonts/
    └── stylez.css
```

**Note:** Should end with `/` (or it will be added automatically). Leading slash is removed.

### VITE_FONT_DIR

**Default:** `fonts/`

**Purpose:** Sets the directory name for bitmap font assets.

**Usage:**

```bash
VITE_FONT_DIR='bitmapfonts/'
```

**Note:** Not used in vite.config.js but read by the frontend client to locate bitmap fonts. See `src/js/client/state.js`

## Runtime Variables (Server)

These variables are used when running the collaboration server.

### PORT

**Default:** `1337`

**Purpose:** Sets the port for the WebSocket collaboration server.

**Usage:**

```bash
# Command line (the bare server takes the port as an argument)
bun server 8080

# Docker (the startup script passes PORT to the server)
docker run -e PORT=8080 text0wnz:latest
```

**Note:** The server reads `PORT` directly only in its `healthcheck` probe mode; otherwise the port comes from the CLI argument.

### NODE_ENV

**Default:** `production`

**Purpose:** Sets the Node.js environment mode.

**Values:**

- `production` - Production mode with optimizations
- `development` - Development mode (plain HTTP in Docker, source maps in builds)

**Usage:**

```bash
NODE_ENV=development bun bake

# Docker
docker run -e NODE_ENV=development text0wnz:latest
```

**Effects:**

- Source maps in the Vite build (enabled when not `production`)
- Caddy configuration (in Docker)
- SSL settings (in Docker)

### DOMAIN

**Default:** `localhost`

**Purpose:** Sets the domain name for the server (Docker only).

**Usage:**

```bash
# Docker
docker run -e DOMAIN=text.example.com text0wnz:latest
```

**Effects (Docker):**

- Caddy server configuration
- SSL certificate generation
- WebSocket endpoint configuration

### ROOM_PASS

**Default:** none

**Purpose:** Room password applied to every room without a specific entry. Same as the `--pass` flag, and it gates spectators too.

**Usage:**

```bash
ROOM_PASS=hunter2 bun server
```

### ROOM_PASSWORDS

**Default:** none

**Purpose:** Per-room passwords as JSON. A room with its own entry ignores `ROOM_PASS`.

**Usage:**

```bash
ROOM_PASSWORDS='{"room":"pw"}' bun server
```

**Note:** Keys are lowercased to match normalized room names. A value that is not valid JSON logs `[Config] ROOM_PASSWORDS is not valid JSON; ignored` and the server boots with no per-room entries.

### ROOM_MAX_COLUMNS / ROOM_MAX_ROWS

**Default:** `1000` columns, `10000` rows

**Purpose:** Canvas resize walls. The walls gate resizes only; restored documents keep their size. Lowering them binds every client. Raising them above the defaults reaches only Moebius, moebiusXBIN, and icy_draw clients: the teXt0wnz editor refuses to apply a resize past 1000 by 10000 on its own side, so a raised wall splits a mixed room.

### ROOM_MAX_GUESSES

**Default:** `20`

**Purpose:** A room's budget of wrong passwords from every address together, on top of each address's own backoff: a burst of N, then one more every 60 / N seconds. While it is spent, the room refuses every address that has not joined it, the right password included, so too low a number lets a few addresses keep newcomers out (at the default, about ten addresses guessing steadily can). An address that has joined with the right password still gets back in. Raise it for a big jam where many people might mistype at once; lower it to slow a guesser spread across many addresses. Anything but a positive whole number keeps the default.

```bash
ROOM_MAX_GUESSES=60 ROOM_PASS=hunter2 bun server
```

### STATIC_DIR

**Default:** none (WebSocket-only; a proxy serves static files)

**Purpose:** Serve the built PWA from this directory. Same as the `--static` flag; used by the single-binary and distroless deployments.

### ALLOWED_ORIGINS

**Default:** none (websocket upgrades stay open, the ancestor behavior)

**Purpose:** Comma-separated Origin allowlist for websocket upgrades. Same as the `--allowed-origins` flag (the flag wins when both are set). Matching is exact strings, so list every scheme and port variant you serve from.

```bash
ALLOWED_ORIGINS="https://text.0w.nz,https://staging.0w.nz" bun src/js/server/main.js
```

Desktop clients (Moebius, icy_draw) send no Origin header and always pass; the allowlist gates browsers only.

### TRUST_PROXY

**Default:** none (loopback only)

**Purpose:** Comma-separated addresses of reverse proxies whose `X-Real-IP` or last `X-Forwarded-For` hop names the client. The password backoff keys on the client's address, so a proxy's own address would make every visitor share one backoff. Loopback is always trusted, which covers the Docker image's Caddy and any proxy on the same host. List a proxy that connects from another address, such as another container or a Docker bridge gateway, by its exact address; ranges do not match:

```bash
TRUST_PROXY=172.18.0.2 bun src/js/server/main.js
```

A trusted proxy must write the header itself, over whatever the visitor sent; the nginx, Apache, and Caddy examples in [webserver-configuration.md](./webserver-configuration.md) do. When both headers arrive and name different addresses, one was forged, so the request counts as the proxy's own. Headers from anyone else are ignored, or a guesser could forge a fresh address for every try.

Only the proxy that connects to the server is consulted. With the Docker image behind another proxy, the image's Caddy is that proxy and names the outer one, so mount a Caddyfile that trusts the outer proxy and sends `{client_ip}` (see [docker.md](./docker.md)).

### BRIDGE

Companions: `BRIDGE_TARGET`, `BRIDGE_PORT`, `BRIDGE_ALLOW`, `BRIDGE_MAX`.

**Default:** `BRIDGE=off`, `BRIDGE_TARGET=ws://127.0.0.1:8000`, `BRIDGE_PORT=8000`, `BRIDGE_MAX=16`

**Purpose:** Control the collaboration bridge, a byte pipe from browser connections to plaintext desktop servers (Moebius, icy_draw).

**Modes:**

- `off` - every bridge request is refused (default)
- `local` - only the preconfigured `BRIDGE_TARGET` is dialed
- `port` - caller-chosen host pinned to `BRIDGE_PORT`; private addresses are denied
- `allow` - only targets on the `BRIDGE_ALLOW` list (comma-separated `host:port`). A listed address dials as given, private or not. A listed name dials the address it resolves to, and its first answer pins its kind (public, private, loopback, or link-local) for the life of the process; a later answer of another kind, or a mix of kinds, is refused

The editor uses the bridge on its own. A page served over https that is asked to join a plaintext server dials `wss://<this host>/bridge?host=...&port=...&room=...` instead, since the browser blocks the direct socket as mixed content. With `BRIDGE=off` the dial fails and the Connect form tells the visitor the site may not allow it (the browser cannot tell a refusal from a dead host). The `port` mode fits a public editor host best: visitors pick the server, the port stays pinned, and private addresses are refused. Behind a reverse proxy, `/bridge` must be forwarded to the server like `/server` is; the Docker image and the examples in [webserver-configuration.md](./webserver-configuration.md) already do.

**What you take on.** In `port` mode your host relays, from its own address, to any public websocket server on that one port, for anyone who can reach `/bridge`. Pin browsers with `ALLOWED_ORIGINS` (desktop clients send no Origin and pass regardless), prefer `allow` when the set of servers is known, and keep the logs: every open, close, and refusal prints with the requester's address (and the proxy's `X-Real-IP` claim when there is one) whether or not `--debug` is on, so an abuse report has an answer. Refusals reach the caller as a bare `403` (mode `off`, a vetoed target, or an Origin outside the allowlist), the cap as `503 bridge busy`, and a request without a websocket handshake as `426`; the reason, which can name resolved addresses, goes to the log only. The bridge also bounds itself: `BRIDGE_MAX` concurrent pipes (default `16`, counted while a lookup is still pending), a 3 second DNS lookup and a 10 second dial, 256 KB of browser frames queued before the upstream answers, a delivery bound in each direction (a side that stops taking delivery for 15 seconds, or leaves more than 64 MB unconfirmed, closes the pipe), and a 30 minute idle reaper. A `BRIDGE_PORT` equal to one of the server's own listeners, or a `BRIDGE_TARGET` pointing at a `/bridge` path, stops the boot.

### XDG_DATA_HOME

**Default:** `/var/lib/caddy` (Docker only)

**Purpose:** Sets the Caddy data directory.

**Usage:**

```bash
# Docker
docker run -e XDG_DATA_HOME=/custom/path text0wnz:latest
```

### XDG_CONFIG_HOME

**Default:** `/etc/caddy` (Docker only)

**Purpose:** Sets the Caddy configuration directory.

**Usage:**

```bash
# Docker
docker run -e XDG_CONFIG_HOME=/custom/path text0wnz:latest
```

## CI/CD Variables (GitHub Actions)

These are GitHub secrets and environment variables used in workflows.

### GITHUB_TOKEN

**Purpose:** Authentication for GitHub API operations.

**Used in:**

- All workflows for repository access
- Docker image pushes to GHCR
- Artifact uploads/downloads
- Pages deployment

### DOCKERHUB_USERNAME

**Required:** Yes (for docker-build.yml)

**Purpose:** Docker Hub login username.

**Setup:**

```
Repository Settings → Secrets and variables → Actions → New repository secret
Name: DOCKERHUB_USERNAME
Value: your-dockerhub-username
```

### DOCKERHUB_TOKEN

**Required:** Yes (for docker-build.yml)

**Purpose:** Docker Hub access token (password).

**Setup:**

```
1. Create access token at https://hub.docker.com/settings/security
2. Add to GitHub:
   Repository Settings → Secrets and variables → Actions → New repository secret
   Name: DOCKERHUB_TOKEN
   Value: your-access-token
```

### CICD_TOKEN

**Required:** Yes (for wiki.yml)

**Purpose:** Personal access token for wiki repository access.

**Setup:**

```
1. Create personal access token at https://github.com/settings/tokens
   Required permissions: repo (full control)
2. Add to GitHub:
   Repository Settings → Secrets and variables → Actions → New repository secret
   Name: CICD_TOKEN
   Value: your-personal-access-token
```

### PKG_TOKEN

**Required:** Yes (for ci-docker-build.yml)

**Purpose:** Personal access token for GitHub Packages.

**Setup:**

```
1. Create personal access token at https://github.com/settings/tokens
   Required permissions: write:packages, read:packages
2. Add to GitHub:
   Repository Settings → Secrets and variables → Actions → New repository secret
   Name: PKG_TOKEN
   Value: your-personal-access-token
```

## Environment File (.env)

The `.env` file in the project root is used for local development configuration.

**Example `.env`:**

```bash
# Build configuration
VITE_DOMAIN='https://text.0w.nz'
VITE_UI_DIR='ui/'
VITE_FONT_DIR='fonts/'
```

**Note:** The `.env` file is not gitignored; keep secrets out of it and commit changes deliberately.

## Setting Environment Variables

### Local Development

**Option 1: .env file (recommended)**

```bash
# Create .env file
cat > .env << EOF
VITE_DOMAIN='https://localhost'
NODE_ENV=development
EOF

# Run build or server
bun bake
bun server
```

**Option 2: Command line**

```bash
# Inline
VITE_DOMAIN='https://localhost' bun bake
NODE_ENV=development bun server

# Export (for current shell session)
export VITE_DOMAIN='https://localhost'
export NODE_ENV=development
bun bake
bun server
```

### Docker

**Option 1: -e flags**

```bash
docker run \
  -e DOMAIN=your.domain.com \
  -e NODE_ENV=production \
  -e ROOM_PASS=your-room-password \
  text0wnz:latest
```

**Option 2: --env-file**

```bash
# Create docker.env file
cat > docker.env << EOF
DOMAIN=your.domain.com
NODE_ENV=production
ROOM_PASS=your-room-password
EOF

# Run with env file
docker run --env-file docker.env text0wnz:latest
```

**Option 3: docker-compose.yml**

```yaml
services:
  text0wnz:
    image: text0wnz:latest
    environment:
      - DOMAIN=your.cool.tld
      - NODE_ENV=production
      - ROOM_PASS=your-room-password
    ports:
      - '80:80'
      - '443:443'
```

### CI/CD (GitHub Actions)

Environment variables are set in workflow files:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      NODE_ENV: production
    steps:
      - name: Build
        run: bun bake
        env:
          VITE_DOMAIN: ${{ secrets.CUSTOM_DOMAIN }}
```

## Troubleshooting

### Variables Not Working

**Build-time variables not applied:**

- Ensure `.env` file exists in project root
- Variable names _**must**_ start with `VITE_`
- Rebuild application after changing variables

**Runtime variables not working:**

- Check environment variable is exported
- Verify variable name (case-sensitive)
- Check Docker logs for environment values

### Common Issues

**Issue:** Sitemap has wrong domain
**Solution:** Set `VITE_DOMAIN` in `.env` before building

**Issue:** WebSocket connection fails in Docker
**Solution:** Set `DOMAIN` environment variable to match your domain; the client connects back to the page's own origin

## Security Best Practices

1. **Keep secrets out of `.env`** - It is committed with non-secret build defaults
2. **Use strong room passwords** - Set via `--pass`, `ROOM_PASS`, or `ROOM_PASSWORDS`
3. **Pin browser origins on public servers** - Set `ALLOWED_ORIGINS` so foreign pages cannot open websocket sessions from a visitor's browser
4. **Rotate secrets regularly** - Update Docker/CI secrets periodically
5. **Limit token permissions** - Give minimum required permissions
6. **Use environment-specific configs** - Different keys for dev/staging/prod

## Related Documentation

- [Building and Developing](building-and-developing.md) - Build process and configuration
- [Docker](docker.md) - Container deployment and environment setup
- [CI/CD Pipeline](cicd.md) - Workflow configuration and secrets
- [Collaboration Server](collaboration-server.md) - Server configuration options
