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

Prebuilt images are avalable in **linux/amd64** & **linux/arm64** flavors from multiple repositories:

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

## Running

### Development Mode:

Development mode provides hot-reloading and detailed logging for an optimized development experience:

```sh
docker run \
    --cap-add=NET_BIND_SERVICE \
    -e NODE_ENV=development \
    -p 80:80 \
    text0wnz:latest
```

The application will be available at http://localhost with WebSocket collaboration features enabled.

### Production Mode:

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

| Variable      | Description                              | Default          |
| ------------- | ---------------------------------------- | ---------------- |
| `DOMAIN`      | Domain name for the application          | `localhost`      |
| `PORT`        | _Internal_ port for the WebSocket server | `1337`           |
| `NODE_ENV`    | Node environment setting                 | `production`     |
| `SESSION_KEY` | Session secret key for express           | `supersecretkey` |

## Advanced Usage

### Persistent Storage

For persistent data storage across container restarts:

```sh
docker run \
    --cap-add=NET_BIND_SERVICE \
    -e DOMAIN=your.domain.tld \
    -e NODE_ENV=production \
    -v text0wnz-data:/var/lib/caddy \
    -p 80:80 -p 443:443 \
    xerostyle/text0wnz:latest
```

### Custom Caddy Configuration

For advanced Caddy configurations, you can mount a custom Caddyfile:

```sh
docker run \
    --cap-add=NET_BIND_SERVICE \
    -v ./my-caddyfile:/etc/caddy/Caddyfile:ro \
    -p 80:80 -p 443:443 \
    xerostyle/text0wnz:latest
```

## Health Monitoring

The container includes a health check endpoint at /healthz that returns status information. This endpoint is used by the container's internal health check and can be used by orchestration systems.

---

For more information on Docker and container orchestration, see the [Docker documentation](https://docs.docker.com).
