# teXt0wnz interface

Quick Reference:

![overview](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/overview.png)

# Top Bar

## ![top-left-nav](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/top-left-nav.png) Editor Menus

### File Menu

File operations allowing your to create, open, and save artwork in multiple file types

![file-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/file-menu.png)

### Edit Menu

Edit operations to quickly add/remove rows/columns, erase sections, and more.

![edit-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/edit-menu.png)

### Sauce Editor

Sauce is a special metadata format created by the ANSI text art scene. It allows for title, author, release group, and comments. Read more about the [Sauce Format](sauce-format).

![sauce](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/sauce.png)

## ![top-right-nav](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/top-right-nav.png) Status Display

This section of the UI display the current canvas size, font, and cursor position. Clicking the Resolution or Font Name will open their respective options menus.

## Canvas Resolution / Size

![resolution](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/resolution.png)

Text art is resolution is calculated by columns and rows. 80 x 25 is the default size of dial-up BBS screens, and is still a very common  size for text art to this day. But feel free to make it as large as you like, even use the 80th column _\*gasps!\*_

# Color Management

![color-palette](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/color-palette.png)

# Current Colors

- Foreground and background color selection
- Click to swap foreground/background colors

# Color Palette

- 16-color ANSI palette (8 standard + 8 bright colors)
- Real-time color preview
- Quick color swap (Q key)
- Double click to change color (XBIN files only)

# Tools

![tools](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/tools.png)

Some tool such as "Brushes" have many options or sub-tools. Clicking the tool icon from the left menu will update (or clear) the current tool options section of the top bar.

## ![keyboard](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/keyboard.png) Keyboard Mode

Full text input with navigation controls. Type characters directly onto the canvas. Use the F-key to insert block shadhing characters (`░▒▓`) like traditional ANSI editors. Navigate the canvas with the arrow keys, home/end, and page up/down.

![f-key legend](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/fkeys.png)

_Tip_: click the F-key legend preview to insert that character to the current cell.

## ![brush](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/brush.png) Brushes

![brush-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/brush-menu.png)

### Freehand/Half Block

Draw with half-blocks for pixel-like drawing. Hold Shift for straight lines. Perfect for detailed shading work.

### Shading Brush

Draw with shading blocks (`░▒▓`). 'Reduce mode' when holding Shift. Ideal for gradients and texture effects. Includes a block color gradient picker. Click the 'X' to close it, or drag it around using the top area.

![shading-panel](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/shading-panel.png)

### Character Brush

Draw with any character from the font. Includes a character picker for selecting specific glyphs.

![character-panel](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/character-panel.png)

### Colorize/Attribute Brush

Paint/recolor the foreground and background colors of the selected cell.

## ![fill](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/fill.png) Fill Tool

Flood fill for colors and text patterns with smart attribute handling to preserve existing artwork while changing colors.

## ![shapes](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/shapes.png) Shapes

![shape-tools](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/shape-tools.png)

### Line Tool

Draw straight lines with automatic color conflict resolution. Great for creating borders and geometric designs.

![line](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/line.png)

### Square/Circle Tool

Draw rectangles, circles, and ellipses. Choose between outline or filled shapes with real-time preview.

![square](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/square.png)

![circle](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/circle.png)

## ![selection tool](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/selectiontool.png) Selection Tool

![selection-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/selection-menu.png)

Visually highlight rectangular sections of the canvas and apply transformations to it.

- Flip Horizontally
- Flip Vertically
- Move
- Cut
- Copy
- Paste (from app clipboard)
- System Paste (from operating system clipboard)

The default selection mode is white:

![selection](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/selection.png)

Move mode is orange:

![move](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/move.png)

## ![sample](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/sample.png) Sample Tool

Sync the editor foreground/background color and brush tool with the selected cell.

## ![mirror](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/mirror.png) Mirror Mode

Horizontally mirrors any drawing tool on the opposite site of the canvas.

**Example**:

![mirror-mode](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/mirror-mode.png)

## ![font](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/font.png) Fonts

![font-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/font-menu.png)

Change the font options for your artwork.

### Font Select
Choose from classic ANSI fonts and modern XBIN fonts. See [fonts.md](fonts) for a complete list.

![font-select](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/font-select.png)

### iCE Colors

Extended 16-color background palette (normally only 8 are available in ANSI). Required for certain artwork styles.

### 9pt Font

A special "extra pixel" wide mode.

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

## ![history](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/history.png) History

![history-menu](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/history-menu.png)

- Up to 1000 undo operations
- `ctrl+z` to undo
- `ctrl+y` to redo
- History maintained during session

## ![grid](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/gridtool.png) Grid Overlay

Toggles the visual grid. Useful for alignment and precision work.

![grid example](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/grid.png)

## ![modeselect](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/modeselect.png) Mode Toggle

This button toggles light / dark mode interface colors

![dark-mode](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/dark-mode.png)

![light-mode](https://raw.githubusercontent.com/wiki/xero/text0wnz/img/light-mode.png)
