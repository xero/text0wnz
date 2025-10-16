FROM mcr.microsoft.com/playwright:latest
# Install required packages
RUN apt-get update && apt-get install -y curl unzip
# Install and setup Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"
# Install tools
RUN bun i -g playwright eslint prettier
# Pre-install Playwright browsers
RUN playwright install-deps && \
		playwright install && \
		playwright install chrome firefox webkit
# Set working directory
WORKDIR /app
# No CMD required for CI containers as all
# commands run are controlled by workflows
