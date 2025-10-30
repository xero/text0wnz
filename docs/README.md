# teXt0wnz Documentation

This directory contains comprehensive guides for using, developing, testing, and deploying the **teXt0wnz** editor.

## Quick Links

### For Users / Artists

- Start here: [Editor Client](editorClient.md)
- Learn the [Editor Interface](interface.md) visually with pictures
- Learn keyboard shortcuts: [Editor Client - Key Bindings](editorClient.md#key-bindings--mouse-controls)
- [PWA Install](docs/installPwa.md): Installation guide for multiple platforms
- [Fonts](fonts.md) - Complete font reference and previews

### For Developers

- Start here: [Building and Developing](buildingAndDeveloping.md)
- Testing: [Testing Guide](testing.md)
- Code quality: [Building and Developing - Linting and Formatting](buildingAndDeveloping.md#linting-and-formatting)

### For System Administrators

- Start here: [Webserver Configuration](webserverConfiguration.md)
- Collaboration server: [Collaboration Server](collaborationServer.md)
- Containerization: [Docker Containerization](docker.md)
- Monitoring: [Other Tools - Monitoring Tools](otherTools.md#monitoring-tools)

## Core Documentation

### Application Guides

- **[Interface](interface.md)** - Visual guide to the user interface and options

- **[Architecture](architecture.md)** - System architecture and design
  - High-level overview and application modes
  - Client and server architecture
  - Data flow and module structure
  - Build system and code splitting
  - Storage and persistence strategies
  - Design patterns and performance optimizations

- **[Editor Client](editorClient.md)** - Frontend text art editor application
  - Drawing tools and features
  - Keyboard shortcuts and mouse controls
  - Color management and palettes
  - File operations and formats
  - Canvas operations
  - Client-side architecture

- **[Collaboration Server](collaborationServer.md)** - Backend real-time collaboration server
  - Server architecture and features
  - Installation and setup
  - Command-line options
  - WebSocket protocol
  - Session management
  - Process management (systemd, forever)
  - SSL configuration

### Development Guides

- **[Project Structure](projectStructure.md)** - Comprehensive file and module organization
  - Directory structure and file organization
  - Client and server module descriptions
  - Configuration files
  - Test structure
  - Build output
  - Naming conventions
  - Module import patterns

- **[Building and Developing](buildingAndDeveloping.md)** - Development workflow and build process
  - Requirements and quick start
  - Build tools (Vite, PostCSS, Tailwind CSS)
  - Bun/NPM scripts reference
  - Environment variables
  - Development workflow
  - Linting and formatting (ESLint, Prettier)
  - Project structure

- **[Environment Variables](environmentVariables.md)** - Configuration and environment setup
  - Build-time variables (Vite)
  - Runtime variables (Server)
  - CI/CD secrets (GitHub Actions)
  - Docker environment configuration
  - Security best practices

- **[Testing](testing.md)** - Comprehensive testing guide
  - Testing strategy (Vitest, Testing Library, Playwright)
  - Unit testing with Vitest
  - DOM/component testing with Testing Library
  - End-to-end testing with Playwright
  - Test coverage and metrics
  - Writing tests
  - Troubleshooting

- **[CI/CD Pipeline](cicd.md)** - Continuous integration and deployment
  - Workflow architecture and orchestration
  - Core workflows (lint, build, test, deploy)
  - Docker image builds and registry
  - Documentation synchronization
  - Artifacts and reports
  - Security and permissions
  - Monitoring and debugging

### Deployment Guides

- **[Webserver Configuration](webserverConfiguration.md)** - Webserver setup and configuration
  - Nginx configuration (recommended)
  - Apache configuration
  - Caddy configuration
  - SSL/HTTPS setup with Let's Encrypt
  - Performance optimization
  - Troubleshooting
  - Monitoring

- **[Other Tools](otherTools.md)** - Additional development and deployment tools
  - Development tools (pin-github-action, npm-check-updates)
  - Git tools and hooks
  - Code quality tools
  - Performance tools (Lighthouse CI, bundle analyzer)
  - Deployment tools (serve, PM2, Docker)
  - Monitoring tools (Uptime Kuma, Netdata)
  - Security tools (npm audit, Snyk, Dependabot)
  - Debugging tools

## Technical Specifications

- **[SAUCE Format](sauceFormat.md)** - SAUCE metadata format specification
- **[XBin Format](xbFormat.md)** - XBin file format specification

### Policies

- **[Security Policy](security.md)** - Security policy and vulnerability reporting
- **[Privacy Policy](privacy.md)** - Privacy policy and data handling
- **[Contributing Guide](contributing.md)** - Resources for working on the project
- **[Code of Conduct](codeOfConduct.md)** - {Una,A}cceptable behaviour for the project

### Supplemental

- **[Logos](logos.md)** - ASCII art logos for the project
- **[Pre-commit Hook](pre-commit)** - Git pre-commit hook script
- **[Examples](https://github.com/xero/text0wnz/tree/main/docs/examples)** - Sample artwork to view and edit
  - ANSI artwork by [xero](https://16colo.rs/artist/xero) (alias: x0^67^aMi5H^iMP!)
  - XBin artwork by [hellbeard](https://16colo.rs/artist/hellbeard) (alias: xz^dS^iMPuRe!)

## Contributing

When contributing documentation:

1. Follow the existing structure and style
2. Use proper Markdown formatting
3. Include code examples where appropriate
4. Test all commands and configurations
5. Keep documentation up to date with code changes
6. Cross-reference related documents

See: [Contributing](contributing) for more details

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/xero/teXt0wnz/issues)
