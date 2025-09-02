// font logic
import type {Palette} from './canvasRenderer'; // Or define your own Palette type

export type FontType = 'cp437' | 'utf8';
export interface FontRenderer {
  width: number;
  height: number;
  setLetterSpacing(enabled: boolean): void;
  getLetterSpacing(): boolean;
  fontType: FontType;
  draw(
    charCode: number,
    fg: number,
    bg: number,
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number
  ): void;
}

/**
 * Set the current font, loading the PNG sheet if necessary.
 * Supports both 'cp437' and 'utf8' (unicode) modes.
 */
export async function setFont(
  fontName: string,
  fontType: FontType,
  palette: Palette,
  letterSpacing: boolean = false
): Promise<FontRenderer> {
  if (fontType === 'utf8' && fontName === 'system') {
    let spacing = letterSpacing;
    return {
      width: 16,
      height: 16,
      fontType,
      setLetterSpacing(enabled: boolean) { spacing = enabled; },
      getLetterSpacing() { return spacing; },
      draw: (charCode, fg, bg, ctx, x, y)=>{
        // If your buffer supports > 256 codepoints, use String.fromCodePoint
        const ch = String.fromCharCode(charCode);
        ctx.font = '16px monospace';
        ctx.textBaseline = 'top';
        ctx.fillStyle = `rgba(${palette.getRGBAColor(fg).join(',')})`;
        ctx.fillText(ch, x * (16 + (spacing ? 1 : 0)), y * 16);
      }
    };
  } else {
    return await loadFontFromImage(fontName, letterSpacing, palette, fontType);
  }
}

type FontGlyphs = ImageData[][][]; // [fg][bg][charCode]

/**
 * Loads a font from a PNG font sheet.
 */
export async function loadFontFromImage(
  fontName: string,
  letterSpacing: boolean,
  palette: Palette,
  fontType: FontType
): Promise<FontRenderer> {
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.src = `/ui/fontz/${fontName}.png`;
    img.onload = ()=>{
      // Parse the font sheet (16x16 grid)
      const fontWidth = Math.floor(img.width / 16);
      const fontHeight = Math.floor(img.height / 16);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d',{willReadFrequently: true});
      if(!ctx) throw new Error('Failing loading canvas context!');
      ctx.drawImage(img, 0, 0);

      // Parse bits for each glyph
      const glyphs: FontGlyphs = [];
      for (let fg = 0; fg < 16; fg++) {
        glyphs[fg] = [];
        for (let bg = 0; bg < 16; bg++) {
          glyphs[fg][bg] = [];
          for (let charCode = 0; charCode < 256; charCode++) {
            // Extract bits for this char
            const x = (charCode % 16) * fontWidth;
            const y = Math.floor(charCode / 16) * fontHeight;
            const imageData = ctx.getImageData(x, y, fontWidth, fontHeight);
            // Convert monochrome image to colored glyph
            for (let i = 0; i < imageData.data.length; i += 4) {
              const isOn = imageData.data[i] > 120; // threshold for "on"
              const color = palette.getRGBAColor(isOn ? fg : bg);
              imageData.data.set(color, i);
            }
            glyphs[fg][bg][charCode] = imageData;
          }
        }
      }
      let spacing = letterSpacing;
      resolve({
        width: fontWidth,
        height: fontHeight,
        fontType: fontType,
        setLetterSpacing(v) { spacing = v; },
        getLetterSpacing() { return spacing; },
        draw(charCode, fg, bg, ctx, x, y) {
          if (
            !glyphs[fg] ||
            !glyphs[fg][bg] ||
            !glyphs[fg][bg][charCode]
          ) return;
          ctx.putImageData(glyphs[fg][bg][charCode], x * fontWidth, y * fontHeight);
        },
      });
    };
    img.onerror = ()=>reject(new Error('Font image failed to load'));
  });
}

/**
 * Loads a font from XBIN font binary data.
 */
export function loadFontFromXBData(
  fontBytes: Uint8Array,
  fontWidth: number,
  fontHeight: number,
  letterSpacing: boolean,
  palette: Palette,
  fontType: FontType
): Promise<FontRenderer> {
  return new Promise((resolve, reject)=>{
    // Assume fontBytes is [fontHeight * 256] bytes, 1 bit per pixel, 8px wide
    if (fontBytes.length < fontHeight * 256) {
      reject(new Error('Invalid font data'));
      return;
    }
    // Convert to RGBA glyphs as in image loader
    const glyphs: FontGlyphs = [];
    for (let fg = 0; fg < 16; fg++) {
      glyphs[fg] = [];
      for (let bg = 0; bg < 16; bg++) {
        glyphs[fg][bg] = [];
        for (let charCode = 0; charCode < 256; charCode++) {
          const imageData = new ImageData(fontWidth, fontHeight);
          for (let row = 0; row < fontHeight; row++) {
            const byte = fontBytes[charCode * fontHeight + row];
            for (let col = 0; col < fontWidth; col++) {
              const bit = (byte >> (7 - col)) & 1;
              const color = palette.getRGBAColor(bit ? fg : bg);
              const idx = (row * fontWidth + col) * 4;
              imageData.data.set(color, idx);
            }
          }
          glyphs[fg][bg][charCode] = imageData;
        }
      }
    }
    let spacing = letterSpacing;
    resolve({
      width: fontWidth,
      height: fontHeight,
      fontType: fontType,
      setLetterSpacing(v) { spacing = v; },
      getLetterSpacing() { return spacing; },
      draw(charCode, fg, bg, ctx, x, y) {
        if (
          !glyphs[fg] ||
          !glyphs[fg][bg] ||
          !glyphs[fg][bg][charCode]
        ) return;
        ctx.putImageData(glyphs[fg][bg][charCode], x * fontWidth, y * fontHeight);
      },
    });
  });
}
