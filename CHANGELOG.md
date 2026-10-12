# Changelog

> [!NOTE]
> All notable changes to teXt0wnz. The log starts with v3; earlier
> releases predate it.

---

## 3.0.0 - unreleased

The GRIDFIRE rewrite. The editor core is new TypeScript around a
three-plane document model, with v2 rendering behavior pinned by
byte-exact golden tests before anything else moved.

### Added

- **Animation.** A frame timeline with add, duplicate, delete, per-frame
  delays, and playback. Onion skinning shows the previous frame under
  your blanks, and a baud-rate preview replays the reveal at classic
  modem speeds. Exports to ansimation `.ans` and `.dur` v8.
- **Unicode and truecolor.** Documents hold full UTF-8 text, xterm-256
  indexes, and RGB colors. A new color panel sits one click past the
  classic 16, and custom hex fonts load with a charset picker.
- **Collab extension suite.** v3 clients sync unicode and truecolor
  cells natively over a superset of the Moebius protocol. Classic
  Moebius clients join the same room and see a faithful 16-color
  down-conversion. Sessions record a timelapse you can export.
- **Minimap.** A live overview with a draggable viewport, on by
  default.
- **Reference image.** Load an image over the canvas with opacity and
  width controls for tracing.
- **Paste modes.** Paste-under fills only blank cells; transparent
  paste skips the blanks in your clipboard.
- **Plugins.** Load an ES module from a URL or file; it reads the
  document through a small API and writes back as one undoable batch.
- **16colo.rs browser.** Browse artpacks by year and open pieces
  straight into the editor.
- **Input.** Pen pressure, touch gestures, focal zoom, and a two-finger
  tap for undo.
- **Crash recovery.** An OPFS journal autosaves your session and
  restores it after a crash or reload.
- **Font favorites.** Star fonts to pin them at the top of the picker.
- **Server packaging.** Single-binary builds for eight platforms, a
  `--static` mode that serves the app and websockets from one process,
  a `/healthz` endpoint, a distroless Docker image, and
  `ROOM_MAX_COLUMNS`/`ROOM_MAX_ROWS` knobs for admins.

### Changed

- **Renderer.** WebGL replaces the 2D canvas chunks, with an optional
  CRT effect.
- **Undo.** A byte-budgeted patch arena (64 MB) replaces cell-count
  caps, so huge joints stop eating your history.
- **Canvas limits.** Walls raised to 1000 columns by 10000 rows, and
  resizes past 300,000 cells ask before committing.
- **Collab server.** Speaks native Moebius protocol, so one server
  hosts classic and v3 clients in the same room.
- **Updates.** The update prompt keeps your localStorage (favorites,
  recent colors, settings) instead of clearing it.

### Fixed

- **Stale PWA cache.** The service worker now revisions `index.html`
  per build and self-heals browsers stuck on an old version. Clearing
  site data by hand is no longer part of updating.
- **Mirror previews.** Shape tools draw the reflected half while you
  drag, not only on release.
