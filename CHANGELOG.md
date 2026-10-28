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
  classic 16, and a charset picker with importable charset tables puts
  unicode glyphs on the keyboard.
- **Collab extension suite.** v3 clients sync unicode and truecolor
  cells natively over a superset of the Moebius protocol. Classic
  Moebius clients join the same room and see a faithful 16-color
  down-conversion. Sessions record a timelapse you can export.
- **Connect to any server.** The collab button in the sauce panel
  opens a Connect form that takes `host:port/room` the way Moebius's
  own dialog does, remembers recent servers, your handle, and your
  group, and reports a dead or refused dial in the form instead of
  hanging. From an https page a plaintext Moebius server routes
  through the host's bridge once the operator turns it on
  (`BRIDGE=port` reaches any public server; `allow` and `local` pin
  the destinations).
- **Rooms through one proxy rule.** `/server/<room>` reaches a named
  room, so a deployment that already forwards `/server*` hosts every
  room without a rule each.
- **A bridge that keeps a ledger.** With `BRIDGE` on, every bridged
  connection opened, closed, or refused logs with its time, the
  requester's address, and the server asked for; the pipe bounds
  itself (delivery confirmed by pings toward the server, progress
  toward the browser, an idle reaper, timeouts), and a bad bridge
  environment stops the boot with a sentence. The privacy and
  security policies describe all of it.
- **Minimap.** A live overview with a draggable viewport, on by
  default.
- **Reference image.** Load an image over the canvas with opacity and
  width controls for tracing.
- **Paste modes.** Paste-under fills only blank cells; transparent
  paste skips the blanks in your clipboard.
- **Plugins.** Load an ES module from a URL or file; it reads the
  document through a small API and writes back as one undoable batch.
- **Browse Artpacks.** One File menu entry opens a landing page for
  both archive browsers. Back from a site's top level returns to the
  landing, the browsers remember where you were for the whole editor
  session, category and search pages hide anything the editor cannot
  open, and rapid clicks on pieces resolve to the last one clicked
  instead of racing.
- **16colo.rs browser.** Browse artpacks by year, crew, or artist, or
  search the whole archive by pack name, and open pieces straight into
  the editor. Packs preview by their `file_id.diz`, years sit in a
  uniform grid, pieces pack into balanced columns sized from their
  artwork, and only files the editor opens are listed.
- **asciiarena.se browser.** Browse amiga ascii collys by latest
  release, artist, or crew, or search the whole archive instantly from
  a one-shot index. Collys preview by their `file_id.diz` text and open
  straight into the editor as latin-1 in Topaz+ 1200, matching the
  site's own rendering. Zip and `.lha`/`.lzh` collys unpack in the
  browser through a new LHA codec (lh0 and lh5, CRC-checked, verified
  against all 4,190 entries in the arena's archives). Amiga `.txt`
  files that are not UTF-8 now fall back to the byte loader everywhere
  instead of failing to open.
- **Native archive opens.** File open, drag-and-drop, and PWA file
  launches accept `.zip`, `.lha`, and `.lzh` directly: one openable
  entry loads straight away, several raise a picker modal. Amiga
  archives open as latin-1 in Topaz+ 1200; zips keep CP437 defaults.
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

- **Renderer.** WebGL replaces the 2D canvas chunks.
- **Undo.** A byte-budgeted patch arena (64 MB) replaces cell-count
  caps, so huge joints stop eating your history.
- **Row and column ops.** Insert and delete row/column are classic
  fixed-canvas shifts in the Moebius and PabloDraw tradition: content
  moves, the canvas keeps its size, and the whole shift is one undo
  step. In v2 these ops grew or shrank the document and erased the
  undo history.
- **Collab server.** Speaks native Moebius protocol, so one server
  hosts classic and v3 clients in the same room.
- **Updates.** The update prompt keeps your localStorage (favorites,
  recent colors, settings) instead of clearing it.

### Fixed

- **Passworded rooms stay joinable.** The silent server probe counted
  as a failed login, so a `--pass` room drifted into a cooldown that
  refused the right password. Blank passwords no longer count, and a
  typo gets a fresh prompt without a reload.
- **Vanilla Moebius palettes at full brightness.** A vanilla server's
  6-bit `{r,g,b}` join palette decoded as 8-bit, a quarter of the
  intended brightness. Depth is detected per palette now.
- **The chat button waits for a session.** It opened while local; it
  now stands down under a `local` label until you join.
- **The bridge honors the Origin allowlist.** A foreign page could dial
  out through it when `ALLOWED_ORIGINS` was set.
- **Nobody dials before consent.** A `?server=` link no longer makes
  the host's bridge dial the named server on page load; the probe runs
  direct from the browser or not at all, and the invitation names the
  server.
- **Move mode is transparent over blanks.** Moving a selection no
  longer stamps its empty cells over artwork: blanks (char 0, space,
  or nbsp on black, the same rule the paste modes use) let the art
  underneath show through and survive.
- **Opening an image traces it.** Picking or dropping a png, jpg, or
  other image routes it to the reference overlay instead of dumping
  its raw bytes into the canvas as text.
- **Selections survive tool switches.** Leaving the selection tool and
  coming back restores the last selection instead of collapsing it to
  a single cell at the cursor. A pre-v3 defect.
- **Deletes render blank in every font.** Char 0 is the editor's empty
  cell, but the Topaz-437 atlas inks glyph 0, so deleted cells stamped
  visible marks. PNG font atlases now blank glyph 0 on load; fonts
  embedded in XBin files keep theirs, since a custom glyph 0 is the
  author's call.
- **F-key previews stop zooming.** The keyboard toolbar's character
  previews drew through the zoom-scaled font, so zooming the canvas
  cropped and flickered them. They render through their own 1x font
  now, like the brush panels always did.
- **iOS layout fits the window.** The fixed root sized to the layout
  viewport, which runs taller than the window while Safari's toolbar
  shows, hiding the bottom rows of the editor and baring offsets at
  the top. The root now tracks the dynamic viewport height.
- **Modals no longer self-close.** A doubled close (a backdrop
  double-tap, or stacked backdrop handlers from switching modals)
  orphaned a transition handler that shut every later modal the moment
  it finished opening, until a reload. Closes are now one-shot and
  each open replaces the backdrop handler instead of stacking it.
- **Stale PWA cache.** The service worker now revisions `index.html`
  per build and self-heals browsers stuck on an old version. Clearing
  site data by hand is no longer part of updating.
- **Mirror previews.** Shape tools draw the reflected half while you
  drag, not only on release.
- **iOS background scroll.** With Safari's toolbar expanded, dragging
  the background could scroll the page and bare a black bar above the
  editor. The root is now scroll-locked.
