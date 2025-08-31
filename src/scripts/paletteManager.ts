// Palette and color utilities for teXt0wnz

export type RGB6Bit = [number, number, number]; // 0–63
export type RGBA = [number, number, number, number]; // 0–255

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
