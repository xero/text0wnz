# teXt0wnz Documentation

This directory contains comprehensive guides for using, developing, testing, and deploying the **teXt0wnz** editor.

---

## Quick Links

### For Users
- Start here: [Editor Client](editor-client.md)
- Learn the [Editor Interface](interface.md) visually with pictures
- Learn keyboard shortcuts: [Editor Client - Key Bindings](editor-client.md#key-bindings--mouse-controls)
- [PWA Install](docs/install-pwa.md): Installation guide for multiple platforms

### For Developers
- Start here: [Building and Developing](building-and-developing.md)
- Testing: [Testing Guide](testing.md)
- Code quality: [Building and Developing - Linting and Formatting](building-and-developing.md#linting-and-formatting)

### For System Administrators
- Start here: [Webserver Configuration](webserver-configuration.md)
- Collaboration server: [Collaboration Server](collaboration-server.md)
- Containerization: [Docker Containerization](docker.md)
- Monitoring: [Other Tools - Monitoring Tools](other-tools.md#monitoring-tools)

---

## Core Documentation

### Application Guides

- **[Interface](interface.md)** - Visual guide to the user interface and options

- **[Editor Client](editor-client.md)** - Frontend text art editor application
  - Drawing tools and features
  - Keyboard shortcuts and mouse controls
  - Color management and palettes
  - File operations and formats
  - Canvas operations
  - Client-side architecture

- **[Collaboration Server](collaboration-server.md)** - Backend real-time collaboration server
  - Server architecture and features
  - Installation and setup
  - Command-line options
  - WebSocket protocol
  - Session management
  - Process management (systemd, forever)
  - SSL configuration

- **[Architecture](architecture.md)** - System architecture and design
  - High-level overview and application modes
  - Client and server architecture
  - Data flow and module structure
  - Build system and code splitting
  - Storage and persistence strategies
  - Design patterns and performance optimizations

### Development Guides

- **[Building and Developing](building-and-developing.md)** - Development workflow and build process
  - Requirements and quick start
  - Build tools (Vite, PostCSS, Tailwind CSS)
  - Bun/NPM scripts reference
  - Environment variables
  - Development workflow
  - Linting and formatting (ESLint, Prettier)
  - Project structure

- **[Project Structure](project-structure.md)** - Comprehensive file and module organization
  - Directory structure and file organization
  - Client and server module descriptions
  - Configuration files
  - Test structure
  - Build output
  - Naming conventions
  - Module import patterns

- **[Environment Variables](environment-variables.md)** - Configuration and environment setup
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

- **[Webserver Configuration](webserver-configuration.md)** - Webserver setup and configuration
  - Nginx configuration (recommended)
  - Apache configuration
  - Caddy configuration
  - SSL/HTTPS setup with Let's Encrypt
  - Performance optimization
  - Troubleshooting
  - Monitoring

- **[Other Tools](other-tools.md)** - Additional development and deployment tools
  - Development tools (pin-github-action, npm-check-updates)
  - Git tools and hooks
  - Code quality tools
  - Performance tools (Lighthouse CI, bundle analyzer)
  - Deployment tools (serve, PM2, Docker)
  - Monitoring tools (Uptime Kuma, Netdata)
  - Security tools (npm audit, Snyk, Dependabot)
  - Debugging tools

## Technical Specifications

- **[SAUCE Format](sauce-format.md)** - SAUCE metadata format specification
- **[XBin Format](xb-format.md)** - XBin file format specification
- **[Fonts](fonts.md)** - Complete font reference and previews

## Additional Resources

- **[Privacy Policy](privacy.md)** - Privacy policy and data handling
- **[Logos](logos.md)** - ASCII art logos for the project
- **[Pre-commit Hook](pre-commit)** - Git pre-commit hook script
- **[Examples](examples/)** - Sample artwork to view and edit
  - ANSI artwork by [xero](https://16colo.rs/artist/xero)
  - XBin artwork by [hellbeard](https://16colo.rs/artist/hellbeard)


## Docs Directory Structure

```
docs/
├── README.md                      # This file
├── interface.md                   # Visual UI guide
├── editor-client.md               # Frontend application guide
├── collaboration-server.md        # Backend server guide
├── architecture.md                # System architecture
├── project-structure.md           # File and module organization
├── environment-variables.md       # Configuration and environment setup
├── install-pwa.md                 # PWA installation guide
├── building-and-developing.md     # Development workflow
├── testing.md                     # Testing guide
├── cicd.md                        # CI/CD pipeline guide
├── docker.md                      # Docker containerization
├── webserver-configuration.md     # Webserver setup
├── other-tools.md                 # Additional tools
├── sauce-format.md                # SAUCE specification
├── xb-format.md                   # XBin specification
├── fonts.md                       # Font reference
├── privacy.md                     # Privacy policy
├── logos.md                       # ASCII logos
├── pre-commit                     # Git hook
├── preview.png                    # Application preview
└── examples/                      # Sample artwork
    ├── ansi/
    │   ├── x0-defcon25.ans
    │   ├── x0-grandpa-dan.ans
    │   └── x0-outlaw-research.ans
    └── xbin/
        ├── xz-divinestylers.xb
        ├── xz-neuromancer.xb
        └── xz-xero.xb
```

---

## Contributing

When contributing documentation:

1. Follow the existing structure and style
2. Use proper Markdown formatting
3. Include code examples where appropriate
4. Test all commands and configurations
5. Keep documentation up to date with code changes
6. Cross-reference related documents

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/xero/teXt0wnz/issues)
