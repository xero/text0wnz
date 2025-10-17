FROM caddy:2-alpine AS caddy
FROM oven/bun:alpine AS bun
FROM alpine:3.22.2
## Building the Application
# docker buildx build -t text0wnz:latest .
#
## Running in Development Mode:
# docker run \
#		 --cap-add=NET_BIND_SERVICE \
#		 -e NODE_ENV=development \
#		 -p 80:80 \
#		 text0wnz:latest
#
## Running in Production Mode:
# docker run \
#		 --cap-add=NET_BIND_SERVICE \
#		 -e DOMAIN=your.cool.domain.tld \
#		 -e SESSION_KEY=secure-production-key \
#		 -e NODE_ENV=production \
#		 -p 80:80 -p 443:443 \
#		 text0wnz:latest

LABEL org.opencontainers.image.title="text0wnz"
LABEL org.opencontainers.image.authors="xero <x@xero.style>"
LABEL org.opencontainers.image.description="Text-mode art editor for ANSI, ASCII, XBIN, NFO, & TXT files"
LABEL org.opencontainers.image.source="https://github.com/xero/text0wnz"
LABEL org.opencontainers.image.created="2025-10-17"

ENV DOMAIN="localhost"
ENV PORT=1337
ENV NODE_ENV="production"
ENV XDG_DATA_HOME="/var/lib/caddy"
ENV XDG_CONFIG_HOME="/etc/caddy"

# Install dependencies
RUN apk add --no-cache \
    libstdc++=14.2.0-r6 \
    libgcc=14.2.0-r6 \
    ca-certificates \
		gettext=0.24.1-r0 \
		netcat-openbsd=1.229.1-r0

# Grab a caddy & toss in a bun
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

# Put the sources in the oven & bake
WORKDIR /app
COPY . .
RUN bun i && bun bake

# Cleanup
RUN rm -rf \
    .env \
    .git \
    .gitattributes \
    .github \
    .gitignore \
    .prettierignore \
    .prettierrc \
    *.config.js \
    bun.lock \
    Dockerfile \
    openrcDockerfile \
    docs \
    node_modules \
    LICENSE.txt \
    OSSMETADATA \
    package*.json \
    README.md \
    tests \
    /var/cache/apk/*

# Create unprivileged user
RUN addgroup -S textart && \
		adduser -S -G textart -h /app textart

# Create directory structure for our user
RUN mkdir -p /etc/caddy /var/log /var/lib/caddy /home/textart/.local/share && \
    chown -R textart:textart /app /var/log /var/lib/caddy /etc/caddy /home/textart && \
    chmod -R 755 /app

# Create startup script
RUN echo '#!/bin/sh' > /bootup && \
    echo 'set -e' >> /bootup && \
		echo 'CI=x0 sh /app/banner' >> /bootup && \
    echo '# Validate required environment variables' >> /bootup && \
    echo 'if [ -z "$SESSION_KEY" ]; then' >> /bootup && \
    echo '    echo "[$(date)] SESSION_KEY not provided, generating one..."' >> /bootup && \
    echo '    if [ -e /dev/urandom ]; then' >> /bootup && \
    echo '        SESSION_KEY=$(tr -dc "a-z0-9" < /dev/urandom | head -c 20)' >> /bootup && \
    echo '        echo "[$(date)] Generated SESSION_KEY"' >> /bootup && \
    echo '    else' >> /bootup && \
    echo '        echo "[$(date)] ERROR: Cannot generate secure SESSION_KEY, /dev/urandom not available"' >> /bootup && \
    echo '        exit 1' >> /bootup && \
    echo '    fi' >> /bootup && \
    echo 'fi' >> /bootup && \
    echo 'echo "[$(date)] Starting text0wnz at: $DOMAIN on port $PORT (Environment: $NODE_ENV)"' >> /bootup && \
    echo '' >> /bootup && \
    echo '# Create log directory' >> /bootup && \
    echo 'mkdir -p /var/log' >> /bootup && \
    echo '' >> /bootup && \
    echo '# Start the application server in background' >> /bootup && \
    echo 'echo "[$(date)] Starting text0wnz backend server"' >> /bootup && \
    echo 'bun /app/src/js/server/main.js "$PORT" > /var/log/text0wnz.log 2>&1 &' >> /bootup && \
    echo 'BACKEND_PID=$!' >> /bootup && \
    echo '' >> /bootup && \
    echo '# Wait briefly to ensure backend starts' >> /bootup && \
    echo 'sleep 2' >> /bootup && \
    echo 'if ! kill -0 $BACKEND_PID 2> /dev/null; then' >> /bootup && \
    echo '	echo "[$(date)] ERROR: Backend server failed to start!"' >> /bootup && \
    echo '	cat /var/log/text0wnz.log' >> /bootup && \
    echo '	exit 1' >> /bootup && \
    echo 'fi' >> /bootup && \
    echo 'echo "[$(date)] Backend server started with PID: $BACKEND_PID"' >> /bootup && \
    echo '' >> /bootup && \
    echo '# Wait for WebSocket server to be fully ready' >> /bootup && \
    echo 'printf "%s %s" "[$(date)]" "Waiting for WebSocket server to accept connections..."' >> /bootup && \
    echo 'RETRY=0' >> /bootup && \
    echo 'MAX_RETRIES=30' >> /bootup && \
    echo 'while ! nc -z 127.0.0.1 $PORT && [ $RETRY -lt $MAX_RETRIES ]; do' >> /bootup && \
    echo '  sleep 1' >> /bootup && \
    echo '  RETRY=$((RETRY+1))' >> /bootup && \
    echo '  printf "%s" "."' >> /bootup && \
    echo 'done' >> /bootup && \
    echo 'if [ $RETRY -eq $MAX_RETRIES ]; then' >> /bootup && \
    echo '  echo "[$(date)] ERROR: WebSocket server failed to start in time"' >> /bootup && \
    echo '  exit 1' >> /bootup && \
    echo 'fi' >> /bootup && \
    echo 'echo "[$(date)] WebSocket server is ready to accept connections"' >> /bootup && \
    echo '' >> /bootup && \
    echo '# Generate appropriate Caddyfile based on environment' >> /bootup && \
    echo 'if [ "$NODE_ENV" = "production" ]; then' >> /bootup && \
    echo '	echo "[$(date)] Configuring Caddy in production mode"' >> /bootup && \
    echo '	cat > /etc/caddy/Caddyfile << EOF' >> /bootup && \
    echo '{' >> /bootup && \
    echo '	admin off' >> /bootup && \
    echo '	log {' >> /bootup && \
    echo '		level ERROR' >> /bootup && \
    echo '	}' >> /bootup && \
    echo '}' >> /bootup && \
    echo '' >> /bootup && \
    echo '$DOMAIN {' >> /bootup && \
    echo '	root * /app/dist' >> /bootup && \
    echo '	file_server' >> /bootup && \
    echo '	' >> /bootup && \
    echo '	# WebSocket Handler' >> /bootup && \
    echo '	handle /server* {' >> /bootup && \
		echo '		reverse_proxy 127.0.0.1:$PORT {' >> /bootup && \
		echo '			header_up Host {host}' >> /bootup && \
		echo '			header_up X-Real-IP {remote}' >> /bootup && \
		echo '			header_up Connection {http.request.header.Connection}' >> /bootup && \
		echo '			header_up Upgrade {http.request.header.Upgrade}' >> /bootup && \
		echo '		}' >> /bootup && \
    echo '	}' >> /bootup && \
    echo '	' >> /bootup && \
    echo '	# Regular files' >> /bootup && \
    echo '	handle {' >> /bootup && \
    echo '		try_files {path} /index.html' >> /bootup && \
    echo '	}' >> /bootup && \
    echo '	' >> /bootup && \
    echo '	# Performance optimizations' >> /bootup && \
    echo '	encode gzip zstd' >> /bootup && \
    echo '	' >> /bootup && \
    echo '	# Security headers' >> /bootup && \
    echo '	header {' >> /bootup && \
    echo '		Strict-Transport-Security "max-age=31536000; includeSubDomains"' >> /bootup && \
    echo '		X-Frame-Options "SAMEORIGIN"' >> /bootup && \
    echo '		X-Content-Type-Options "nosniff"' >> /bootup && \
    echo '		Referrer-Policy "same-origin"' >> /bootup && \
		echo '		Content-Security-Policy "default-src '"'"'self'"'"'; connect-src '"'"'self'"'"' ws: wss:; script-src '"'"'self'"'"' '"'"'unsafe-inline'"'"'; style-src '"'"'self'"'"' '"'"'unsafe-inline'"'"'; img-src '"'"'self'"'"' blob: data:;"' >> /bootup && \
    echo '	}' >> /bootup && \
    echo '	' >> /bootup && \
    echo '	# Cache static assets' >> /bootup && \
    echo '	@static {' >> /bootup && \
    echo '		path *.js *.css *.png *.jpg *.jpeg *.gif *.ico *.svg *.woff2' >> /bootup && \
    echo '	}' >> /bootup && \
    echo '	header @static Cache-Control "public, max-age=31536000, immutable"' >> /bootup && \
    echo '}' >> /bootup && \
    echo 'EOF' >> /bootup && \
    echo 'else' >> /bootup && \
    echo '	echo "[$(date)] Configuring Caddy in development mode"' >> /bootup && \
    echo '	cat > /etc/caddy/Caddyfile << EOF' >> /bootup && \
    echo '{' >> /bootup && \
    echo '	admin off' >> /bootup && \
    echo '	auto_https off' >> /bootup && \
    echo '	http_port 80' >> /bootup && \
    echo '	log {' >> /bootup && \
    echo '		level ERROR' >> /bootup && \
    echo '	}' >> /bootup && \
    echo '}' >> /bootup && \
    echo '' >> /bootup && \
    echo 'http://$DOMAIN {' >> /bootup && \
    echo '	root * /app/dist' >> /bootup && \
    echo '	file_server' >> /bootup && \
    echo '	' >> /bootup && \
    echo '	# WebSocket Handler' >> /bootup && \
    echo '	handle /server* {' >> /bootup && \
		echo '		reverse_proxy 127.0.0.1:$PORT {' >> /bootup && \
		echo '			header_up Host {host}' >> /bootup && \
		echo '			header_up X-Real-IP {remote}' >> /bootup && \
		echo '			header_up Connection {http.request.header.Connection}' >> /bootup && \
		echo '			header_up Upgrade {http.request.header.Upgrade}' >> /bootup && \
		echo '		}' >> /bootup && \
    echo '	}' >> /bootup && \
    echo '	' >> /bootup && \
    echo '	# Regular files' >> /bootup && \
    echo '	handle {' >> /bootup && \
    echo '		try_files {path} /index.html' >> /bootup && \
    echo '	}' >> /bootup && \
    echo '	' >> /bootup && \
    echo '	# Performance optimizations' >> /bootup && \
    echo '	encode gzip zstd' >> /bootup && \
    echo '	' >> /bootup && \
    echo '	# Security headers' >> /bootup && \
    echo '	header {' >> /bootup && \
    echo '		X-Frame-Options "SAMEORIGIN"' >> /bootup && \
    echo '		X-Content-Type-Options "nosniff"' >> /bootup && \
    echo '		Referrer-Policy "same-origin"' >> /bootup && \
		echo '		Content-Security-Policy "default-src '"'"'self'"'"'; connect-src '"'"'self'"'"' ws: wss:; script-src '"'"'self'"'"' '"'"'unsafe-inline'"'"'; style-src '"'"'self'"'"' '"'"'unsafe-inline'"'"'; img-src '"'"'self'"'"' blob: data:;"' >> /bootup && \
    echo '	}' >> /bootup && \
    echo '	' >> /bootup && \
    echo '	# Cache static assets' >> /bootup && \
    echo '	@static {' >> /bootup && \
    echo '		path *.js *.css *.png *.jpg *.jpeg *.gif *.ico *.svg *.woff2' >> /bootup && \
    echo '	}' >> /bootup && \
    echo '	header @static Cache-Control "public, max-age=31536000, immutable"' >> /bootup && \
    echo '}' >> /bootup && \
    echo 'EOF' >> /bootup && \
    echo 'fi' >> /bootup && \
    echo '' >> /bootup && \
    echo '# Create health and metrics endpoint' >> /bootup && \
    echo 'mkdir -p /app/dist/healthz' >> /bootup && \
    echo 'echo '"'"'{"status":"ok","version":"1.0.0"}'"'"' > /app/dist/healthz/index.json' >> /bootup && \
    echo '' >> /bootup && \
    echo '# Start Caddy' >> /bootup && \
    echo 'echo "[$(date)] Starting Caddy web server"' >> /bootup && \
    echo 'caddy fmt --overwrite /etc/caddy/Caddyfile' >> /bootup && \
    echo 'caddy run --config /etc/caddy/Caddyfile &' >> /bootup && \
    echo 'CADDY_PID=$!' >> /bootup && \
    echo '' >> /bootup && \
    echo '# Wait briefly to ensure Caddy starts' >> /bootup && \
    echo 'sleep 2' >> /bootup && \
    echo 'if ! kill -0 $CADDY_PID 2> /dev/null; then' >> /bootup && \
    echo '	echo "[$(date)] ERROR: Caddy failed to start!"' >> /bootup && \
    echo '	exit 1' >> /bootup && \
    echo 'fi' >> /bootup && \
    echo '' >> /bootup && \
    echo '# Keep container running' >> /bootup && \
    echo 'echo "[$(date)] Server is running at: $DOMAIN"' >> /bootup && \
    echo 'trap '"'"'echo "[$(date)] Shutting down..."; kill $BACKEND_PID; kill $CADDY_PID; exit 0'"'"' TERM INT QUIT' >> /bootup && \
    echo 'wait $CADDY_PID' >> /bootup && \
    chmod +x /bootup && \
    chown textart:textart /bootup

# Open ports
EXPOSE 80 443

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD nc -z localhost 80 || exit 1

# Switch to non-root user
USER textart

# Start drawing!
CMD ["/bootup"]
