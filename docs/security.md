# Security Policy

The makers of the `teXt0wnz` application value your security and privacy. We are committed to maintaining a secure application and full transparency about how your data is handled.

## Supported Versions

The following versions of `text0w.nz` are currently being supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |
| 1.x.x   | :x:                |

## Reporting a Vulnerability

If you discover a flaw in the application (client or server) please submit a new [security advisory](https://github.com/xero/text0wnz/security/advisories/new).

If you do not wish to use GitHub, you can contact the project maintainer directly via [PGP signed email](https://0w.nz/pgp.pub) or [Matrix](https://matrix.to/#/@x0:rx.haunted.computer)

Make sure your advisory includes the following information:

- Detailed explanation of the issue
- software version and commit hash used
- POC exploiting the vulnerability
- Any logs that might be available
- Contact info if you wish to talk outside of github
- If possible, suggested fixes, mitigations, or solutions to the issue

Your advisory will be triaged by our team ASAP. We will undoubtedly contact you for more information.

> **Please Note:** this is an open-source project and we do not award monetary bug bounties. As a thank you, your name will be added to contributors list crediting your work.

## Privacy

You have full control over your data. No personal data is collected or stored unless you voluntarily include it in your artwork’s "[sauce](https://github.com/xero/text0wnz/wiki/sauce-format)" metadata. All data remains on your device and is never unknowingly transferred; only files you explicitly choose to save or export leave your device.

### Cookies and Tracking

We **do not** use cookies, tracking technologies, or similar mechanisms.

### Data Storage and Usage

**Local Storage**: This application uses your device’s local storage to save the following information about your artwork:

- CANVAS_DATA: The raw drawing data for your current artwork.
- FONT_NAME, PALETTE_COLORS, ICE_COLORS, LETTER_SPACING, XBIN_FONT_DATA: Editor font and configuration settings to ensure a consistent experience.

For more information, see our [Privacy Policy](https://github.com/xero/text0wnz/wiki/privacy)

## WebSocket Security (Collaboration Mode)

When using the optional collaboration server, the application implements multiple security measures:

### Client-Side Security

**Worker Isolation**: WebSocket communication runs in a dedicated Web Worker, isolating network operations from the main UI thread.

**Message Origin Guard**: Every postMessage channel validates incoming messages with a shared guard that drops any message claiming a foreign origin or carrying a non-object payload. Unknown worker commands are ignored.

**Trusted URL Construction**: WebSocket URLs default to the worker's own `location` object:

- Protocol automatically matches page protocol (`wss:` for HTTPS, `ws:` for HTTP)
- Hostname matches the page's hostname
- Port uses the page's port or secure defaults (443/80)

An explicit server URL is honored only when you supply one, and only `ws:` or `wss:` URLs are accepted; anything else falls back to the same-origin default.

**URL Validation**: WebSocket construction runs inside try-catch blocks. Malformed URLs are caught and reported as errors without crashing the worker.

**Input Sanitization**: Chat handles, group names, and chat text are sanitized server side:

- Newlines and control characters are stripped
- String length is limited
- Prevents injection attacks via user-supplied strings

**JSON Protection**: Server frames are decoded inside try-catch blocks. Malformed frames are dropped without crashing the application.

**Silent Connection Check**: The application performs a non-intrusive server availability check before prompting users, preventing error dialogs when collaboration is unavailable.

### Server-Side Security

For server-side security best practices, see the [Collaboration Server Security section](https://github.com/xero/text0wnz/wiki/collaboration-server#security-best-practices).

### Threat Model

**Mitigated Threats:**

- **Cross-Origin Message Injection**: Prevented by the shared message origin guard on every postMessage channel [CWE-940]
- **URL Injection**: Prevented by same-origin URL construction and the ws/wss scheme restriction [CWE-918]
- **Malformed Frame Injection**: Prevented by try-catch frame decoding; bad frames drop silently [CWE-20]
- **Chat Injection**: Prevented by server-side sanitization of handles, groups, and messages [CWE-20][CWE-117]

**User Responsibility:**

- Users should only connect to trusted collaboration servers
- HTTPS/WSS is strongly recommended for production use
- Server certificate validation is handled by the browser
