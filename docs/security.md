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

## Share Target

The installed app takes files from the OS share sheet as a POST to `/open`. The service worker caches the file and hands it to every open editor tab, which opens it in place of the current canvas. Any web page can submit a form to that address, so the worker accepts only a POST it can trace back to the app:

- **The worker checks `Origin`, not `Sec-Fetch-Site`.** Browsers attach `Sec-Fetch-Site` after the service worker has handled a request, so the worker never sees it. Chromium sets `Origin` on a POST navigation before the worker runs.
- **Only the app's own origin passes.** Chrome 156 and later attribute a share sheet POST to the app, so it carries the app's origin. A form on another site carries that site's origin, or `null` when the page hides it. The worker turns away both, and any POST with no `Origin` at all, by redirecting to the editor without touching the open tabs.
- **Older browsers cannot share into the PWA.** Chrome releases before 156, like any browser whose share code does not attribute the POST to the app, send it as `Origin: null`, which the worker cannot tell apart from a hostile page hiding its origin. A browser that never shows the worker an `Origin` is turned away too. Those shares open the editor without the file; File → Open still works.

This prevents cross-site request forgery into open tabs [CWE-352].

## WebSocket Security (Collaboration Mode)

When using the optional collaboration server, the application implements multiple security measures:

### Client-Side Security

**Worker Isolation**: WebSocket communication runs in a dedicated Web Worker, isolating network operations from the main UI thread.

**Message Origin Guard**: Every postMessage channel validates incoming messages with a shared guard that drops any message claiming a foreign origin or carrying a non-object payload. Unknown worker commands are ignored.

**Server Selection**: With no server named, the client dials its own origin: `wss:` on HTTPS pages and `ws:` otherwise, the page's own host, and the `/server` path. The Connect form accepts a server as `host[:port][/room]` or as a full `ws://` or `wss://` URL, and nothing else; any other scheme is rejected before a socket is opened. A `?server=` query parameter prefills the same form.

**Mixed Content and the Bridge**: A page served over HTTPS cannot open a plaintext `ws://` socket; the browser enforces that, not the editor. For a plaintext target, the client dials its own host's `/bridge` endpoint over `wss:` and lets the server relay. The target travels as a query string the server validates. In `port` and `allow` modes the server never dials anything the client did not name; in `local` mode it dials only its one configured target, whatever the client asked for. A host with the bridge off refuses, which the form reports.

**URL Validation**: WebSocket construction runs inside try-catch blocks. Malformed URLs are caught and reported as errors without crashing the worker.

**Input Sanitization**: Chat handles, group names, and chat text are sanitized server side:

- Newlines and control characters are stripped
- String length is limited
- Prevents injection attacks via user-supplied strings

**JSON Protection**: Server frames are decoded inside try-catch blocks. Malformed frames are dropped without crashing the application.

**Silent Connection Check**: The application performs a non-intrusive server availability check before prompting users, preventing error dialogs when collaboration is unavailable. The check dials direct only. A target that would need the host's bridge gets no probe and no launch invitation, so the Connect form is the one path that opens a bridged connection, and nothing dials out on a visitor's behalf before they ask.

### Server-Side Security

For server-side hardening, see the [Limits and Hardening section](https://github.com/xero/text0wnz/wiki/collaboration-server#limits-and-hardening) of the server guide.

### The Collaboration Bridge

The server can relay a browser's socket to a plaintext Moebius server (the `BRIDGE` setting, off by default). The relay dials from the server's own address, so the server treats it as the most exposed thing it does:

- **The destination is scoped by mode, never by the client alone.** `local` dials one fixed target. `port` lets the client name a host but pins the port, resolves the name, refuses private, loopback, link-local, multicast, reserved, and cloud metadata addresses, and dials the resolved address, so DNS rebinding gains nothing. `allow` admits only a listed set of `host:port` pairs and dials each by name as listed, so a private entry is the operator's informed consent and a listed name is trusted to keep resolving where it does today.
- **Every request is logged with the requester's address while the bridge is on.** See the [Privacy Policy](https://github.com/xero/text0wnz/wiki/privacy). Refusals reach the caller as a bare `403` with no reason (a full bridge answers `503`, and a request with no websocket handshake gets `426` before anything resolves), so the endpoint cannot be used to read the host's DNS.
- **Every pipe is bounded.** A connection cap, a delivery bound in both directions (a side that stops taking delivery, or leaves more than two maximum frames, 64 MB, unconfirmed, closes the pipe), an idle reaper, and timeouts on the dial and the lookup.
- **The Origin allowlist gates the bridge** exactly as it gates room upgrades.
- **Traffic past the bridge is plaintext to the destination**, passwords included, because that is what Moebius servers speak. The bridge changes who the destination sees (the bridge host), not what it sees.

A public host in `port` mode is a relay from its own address to any public websocket server on one port, by design. Read the [Environment Variables](https://github.com/xero/text0wnz/wiki/environment-variables#bridge) guide before enabling it.

### Threat Model

**Mitigated Threats:**

- **Cross-Origin Message Injection**: Prevented by the shared message origin guard on every postMessage channel [CWE-940]
- **URL Injection**: Prevented by same-origin URL construction and the ws/wss scheme restriction [CWE-918]
- **Malformed Frame Injection**: Prevented by try-catch frame decoding; bad frames drop silently [CWE-20]
- **Chat Injection**: Prevented by server-side sanitization of handles, groups, and messages [CWE-20][CWE-117]
- **Server-Side Request Forgery via the bridge**: Prevented by mode-scoped destinations, resolve-then-vet address denial and dial-by-resolved-address in `port` mode, operator-listed targets in `allow` mode, and reason-free refusals [CWE-918]
- **Relay abuse via the bridge**: Reduced by the Origin allowlist, connection and buffer bounds, and per-connection logging of the requester; a public `port`-mode host remains a relay by design [CWE-441]

**User Responsibility:**

- Users should only connect to trusted collaboration servers
- HTTPS/WSS is strongly recommended for production use
- Server certificate validation is handled by the browser
- Connecting through a host's bridge means that host logs the address you connect from, and the destination sees the host's address instead of yours
