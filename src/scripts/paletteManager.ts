// Palette and color utilities for teXt0wnz
import {KEYBIND_PALETTE, registerPaletteKeybinds, unregisterKeybind} from './keybinds';

export type RGB6Bit = [number, number, number];         // 0–63
export type RGBA    = [number, number, number, number]; // 0–255

export interface Palette {
  getRGBAColor(index: number): RGBA;
  getForegroundColor(): number;
  getBackgroundColor(): number;
  setForegroundColor(n: number): void;
  setBackgroundColor(n: number): void;
  to6BitArray(): RGB6Bit[];
}

// Convert 6-bit color to RGBA
export function rgb6bitToRgba(rgb: RGB6Bit): RGBA {
  return [
    (rgb[0] << 2) | (rgb[0] >> 4),
    (rgb[1] << 2) | (rgb[1] >> 4),
    (rgb[2] << 2) | (rgb[2] >> 4),
    255
  ];
}
//many ANSI files were created with the IBM CGA/EGA/VGA hardware in mind,
//which had a different color ordering than the standard ANSI SGR color codes
export function mapAnsiColor(ansiColor: number): number {
  switch (ansiColor) {
    case 4: return 1;     // Red → Blue
    case 6: return 3;     // Brown/Yellow → Cyan
    case 1: return 4;     // Blue → Red
    case 3: return 6;     // Cyan → Brown/Yellow
    case 12: return 9;    // Light Red → Light Blue
    case 14: return 11;   // Light Yellow → Light Cyan
    case 9: return 12;    // Light Blue → Light Red
    case 11: return 14;   // Light Cyan → Light Yellow
    default: return ansiColor;
  }
}

// Create a palette from 6-bit array
export function createPalette(colors: RGB6Bit[], fg = 7, bg = 0): Palette {
  const rgbaColors: RGBA[] = colors.map(rgb6bitToRgba);
  let foreground = fg;
  let background = bg;

  return {
    getRGBAColor: (i: number)=>rgbaColors[i],
    getForegroundColor: ()=>foreground,
    getBackgroundColor: ()=>background,
    setForegroundColor: (n: number)=>{ foreground = n; },
    setBackgroundColor: (n: number)=>{ background = n; },
    to6BitArray: ()=>colors.slice()
  };
}

// Default 16-color ANSI palette (6-bit RGB values)
export function createDefaultPalette(): Palette {
  return createPalette([
    [0, 0, 0],      // Black
    [0, 0, 42],     // Blue
    [0, 42, 0],     // Green
    [0, 42, 42],    // Cyan
    [42, 0, 0],     // Red
    [42, 0, 42],    // Magenta
    [42, 21, 0],    // Brown/Yellow
    [42, 42, 42],   // Light gray
    [21, 21, 21],   // Dark gray
    [21, 21, 63],   // Light blue
    [21, 63, 21],   // Light green
    [21, 63, 63],   // Light cyan
    [63, 21, 21],   // Light red
    [63, 21, 63],   // Light magenta
    [63, 63, 21],   // Yellow
    [63, 63, 63],   // White
  ]);
}

// Palette picker UI & keybinds
export interface PalettePickerOptions {
  canvas: HTMLCanvasElement;
  palette: Palette;
  initCanvas: (canvas: HTMLCanvasElement, name: string) => CanvasRenderingContext2D;
  updateCurrentColorsPreview: () => void;
}

// Global palette instance
let globalPalette: Palette | null = null;

// Get or create global palette
export function getGlobalPalette(): Palette {
  if (!globalPalette) {
    globalPalette = createDefaultPalette();
  }
  return globalPalette;
}

// Update palette with new colors
export function updatePaletteColors(colors: RGB6Bit[]): void {
  const palette = getGlobalPalette();
  const newPalette = createPalette(colors,
    palette.getForegroundColor(),
    palette.getBackgroundColor());

  // Copy all properties
  Object.assign(palette, newPalette);

  // Trigger any needed updates
  document.dispatchEvent(new CustomEvent('onPaletteChange'));
}

export class PalettePicker {
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData[] = [];
  private cols = 8;
  private rows = 2;
  private swatchWidth: number;
  private swatchHeight: number;
  private palette: Palette;
  private canvas: HTMLCanvasElement;
  private updateCurrentColorsPreview: () => void;

  constructor(opts: PalettePickerOptions) {
    this.canvas = opts.canvas;
    this.palette = opts.palette;
    this.updateCurrentColorsPreview = opts.updateCurrentColorsPreview;
    this.ctx = opts.initCanvas(this.canvas, 'paletteColors');
    this.swatchWidth = this.canvas.width / this.cols;
    this.swatchHeight = this.canvas.height / this.rows;

    for (let i = 0; i < 16; i++) {
      this.imageData[i] = this.ctx.createImageData(this.swatchWidth + 1, this.swatchHeight);
    }

    this.updatePalette();
    this.attachEvents();

    // Register keybinds for palette shortcuts
    registerPaletteKeybinds(this.palette, this.updateCurrentColorsPreview);
  }

  // Draw the palette swatches
  private updateColor(index: number): void {
    const color = this.palette.getRGBAColor(index);
    const img = this.imageData[index];
    for (let y = 0, i = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++, i += 4) {
        img.data.set(color, i);
      }
    }
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    this.ctx.putImageData(img, col * this.swatchWidth, row * this.swatchHeight);
  }

  public updatePalette(): void {
    for (let i = 0; i < 16; i++) {
      this.updateColor(i);
    }
    this.updateCurrentColorsPreview();
  }

  private attachEvents() {
    this.canvas.addEventListener('touchend', this.touchEnd, {passive: false});
    this.canvas.addEventListener('touchcancel', this.touchEnd, {passive: false});
    this.canvas.addEventListener('mouseup', this.mouseEnd, {passive: false});
    this.canvas.addEventListener('contextmenu', e=>e.preventDefault());
  }

  // Touch palette selection
  private touchEnd = (e: TouchEvent)=>{
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.changedTouches[0].pageX - rect.left) / this.swatchWidth);
    const y = Math.floor((e.changedTouches[0].pageY - rect.top) / this.swatchHeight);
    const colorIndex = y * this.cols + x;
    this.palette.setForegroundColor(colorIndex);
    this.updateCurrentColorsPreview();
  };

  // Mouse palette selection
  private mouseEnd = (e: MouseEvent)=>{
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / this.swatchWidth);
    const y = Math.floor((e.clientY - rect.top) / this.swatchHeight);
    const colorIndex = y * this.cols + x;
    if (!e.altKey && !e.ctrlKey) {
      this.palette.setForegroundColor(colorIndex);
    } else {
      this.palette.setBackgroundColor(colorIndex);
    }
    this.updateCurrentColorsPreview();
  };

  // Cleanup if needed
  public destroy() {
    // Remove listeners
    this.canvas.removeEventListener('touchend', this.touchEnd);
    this.canvas.removeEventListener('touchcancel', this.touchEnd);
    this.canvas.removeEventListener('mouseup', this.mouseEnd);
    unregisterKeybind(KEYBIND_PALETTE);
  }
}
