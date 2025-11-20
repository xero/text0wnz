FROM oven/bun:debian AS bun
FROM mcr.microsoft.com/playwright:latest

LABEL org.opencontainers.image.title="text0wnz/ci"
LABEL org.opencontainers.image.description="cicd unit testing toolchain for the text0wnz editor"
LABEL org.opencontainers.image.authors="https://github.com/xero/text0wnz/graphs/contributors"
LABEL org.opencontainers.image.documentation="https://github.com/xero/text0wnz/wiki"
LABEL org.opencontainers.image.url="https://github.com/xero/text0wnz/actions"
LABEL org.opencontainers.image.source="https://github.com/xero/text0wnz"
LABEL org.opencontainers.image.licenses="MIT"
-11-20"

# Pull the bun outta the oven
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV PATH="/root/.bun/bin:${PATH}"

# Install dependencies
RUN apt-get update && apt-get install -y curl unzip

# Testing tools
RUN bun i -g playwright eslint prettier

# Playwright browsers
RUN playwright install-deps && \
		playwright install && \
		playwright install chrome firefox webkit

# Set working directory
WORKDIR /app

# No CMD required for CI containers as all
# commands run are controlled by workflows
