# Docker

**text0wnz** is fully containerized, offering a streamlined deployment experience across different environments and architectures. Our Docker implementation follows industry best practices to ensure security, performance, and ease of use.

## Design Principles

Our containerization approach focuses on several key areas:

### Multi-Stage Build Architecture

We utilize a sophisticated multi-stage build process that:

- Sources the latest secure Caddy binary from the official caddy:2-alpine image
- Obtains the optimized Bun runtime from the official oven/bun:alpine image
- Combines these in a minimal Alpine Linux base for a clean, secure final image

### Security Hardening

The container implements multiple security measures:

- Non-root execution using a dedicated textart user with minimal permissions
- Carefully scoped file system permissions following the principle of least privilege
- Dependency version pinning to prevent supply chain attacks
- No unnecessary packages or development tools in the final image

### Performance Optimization

Several techniques are employed to maximize performance:

- HTTP/2 and TLS support via Caddy for optimized connections
- Efficient WebSocket proxy configuration for real-time collaboration
- Content compression (gzip, zstd) to reduce bandwidth usage
- Appropriate cache headers for static assets

### Service Orchestration

Container services are carefully managed with:

- Proper dependency ordering with readiness checks between components
- Health monitoring to ensure reliability during operation
- Clean shutdown handling with proper signal propagation
- Structured logging for observability

### Registry Support

Prebuilt images are available in **linux/amd64** & **linux/arm64** flavors from multiple repositories:

**[DockerHub](https://hub.docker.com/r/xerostyle/text0wnz):**

```sh
docker pull xerostyle/text0wnz:latest
```

**[GitHub Container Registry](https://github.com/xero/text0wnz/pkgs/container/text0wnz):**

```sh
docker pull ghcr.io/xero/text0wnz:latest
```

## Building Locally

To build the container locally, you'll need [Docker](https://docs.docker.com/get-docker/) with [Buildx](https://docs.docker.com/buildx/working-with-buildx/) support:

```sh
# Standard build for your local architecture
docker buildx build -t text0wnz:latest .

# Multi-architecture build (requires buildx setup)
docker buildx create --name mybuilder --use
docker buildx build --platform linux/amd64,linux/arm64 -t yourname/text0wnz:latest --push .
```

A second image definition, `Dockerfile.distroless`, compiles the server into a single binary on a distroless non-root base. That binary serves the built PWA itself (via `STATIC_DIR`), collab WebSockets, the bridge, and `/healthz`, with no Caddy in the container:

```sh
docker buildx build -f Dockerfile.distroless --platform linux/amd64,linux/arm64 -t text0wnz:distroless .
```

CI builds and publishes only the Caddy image (`Dockerfile`); the registries carry no distroless tag, so build this one yourself. It sets `PORT=1337` and `STATIC_DIR=/app/dist`, exposes `1337`, declares `/app/sessions` as a volume, and runs the binary's own `healthcheck` probe as its health check. Arguments after the image name reach the server as CLI flags (the default is the port, `1337`), so `docker run text0wnz:distroless 1337 --pass hunter2` works. It speaks plain `ws://` and http unless you pass `--ssl`, so put TLS in front of it or inside it.

## Running

### Development Mode:

Development mode serves plain HTTP with no automatic HTTPS, handy for local testing:

```sh
docker run \
    --cap-add=NET_BIND_SERVICE \
    -e NODE_ENV=development \
    -p 80:80 \
    text0wnz:latest
```

The application will be available at http://localhost with WebSocket collaboration features enabled.

### Production Mode:

For production deployments, use this configuration with your domain:

```sh
docker run \
    --cap-add=NET_BIND_SERVICE \
    -e DOMAIN=your.cool.domain.tld \
    -e NODE_ENV=production \
    -p 80:80 -p 443:443 \
    text0wnz:latest
```

This setup enables:

- Automatic HTTPS via Caddy's built-in certificate management
- Production-optimized performance settings
- Stricter security headers and content policies

### Required Capabilities

The container requires `NET_BIND_SERVICE` capability to bind to privileged ports (80/443). For enhanced security, we avoid running as root while still providing standard web server ports.

## Container Lifecycle

The container implements a robust startup sequence:

1. Validates environment variables and generates defaults if needed
2. Starts the Bun backend server for WebSocket collaboration
3. Performs readiness checks to ensure the backend is fully operational
4. Configures and launches Caddy with the appropriate environment settings
5. Sets up health monitoring endpoints and graceful shutdown handlers

## Environment Variables

| Variable           | Description                                                                   | Default               |
| ------------------ | ----------------------------------------------------------------------------- | --------------------- |
| `DOMAIN`           | Domain name for the application                                               | `localhost`           |
| `PORT`             | _Internal_ port for the WebSocket server                                      | `1337`                |
| `NODE_ENV`         | Node environment setting                                                      | `production`          |
| `ROOM_PASS`        | Password for collaboration rooms (gates spectators too)                       | none                  |
| `ROOM_PASSWORDS`   | Per-room passwords as JSON: `{"room":"pw"}`                                   | none                  |
| `BRIDGE`           | Bridge mode for plaintext desktop servers: `off`, `local`, `port`, or `allow` | `off`                 |
| `BRIDGE_PORT`      | The one port `port` mode dials                                                | `8000`                |
| `BRIDGE_TARGET`    | The fixed target `local` mode dials                                           | `ws://127.0.0.1:8000` |
| `BRIDGE_ALLOW`     | Comma-separated `host:port` list for `allow` mode                             | none                  |
| `BRIDGE_MAX`       | Concurrent bridged connections                                                | `16`                  |
| `ALLOWED_ORIGINS`  | Comma-separated Origin allowlist for websocket upgrades                       | none (open)           |
| `TRUST_PROXY`      | Proxies beyond loopback whose `X-Real-IP` names the client                    | none (loopback only)  |
| `ROOM_MAX_COLUMNS` | Canvas resize wall, columns                                                   | `1000`                |
| `ROOM_MAX_ROWS`    | Canvas resize wall, rows                                                      | `10000`               |

The startup script hands its whole environment to the server, so every server variable in [environment-variables.md](./environment-variables.md) works here; the table lists the ones most deployments set.

Both images forward `/bridge*` to the server, so setting `BRIDGE=port` is all an https deployment needs for its visitors to reach plaintext Moebius servers. Enabling it turns the host into a relay from its own address and switches on an audit line per bridged connection; read the [bridge section of the environment variables guide](./environment-variables.md#bridge) first.

## Advanced Usage

### Persistent Storage

For persistent data storage across container restarts, mount `/var/lib/caddy` (Caddy data, including certificates) and `/app/sessions` (collaboration session files):

```sh
docker run \
    --cap-add=NET_BIND_SERVICE \
    -e DOMAIN=your.domain.tld \
    -e NODE_ENV=production \
    -v text0wnz-data:/var/lib/caddy \
    -v text0wnz-sessions:/app/sessions \
    -p 80:80 -p 443:443 \
    xerostyle/text0wnz:latest
```

### Custom Caddy Configuration

The image ships no Caddyfile; the boot script writes one from the environment at start. Mount your own at the same path and the script leaves it alone, validates it, and runs Caddy on it:

```sh
docker run \
    --cap-add=NET_BIND_SERVICE \
    -v ./my-caddyfile:/etc/caddy/Caddyfile:ro \
    -p 80:80 -p 443:443 \
    xerostyle/text0wnz:latest
```

Your file replaces the generated one entirely, so it has to do everything that one does: serve `/app/dist`, reverse proxy `/server*` and `/bridge*` to `127.0.0.1:1337` (the backend's `PORT`) with the path intact, and listen on port 80, which the container health check probes. The generated file inside [`bootup`](https://github.com/xero/text0wnz/blob/main/bootup) is the template to start from. `DOMAIN`, `NODE_ENV`, and the TLS settings shape only the generated file and have no effect on a mounted one. Mount it read-only; the script never writes to it, and a stray edit cannot reach your source.

## Health Monitoring

The Caddy image's built-in health check probes TCP port 80 with `nc`. The `/healthz` that Caddy serves on ports 80 and 443 is a static stub the boot script writes, `{"status":"ok","version":"1.0.0"}`, because Caddy proxies only `/server*` and `/bridge*`; the server's own `/healthz`, which answers `{"ok":true,"rooms":N,"uptime":S}`, listens on the internal `PORT` only. The distroless image has no Caddy, so its `/healthz` is the server's, and its health check is the binary probing that endpoint.

---

For more information on Docker and container orchestration, see the [Docker documentation](https://docs.docker.com).
