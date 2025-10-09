# teXt0wnz Documentation

This directory contains comprehensive guides for using, developing, testing, and deploying the **teXt0wnz** editor.

---

## Quick Links

### For Users
- Start here: [Editor Client](editor-client.md)
- Learn keyboard shortcuts: [Editor Client - Key Bindings](editor-client.md#key-bindings--mouse-controls)
- File formats: [Editor Client - File Operations](editor-client.md#file-operations)
- [PWA Install](docs/install-pwa.md): Guide to installing the app on multiple platforms

### For Developers
- Start here: [Building and Developing](building-and-developing.md)
- Testing: [Testing Guide](testing.md)
- Code quality: [Building and Developing - Linting and Formatting](building-and-developing.md#linting-and-formatting)

### For System Administrators
- Start here: [Webserver Configuration](webserver-configuration.md)
- Collaboration server: [Collaboration Server](collaboration-server.md)
- Monitoring: [Other Tools - Monitoring Tools](other-tools.md#monitoring-tools)

---

## Core Documentation

### Application Guides

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

### Development Guides

- **[Building and Developing](building-and-developing.md)** - Development workflow and build process
  - Requirements and quick start
  - Build tools (Vite, PostCSS, Tailwind CSS)
  - NPM scripts reference
  - Environment variables
  - Development workflow
  - Linting and formatting (ESLint, Prettier)
  - Project structure

- **[Testing](testing.md)** - Comprehensive testing guide
  - Testing strategy (Vitest, Testing Library, Playwright)
  - Unit testing with Vitest
  - DOM/component testing with Testing Library
  - End-to-end testing with Playwright
  - Test coverage and metrics
  - Writing tests
  - Troubleshooting

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
- **[Logos](logos.txt)** - ASCII art logos for the project
- **[Pre-commit Hook](pre-commit)** - Git pre-commit hook script
- **[Examples](examples/)** - Sample artwork to view and edit
  - ANSI artwork by [xero](https://16colo.rs/artist/xero)
  - XBin artwork by [hellbeard](https://16colo.rs/artist/hellbeard)


## Docs Directory Structure

```
docs/
├── README.md                      # This file
├── editor-client.md               # Frontend application guide
├── collaboration-server.md        # Backend server guide
├── building-and-developing.md     # Development workflow
├── testing.md                     # Testing guide
├── webserver-configuration.md     # Webserver setup
├── other-tools.md                 # Additional tools
├── sauce-format.md                # SAUCE specification
├── xb-format.md                   # XBin specification
├── fonts.md                       # Font reference
├── privacy.md                     # Privacy policy
├── logos.txt                      # ASCII logos
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
- **Discussions:** [GitHub Discussions](https://github.com/xero/teXt0wnz/discussions)
- **Main README:** [../README.md](../README.md)
