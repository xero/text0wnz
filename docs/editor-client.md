# Editor Client (Frontend App)

The teXt0wnz client is a browser-based text art editor supporting ANSI, ASCII, XBIN, NFO, and other text-based artwork formats.

## Features

### Drawing Tools

**Keyboard Mode** - Full text input with navigation controls. Type characters directly onto the canvas with arrow keys, Home/End, Page Up/Down navigation.

**Freehand/Half Block** - Draw with half-blocks for pixel-like drawing. Pressure-sensitive drawing, hold Shift for straight lines. Perfect for detailed shading work.

**Shading Brush** - Draw with shading blocks (░▒▓). Pressure-sensitive with 'reduce mode' when holding Shift. Ideal for gradients and texture effects.

**Character Brush** - Draw with any ASCII/extended character from the character palette. Includes a character picker for selecting specific glyphs.

**Fill Tool** - Flood fill for colors and text patterns. Smart attribute handling to preserve existing artwork while changing colors.

**Color/Attribute Brush** - Paint colors only without changing characters. Hold Alt to paint background colors instead of foreground.

**Line Tool** - Draw straight lines with automatic color conflict resolution. Great for creating borders and geometric designs.

**Square/Circle Tool** - Draw rectangles, circles, and ellipses. Choose between outline or filled shapes with real-time preview.

**Selection Tool** - Select rectangular areas for copying, cutting, and manipulation. Includes flip horizontal/vertical and move operations.

**Sample Tool (Alt)** - Color picker that samples colors from existing artwork. Works as a quick color selection method.

## Key Bindings & Mouse Controls

### Main Tool Shortcuts

| Key      | Action/Tool                |
|----------|----------------------------|
| K        | Keyboard Mode              |
| F        | Freestyle (half-block)     |
| B        | Character Brush            |
| N        | Fill                       |
| A        | Attribute Brush            |
| G        | Grid Toggle                |
| I        | iCE Colors Toggle          |
| M        | Mirror Mode (drawing)      |

### Color & Character

| Key/Combo   | Action                     |
|-------------|----------------------------|
| D           | Reset colors to default    |
| Q           | Swap foreground/background |
| 0–7         | Select basic color         |
| F1–F12      | Insert special block chars |

### File & Canvas

| Key Combo           | Action                      |
|---------------------|-----------------------------|
| Ctrl+Z / Ctrl+Y     | Undo / Redo                 |
| Ctrl+X/C/V/Shift+V  | Cut/Copy/Paste/System Paste |
| Ctrl+Delete         | Delete selection            |

### Navigation (Keyboard Mode)

| Key              | Action                  |
|------------------|-------------------------|
| Arrow Keys       | Move cursor             |
| Home/End         | Line start/end          |
| Page Up/Down     | Page jump               |
| Tab/Backspace    | Insert tab/delete left  |
| Enter            | New line                |

### Advanced Editing (Alt + Key)

| Combo             | Action            |
|-------------------|-------------------|
| Alt+Up/Down       | Insert/Delete row |
| Alt+Right/Left    | Insert/Delete col |
| Alt+E/Shift+E     | Erase row/col     |
| Alt+Home/End      | Erase to start/end|
| Alt+PgUp/PgDn     | Erase to top/bottom|

### Selection Operations

| Key      | Action         |
|----------|---------------|
| [ / ]    | Flip selection |
| M        | Move mode      |

### Special Function Keys

| Key | Character | Description |
|-----|-----------|-------------|
| F1  | `░` | Light shade block |
| F2  | `▒` | Medium shade block |
| F3  | `▓` | Dark shade block |
| F4  | `█` | Full block |
| F5  | `▀` | Upper half block |
| F6  | `▄` | Lower half block |
| F7  | `▌` | Left half block |
| F8  | `▐` | Right half block |
| F9  | `■` | Small solid square |
| F10 | `○` | Circle |
| F11 | `•` | Bullet |
| F12 | `NULL` | Blank/transparent |

### Mouse Controls

- **Left Click:** Draw
- **Drag:** Draw/Shape
- **Shift+Click:** Straight line (freehand)
- **Alt+Click:** Sample color/alt draw
- **Right Click:** Context menu

## Color Management

### ANSI Color Palette

- 16-color ANSI palette (8 standard + 8 bright colors)
- Real-time color preview
- Foreground and background color selection
- Quick color swap (Q key)

### iCE Colors

Extended 16-color background palette (normally only 8 are available in ANSI). Enable via the View menu or I key. Required for certain artwork styles.

### Color Conflict Resolution

When drawing lines or shapes with multiple colors, the editor intelligently resolves color conflicts to maintain visual consistency.

## Canvas Operations

### Canvas Resizing

Access via Edit menu to change canvas dimensions. Canvas can be expanded or reduced while preserving existing artwork.

### Undo/Redo

- Up to 1000 undo operations
- Ctrl+Z to undo
- Ctrl+Y to redo
- Full undo history maintained during session

### Grid Overlay

Toggle grid with G key. Useful for alignment and precision work.

### Font Selection

Access via View menu. Choose from classic ANSI fonts and modern XBIN fonts. See [fonts.md](fonts.md) for a complete list.

### SAUCE Metadata

Edit artwork metadata via File menu. Includes title, author, group, comments, and other standard SAUCE fields.

## File Operations

### Supported File Types

- `*.ans`: ANSI art
- `*.utf8.ans`: UTF-8 ANSI for terminals
- `*.bin`: DOS-era BIN
- `*.xbin`: Modern XBIN with embedded fonts/palettes
- `*.nfo`: Scene/release NFO
- `*.txt`: ASCII text
- Any other plain text file

### Import/Export

**Import:**
- Load existing files via File → Open
- Drag and drop files onto canvas
- Automatic format detection

**Export:**
- ANSI (.ans)
- Binary (.bin)
- XBIN (.xb) with embedded fonts
- UTF-8 text (.utf8.ans)
- PNG image export

### Auto Save/Restore

Artwork is automatically saved to browser localStorage as you draw. When reopening the app, your work is automatically restored. Works even when offline.

## Progressive Web App (PWA)

The editor works as a Progressive Web App:

- Install to desktop/home screen
- Works offline
- Updates automatically
- No installation required

## Tips & Workflow

1. Start with Keyboard Mode for layout and text
2. Use Grid (G key) for alignment
3. Switch to Freestyle for shading and pixel art
4. Use Character Brush for textures and patterns
5. Fill Tool for large color blocks
6. Selection Tool for moving and copying sections
7. Save often (Ctrl+S)
8. Use F-keys for quick access to block characters
9. Alt+Click to sample colors from artwork
10. Undo/Redo freely (up to 1000 operations stored)

## Browser Support

The editor works on desktop and mobile browsers:

- Chrome/Chromium 95+
- Firefox 93+
- Safari 15+
- Edge 95+

## Client-Side Architecture

### Project Structure

```
src/js/client/
├── main.js           # Application entry point and initialization
├── canvas.js         # Canvas rendering and manipulation
├── keyboard.js       # Keyboard shortcuts and text input handling
├── ui.js             # UI components and interactions
├── palette.js        # Color palette management
├── file.js           # File I/O operations (load/save)
├── freehand_tools.js # Drawing tools implementation
├── toolbar.js        # Toolbar state management
├── state.js          # Global application state
├── utils.js          # Utility functions
├── worker.js         # Web Worker for background processing
└── network.js        # Collaboration/network functionality
```

### Key Modules

**main.js** - Initializes the application, sets up event listeners, and coordinates module loading.

**canvas.js** - Manages the text art canvas, handles drawing operations, dirty region tracking, and image data manipulation.

**keyboard.js** - Handles keyboard input, shortcuts, and keyboard mode functionality.

**ui.js** - Manages UI components, dialogs, menus, and user interactions.

**palette.js** - Manages color palettes, RGB conversions, and color selection.

**file.js** - Handles file loading, saving, format detection, SAUCE metadata, and PNG export.

**state.js** - Maintains global application state including current font, palette, tool, and canvas settings.

## Standalone vs Collaborative Mode

### Standalone Mode (Client-Only)

When the collaboration server is not available or not needed:

- Fully functional text art editor
- All drawing tools work locally
- Files save/load from local storage or file system
- No network connection required
- Perfect for offline use or local-only editing

### Collaborative Mode (With Server)

When connected to the collaboration server:

- Real-time multi-user editing
- Shared canvas state
- Chat functionality
- Session persistence
- User presence indicators

See [collaboration-server.md](collaboration-server.md) for server setup and details.
