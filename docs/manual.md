# teXt0wnz Client Editor Manual

> # Table o' Contents
>
> - [Visual Reference](#visual-reference)
> - [Top Bar](#top-bar)
>   - [Editor Menus](#-editor-menus)
>     - [File Menu](#file-menu)
>     - [16colo.rs Browser](#16colors-browser)
>     - [Plugins](#plugins)
>     - [Updating the Editor](#updating-the-editor)
>     - [Edit Menu](#edit-menu)
>     - [Character Sets & Unicode](#character-sets--unicode)
>     - [Sauce Editor](#sauce-editor)
>   - [Status Display](#-status-display)
>   - [Canvas Resolution / Size](#canvas-resolution--size)
> - [Color Management](#color-management)
>   - [Current Colors](#current-colors)
>   - [Color Palette](#color-palette)
>   - [Extended Colors](#extended-colors)
> - [Toolbar & Drawing Tools](#toolbar--drawing-tools)
>   - [Keyboard Mode](#-keyboard-mode)
>     - [Screen-Aware Navigation](#screen-aware-navigation)
>   - [Tool Settings Window](#tool-settings-window)
>   - [Brushes](#-brushes)
>     - [Block / Freehand Brush](#block--freehand-brush)
>     - [Shading Brush](#shading-brush)
>     - [ASCII Brush](#ascii-brush)
>     - [Character Brush](#character-brush)
>     - [Colorize/Attribute Brush](#colorizeattribute-brush)
>   - [Fill Tool](#-fill-tool)
>   - [Shapes](#-shapes)
>     - [Line Tool](#line-tool)
>     - [Square/Circle Tool](#squarecircle-tool)
>   - [Selection Tool](#-selection-tool)
>   - [Sample Tool](#-sample-tool)
>   - [Mirror Mode](#-mirror-mode)
>   - [History](#-history)
>   - [Fonts](#-fonts)
>     - [Font Select](#font-select)
>     - [Font Favorites](#font-favorites)
>     - [iCE Colors](#ice-colors)
>     - [9pt Font](#9pt-font)
>       - [Font Examples](#font-examples)
>   - [Viewport Options](#-viewport-options)
>     - [Zoom](#zoom)
>     - [Light/Dark Mode](#-lightdark-mode)
>     - [Grid Overlay](#-grid-overlay)
>     - [Minimap](#minimap)
>       - [Autoscroll](#autoscroll)
>     - [Reference Image](#reference-image)
> - [Animation](#animation)
>   - [Frame Timeline](#frame-timeline)
>   - [Onion Skin](#onion-skin)
>   - [Baud Preview](#baud-preview)
>   - [Exporting Animations](#exporting-animations)
> - [Touch, Pen, and Gestures](#touch-pen-and-gestures)
> - [Workflows](#workflows)
> - [Tutorials](#tutorials)
>   - [Viewing and Opening Tutorials](#viewing-and-opening-tutorials)
> - [Collaboration Features](#collaboration-features)
>   - [Chat Window](#chat-window)
>     - [Features](#features)
>     - [Usage](#usage)
> - [Key Bindings Summary](#key-bindings-summary)
>   - [Mouse Controls](#mouse-controls)

# Visual Reference

![overview](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/overview.png)

# Top Bar

## ![top-left-nav](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/top-left-nav.png) Editor Menus

### File Menu

File operations allowing you to create, open, and save artwork in multiple file types.

**Supported Formats:**

- **ANSI** (`.ans`) - Classic ANSI text art format
- **ASCII** (`.asc`) - Plain amiga and pc scene ascii
- **NFO** (`.nfo`) - Warez scene release format
- **Binary Text** (`.bin`) - Raw binary (legacy scene format)
- **XBin** (`.xb`) - Extended Binary format with embedded fonts and palettes
- **TundraDraw** (`.tnd`) - 24-bit color text art format
- **durdraw Movie** (`.dur`) - Animation format (gzipped JSON, 256 colors, UTF-8)
- **teXt0wnz Doc** (`.0wnz`) - Native format; keeps truecolor, unicode, animation frames, and embedded fonts
- **UTF-8** (`.utf8.ans`) - Export as text with shell color escape codes, with or without blink
- **Plain Text** (`.txt`) - Export as text only
- **ANSimation** (`.ans`) - Export animation frames as a classic ansimation
- **PNG** - Export as image
- **Archives** (`.zip`, `.lha`, `.lzh`) - Containers unpack in the browser; the art inside opens

> [!NOTE]
> See [xb-format.md](xb-format.md) for technical details on the XBin
> format, and [lha-format.md](lha-format.md) for the amiga archive
> support.

![file-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/file-menu.png)

**Import/Export Operations:**

- Load via **File → Open** or **drag-and-drop**
- Format detection by file extension
- Zip and amiga `.lha`/`.lzh` archives unpack in the browser: a lone
  openable file loads straight away, several raise a picker. Amiga
  archives open as latin-1 in Topaz+ 1200, zips keep CP437 defaults
- Export options for all supported types and PNG
- Before an export that cannot hold everything in your piece (unicode glyphs, extended colors, blink), a dialog lists exactly what will be lost so you can decide
- XBin exports offer an RLE compression toggle
- **Export Session Timelapse** replays a collaboration session into a durdraw movie (requires a teXt0wnz collaboration server)

**Auto Save/Restore:**

- Every committed stroke appends to an autosave journal in your browser's private origin storage (OPFS)
- Larger changes like resizes, file opens, and undo/redo write fresh journal keyframes
- After a crash, a closed tab, or a reload, the journal replays and your session restores where you left off
- Browsers without OPFS fall back to an IndexedDB snapshot; private windows that block both lose autosave for that tab only
- Lightweight settings (theme, zoom, favorites, recent colors) persist in local storage
- Collaboration sessions never journal; the server owns that document

### Artpack Browsers

**File → Browse Artpacks** opens a landing page for the two in-app
archive browsers. Each site gets a card; click anywhere on a card to
browse that archive.

**Shared behavior:**

- **Back** retraces your path one view at a time, and from a site's
  top level it returns to the landing so you can switch archives
- While the editor stays open, reopening Browse Artpacks returns to
  the exact view you left, even after opening a piece closed the
  window. Backing out to the landing forgets that memory
- Category and search pages only list what the editor can open:
  years, artists, and crews with nothing viewable never render, and
  a page the filter empties says so instead of showing a blank well
- Every request is user-driven; nothing loads in the background

#### 16colo.rs

The [16colo.rs](https://16colo.rs) card browses the artpack archive.

**Features:**

- Four tabs: **year** (the default), **crew**, **artist**, and
  **search**. Crews and artists list with release counts and a filter
  box; search finds packs by name across the whole archive
- An artist's page groups their works by year and pack; a crew's page
  lists every pack they released
- Browse by year, then by pack, with each pack previewed by its
  `file_id.diz` artwork, the scene's own pack labels
- Pieces lay out in balanced columns sized from their artwork, like the
  real gallery
- Click a piece to open it straight in the editor
- Only formats the editor opens are listed (`.ans`, `.asc`, `.diz`,
  `.nfo`, `.txt`, `.bin`, `.xb`, `.tnd`, `.dur`, and the bare
  `file_id`); images, music, and other pack extras are filtered out
- Pack archives download once and cache for the session, shared even
  between rapid clicks on different pieces of the same pack

#### aSCIIaRENA

The [aSCIIaRENA](https://asciiarena.se) card browses the amiga
artscene archive.

**Features:**

- Four tabs: **latest** (the default), **artist**, **crew**, and
  **search**. Artists and crews list with a filter box and drill into
  their collys; search runs instantly over the whole archive index
- Collys preview by their `file_id.diz` text, fetched lazily as cards
  scroll into view
- Click a colly to open it straight in the editor. Zip and
  `.lha`/`.lzh` archives list their openable files first, unpacked in
  the browser with every entry checked against its CRC (see
  [lha-format.md](lha-format.md))
- Amiga ascii opens the way the site renders it: raw latin-1 bytes in
  Topaz+ 1200, with SAUCE font records still winning when present
- The search index downloads once and caches for the session
- Diskmag releases ride `.dms` disk images the editor cannot read, so
  they never list

> [!NOTE]
> Both archive browsers talk to third-party sites, and only while you
> use them. [privacy.md](privacy.md) lists exactly what loads from
> where.

### Plugins

**File → Plugins** loads and runs ES-module plugins, in the durdraw lineage.

A plugin is one JavaScript module whose default export is `{name, run(api)}`. The `run` function receives a small stable API over the current frame: `columns`, `rows`, the active `foreground` and `background` colors, `get(x, y)` to read a cell, and `put(x, y, code, fg, bg)` to write one.

**Features:**

- Load a local `.js` file or a plugin URL
- All of a plugin's writes apply as one undo step when it finishes
- Reads always see the document as it was when the plugin started
- Loaded URLs are remembered between sessions; nothing ever loads automatically

> [!WARNING]
> A plugin runs with full access to the page. Only load code you trust.

### Updating the Editor

The editor is an offline-first web app. When a new version is ready, an update prompt appears.

- Press **Update** to apply the new version and reload. Your artwork, settings, font favorites, and recent colors all survive the update.
- Press **Cancel** to keep working; the update waits.
- **File → Update Editor** with no update pending acts as a manual recovery reset: it clears saved settings and caches before reloading. Save your work first.

### Edit Menu

Edit operations to quickly add/remove rows/columns, erase sections, and more.

**Features:**

- **Clipboard Operations** - Cut, copy, paste (both app and system clipboard)
- **Paste Modes** - Transparent and under paste for compositing (see below)
- **Undo/Redo** - Full history support with keyboard shortcuts
- **Canvas Manipulation** - Insert/delete rows and columns
- **Erase Tools** - Clear rows, columns, or specific sections
- **Color Operations** - Default color, swap colors
- **Character Sets** - Open the unicode character set picker
- **Fullscreen Mode** - Toggle fullscreen for distraction-free editing

![edit-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/edit-menu.png)

**Paste Modes:**

Beyond plain paste, the Edit menu offers two PabloDraw-style compositing pastes. A cell counts as blank when it holds no visible glyph (null, space, or non-breaking space) on a black background.

- **Paste Transparent** - Blank cells in the clipboard do not overwrite; your copied shape lands without its empty surroundings
- **Paste Under** - Clipboard cells land only where the target cell is blank; existing artwork stays on top

Either way the paste applies as one undo step.

### Character Sets & Unicode

**Edit → Character Sets** opens a picker covering every Unicode block.

**Features:**

- Search blocks by name and preview which glyphs the bundled fonts cover
- Click a glyph to insert it at the cursor
- Selecting a block also loads it into the F-key bar as the active page
- Import charset tables (durdraw `.ini` or teXt0wnz `.json`); imported pages ride the F-key bar and persist between sessions

Unicode glyphs render from [unscii-16](http://viznut.fi/unscii/) (purpose-built for textmode art) with [GNU Unifont](https://unifoundry.com/unifont/) covering the rest. A glyph neither font covers renders as a hollow box and inserts as `?`.

> [!NOTE]
> On a classic collaboration server the wire only speaks CP437, so unicode input locks while connected. The picker says so when it applies.

### Sauce Editor

_"[Sauce](sauce-format.md)"_ is a special metadata format created by the ANSI text art scene. It allows for embedding title, author, release group, and comments into files.

![sauce](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/sauce.png)

## ![top-right-nav](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/top-right-nav.png) Status Display

This section of the UI displays the current canvas size, font, and cursor position. Clicking the Resolution or Font Name will open their respective options menus.

**Status Elements:**

- **Resolution** - Current canvas size (columns × rows)
- **Font Name** - Active font (click to change)
- **Cursor Position** - Current cell coordinates (column, row)

## Canvas Resolution / Size

![resolution](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/resolution.png)

Text art resolution is calculated by columns and rows. 80 × 25 is the default size of dial-up BBS screens, and is still a very common size for text art to this day. But feel free to make it as large as you like, even use the 80th column _\*gasps!\*_

**Common Sizes:**

- **80 × 25** - Classic BBS terminal size
- **80 × 50** - Extended terminal mode
- **132 × 60** - Wide format for detailed work

**Limits:**

- Maximum canvas size is 1000 columns by 10000 rows
- Resizing past 300,000 total cells asks for confirmation first; very large canvases use more memory, grow autosaves, and slow collaboration joins

> [!NOTE]
> See [building-and-developing.md](building-and-developing.md) for technical details on canvas rendering.

# Color Management

![color-palette](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/color-palette.png)

The color system anchors on the classic 16-color ANSI palette, with optional iCE colors for extended backgrounds, and a full extended panel for xterm-256 and RGB truecolor.

## Current Colors

- Foreground and background color selection
- Click the preview swatch to swap foreground/background colors
- Keyboard shortcut: `q` to quickly swap colors (`ctrl q` in keyboard mode)
- Keyboard shortcut: `d` for default colors (`ctrl d` in keyboard mode)

## Color Palette

- 16-color ANSI palette (8 standard + 8 bright colors)
- Real-time color preview
- Click a swatch to set the foreground color
- Double click a swatch to edit that palette entry with the system color picker
- `ctrl` + `0`-`7` sets the foreground, `alt` + `0`-`7` the background; press the same key again for the bright variant
- `ctrl` + `up`/`down` cycles the foreground color, `ctrl` + `left`/`right` the background

**Color Support:**

- Standard ANSI 16 colors
- iCE colors (extended 16 background colors)
- Custom palettes in XBin format
- xterm-256 and RGB truecolor via the extended panel

> [!NOTE]
> See [xb-format.md](xb-format.md) for information on custom palettes

## Extended Colors

The `++` button under the palette strip opens the extended color panel, one click past the classic 16.

**Features:**

- **xterm 256 grid** - Click a swatch for the foreground, right-click for the background
- **RGB** - Pick any truecolor value with the hex color input, then apply it with the `fg` or `bg` buttons
- **Recent** - Your last ten extended picks, remembered between sessions
- The panel floats: drag any free spot to move it, close it with the **X** or the `++` button

Formats that cannot hold extended colors list what will be quantized or dropped at export time.

> [!NOTE]
> On a classic collaboration server the wire only speaks 16 colors, so the extended panel locks while connected and says why.

# Toolbar & Drawing Tools

![tools](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/tools.png)

> [!TIP]
> The currently selected tool will be highlighted (keyboard mode in this case)

Some tools such as "Brushes" have many options or sub-tools. Clicking the tool icon from the left menu will update (or clear) the current tool options section of the top bar.

> [!TIP]
> Press `escape` to switch back to the previous tool

**Available Tools:**

- Keyboard Mode - Full text input
- Brushes - Freehand, shading, character, and attribute brushes, plus flood fill
- Shapes - Lines, rectangles, circles, and ellipses
- Selection - Select, move, copy, and transform areas
- Sample - Pick colors and characters from canvas
- Mirror Mode - Symmetrical drawing
- History - Undo/redo operations
- Font Selection - Choose from many classic fonts
- Viewport Options - Zoom, theme, grid, animation frames, minimap, and reference image

## ![keyboard](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/keyboard.png) Keyboard Mode

Full text input with navigation controls. Type characters directly onto the canvas. Use the F-keys to insert block shading characters (`░▒▓`) like traditional ANSI editors.

**Features:**

- Direct character input
- F-key character insertion from the active page
- `ctrl+[`, `ctrl+]` or the arrow buttons at either end of the bar cycle pages; pages cover all of CP437, unicode blocks (rounded corners and diagonals, sextants, wedges, eighth blocks), and any charsets you import
- `ctrl+u` picks up the colors of the cell under the cursor
- Traditional ANSI editor workflow
- `shift+arrow keys` switch to the Selection Tool

![f-key legend](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/fkeys.png)

> [!TIP]
> Click the F-key legend preview to insert that character to the current cell.

**Navigation Shortcuts:**

| Key                    | Action                   |
| ---------------------- | ------------------------ |
| `arrow keys`           | Move cursor              |
| `shift arrow keys`     | Switch to selection tool |
| `home`                 | To start of row          |
| `end`                  | To end of row            |
| `page up`/`page down`  | Move by viewport screen  |
| `cmd left`/`cmd right` | Start/end of row         |
| `tab`/`backspace`      | Insert/delete left tab   |
| `enter`                | New line                 |

## Screen-Aware Navigation

`Page Up` and `Page Down` automatically calculate movement based on the current viewport height and font size, allowing you to navigate large canvases one screen at a time without losing your bearings.

**In Keyboard Mode:**

- Canvas cursor moves by one full screen height
- Viewport automatically scrolls to keep cursor visible

**In Selection Tool:**

- Selection moves by one full screen height in default mode
- In move mode, selected content moves by one full screen height
- Viewport automatically scrolls to keep selection visible

**After scrolling by hand:**

- Scroll anywhere (minimap, touch, wheel, or scrollbar) and the cursor follows: once it is fully off screen, it re-homes near the top left of the visible canvas, so the next keypress acts where you look instead of snapping the view back
- A selection does the same, collapsing to a single cell; one still partly visible, mid-drag, or in move mode never moves
- Scrolling settles on whole rows; a partial row only ever appears at the bottom edge

This makes navigation much faster and more intuitive on large text art pieces.

## Tool Settings Window

Tools with options share one floating window. It opens when you select a tool that has settings, swaps its content to match the tool (the title strip names it), and hides for tools that have none.

**Features:**

- Mode and Style picks are tappable pills; each mode wears a glyph preview of its vocabulary
- The shading gradient picker and the character picker live here too
- Drag the title strip to move the window; it remembers its spot
- Press the **'X'** to hide it; selecting any tool with settings reopens it
- Modes, width, size, and the outline/filled choice persist across reloads

## ![brush](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/brush.png) Brushes

![brush-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/brush-menu.png)

Multiple brush types for different drawing techniques. Each brush has unique properties and use cases.

### Block / Freehand Brush

Draw with blocks for pixel-like drawing. Hold Shift for straight lines. Think of this tool as your pen.

**Features:**

- Pixel-precise drawing with half-block characters
- Hold `shift` for straight line constraints
- Ideal for detailed artwork

### Shading Brush

Draw with shading blocks (`░▒▓`). 'Reduce mode' when holding Shift. Ideal for gradients and texture effects. The block color gradient picker rides the [Tool Settings Window](#tool-settings-window).

![shading-panel](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/shading-panel.png)

**Features:**

- Multiple shading levels: light (`░`), medium (`▒`), dark (`▓`), full (`█`)
- Reduce mode with Shift key
- A pressure-sensitive pen picks its shade from pressure directly; press lighter or harder to shade
- The gradient picker follows the active foreground color

### ASCII Brush

Draw freehand ascii line art. The stroke reads the slope under your hand and picks its glyphs live, revising as you go, so curves land the way the scene types them.

The Width row in the [Tool Settings Window](#tool-settings-window) picks the style, each stop wearing a swatch of its stroke:

**Width 1 is old skool.** The thin line vocabulary: `|` verticals, `/` and `\` diagonals, `.'` pebble pairs on steep steps, `,-'` and `__..--""` shallow runs, and dressed caps and bowls on turns.

**Width 2-9 is nu skool.** The same skeleton drives a solid `$` ribbon in the Abstrakt dialect: one chisel glyph per side (`,d$$P'` rising, `` `Y$$b. `` falling), fill that scales with the knob, an entry taper, a live tapered tip, and a sputter ending.

**Features:**

- Strokes revise live under the pen and commit as a single undo step
- A stroke ending on a line voices a joiner (`7` `r` `T` rising, `L` `J` `+` falling), and crossings voice `+` `%` `X`
- Endpoint snapping forgives a one cell miss or overshoot and bridges a one cell gap
- Additive contact never carves existing ink; the heavier mark survives and equal weights densify
- A tap leaves a pebble at width 1 and a full width daub at width 2 and up
- Plays well with mirror mode

### Character Brush

Draw with any character from the font. The 256 glyph picker rides the [Tool Settings Window](#tool-settings-window).

![character-panel](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/character-panel.png)

**Features:**

- Access to full character set
- Interactive character picker in the current colors
- Draw with any glyph from the active font

### Colorize/Attribute Brush

Paint/recolor the foreground and background colors of the selected cell. The Size slider in the [Tool Settings Window](#tool-settings-window) paints larger or smaller areas.

**Brush size x1** _(default)_

![color-x1](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/color-x1.png)

**Brush size x3**

![color-x3](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/color-x3.png)

**Features:**

- Change colors without affecting characters
- Alt+click repaints only the background
- Preserve existing artwork structure
- Quick color corrections
- Repaint large areas faster with brush sizes up to 16

> [!NOTE]
> See [fonts.md](fonts.md) for available characters in different fonts and [project-structure.md](project-structure.md) for technical brush implementation.

## ![fill](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/fill.png) Fill Tool

Flood fill connected color regions with the current foreground color. Fill lives in the brush submenu alongside the block, shading, character, and color brushes.

**Features:**

- Fills connected half-block regions of the same color
- Handles left/right and upper/lower half-block boundaries cleanly
- Seeds the mirrored side too when Mirror Mode is on
- One undo step per fill

## ![shapes](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/shapes.png) Shapes

![shape-tools](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/shape-tools.png)

Draw geometric shapes with automatic color conflict resolution and real-time preview.

### Line Tool

Draw straight ruled lines. The Mode pills in the [Tool Settings Window](#tool-settings-window) pick the vocabulary:

- **Block.** The classic half block line with automatic color conflict resolution.
- **Old Skool.** The thin ascii vocabulary with square ends.
- **Nu Skool.** A two wide `$` ribbon that ends square.

![line](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/line.png)

**Features:**

- Click and drag to draw lines
- The preview runs the exact commit pipeline, so the ghost is pixel faithful to what lands
- Old skool endpoints voice junctions where they meet existing ink
- Perfect for borders and diagrams

### Square/Circle Tool

Draw rectangles, circles, and ellipses. Each tool's Mode pills and its Outline/Filled Style toggle live in the [Tool Settings Window](#tool-settings-window):

- **Block.** Classic half block shapes with automatic color conflict resolution.
- **Old Skool.** The thin ascii vocabulary. Squares wear the canon box idioms: period shoulders over dash edges, backtick and quote feet, and pipe sides. Circles follow the scene scaling law: the corner anatomy never changes with size, height stretches the walls, and width stretches the cap dashes and underscores.
- **Nu Skool.** The Abstrakt chisel dialect. Squares rule a solid `$` rim; circles speak a single cell rim of `8` bodies with chisel ladders down the quarters. Filled pours a `$` slab in both.

![square](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/square.png)

![circle](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/circle.png)

**Features:**

- Shapes drag corner to corner; old skool circles fill the drag box exactly at any width, block and nu skool inscribe inside it
- A single tap stamps the smallest good shape for the mode instead of a crumb
- Corners and edges landing on existing lines voice junction glyphs, and stacked boxes share their edge invisibly
- Outline or filled; old skool circles have no fill vocabulary, so the toggle naps in that mode
- Real-time preview while dragging

## ![selection tool](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/selectiontool.png) Selection Tool

![selection-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/selection-menu.png)

Select rectangular canvas areas for manipulation, copying, or transformation. Position updates live in status bar.

> [!NOTE]
> Single clicks move the cursor without creating a selection. Drag to create a selection to prevent accidental single-cell selections.

**Selection Modes:**

The default selection mode is white:

![selection](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/selection.png)

Move mode is orange (toggle with `m` key):

![move](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/move.png)

Blank cells in the selection move transparently, like paste transparent: artwork under the empty parts of the rect shows through and survives the move. A cell counts as blank when it is empty (char 0, space, or nbsp) on a black background, the same rule the paste modes use.

**Keyboard Shortcuts:**

| Key Combo                  | Action                          |
| -------------------------- | ------------------------------- |
| default mode: `arrow keys` | Move selection **area**         |
| move mode: `arrow keys`    | Move selection **contents**     |
| `shift arrow keys`         | Expand/shrink selection         |
| `home`/`end`               | Expand to row start/end         |
| `page up`/`page down`      | Move by screen height           |
| `ctrl x`                   | Cut                             |
| `ctrl c`                   | Copy                            |
| `ctrl v`                   | Paste from **editor** clipboard |
| `ctrl shift v`             | Paste from **system** clipboard |
| `[`/`]`                    | Flip horizontally/vertically    |
| `m`                        | Toggle move mode (orange)       |
| `enter`                    | Return to keyboard mode         |

**Mouse/Touch:**

- **Click in unselected area** - Create new selection
- **Click and drag** - Create or expand selection to different cell
- **Within a selection (default mode)** - Move the selection box
- **Within a selection (move mode)** - Move the selection _and its contents_

## ![sample](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/sample.png) Sample Tool

Sync the editor foreground/background color and brush tool with the selected cell. Great for matching colors and characters when working on complex artwork.

**Features:**

- Pick colors from existing artwork
- Copy character and color attributes
- Quick tool for color matching
- Turns [Mirror Mode](#-mirror-mode) off when selected

**Keyboard Shortcut:**

`alt` key (while using other tools)

## ![mirror](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/mirror.png) Mirror Mode

Horizontally mirrors any drawing tool on the opposite side of the canvas. Ideal for creating logos, symmetric patterns, and balanced compositions.

**Example**:

![mirror-mode](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/mirror-mode.png)

**Features:**

- Automatic horizontal mirroring
- Works with all drawing tools
- Perfect for creating symmetrical designs
- Exclusive with the [Sample Tool](#-sample-tool); enabling it there returns you to your previous tool

**Keyboard Shortcut:**

`m`, or `ctrl m` in keyboard mode

## ![history](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/history.png) History

![history-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/history-menu.png)

Full undo/redo support for all drawing operations.

**Features:**

- Deep undo capped by memory (64 MB of change data), not a fixed step count
- Works with all tools and operations
- Your artwork survives reloads through the autosave journal; the undo stack itself starts fresh each session

**Supported Operations:**

- Drawing and erasing
- Color changes
- Selection operations
- Canvas resizing
- Font changes

**Keyboard Shortcuts:**

| Key Combo               | Action |
| ----------------------- | ------ |
| `ctrl z`, `cmd z`       | Undo   |
| `ctrl y`, `cmd shift z` | Redo   |

> [!NOTE]
> See [architecture.md](architecture.md) for state management implementation details.

## ![font](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/font.png) Fonts

![font-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/font-menu.png)

Change the font options for your artwork. teXt0wnz supports a wide variety of classic and modern fonts.

### Font Select

Choose from classic ANSI fonts and modern XBin fonts. See [fonts.md](fonts.md) for a complete list of available fonts with previews.

![font-select](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/font-select.png)

**Font Categories:**

- **XBin** - The font embedded in the loaded XBin or teXt0wnz Doc file
- **Modern** - Contemporary scene fonts (Topaz 437, TES-SYM variants, Teletext, and more)
- **Commodore 64** - PETSCII fonts (Shifted, UnShifted, and DiskMaster)
- **Amiga** - MicroKnight, mO'sOul, P0t-N0oDLE, & Topaz variants
- **IBM PC Code Pages** - Grouped by language: Arabic, Baltic Rim, Cyrillic, French Canadian, Greek, Hebrew, IBM PC, Icelandic, Latin-1, Latin-2, Latin-3, Nordic, Portuguese, and Turkish

### Font Favorites

Star the fonts you use most and they pin to a **Favorites** group at the top of the picker.

- Open the font picker and press the star next to the font name to toggle a favorite
- Favorites persist in local storage and survive editor updates

### iCE Colors

Extended 16-color background palette (normally only 8 are available in ANSI). Required for certain artwork styles.

> [!IMPORTANT]
> iCE colors use the blink bit for additional background colors, disabling blinking text.

### 9pt Font

A special "extra pixel" wide mode for letter spacing.

**Use Cases:**

- Wider character spacing
- Better readability for some fonts
- Specific aesthetic requirements

#### Font Examples

**Font**: XBIN topaz_437

![topaz437](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/topaz437.png)

**Font**: XBIN topaz_437 with 9pt

![9pt](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/9pt.png)

**Font**: IBM Code Page 437

![CP437](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/CP437.png)

**Font**: Commodore C64 Petscii

![Petscii](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/Petscii.png)

**Font**: Amiga MicroKnight

![microknight](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/microknight.png)

> [!NOTE]
> See [fonts.md](fonts.md) for the complete font catalog and [xb-format.md](xb-format.md) for embedding custom fonts in XBin files.

## ![viewport](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/viewport.png) Viewport Options

![viewport toolbar](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/viewport-toolbar.png)

Customize your editing experience with these interface options. This toolbar also holds the toggles for the animation frames panel, the minimap, and the reference image.

> [!NOTE]
> The editor renders with WebGL and falls back to a 2D renderer where WebGL2 is unavailable (append `?renderer=2d` to the URL to force it). The minimap and onion skin need the WebGL renderer.

### Zoom

Visually scale the drawing canvas from 0.5-4x size, while keeping the interface elements unchanged.

![zoom-x1](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/zoom-x1.png)

![zoom-x2](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/zoom-x2.png)

- Use the slider to adjust the zoom
- Provides half size steps for greater control
- Select whole number scaling for pixel perfect rendering
- `ctrl` + mouse wheel (or a trackpad pinch) zooms at the pointer
- A two-finger pinch zooms at the pinch center on touch screens
- Pinching anywhere else, menus and panels included, zooms the editor too; the browser's own page zoom and double-tap zoom stay out of the way
- Preference saved in local storage

**Keyboard Shortcuts:**

| Key Combo | Action          |
| --------- | --------------- |
| `ctrl +`  | Zoom canvas in  |
| `ctrl -`  | Zoom canvas out |

> [!NOTE]
> On the WebGL renderer, zoom applies live as you pinch or scroll. The 2D fallback renderer commits the new scale when the gesture ends, which can take a moment on large canvases.

### ![theme select](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/modeselect.png) Light/Dark Mode

Toggles between **light** and **night** mode interface colors. Choose the theme that works best for your environment and personal preference.

![dark-mode](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/dark-mode.png)

![light-mode](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/light-mode.png)

**Features:**

- Night mode for low-light environments
- Light mode for bright environments
- Preference saved in local storage
- Instant switching without reload
- Slick visual transition

### ![grid](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/gridtool.png) Grid Overlay

Toggles the visual grid. Useful for creating precise layouts, aligning elements, and maintaining consistent spacing in your artwork.

![grid example](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/grid.png)

**Features:**

- Visual cell boundaries
- Helps with alignment and spacing
- Non-destructive overlay (doesn't affect artwork)

**Keyboard Shortcut:**

`g`, or `ctrl g` in keyboard mode

### Minimap

A live overview of the whole canvas, one pixel per cell, docked beside the viewport. It is on by default.

**Features:**

- Renders the full document at the art's true proportions, with foreground and background colors blended by glyph coverage; 256-color and RGB art previews true
- A focus box marks the visible viewport, tracks your scrolling, and stays in view as the map pages along with you
- Tap anywhere on the map to jump the viewport there; jumps land on whole rows
- Drag the focus box like a scrollbar thumb to scrub the canvas; hold it at the map's top or bottom edge and the map auto-scrolls until you release or back away
- On maps taller than the panel, dragging outside the focus box pans the map itself
- Refreshes twice a second while open
- Toggle it with the **Minimap** button in the viewport toolbar; the choice is remembered

#### Autoscroll

Plays the artwork like a compo screen: the canvas glides to the bottom, holds a moment, glides back to the top, holds again, and repeats. Hosts at demoparties run exactly this to show tall pieces during voting, the same trick Moebius and PabloDraw are known for.

Click the loop icon in the minimap's top right corner to open the autoscroll menu. The icon becomes an **X** that closes it again.

**Controls:**

- **Play/pause** sits beside the autoscroll title. Play starts or resumes the ride, pause freezes it in place
- The **scroll | loop** pill picks between a set number of passes and looping forever
- In scroll mode, **count** sets 1 to 5 round trips with the **-** and **+** stepper; the run parks at the top when they finish. In loop mode the count row dims
- **speed** sets the glide rate in rows per second, from a slow crawl to a fast 25 rows per second. Only the speed is remembered between sessions

**Behavior:**

- Scrolling anywhere by hand (wheel, touch, the minimap, or the scrollbar) pauses playback right where you are; press play to resume
- Opening a new piece stops playback; your mode, count, and speed stay as you set them
- Playback keeps running if you hide the minimap; reopen it from the viewport toolbar to reach the controls
- The glide moves in whole dither periods at your display's refresh rate, so shaded blocks stay rock solid instead of shimmering, and a short piece that already fits on screen has nowhere to go, so play declines politely

### Reference Image

The **Ref Image** button in the viewport toolbar opens a small panel for tracing over a picture.

**Features:**

- **load image** floats a translucent image over the canvas; the file stays local and is never uploaded
- **opacity** slider from 0 to 95 percent
- **width** slider sizes the image from 10 to 400 percent of the canvas width
- Every tool draws straight through the overlay, and it follows zoom and canvas resizes
- The **move image** button toggles drag mode: a cyan ring marks the image and pointer or touch drags reposition it anywhere over the art. The sliders and buttons all keep working; toggle again to lock the image back down and return the pointer to the tools
- **clear** removes the image and returns every setting to its default
- Once an image is loaded, the image and its settings persist in the browser and survive a reload. Pressing **clear** or starting new artwork (File > New, opening a file) resets the tool completely
- Opening an image through **File > Open** or by dropping it on the editor loads it here too, never into the canvas
- The panel floats: drag any free spot to move it, close it with the **X** or the **Ref Image** button

# Animation

teXt0wnz edits multi-frame animations. Press the **Frames** button in the viewport toolbar to open the frames panel. The panel floats: drag any free spot to move it, close it with the **X** or the **Frames** button.

## Frame Timeline

The panel shows a numbered strip of frames with the current one highlighted.

**Controls:**

- **◀ / ▶** step to the previous or next frame; click any number in the strip to jump
- **+** adds a blank frame after the current one
- **=** duplicates the current frame
- **×** deletes the current frame (disabled on the last remaining frame)
- **ms** sets a per-frame delay in milliseconds (16-60000); leave it blank to use the global rate
- **fps** sets the global playback rate (1-60 frames per second)
- **play** cycles the frames at their delays; press again (or click the canvas) to stop

Adding a frame past the animation memory budget asks for confirmation first.

## Onion Skin

The **onion** button ghosts the previous frame under the current one, so you can line up motion between frames. WebGL renderer only.

## Baud Preview

The **baud** button replays the current frame the way it would paint over a modem line, at the selected rate (2400 to 115200 baud, 14400 by default). Classic ansimations use the line rate as their clock, so this is the honest preview of how your animation will feel on a BBS.

## Exporting Animations

- **File → Export as ANSimation** writes a classic ansimation `.ans` (clear screen and home between frames; baud rate is the clock)
- **File → Save as durdraw Movie** writes a durdraw v8 `.dur` movie: gzipped JSON, 256-color mode, UTF-8 glyphs. RGB colors land on the nearest xterm-256 entry
- **File → Save as teXt0wnz Doc** keeps frames, truecolor, and unicode losslessly in `.0wnz`
- Opening a `.dur` or `.0wnz` file brings its frames with it

> [!NOTE]
> Animation editing is local-only. Collaboration sessions stay on one frame, and the panel says so while connected.

# Touch, Pen, and Gestures

The editor treats mouse, pen, and touch as first-class input.

**Touch gestures:**

- **One finger** draws with the active tool; a tap paints one cell
- **Two-finger tap** undoes (it also works on the viewport margins around the canvas)
- **Three-finger tap** redoes
- **Two-finger pinch** zooms at the pinch center; dragging both fingers pans the canvas

**Pen:**

- Pressure drives the Shading Brush: press lighter or harder to pick the shade
- Palm rejection ignores touch while the pen is down and for a moment after it lifts

# Workflows

> [!TIP]
>
> 1. Start with Keyboard Mode for layout and text
> 2. Use Grid (G key) for alignment
> 3. Switch to the Block brush for shading and pixel art
> 4. Use Character Brush for textures and patterns
> 5. Fill Tool for large color blocks
> 6. Selection Tool for moving and copying sections
> 7. Autosave has your back, but export your work often
> 8. Use F-keys for quick access to block characters
> 9. Alt+Click to sample colors from artwork
> 10. Undo/Redo freely
> 11. Open the minimap to keep your bearings on large pieces
> 12. Hosting a compo? Autoscroll in the minimap menu plays tall pieces hands-free

# Tutorials

The editor contains a built in library of 20+ hand-collected ANSI drawing tutorials spanning decades of the scene. Each entry showcases unique techniques, styles, and the vision of a talented artist.

The tutorials themselves are just normal ANSI art files. Viewing a tutorial simply opens the file in the editor. Allowing you to test the techniques and play around with the samples in their native context.

## Viewing and Opening Tutorials

![Tutorials Menu](https://github.com/user-attachments/assets/f2f496e6-1ec9-4467-8e07-3e6c4364b842)

- Click file menu floppy disk icon
- Click the **"Tutorials"** item
- Click on a preview to load the tutorial into the editor!

![Tutorials Modal](https://github.com/user-attachments/assets/57576b04-2d84-4224-b58b-ad76a89fd380)

> [!NOTE]
> See [tutorials.md](tutorials.md) for a complete listing.

# Collaboration Features

When the editor is served alongside a collaboration server, a prompt at launch asks whether to join the session in progress or continue offline.

- Everyone in a session draws on the same canvas in real time, with live peer cursors, synced fonts, canvas sizes, iCE colors, and SAUCE metadata
- Between teXt0wnz clients, unicode characters and extended colors travel natively
- Classic Moebius clients can join the same session; the server down-converts extended cells to their nearest 16-color CP437 equivalents for them, so mixed rooms stay coherent
- Connected to a classic server, the editor locks what that wire cannot carry: extended colors, unicode input, and animation editing disable while connected, and each panel says so
- On a teXt0wnz server, **File → Export Session Timelapse** replays the session's history into a durdraw movie

## Chat Window

The chat window is available when connected to a collaboration server. It provides real-time communication with other users and displays server activity logs.

![chat window](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/chat.png)

### Features

- **Repositionable** - Click and drag the chat header to move the window anywhere on screen
- **User Messages** - Send and receive chat messages with other collaborators
- **Server Logs** - Join/leave/nickname change events displayed as styled log messages
- **Notifications** - Optional desktop notifications for new messages and events
- **User List** - See all currently connected users (left hand column)
- **Close Button** - Click the X button in the header to close the chat window

### Usage

- Type your message in the input field and press Enter or click "send"
- Change your username by editing the handle field
- Enable/disable notifications with the checkbox in the header
- Drag the header to reposition the window (position does not persist between sessions)

> [!NOTE]
> See [collaboration-server.md](collaboration-server.md) for details on setting up and using the collaboration server.

# Key Bindings Summary

**Main Tool Shortcuts:**

These work whenever you are not typing in Keyboard Mode. Hold `ctrl` to use them from Keyboard Mode too (for example `ctrl m` for mirror, `ctrl g` for grid).

| Key      | Tool/Action                |
| -------- | -------------------------- |
| `k`      | Keyboard Mode              |
| `f`      | Brushes                    |
| `b`      | Character Brush            |
| `n`      | Fill Tool                  |
| `a`      | Colorize/Attribute Brush   |
| `g`      | Grid Toggle                |
| `i`      | iCE Colors Toggle          |
| `m`      | Mirror Mode                |
| `d`      | Reset colors to default    |
| `q`      | Swap foreground/background |
| `escape` | Back to the previous tool  |

**Color & Character:**

| Key/Combo                | Action                                            |
| ------------------------ | ------------------------------------------------- |
| `0`-`7`                  | Foreground color (press again for bright)         |
| `ctrl 0`-`7`             | Foreground color, works in keyboard mode          |
| `alt 0`-`7`              | Background color (press again for bright)         |
| `ctrl up`/`ctrl down`    | Previous/next foreground color                    |
| `ctrl left`/`ctrl right` | Previous/next background color                    |
| `ctrl u`                 | Pick up colors under the cursor (keyboard mode)   |
| `F1`-`F12`               | Insert character from the active page (see below) |
| `ctrl [` / `ctrl ]`      | Previous/next character page                      |

**File & Canvas:**

| Combo                                     | Action                     |
| ----------------------------------------- | -------------------------- |
| `ctrl z` / `ctrl y`                       | Undo / Redo                |
| `ctrl x`/`ctrl c`/`ctrl v`/`ctrl shift v` | Cut/Copy/Paste/SystemPaste |
| `ctrl backspace`                          | Delete selection           |
| `ctrl +` / `ctrl -`                       | Zoom in / out              |

**Navigation (Keyboard Mode):**

| Key                      | Action                  |
| ------------------------ | ----------------------- |
| `arrow keys`             | Move cursor             |
| `home`                   | Start of current row    |
| `end`                    | End of current row      |
| `page up` / `page down`  | Move by viewport screen |
| `cmd left` / `cmd right` | Start/end of row        |

**Advanced Editing (`alt` + key):**

| Combo                           | Action               |
| ------------------------------- | -------------------- |
| `alt up` / `alt down`           | Insert/Delete row    |
| `alt right` / `alt left`        | Insert/Delete column |
| `alt e` / `alt shift e`         | Erase row/col        |
| `alt home` / `alt end`          | Erase to start/end   |
| `alt page up` / `alt page down` | Erase to top/bottom  |

**Selection Operations:**

| Key       | Action                  |
| --------- | ----------------------- |
| `[` / `]` | Flip selection          |
| `m`       | Move mode               |
| `enter`   | Return to keyboard mode |

**Selection Navigation:**

| Key                     | Action                            |
| ----------------------- | --------------------------------- |
| `arrow keys`            | Move selection area by one cell   |
| `shift arrow keys`      | Expand/shrink selection           |
| `home` / `end`          | Expand selection to row start/end |
| `page up` / `page down` | Move selection by screen height   |

**In Move Mode:**

- `arrow keys`, `page up`, `page down` move selected content

**Function Keys (`F1`-`F12`):** Quick character insert from the active page. The default page holds the classic blocks:

| Key   | Character | Description        |
| ----- | --------- | ------------------ |
| `f1`  | `░`       | Light shade block  |
| `f2`  | `▒`       | Medium shade block |
| `f3`  | `▓`       | Dark shade block   |
| `f4`  | `█`       | Full block         |
| `f5`  | `▀`       | Upper half block   |
| `f6`  | `▄`       | Lower half block   |
| `f7`  | `▌`       | Left half block    |
| `f8`  | `▐`       | Right half block   |
| `f9`  | `■`       | Small solid square |
| `f10` | `·`       | Middle dot         |
| `f11` | `•`       | Bullet             |
| `f12` | ` `       | Space              |

**Cycling character pages:**

- Use the arrow buttons at either end of the F-key bar, or `ctrl [` and `ctrl ]`, to cycle pages: all of CP437 (boxes, blocks, symbols, accents, and more), unicode pages (rounded corners and diagonals, sextants, wedges, eighth blocks), and any charsets you import through the [character set picker](#character-sets--unicode).

## Mouse Controls

- **left click:** Draw, place cursor
- **click & drag:** Draw/Shape or select region
- **shift click:** Straight line with freehand
- **alt click:** Sample colors (any tool)
- **right click:** Set the background color (in the color panels); on the canvas the browser context menu is suppressed

## Related Documentation

- [architecture.md](architecture.md) - System architecture and design
