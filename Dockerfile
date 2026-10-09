FROM caddy:2-alpine AS caddy
FROM oven/bun:alpine AS bun
FROM alpine:3.23.4

LABEL org.opencontainers.image.title="text0wnz"
LABEL org.opencontainers.image.description="Retro Text Art Editor for ANSI/ASCII/NFO/XBIN Files Rebooted for the Modern Web"
LABEL org.opencontainers.image.authors="https://github.com/xero/text0wnz/graphs/contributors"
LABEL org.opencontainers.image.documentation="https://github.com/xero/text0wnz/wiki"
LABEL org.opencontainers.image.source="https://github.com/xero/text0wnz"
LABEL org.opencontainers.image.url="https://text.0w.nz"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.created="2026-10-09"
LABEL org.opencontainers.image.version="2.2.1"

# Override me!
ENV DOMAIN="localhost"
ENV PORT=1337
ENV NODE_ENV="production"
ENV XDG_DATA_HOME="/var/lib/caddy"
ENV XDG_CONFIG_HOME="/etc/caddy"

# Install dependencies
RUN apk add --no-cache \
    libstdc++=15.2.0-r2 \
    libgcc=15.2.0-r2 \
    ca-certificates=20260909-r0 \
		gettext=0.24.1-r1 \
		netcat-openbsd=1.234.1-r0

# Grab a caddy & toss in a bun
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

# Put the sources in the oven & bake
WORKDIR /app
COPY . .
RUN rm -f bun.lock package-lock.json
RUN bun i && bun bake
# Take out the bun and let it cool
RUN rm -rf ./node_modules && bun i --production
RUN printf "\n%s\n%s\n" "https://github.com/xero/text0wnz" "https://teXt.0w.nz" >> LICENSE.txt

# Clean up the kitchen
RUN rm -rf \
    .env \
    .git \
    .gitattributes \
    .github \
    .gitignore \
    .prettierignore \
    .prettierrc \
    *.config.js \
    bootup \
    Dockerfile \
    docs \
    OSSMETADATA \
    package*.json \
    README.md \
    tests \
    /var/cache/apk/*

# Create unprivileged user
RUN addgroup -S textart && \
		adduser -S -G textart -h /app textart

# Create directory structure
RUN mkdir -p /etc/caddy /var/log /var/lib/caddy /home/textart/.local/share && \
    chown -R textart:textart /app /var/log /var/lib/caddy /etc/caddy /home/textart && \
    chmod -R 755 /app

# Install startup script
COPY bootup /bootup
RUN chmod +x /bootup && \
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
