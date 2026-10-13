# Privacy Policy

## Overview

The makers of the [teXt0wnz](https://github.com/xero/teXt0wnz) application value your privacy and are committed to transparency about how your data is handled.

## Data Storage and Usage

### Local Storage

This application uses your device’s browser storage to save the following information:

- **CANVAS_DATA**, **XBIN_FONT_DATA**: The raw drawing data for your current artwork, custom font data, and undo history (IndexedDB).
- **AUTOSAVE_JOURNAL**: A rolling journal of your recent edits, used for crash recovery (origin private file system).
- **FONT_NAME**, **PALETTE_COLORS**, **ICE_COLORS**, **LETTER_SPACING**, **SCALE_FACTOR**: Editor font and configuration settings to ensure a consistent experience (localStorage).
- **FAVORITES**: Font favorites, recent colors, custom character sets, and plugin URLs (localStorage).
- **HANDLE**, **SEND_NOTIFICATION**: Your chat handle and notification preference for collaboration mode (localStorage).
- **APP_CACHE**: The application’s own files, cached for offline use (service worker cache).

No personal data is collected or stored unless you voluntarily include it in your artwork’s "[sauce](sauce-format.md)" metadata. All data remains on your device and is never unknowingly transferred; only files you explicitly choose to save or export leave your device.

### Cookies and Tracking

We do **not** use cookies, tracking technologies, or similar mechanisms.

## In-App Art Archive Browsers

The **File → Browse** menu items connect to third-party art archives. These requests happen only when you use the browsers; nothing contacts these services on launch or in the background.

- **16colo.rs**: pack listings and thumbnails load from `api.16colo.rs` and `16colo.rs`; artwork bytes load from the project's archive mirror on `raw.githubusercontent.com`.
- **aSCIIaRENA**: colly listings, the search index, previews, and artwork load from `asciiarena.se`.

Each request is a standard HTTP fetch, so those services see your IP address and user agent the same way they would if you visited their sites directly. The editor sends nothing else: no identifiers, no artwork, and no settings. Loading a plugin from a URL likewise fetches only the address you typed. Review those services' own policies for how they handle server logs.

## Server-side Collaboration Mode

When you opt into collaboration mode, the server processes the following data to enable real-time collaboration:

- **SESSION_ID**: A numeric id the server assigns to your connection to identify you within the session.
- **HANDLE**: Your chat handle or name. Defaults to "Anonymous" until you change the value.
- **CHAT_HISTORY**: Recent chat messages (handle, group, text, and timestamp), kept so new joiners see the conversation.
- **CANVAS_DATA**: The shared raw drawing data for the collaborative session.
- **FONT_NAME**, **PALETTE_COLORS**, **ICE_COLORS**, **LETTER_SPACING**, **XBIN_FONT_DATA**: Editor font and configuration settings shared for consistent rendering.

**Data Handling Details:**

- The server saves each session to disk so rooms survive restarts, and keeps periodic backups. Saved sessions include the canvas content, recent chat history, and session metadata (title, author, and group); they remain on the server until its operator deletes them.
- By default, no IP addresses or other persistent identifiers are logged.
- You have full control over what information is shared; your chat handle defaults to anonymous, and chat notifications are handled on your device and default to off.

**Important Notice:**
While the default server does not log IP addresses or other persistent identifiers, we cannot control the policies and or modifications of other system administrators running our free software.
Whenever connecting to a collaboration server not operated by us, **assume your IP address and other information may be logged**. Please review the privacy policy of any third-party server you connect to.

## User Control

- You have full control over your data.
- Only files you choose to save or export are transferred from your device.

## Updates

This privacy policy may be updated in the future. Any changes will be reflected here.

## Contact

For questions or concerns about this privacy policy, please contact the current repo maintainer.

| Updated  | Maintainer                     | Change description                        |
| -------- | ------------------------------ | ----------------------------------------- |
| 10.08.25 | [xero](http://github.com/xero) | Initial policy draft                      |
| 10.12.26 | [xero](http://github.com/xero) | Local autosave and server session storage |
| 10.13.26 | [xero](http://github.com/xero) | In-app art archive browser requests       |
