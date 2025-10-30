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

### VITE_WORKER_FILE

**Default:** `websocket.js`

**Purpose:** Sets the filename for the WebSocket worker.

**Usage:**

```bash
VITE_WORKER_FILE='worker.js'
```

**Note:** This file is not hashed for cache-busting to allow service worker caching.

### VITE_FONT_DIR

**Default:** `fonts/`

**Purpose:** Sets the directory name for bitmap font assets.

**Usage:**

```bash
VITE_FONT_DIR='bitmapfonts/'
```

**Note:** Not used in vite.config.js but used in the frontend client application. See `/src/js/client/state.js#L89`

## Runtime Variables (Server)

These variables are used when running the collaboration server.

### PORT

**Default:** `1337`

**Purpose:** Sets the port for the WebSocket collaboration server.

**Usage:**

```bash
# Command line
bun server 8060

# Environment variable
PORT=8060 bun server

# Docker
docker run -e PORT=8060 text0wnz:latest
```

### NODE_ENV

**Default:** `production`

**Purpose:** Sets the Node.js environment mode.

**Values:**

- `production` - Production mode with optimizations
- `development` - Development mode with verbose logging

**Usage:**

```bash
NODE_ENV=development bun server

# Docker
docker run -e NODE_ENV=development text0wnz:latest
```

**Effects:**

- Logging verbosity
- Error messages
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

### SESSION_KEY

**Default:** `supersecretkey` (auto-generated in Docker if not provided)

**Purpose:** Secret key for express-session middleware.

**Usage:**

```bash
# Docker
KEY=$(openssl rand -base64 32)
docker run -e SESSION_KEY=$KEY text0wnz:latest
```

**Security:**

- Should be a long random string in production
- Used for session cookie signing
- Auto-generated via urandom in Docker if not provided

```bash
SESSION_KEY=$(tr -dc 'a-z0-9' </dev/urandom | head -c 20)
```

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
VITE_WORKER_FILE='websocket.js'

# Server configuration (optional, can use CLI args instead)
PORT=1337
NODE_ENV=production
```

**Note:** The `.env` file is gitignored. Manually run: `git add .env ` to track changes as needed.

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
  -e SESSION_KEY=your-secret-key \
  text0wnz:latest
```

**Option 2: --env-file**

```bash
# Create docker.env file
cat > docker.env << EOF
DOMAIN=your.domain.com
NODE_ENV=production
SESSION_KEY=your-secret-key
EOF

# Run with env file
docker run --env-file docker.env text0wnz:latest
```

**Option 3: docker-compose.yml**

```yaml
version: '3.8'
services:
  text0wnz:
    image: text0wnz:latest
    environment:
      - DOMAIN=your.cool.tld
      - NODE_ENV=production
      - SESSION_KEY=your-secret-key
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
**Solution:** Set `DOMAIN` environment variable to match your domain
**Note:** The default for no domain or port set is `ws://localhost:1337`

**Issue:** Session errors in Docker
**Solution:** Set `SESSION_KEY` to a secure random value in your docker run command

## Security Best Practices

1. **Never commit `.env` file** - It's gitignored for security
2. **Use strong SESSION_KEY** - Generate with: `openssl rand -base64 32`
3. **Rotate secrets regularly** - Update Docker/CI secrets periodically
4. **Limit token permissions** - Give minimum required permissions
5. **Use environment-specific configs** - Different keys for dev/staging/prod

## Related Documentation

- [Building and Developing](buildingAndDeveloping.md) - Build process and configuration
- [Docker](docker.md) - Container deployment and environment setup
- [CI/CD Pipeline](cicd.md) - Workflow configuration and secrets
- [Collaboration Server](collaborationServer.md) - Server configuration options
