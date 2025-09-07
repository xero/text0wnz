// async file parsing, emits events
import type {SauceMetadata, CanvasState, FontType} from './state';
import {eventBus} from './eventBus';
import {resizeCanvasToState, updateCanvasData} from './canvasRenderer';
import {setFont} from './fontManager';
import {createDefaultPalette} from './paletteManager';

function readString(data: Uint8Array, offset: number, length: number): string {
  return new TextDecoder('latin1').decode(data.slice(offset, offset + length))
    .replace(/\0+$/, ''); // trim null terminators
}

function readLE16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

/**
 * Parse SAUCE metadata from the last 128 bytes of a file
 */
export function parseSauce(data: Uint8Array): SauceMetadata | null {
  if (data.length < 128) return null;

  // SAUCE record is last 128 bytes
  const sauceStart = data.length - 128;
  const id = readString(data, sauceStart, 5);

  if (id !== 'SAUCE') return null;

  const version = readString(data, sauceStart + 5, 2);
  if (version !== '00') {
    console.warn(`Unsupported SAUCE version: ${version}`);
  }

  // Parse binary fields after text fields
  // DataType (1 byte) at offset 94
  // TInfo1 (2 bytes LE) at offset 96 - width for ANSI
  // TInfo2 (2 bytes LE) at offset 98 - height for ANSI
  // TFlags (1 byte) at offset 100 - ANSiFlags for ANSI files
  const dataType = data[sauceStart + 94];
  const tInfo1 = readLE16(data, sauceStart + 96); // width
  const tInfo2 = readLE16(data, sauceStart + 98); // height
  const tFlags = data[sauceStart + 100]; // ANSiFlags

  const sauce: SauceMetadata = {
    title: readString(data, sauceStart + 7, 35).trim(),
    author: readString(data, sauceStart + 42, 20).trim(),
    group: readString(data, sauceStart + 62, 20).trim(),
    comments: readString(data, sauceStart + 104, 22).trim()
  };

  // Add dimensions and ICE colors for ANSI files (DataType 1 = Character)
  if (dataType === 1) {
    if (tInfo1 > 0) sauce.width = tInfo1;
    if (tInfo2 > 0) sauce.height = tInfo2;
    // Extract ICE colors flag from bit 0 of TFlags (ANSiFlags)
    sauce.ice = (tFlags & 0x01) !== 0;
  }

  return sauce;
}

// Font mapping interface
interface FontMapping {
  name: string;
  type: FontType;
}

/**
 * Map SAUCE font info to teXt0wnz font files
 */
function mapSauceToFont(sauce: SauceMetadata | null): FontMapping {
  // Default CP437 8x16
  if (!sauce || !sauce.comments) {
    return {name: 'CP437 8x16', type: 'cp437'};
  }

  // SAUCE font mapping based on available fonts in ./ui/fontz/
  const fontMap: Record<string, FontMapping> = {
    // IBM VGA family (most common)
    'IBM VGA': {name: 'CP437 8x16', type: 'cp437'},
    'IBM VGA50': {name: 'CP437 8x8', type: 'cp437'},
    'IBM VGA25G': {name: 'CP437 8x19', type: 'cp437'},
    'IBM EGA': {name: 'CP437 8x14', type: 'cp437'},
    'IBM EGA43': {name: 'CP437 8x8', type: 'cp437'},

    // Amiga fonts (order matters - longer strings first for proper matching)
    'Amiga Topaz 1+': {name: 'Topaz+ 500 8x16', type: 'cp437'},
    'Amiga Topaz 2+': {name: 'Topaz+ 1200 8x16', type: 'cp437'},
    'Amiga Topaz 1': {name: 'Topaz 500 8x16', type: 'cp437'},
    'Amiga Topaz 2': {name: 'Topaz 1200 8x16', type: 'cp437'},
    'Amiga P0T-NOoDLE': {name: 'P0t-NOoDLE 8x16', type: 'cp437'},
    'Amiga MicroKnight+': {name: 'MicroKnight+ 8x16', type: 'cp437'},
    'Amiga MicroKnight': {name: 'MicroKnight 8x16', type: 'cp437'},
    'Amiga mOsOul': {name: 'mO\'sOul 8x16', type: 'cp437'},

    // Commodore 64
    'C64 PETSCII unshifted': {name: 'C64-PETSCII unshifted 8x8', type: 'cp437'},
    'C64 PETSCII shifted': {name: 'C64-PETSCII shifted 8x8', type: 'cp437'},

    // Code page variants
    'IBM VGA 737': {name: 'CP737 8x16', type: 'cp437'},
    'IBM VGA 775': {name: 'CP775 8x16', type: 'cp437'},
    'IBM VGA 850': {name: 'CP850 8x16', type: 'cp437'},
    'IBM VGA 852': {name: 'CP852 8x16', type: 'cp437'},
    'IBM VGA 855': {name: 'CP855 8x16', type: 'cp437'},
    'IBM VGA 857': {name: 'CP857 8x16', type: 'cp437'},
    'IBM VGA 860': {name: 'CP860 8x16', type: 'cp437'},
    'IBM VGA 861': {name: 'CP861 8x16', type: 'cp437'},
    'IBM VGA 862': {name: 'CP862 8x16', type: 'cp437'},
    'IBM VGA 863': {name: 'CP863 8x16', type: 'cp437'},
    'IBM VGA 864': {name: 'CP864 8x16', type: 'cp437'},
    'IBM VGA 865': {name: 'CP865 8x16', type: 'cp437'},
    'IBM VGA 866': {name: 'CP866 8x16', type: 'cp437'},
    'IBM VGA 869': {name: 'CP869 8x16', type: 'cp437'},
  };

  // Try to match SAUCE font info - look for exact matches first
  for (const [sauceFont, fontInfo] of Object.entries(fontMap)) {
    if (sauce.comments.includes(sauceFont)) {
      return fontInfo;
    }
  }

  // Fallback patterns
  if (sauce.comments.includes('IBM VGA')) {
    return {name: 'CP437 8x16', type: 'cp437'};
  }
  if (sauce.comments.includes('IBM EGA')) {
    return {name: 'CP437 8x14', type: 'cp437'};
  }
  if (sauce.comments.includes('Topaz')) {
    return {name: 'Topaz+ 1200 8x16', type: 'cp437'};
  }
  if (sauce.comments.includes('Amiga')) {
    return {name: 'Topaz+ 1200 8x16', type: 'cp437'};
  }

  return {name: 'CP437 8x16', type: 'cp437'}; // fallback
}

/**
 * Parse ANSI escape sequences and populate canvas rawdata
 */
export function parseAnsiToCanvas(data: Uint8Array, sauce: SauceMetadata | null): CanvasState {
  // Use SAUCE dimensions if available, otherwise default to 80x25
  const width = sauce?.width || 80;
  const height = sauce?.height || 25;

  console.log(`Using canvas dimensions: ${width}x${height}`);

  // Map SAUCE font info to appropriate font
  const fontMapping = mapSauceToFont(sauce);

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
            const params = seq ? seq.split(';').map(n=>parseInt(n) || 0) : [0];

            for (const param of params) {
              if (param === 0) {
                fg = 7; bg = 0; // reset
              } else if (param >= 30 && param <= 37) {
                fg = param - 30; // foreground
              } else if (param >= 40 && param <= 47) {
                bg = param - 40; // background
              } else if (param >= 90 && param <= 97) {
                fg = param - 90 + 8; // bright fg
              } else if (param >= 100 && param <= 107) {
                bg = param - 100 + 8; // bright bg
              }
            }
          } else if (cmd === 'H' || cmd === 'f') {
            // Cursor position command
            const params = seq ? seq.split(';').map(n=>parseInt(n) || 1) : [1, 1];
            y = Math.max(0, Math.min(height - 1, (params[0] || 1) - 1));
            x = Math.max(0, Math.min(width - 1, (params[1] || 1) - 1));
          } else if (cmd === 'A') {
            // Cursor up
            const n = parseInt(seq) || 1;
            y = Math.max(0, y - n);
          } else if (cmd === 'B') {
            // Cursor down
            const n = parseInt(seq) || 1;
            y = Math.min(height - 1, y + n);
          } else if (cmd === 'C') {
            // Cursor right
            const n = parseInt(seq) || 1;
            x = Math.min(width - 1, x + n);
          } else if (cmd === 'D') {
            // Cursor left
            const n = parseInt(seq) || 1;
            x = Math.max(0, x - n);
          }
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
    } else if (char === 0x1A) {
      // EOF character - stop processing
      break;
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

  // Get default palette colors
  const palette = createDefaultPalette();
  const rgb6BitArray = palette.to6BitArray();
  const paletteColors: number[] = [];

  // Convert RGB6Bit to hex colors for state
  for (const [r, g, b] of rgb6BitArray) {
    // Convert 6-bit to 8-bit and then to hex
    const r8 = (r << 2) | (r >> 4);
    const g8 = (g << 2) | (g >> 4);
    const b8 = (b << 2) | (b >> 4);
    paletteColors.push((r8 << 16) | (g8 << 8) | b8);
  }

  return {
    id: Date.now(), // temporary ID
    name: sauce?.title || 'Loaded ANSI',
    sauce: sauce || undefined,
    width,
    height,
    font: fontMapping.name,
    fontType: fontMapping.type,
    spacing: 0,
    ice: sauce?.ice ?? false, // Use ICE setting from SAUCE metadata, default to false
    colors: paletteColors,
    rawdata,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Load appropriate font based on SAUCE metadata
 */
async function loadAppropriateFont(canvasState: CanvasState): Promise<void> {
  try {
    // Create default palette for font loading
    const palette = createDefaultPalette();

    // Map font type to fontManager compatible type
    const fontType = canvasState.fontType === 'unicode' ? 'utf8' : canvasState.fontType;

    // Load font using existing font manager
    await setFont(
      canvasState.font,
      fontType,
      palette,
      canvasState.spacing > 0
    );

    console.log(`Loaded font: ${canvasState.font} (${fontType})`);

  } catch (error) {
    console.warn('Font loading failed, using default:', error);
    // Font loading failure is not critical - the app will use the default font
  }
}

/**
 * Main file loader that integrates with existing architecture
 */
export async function loadAnsiFile(file: File): Promise<void> {
  try {
    console.log(`Loading ANSI file: ${file.name}`);
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Parse SAUCE metadata
    const sauce = parseSauce(data);
    console.log('SAUCE metadata:', sauce);

    // Parse ANSI content to canvas format
    const canvasState = parseAnsiToCanvas(data, sauce);
    console.log(`Parsed ANSI dimensions: ${canvasState.width}x${canvasState.height}`);

    // Load appropriate font based on SAUCE metadata
    await loadAppropriateFont(canvasState);

    // Update the canvas data
    updateCanvasData(canvasState);

    // Resize canvas to match the loaded file dimensions
    // This ensures the canvas is properly sized
    resizeCanvasToState();
    console.log('Canvas resized to match file dimensions');

    // Populate SAUCE form if needed
    eventBus.publish('local:sauce:populate', {sauce});

    // Emit event for other components that need to know a file was loaded
    eventBus.publish('local:file:loaded', {
      fileName: file.name,
      data: arrayBuffer
    });

    // Force a full redraw to ensure colors are displayed correctly
    eventBus.publish('local:canvas:cleared', {reason: 'new-file'});

  } catch (error) {
    console.error('Failed to load ANSI file:', error);
    const message = error instanceof Error ? error.message : String(error);

    eventBus.publish('ui:notification', {
      message: `Failed to load ${file.name}: ${message}`,
      level: 'error'
    });
  }
}
