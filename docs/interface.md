# teXt0wnz interface

## Quick Reference:

![overview](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/overview.png)

# Top Bar

## ![top-left-nav](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/top-left-nav.png) Editor Menus

### File Menu

File operations allowing you to create, open, and save artwork in multiple file types.

**Supported Formats:**

- **ANSI** (.ans) - Classic ANSI text art format
- **NFO** (.nfo) - Warez scene release format
- **Binary Text** (.bin) - Raw binary format (scene legacy)
- **XBin** (.xb) - Extended Binary format with embedded fonts and palettes
- **UTF-8** (.utf8.ans) - Export as text with shell color escape codes
- **Plain Text** (.txt) - Export as text only
- **PNG** - Export as image

See [other-tools.md](other-tools.md) for information on working with different file formats and [xb-format.md](xb-format.md) for details on the XBin format.

![file-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/file-menu.png)

### Edit Menu

Edit operations to quickly add/remove rows/columns, erase sections, and more.

**Features:**

- **Clipboard Operations** - Cut, copy, paste (both app and system clipboard)
- **Undo/Redo** - Full history support with keyboard shortcuts
- **Canvas Manipulation** - Insert/delete rows and columns
- **Erase Tools** - Clear rows, columns, or specific sections
- **Color Operations** - Default color, swap colors
- **Fullscreen Mode** - Toggle fullscreen for distraction-free editing

See [editor-client.md](editor-client.md) for more details on editor features and keyboard shortcuts.

![edit-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/edit-menu.png)

### Sauce Editor

_"[Sauce](sauce-format)"_ is a special metadata format created by the ANSI text art scene. It allows for embedding title, author, release group, and comments into files.

![sauce](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/sauce.png)

## ![top-right-nav](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/top-right-nav.png) Status Display

This section of the UI displays the current canvas size, font, and cursor position. Clicking the Resolution or Font Name will open their respective options menus.

**Status Elements:**

- **Resolution** - Current canvas size (columns × rows)
- **Font Name** - Active font (click to change)
- **Cursor Position** - Current cell coordinates (column, row)

See [fonts.md](fonts.md) for available font options.

## Canvas Resolution / Size

![resolution](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/resolution.png)

Text art resolution is calculated by columns and rows. 80 × 25 is the default size of dial-up BBS screens, and is still a very common size for text art to this day. But feel free to make it as large as you like, even use the 80th column _\*gasps!\*_

**Common Sizes:**

- **80 × 25** - Classic BBS terminal size
- **80 × 50** - Extended terminal mode
- **132 × 60** - Wide format for detailed work

See [building-and-developing.md](building-and-developing.md) for technical details on canvas rendering.

# Color Management

![color-palette](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/color-palette.png)

The color system uses the classic 16-color ANSI palette with optional iCE colors for extended backgrounds.

# Current Colors

- Foreground and background color selection
- Click to swap foreground/background colors
- Keyboard shortcut: **Q** to quickly swap colors
- Keyboard shortcut: **Ctrl+D** for default colors

# Color Palette

- 16-color ANSI palette (8 standard + 8 bright colors)
- Real-time color preview
- Quick color swap (Q key)
- Double click to change color (XBIN files only)

**Color Support:**

- Standard ANSI 16 colors
- iCE colors (extended 16 background colors)
- Custom palettes in XBIN format

See [xb-format.md](xb-format.md) for information on custom palettes and [architecture.md](architecture.md) for technical color handling details.

# Tools

![tools](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/tools.png)

Some tools such as "Brushes" have many options or sub-tools. Clicking the tool icon from the left menu will update (or clear) the current tool options section of the top bar.

> [!NOTE]
> The currently selected tool will be highlighted (keyboard mode in this case)

**Available Tools:**

- Keyboard Mode - Full text input
- Brushes - Freehand, shading, character, and attribute brushes
- Fill - Flood fill colors and patterns
- Shapes - Lines, rectangles, circles, and ellipses
- Selection - Select, move, copy, and transform areas
- Sample - Pick colors and characters from canvas
- Mirror Mode - Symmetrical drawing
- History - Undo/redo operations
- Font Selection - Choose from many classic fonts
- Grid - Toggle alignment grid
- Light/Dark Mode - Interface theme
- Zoom - Scale the drawing canvas

See [editor-client.md](editor-client.md) for detailed tool descriptions and [project-structure.md](project-structure.md) for technical implementation details.

## ![keyboard](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/keyboard.png) Keyboard Mode

Full text input with navigation controls. Type characters directly onto the canvas. Use the F-keys to insert block shading characters (`░▒▓`) like traditional ANSI editors.

**Features:**

- Direct character input
- F-key block character insertion
- Ctrl+[ / ] to swap character sets
- Traditional ANSI editor workflow
- Shift+Arrow keys switches to the Selection Tool

**Navigation:**

- **Arrow Keys** - Move cursor in any direction
- **Home** - Move to start of current row
- **End** - Move to end of current row
- **Page Up** - Move cursor up by one screen height
- **Page Down** - Move cursor down by one screen height
- **Cmd/Meta + Left Arrow** - Move to start of current row
- **Cmd/Meta + Right Arrow** - Move to end of current row
- **Enter** - Move to next line (start of new row)

![f-key legend](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/fkeys.png)

> [!TIP]
> Click the F-key legend preview to insert that character to the current cell.

See [editor-client.md](editor-client.md) for keyboard shortcuts and navigation details.

## ![brush](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/brush.png) Brushes

![brush-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/brush-menu.png)

Multiple brush types for different drawing techniques. Each brush has unique properties and use cases.

### Freehand/Half Block

Draw with half-blocks for pixel-like drawing. Hold Shift for straight lines. Think of this tool as your pen.

**Features:**

- Pixel-precise drawing with half-block characters
- Hold Shift for straight line constraints
- Ideal for detailed artwork

### Shading Brush

Draw with shading blocks (`░▒▓`). 'Reduce mode' when holding Shift. Ideal for gradients and texture effects. Includes a block color gradient picker. Click the 'X' to close it, or drag it around using the top area.

![shading-panel](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/shading-panel.png)

**Features:**

- Three shading levels: light (`░`), medium (`▒`), dark (`▓`)
- Reduce mode with Shift key
- Draggable gradient picker panel

### Character Brush

Draw with any character from the font. Includes a character picker for selecting specific glyphs.

![character-panel](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/character-panel.png)

**Features:**

- Access to full character set
- Interactive character picker
- Draw with any glyph from the active font

### Colorize/Attribute Brush

Paint/recolor the foreground and background colors of the selected cell. Use the size dropdown to adjust the brush size to paint larger/smaller areas.

**Brush size x1** _(default)_
![color-x1](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/color-x1.png)

**Brush size x3**
![color-x3](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/color-x3.png)

**Features:**

- Change colors without affecting characters
- Preserve existing artwork structure
- Quick color corrections
- Repaint large areas faster

See [fonts.md](fonts.md) for available characters in different fonts and [project-structure.md](project-structure.md) for technical brush implementation.

## ![fill](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/fill.png) Fill Tool

Flood fill for colors and text patterns with smart attribute handling to preserve existing artwork while changing colors.

**Features:**

- Flood fill connected regions
- Smart attribute detection
- Color-only fill option to preserve characters

See [project-structure.md](project-structure.md) for fill algorithm implementation details.

## ![shapes](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/shapes.png) Shapes

![shape-tools](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/shape-tools.png)

Draw geometric shapes with automatic color conflict resolution and real-time preview.

### Line Tool

Draw straight lines with automatic color conflict resolution. Great for creating borders and geometric designs.

![line](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/line.png)

**Features:**

- Click and drag to draw lines
- Automatic color mixing for intersections
- Perfect for borders and diagrams

### Square/Circle Tool

Draw rectangles, circles, and ellipses. Choose between outline or filled shapes with real-time preview.

![square](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/square.png)

![circle](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/circle.png)

**Features:**

- Rectangles and squares
- Circles and ellipses
- Outline or filled modes
- Real-time preview while dragging

See [architecture.md](architecture.md) for shape rendering algorithms.

## ![selection tool](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/selectiontool.png) Selection Tool

![selection-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/selection-menu.png)

Visually highlight rectangular sections of the canvas and apply transformations to it. The selection position is displayed in the status bar in real-time as you manipulate it.

**Keyboard Navigation:**

- **Arrow Keys** - Move selection by one cell
  - Default: Move the selection box
  - Move Mode: Move the selection _and its contents_
- **Shift + Arrow Keys** - Expand/shrink selection
- **Home** - Expand selection to start of current row
- **End** - Expand selection to end of current row
- **Page Up** - Move selection up by one screen height
- **Page Down** - Move selection down by one screen height
- **Cmd/Meta + Left Arrow** - Expand selection to start of current row
- **Cmd/Meta + Right Arrow** - Expand selection to end of current row

**Mouse/Touch:**

- **Click in unselected area** - Create new selection
- **Click and drag** - Create or expand selection to different cell
- **Within a selection (default mode)** - Move the selection box
- **Within a selection (move mode)** - Move the selection _and its contents_

> [!NOTE]
> Single clicks move the cursor without creating a selection. Drag to create a selection to prevent accidental single-cell selections.

**Viewport Auto-Scroll:**

When navigating selections with keyboard or mouse, the viewport automatically scrolls to keep the selection visible with a buffer zone, similar to cursor navigation.

**Operations:**

- Flip Horizontally (`[` key)
- Flip Vertically (`]` key)
- Move Mode (`M` key) - Toggle orange move mode
- Cut (`Ctrl+X`)
- Copy (`Ctrl+C`)
- Paste from app clipboard (`Ctrl+V`)
- System Paste from OS clipboard (`Ctrl+Shift+V`)

**Selection Modes:**

The default selection mode is white:

![selection](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/selection.png)

Move mode is orange (toggle with `M` key):

![move](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/move.png)

**Keyboard Shortcuts:**

- **Ctrl+X** - Cut selection
- **Ctrl+C** - Copy selection
- **Ctrl+V** - Paste from app clipboard
- **Ctrl+Shift+V** - Paste from system clipboard
- **[** - Flip horizontally
- **]** - Flip vertically
- **M** - Toggle move mode

See [editor-client.md](editor-client.md) for more keyboard shortcuts and clipboard operations.

## ![sample](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/sample.png) Sample Tool

Sync the editor foreground/background color and brush tool with the selected cell.

**Features:**

- Pick colors from existing artwork
- Copy character and color attributes
- Quick tool for color matching
- Keyboard shortcut: **Alt** key (while using other tools)

Great for matching colors and characters when working on complex artwork.

## ![mirror](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/mirror.png) Mirror Mode

Horizontally mirrors any drawing tool on the opposite side of the canvas.

**Features:**

- Automatic horizontal mirroring
- Works with all drawing tools
- Perfect for creating symmetrical designs
- Keyboard shortcut: **Ctrl+M**

**Example**:

![mirror-mode](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/mirror-mode.png)

Ideal for creating logos, symmetric patterns, and balanced compositions. See [editor-client.md](editor-client.md) for more drawing techniques.

## ![history](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/history.png) History

![history-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/history-menu.png)

Full undo/redo support for all drawing operations.

**Features:**

- Up to 1000 undo operations
- **Ctrl+Z** to undo
- **Ctrl+Y** to redo
- History maintained during session
- Works with all tools and operations

**Supported Operations:**

- Drawing and erasing
- Color changes
- Selection operations
- Canvas resizing
- Font changes

See [architecture.md](architecture.md) for state management implementation details.

## ![font](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/font.png) Fonts

![font-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/font-menu.png)

Change the font options for your artwork. teXt0wnz supports a wide variety of classic and modern fonts.

### Font Select

Choose from classic ANSI fonts and modern XBIN fonts. See [fonts.md](fonts.md) for a complete list of available fonts with previews.

![font-select](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/font-select.png)

**Font Categories:**

- **IBM PC** - Classic DOS code pages (CP437, CP850, etc.)
- **Modern** - Contemporary XBIN fonts (Topaz437, SES-SYM variants, etc.)
- **Commodore 64** - PETSCII fonts (Shifted, UnShifted, and DiskMaster)
- **Amiga** - MicroKnight, mO'sOul, P0t-N0oDLE, & Topaz variants
- **Internation CP** - Arabic, Cyrillic, Greek, Hebrew, and more

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

See [fonts.md](fonts.md) for the complete font catalog and [xb-format.md](xb-format.md) for embedding custom fonts in XBin files.

## ![viewport](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/viewport.png) Viewport Options

![viewport toolbar](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/viewport-toolbar.png)

Customize your editing experience with these interface options.

### Zoom

Visually scale the drawing canvas from 0.5-4x size, while keeping the interface elements unchanged.

![zoom-x1](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/zoom-x1.png)

![zoom-x2](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/zoom-x2.png)

- Use the slider or **Ctrl +** and **Ctrl -** to adjust the zoom
- Provides half size steps for greater control
- Select whole number scaling for pixel perfect rendering
- Preference saved in local storage

### ![theme select](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/modeselect.png) Light/Dark Mode

Toggles between light and dark mode interface colors.

![dark-mode](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/dark-mode.png)

![light-mode](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/light-mode.png)

**Features:**

- Dark mode for low-light environments
- Light mode for bright environments
- Preference saved in local storage
- Instant switching without reload

Choose the theme that works best for your environment and personal preference.

### ![grid](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/gridtool.png) Grid Overlay

Toggles the visual grid. Useful for alignment and precision work.

![grid example](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/grid.png)

**Features:**

- Visual cell boundaries
- Keyboard shortcut: **Ctrl+G**
- Helps with alignment and spacing
- Non-destructive overlay (doesn't affect artwork)

Perfect for creating precise layouts, aligning elements, and maintaining consistent spacing in your artwork.

> [!NOTE]
> See [privacy.md](privacy.md) for information on local storage usage.

# Collaboration Features

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

See [collaboration-server.md](collaboration-server.md) for details on setting up and using the collaboration server.
