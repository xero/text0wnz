import type {Palette} from './paletteManager';

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
    y: number,
    iceColors?: boolean
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
  // Default to 16x16 for 'system' font, 8x16 for others
  const defaultWidth = fontName === 'system' ? 16 : 8;
  const defaultHeight = 16;
  const fontWidth = match ? parseInt(match[1], 10) : defaultWidth;
  const fontHeight = match ? parseInt(match[2], 10) : defaultHeight;

  if (fontType === 'utf8' && fontName === 'system') {
    let spacing = letterSpacing;
    return {
      width: fontWidth,
      height: fontHeight,
      fontType,
      setLetterSpacing(enabled: boolean) { spacing = enabled; },
      getLetterSpacing() { return spacing; },
      draw: (charCode, fg, bg, ctx, x, y, iceColors = false)=>{
        // Validate inputs first
        if (fg < 0 || fg > 15 || bg < 0 || bg > 15 || charCode < 0 || charCode > 255) {
          return;
        }
        
        // If not using ice colors and bg >= 8, subtract 8 (treat as non-bright)
        if (!iceColors && bg >= 8) {
          bg -= 8;
        }
        const ch = String.fromCharCode(charCode);
        ctx.font = `${fontHeight}px monospace`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = `rgba(${palette.getRGBAColor(bg).join(',')})`;
        ctx.fillRect(
          x * (fontWidth + (spacing ? 1 : 0)),
          y * fontHeight,
          fontWidth,
          fontHeight
        );
        ctx.fillStyle = `rgba(${palette.getRGBAColor(fg).join(',')})`;
        ctx.fillText(ch, x * (fontWidth + (spacing ? 1 : 0)), y * fontHeight);
      }
    };
  } else {
    return await loadFontFromImage(fontName, letterSpacing, palette, fontType);
  }
}

/**
 * Loads a font from a PNG font sheet using fast thresholding & palette.
 * Works for both white and gray glyphs on black.
 */
export async function loadFontFromImage(
  fontName: string,
  letterSpacing: boolean,
  palette: Palette,
  fontType: FontType,
): Promise<FontRenderer> {
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.src = `./ui/fontz/${fontName}.png`;
    img.onload = ()=>{
      const match = fontName.match(/(\d+)x(\d+)$/i);
      // Default to 8x16 if not found in the name
      const fontWidth = match ? parseInt(match[1], 10) : 8;
      const fontHeight = match ? parseInt(match[2], 10) : 16;

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

      // Precolor all glyphs for every fg/bg/pair (fastest, supports gray glyphs)
      const glyphs: ImageData[][][] = [];
      for (let fg = 0; fg < 16; fg++) {
        glyphs[fg] = [];
        for (let bg = 0; bg < 16; bg++) {
          glyphs[fg][bg] = [];
          for (let charCode = 0; charCode < 256; charCode++) {
            const sx = (charCode % 16) * fontWidth;
            const sy = Math.floor(charCode / 16) * fontHeight;
            const imageData = tempCtx.getImageData(sx, sy, fontWidth, fontHeight);
            // Threshold-based coloring: supports legacy gray or white fonts.
            for (let i = 0; i < imageData.data.length; i += 4) {
              // Use red channel as threshold (works for grayscale or white)
              const isOn = imageData.data[i] > 120; // Adjust threshold as needed
              const color = palette.getRGBAColor(isOn ? fg : bg);
              imageData.data.set(color, i);
            }
            glyphs[fg][bg][charCode] = imageData;
          }
        }
      }
      let spacing = letterSpacing;

      const draw = (
        charCode: number,
        fg: number,
        bg: number,
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        iceColors = false
      ): void=>{
        // Validate inputs first
        if (fg < 0 || fg > 15 || bg < 0 || bg > 15 || charCode < 0 || charCode > 255) {
          return;
        }
        
        if (!iceColors && bg >= 8) {
          bg -= 8;
        }
        if (
          !glyphs[fg] ||
          !glyphs[fg][bg] ||
          !glyphs[fg][bg][charCode]
        ) return;

        ctx.putImageData(
          glyphs[fg][bg][charCode],
          x * (fontWidth + (spacing ? 1 : 0)),
          y * fontHeight
        );
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
