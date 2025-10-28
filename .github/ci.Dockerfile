FROM oven/bun:debian AS bun
FROM mcr.microsoft.com/playwright:latest

LABEL org.opencontainers.image.title="text0wnz/ci"
LABEL org.opencontainers.image.authors="xero <x@xero.style>"
LABEL org.opencontainers.image.description="cicd toolchain for the text0wnz editor"
LABEL org.opencontainers.image.source="https://github.com/xero/text0wnz"
LABEL org.opencontainers.image.created="2025-10-28"

# Pull the bun outta the oven
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV PATH="/root/.bun/bin:${PATH}"

# Install required packages
RUN apt-get update && apt-get install -y curl unzip

# Dev tools
RUN bun i -g playwright eslint prettier

# Playwright browsers
RUN playwright install-deps && \
		playwright install && \
		playwright install chrome firefox webkit

# Set working directory
WORKDIR /app
# No CMD required for CI containers as all
# commands run are controlled by workflows
