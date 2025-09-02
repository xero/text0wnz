// font logic
import type {Palette} from './canvasRenderer';

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
  const match = fontName.match(/(\d+)x(\d+)$/i);
  // Default to 16x16 if not found (legacy or fallback)
  const fontWidth = match ? parseInt(match[1], 10) : 16;
  const fontHeight = match ? parseInt(match[2], 10) : 16;

  if (fontType === 'utf8' && fontName === 'system') {
    let spacing = letterSpacing;
    return {
      width: fontWidth,
      height: fontHeight,
      fontType,
      setLetterSpacing(enabled: boolean) { spacing = enabled; },
      getLetterSpacing() { return spacing; },
      draw: (charCode, fg, bg, ctx, x, y)=>{
        const ch = String.fromCharCode(charCode);
        ctx.font = `${fontHeight}px monospace`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = `rgba(${palette.getRGBAColor(fg).join(',')})`;
        ctx.fillText(ch, x * (fontWidth + (spacing ? 1 : 0)), y * fontHeight);
      }
    };
  } else {
    return await loadFontFromImage(fontName, letterSpacing, palette, fontType);
  }
}

type FontGlyphs = HTMLCanvasElement[]; // [charCode]

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
      const match = fontName.match(/(\d+)x(\d+)$/i);
      if (!match) throw new Error('Font PNG filename must end with WxH, e.g. 8x16.png');
      const fontWidth = parseInt(match[1], 10);
      const fontHeight = parseInt(match[2], 10);
      if (img.width !== fontWidth * 16 || img.height !== fontHeight * 16) {
        throw new Error(
          `Font PNG dimensions (${img.width}x${img.height}) do not match expected grid for ${fontWidth}x${fontHeight} glyphs`
        );
      }
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const tempCtx = tempCanvas.getContext('2d', {willReadFrequently: true});
      if (!tempCtx) throw new Error('Failing loading canvas context!');
      tempCtx.drawImage(img, 0, 0);

      // Only cache 256 monochrome glyphs
      const glyphs: FontGlyphs = [];
      for (let charCode = 0; charCode < 256; charCode++) {
        const sx = (charCode % 16) * fontWidth;
        const sy = Math.floor(charCode / 16) * fontHeight;
        const glyphCanvas = document.createElement('canvas');
        glyphCanvas.width = fontWidth;
        glyphCanvas.height = fontHeight;
        const glyphCtx = glyphCanvas.getContext('2d')!;
        // Get the image data for this char
        const imageData = tempCtx.getImageData(sx, sy, fontWidth, fontHeight);
        glyphCtx.putImageData(imageData, 0, 0);
        glyphs[charCode] = glyphCanvas;
      }
      let spacing = letterSpacing;


      const cellBuffer = document.createElement('canvas');
      cellBuffer.width = fontWidth;
      cellBuffer.height = fontHeight;
      const cellCtx = cellBuffer.getContext('2d')!;

      const draw = (
        charCode: number,
        fg: number,
        bg: number,
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number
      ): void => {
        // Ensure buffer is correct size
        if (cellBuffer.width !== fontWidth || cellBuffer.height !== fontHeight) {
          cellBuffer.width = fontWidth;
          cellBuffer.height = fontHeight;
        }

        const glyphCanvas = glyphs[charCode];
        if (!glyphCanvas) return;

        const fgColor = palette.getRGBAColor(fg);
        const bgColor = palette.getRGBAColor(bg);

        // 1. Fill BG
        cellCtx.globalCompositeOperation = 'source-over';
        cellCtx.clearRect(0, 0, fontWidth, fontHeight);
        cellCtx.fillStyle = `rgba(${bgColor.join(',')})`;
        cellCtx.fillRect(0, 0, fontWidth, fontHeight);

        // 2. Draw glyph as a mask
        cellCtx.globalCompositeOperation = 'source-over';
        cellCtx.drawImage(glyphCanvas, 0, 0, fontWidth, fontHeight);

        // 3. Tint with FG
        cellCtx.globalCompositeOperation = 'source-in';
        cellCtx.fillStyle = `rgba(${fgColor.join(',')})`;
        cellCtx.fillRect(0, 0, fontWidth, fontHeight);

        // 4. Reset composite mode
        cellCtx.globalCompositeOperation = 'source-over';

        // 5. Draw buffer to main canvas
        const px = x * (fontWidth + (spacing ? 1 : 0));
        const py = y * fontHeight;
        ctx.drawImage(cellBuffer, px, py);
      };


      resolve({
        width: fontWidth,
        height: fontHeight,
        fontType: fontType,
        setLetterSpacing(v) { spacing = v; },
        getLetterSpacing() { return spacing; },
        draw,
      });
    };
    img.onerror = ()=>reject(new Error('Font image failed to load'));
  });
}

/**
 * Loads a font from XBIN font binary data.

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
*/
