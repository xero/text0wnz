# Technical File Loader Implementation Guide for teXt0wnz

## Overview

This is a **technical implementation guide** for adding ANSI file loading with SAUCE metadata support to teXt0wnz. This guide provides specific code implementations that integrate directly with the existing `canvasRenderer.ts`, `fontManager.ts`, and event bus architecture.

## Architecture Integration Points

### Canvas Renderer Integration (`src/scripts/canvasRenderer.ts`)
- **Data Format**: `state.currentRoom.canvas.rawdata` as `Uint8Array` with triplets `[charCode, fg, bg]`
- **Update Method**: Use `updateCanvasData(newCanvas: CanvasState)` to replace canvas content
- **Events**: Canvas renderer already subscribes to `'local:file:loaded'` event (line 66-68)
- **Dimensions**: Canvas resizing handled automatically via `resizeCanvasToState()`

### Font Manager Integration (`src/scripts/fontManager.ts`)
- **Font Loading**: Use `setFont(fontName, fontType, palette, letterSpacing)` 
- **Font Path**: Fonts loaded from `./ui/fontz/{name}.png` (16x16 grid, 256 chars)
- **Font Types**: `'cp437' | 'utf8'` (defined in `FontType` union)
- **Font Naming**: Expected format `{name}{width}x{height}` (e.g., `cp437_8x16.png`)

### State Management (`src/scripts/state.ts`)
- **Canvas State**: `CanvasState` interface with `sauce?: SauceMetadata`
- **Data Structure**: `rawdata: Uint8Array` triplet format `[char, fg, bg, ...]`
- **SAUCE Support**: `SauceMetadata` interface already defined (lines 45-50)

### Event Bus (`src/scripts/eventBus.ts`)
- **File Event**: `'local:file:loaded': { fileName: string; data: ArrayBuffer }`
- **Usage**: Canvas renderer listens for this event to trigger redraw

## Implementation Plan

### Phase 1: SAUCE Parser and File Reading (2-3 hours)

#### Step 1.1: Implement SAUCE Parser in `fileLoader.ts`

```typescript
// src/scripts/fileLoader.ts additions

interface SauceRecord {
  id: string;      // "SAUCE00"
  title: string;   // 35 chars
  author: string;  // 20 chars  
  group: string;   // 20 chars
  date: string;    // 8 chars CCYYMMDD
  filesize: number; // 4 bytes
  datatype: number; // 1 byte
  filetype: number; // 1 byte
  tinfo1: number;   // 2 bytes (width)
  tinfo2: number;   // 2 bytes (height)
  tinfo3: number;   // 2 bytes (font width)
  tinfo4: number;   // 2 bytes (font height)
  comments: number; // 1 byte
  tflags: number;   // 1 byte
  tinfos: string;   // 22 chars
}

// Binary reading utilities
function readLE16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function readLE32(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8) | 
         (data[offset + 2] << 16) | (data[offset + 3] << 24);
}

function readString(data: Uint8Array, offset: number, length: number): string {
  return new TextDecoder('latin1').decode(data.slice(offset, offset + length))
    .replace(/\0+$/, ''); // trim null terminators
}

// Main SAUCE parser - integrates with existing SauceMetadata interface
function parseSauce(data: Uint8Array): SauceMetadata | null {
  if (data.length < 128) return null;
  
  // SAUCE record is last 128 bytes
  const sauceStart = data.length - 128;
  const id = readString(data, sauceStart, 5);
  
  if (id !== 'SAUCE') return null;
  
  return {
    title: readString(data, sauceStart + 7, 35).trim(),
    author: readString(data, sauceStart + 42, 20).trim(),
    group: readString(data, sauceStart + 62, 20).trim(),
    comments: readString(data, sauceStart + 82, 22).trim()
  };
}
```

#### Step 1.2: ANSI Parser with Canvas Integration

```typescript
// Parse ANSI escape sequences and populate canvas rawdata
function parseAnsiToCanvas(data: Uint8Array, sauce: SauceMetadata | null): CanvasState {
  // Default to 80x25 or use SAUCE dimensions
  let width = 80, height = 25;
  let fontName = 'cp437_8x16'; // default CP437 font
  
  // Extract dimensions from SAUCE if available
  if (sauce) {
    // SAUCE tinfo1/tinfo2 would be width/height from parsing above
    // For now, detect from content or use defaults
  }
  
  // Create canvas rawdata in teXt0wnz format: [charCode, fg, bg] triplets
  const rawdata = new Uint8Array(width * height * 3);
  
  // Initialize with spaces (char 32), white on black (7, 0)
  for (let i = 0; i < width * height; i++) {
    rawdata[i * 3 + 0] = 32; // space character
    rawdata[i * 3 + 1] = 7;  // white foreground  
    rawdata[i * 3 + 2] = 0;  // black background
  }
  
  // ANSI parsing state
  let x = 0, y = 0;
  let fg = 7, bg = 0; // white on black
  let i = 0;
  
  // Remove SAUCE record if present
  const ansiLength = sauce ? data.length - 128 : data.length;
  
  while (i < ansiLength && y < height) {
    const char = data[i];
    
    if (char === 0x1B && i + 1 < ansiLength && data[i + 1] === 0x5B) {
      // ESC[ - ANSI escape sequence
      i += 2;
      let seq = '';
      
      // Read until letter (command)
      while (i < ansiLength) {
        const c = data[i];
        if ((c >= 0x40 && c <= 0x7E)) { // Letter command
          const cmd = String.fromCharCode(c);
          
          if (cmd === 'm') {
            // Color command - parse SGR parameters
            const params = seq ? seq.split(';').map(n => parseInt(n) || 0) : [0];
            
            for (const param of params) {
              if (param === 0) { fg = 7; bg = 0; } // reset
              else if (param >= 30 && param <= 37) fg = param - 30; // foreground
              else if (param >= 40 && param <= 47) bg = param - 40; // background
              else if (param >= 90 && param <= 97) fg = param - 90 + 8; // bright fg
              else if (param >= 100 && param <= 107) bg = param - 100 + 8; // bright bg
            }
          }
          // Add other ANSI commands (cursor movement, etc.) as needed
          
          break;
        } else {
          seq += String.fromCharCode(c);
        }
        i++;
      }
    } else if (char === 0x0D) {
      // Carriage return
      x = 0;
    } else if (char === 0x0A) {
      // Line feed
      y++;
      x = 0;
    } else {
      // Regular character
      if (x < width && y < height) {
        const pos = (y * width + x) * 3;
        rawdata[pos + 0] = char;
        rawdata[pos + 1] = fg;
        rawdata[pos + 2] = bg;
        x++;
        if (x >= width) {
          x = 0;
          y++;
        }
      }
    }
    i++;
  }
  
  return {
    id: Date.now(), // temporary ID
    name: 'Loaded ANSI',
    sauce,
    width,
    height,
    font: fontName,
    fontType: 'cp437' as FontType,
    spacing: 0,
    ice: false,
    colors: [
      0x000000, 0x800000, 0x008000, 0x808000, // 0-3: black, red, green, yellow
      0x000080, 0x800080, 0x008080, 0xC0C0C0, // 4-7: blue, magenta, cyan, white
      0x808080, 0xFF0000, 0x00FF00, 0xFFFF00, // 8-11: bright versions
      0x0000FF, 0xFF00FF, 0x00FFFF, 0xFFFFFF  // 12-15: bright blue, magenta, cyan, white
    ],
    rawdata,
    updatedAt: new Date().toISOString()
  };
}
```

#### Step 1.3: Main File Loading Function

```typescript
// Main file loader that integrates with existing architecture
export async function loadAnsiFile(file: File): Promise<void> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    // Parse SAUCE metadata
    const sauce = parseSauce(data);
    
    // Parse ANSI content to canvas format
    const canvasState = parseAnsiToCanvas(data, sauce);
    
    // Update global state - assumes state is accessible
    import('./state').then(({ state }) => {
      if (state.currentRoom) {
        // Use canvas renderer's update method
        import('./canvasRenderer').then(({ updateCanvasData }) => {
          updateCanvasData(canvasState);
          
          // Emit event that canvas renderer already listens for
          import('./eventBus').then(({ eventBus }) => {
            eventBus.publish('local:file:loaded', {
              fileName: file.name,
              data: arrayBuffer
            });
          });
        });
      }
    });
    
  } catch (error) {
    console.error('Failed to load ANSI file:', error);
    // Emit error event
    import('./eventBus').then(({ eventBus }) => {
      eventBus.publish('ui:notification', {
        message: `Failed to load ${file.name}: ${error.message}`,
        level: 'error'
      });
    });
  }
}
```

### Phase 2: Font Integration (1-2 hours)

#### Step 2.1: Font Detection from SAUCE

```typescript
// Map SAUCE font info to teXt0wnz font files
function mapSauceToFont(sauce: SauceMetadata | null): { name: string; type: FontType } {
  // Default CP437 8x16
  if (!sauce) return { name: 'cp437_8x16', type: 'cp437' };
  
  // SAUCE font mapping - extend based on available fonts in ./ui/fontz/
  const fontMap: Record<string, { name: string; type: FontType }> = {
    'IBM VGA': { name: 'cp437_8x16', type: 'cp437' },
    'IBM VGA50': { name: 'cp437_8x8', type: 'cp437' },
    'IBM EGA': { name: 'cp437_8x14', type: 'cp437' },
    'IBM EGA43': { name: 'cp437_8x8', type: 'cp437' },
    // Add more mappings based on available font files
  };
  
  // Try to match SAUCE font info
  for (const [sauceFont, fontInfo] of Object.entries(fontMap)) {
    if (sauce.comments?.includes(sauceFont)) {
      return fontInfo;
    }
  }
  
  return { name: 'cp437_8x16', type: 'cp437' }; // fallback
}

// Update canvas dimensions based on font
async function loadAppropriateFont(canvasState: CanvasState): Promise<void> {
  const fontInfo = mapSauceToFont(canvasState.sauce);
  
  // Load font using existing font manager
  const { setFont } = await import('./fontManager');
  const { palette } = await import('./paletteManager'); // assuming this exists
  
  try {
    const fontRenderer = await setFont(
      fontInfo.name,
      fontInfo.type,
      palette,
      canvasState.spacing > 0
    );
    
    // Update canvas renderer with new font
    const { initCanvasRenderer } = await import('./canvasRenderer');
    // This would require access to renderer instance to call setFont()
    
  } catch (error) {
    console.warn('Font loading failed, using default:', error);
    // Fallback to default font
  }
}
```

### Phase 3: UI Integration (1 hour)

#### Step 3.1: File Input Handler

```typescript
// Add to main.ts or uiController.ts
export function initFileLoading(): void {
  // Create hidden file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.ans,.xb,.bin';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  
  // Handle file selection
  fileInput.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      await loadAnsiFile(file);
    }
  });
  
  // Keyboard shortcut (Ctrl+O)
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'o') {
      event.preventDefault();
      fileInput.click();
    }
  });
  
  // Drag and drop support
  document.addEventListener('dragover', (event) => {
    event.preventDefault();
  });
  
  document.addEventListener('drop', async (event) => {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files && files[0]) {
      await loadAnsiFile(files[0]);
    }
  });
}
```

#### Step 3.2: SAUCE Form Population

```typescript
// Integration with existing SAUCE UI elements in uiController.ts
function populateSauceForm(sauce: SauceMetadata | null): void {
  // Use existing UI elements from uiController.ts
  if (sauce) {
    sauceTitle.value = sauce.title || '';
    sauceAuthor.value = sauce.author || '';
    sauceGroup.value = sauce.group || '';
    sauceComments.value = sauce.comments || '';
    
    // Update navigation title to match
    navTitle.value = sauce.title || 'untitled';
    
    // Trigger existing byte count update
    enforceMaxBytes();
  } else {
    // Use existing defaults function
    sauceDefaults();
  }
}

// Update main loading function to populate form
export async function loadAnsiFile(file: File): Promise<void> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    // Parse SAUCE metadata
    const sauce = parseSauce(data);
    
    // Parse ANSI content to canvas format
    const canvasState = parseAnsiToCanvas(data, sauce);
    
    // Update global state
    const { state } = await import('./state');
    if (state.currentRoom) {
      // Update canvas data using existing architecture
      const { updateCanvasData } = await import('./canvasRenderer');
      updateCanvasData(canvasState);
      
      // Populate existing SAUCE form UI
      populateSauceForm(sauce);
      
      // Update canvas dimensions display using existing function
      displayRes(canvasState.width, canvasState.height);
      
      // Emit event that canvas renderer already listens for
      const { eventBus } = await import('./eventBus');
      eventBus.publish('local:file:loaded', {
        fileName: file.name,
        data: arrayBuffer
      });
    }
    
  } catch (error) {
    console.error('Failed to load ANSI file:', error);
    const { eventBus } = await import('./eventBus');
    eventBus.publish('ui:notification', {
      message: `Failed to load ${file.name}: ${error.message}`,
      level: 'error'
    });
  }
}
```

## Testing Strategy

### Unit Tests (`tests/unit/fileLoader.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { parseSauce, parseAnsiToCanvas } from '../src/scripts/fileLoader';

describe('SAUCE Parser', () => {
  it('should extract metadata from x0-outlaw-research.ans', async () => {
    // Load test file
    const response = await fetch('./examples/ansi/x0-outlaw-research.ans');
    const data = new Uint8Array(await response.arrayBuffer());
    
    const sauce = parseSauce(data);
    
    expect(sauce).toBeTruthy();
    expect(sauce?.title).toBe('outlaw research');
    expect(sauce?.author).toBe('x0^67^aMi5H^iMP!');
    expect(sauce?.group).toBe('blocktronics');
  });
  
  it('should return null for files without SAUCE', () => {
    const data = new Uint8Array([65, 66, 67]); // Simple text without SAUCE
    const sauce = parseSauce(data);
    expect(sauce).toBeNull();
  });
  
  it('should parse ANSI to correct canvas format', () => {
    // Test with simple ANSI: "Hello" in red
    const ansiData = new Uint8Array([
      0x1B, 0x5B, 0x33, 0x31, 0x6D, // ESC[31m (red)
      0x48, 0x65, 0x6C, 0x6C, 0x6F   // "Hello"
    ]);
    
    const canvas = parseAnsiToCanvas(ansiData, null);
    
    expect(canvas.width).toBe(80);
    expect(canvas.height).toBe(25);
    expect(canvas.rawdata[0]).toBe(0x48); // 'H'
    expect(canvas.rawdata[1]).toBe(1);     // red foreground
    expect(canvas.rawdata[2]).toBe(0);     // black background
  });
});
```

### E2E Tests (`tests/e2e/fileLoading.spec.ts`)

```typescript
import { test, expect } from '@playwright/test';

test('loads ANSI file and renders correctly', async ({ page }) => {
  await page.goto('/');
  
  // Close splash dialog
  await page.click('#splashDraw');
  
  // Upload test file via drag and drop
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('./examples/ansi/x0-outlaw-research.ans');
  
  // Verify canvas updated
  const canvas = page.locator('#art');
  await expect(canvas).toBeVisible();
  
  // Check that SAUCE form was populated
  await page.click('text=untitled'); // Click nav title to open SAUCE modal
  await expect(page.locator('#sauceTitle')).toHaveValue('outlaw research');
  await expect(page.locator('#sauceAuthor')).toHaveValue('x0^67^aMi5H^iMP!');
  await expect(page.locator('#sauceGroup')).toHaveValue('blocktronics');
});

test('handles drag and drop file loading', async ({ page }) => {
  await page.goto('/');
  await page.click('#splashDraw');
  
  // Simulate drag and drop
  const dropZone = page.locator('body');
  await dropZone.dispatchEvent('drop', {
    dataTransfer: {
      files: [{ name: 'test.ans', type: 'text/plain' }]
    }
  });
  
  // Should trigger file loading process
  await expect(page.locator('#art')).toBeVisible();
});
```

## Performance Considerations

1. **Streaming**: For large files, consider using `ReadableStream` for progressive loading
2. **Worker Processing**: Move ANSI parsing to Web Worker for heavy files
3. **Caching**: Cache parsed font mappings and SAUCE metadata
4. **Dirty Regions**: Use existing dirty region system for efficient redraws

## Error Handling

1. **File Validation**: Check file size limits and format validity
2. **Graceful Degradation**: Fall back to defaults for missing fonts/invalid data
3. **User Feedback**: Use existing notification system for errors
4. **Recovery**: Preserve existing canvas if file loading fails

This implementation directly leverages teXt0wnz's existing architecture and provides specific code that integrates with the canvas renderer, font manager, and event system.
