// canvas drawing, listens for state changes
import type {GlobalState, CanvasState} from './state';
import {eventBus} from './eventBus';

// --- Types
type RGBA = [number, number, number, number];

export interface Palette {
  getRGBAColor(index: number): RGBA;
  getForegroundColor(): number;
  getBackgroundColor(): number;
  setForegroundColor(n: number): void;
  setBackgroundColor(n: number): void;
}

export interface FontRenderer {
  width: number;
  height: number;
  draw(
    charCode: number,
    fg: number,
    bg: number,
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number
  ): void;
}

// --- Globals
let ctx: CanvasRenderingContext2D | null = null;
let canvas: HTMLCanvasElement | null = null;
let font: FontRenderer | null = null;
let palette: Palette | null = null;
let state: GlobalState | null = null;

// --- Setup
export function initCanvasRenderer(
  _state: GlobalState,
  _palette: Palette,
  _font: FontRenderer
) {
  state = _state;
  palette = _palette;
  font = _font;
  canvas = document.getElementById('art') as HTMLCanvasElement;
  ctx = canvas.getContext('2d',{willReadFrequently: true});
  if (!ctx) throw new Error('2D context not available on #art');

  resizeCanvasToState();

  // Listen for relevant events
  eventBus.subscribe('ui:state:changed', ({state})=>{
    void state;
    // If canvas size or font changes, resize/redraw
    resizeCanvasToState();
    redraw();
  });

  eventBus.subscribe('local:palette:changed', ()=>{
    redraw();
  });

  eventBus.subscribe('local:tool:activated', ()=>{
    // Might need to redraw if tool overlays are needed
    redraw();
  });

  // Add more as needed: file load, undo/redo, etc.

  // Initial draw
  redraw();

  // --- Return mutator API for palette/font switching
  return {
    setFont(newFont: FontRenderer) {
      font = newFont;
      resizeCanvasToState();
      redraw();
    },
    setPalette(newPalette: Palette) {
      palette = newPalette;
      redraw();
    },
    redraw,
    getCanvasImage,
  };
}

function resizeCanvasToState() {
  if (!canvas || !state || !font) return;
  const c = state.currentRoom?.canvas;
  if (!c) return;

  // Calculate logical canvas size
  const logicalWidth = c.width * font.width;
  const logicalHeight = c.height * font.height;

  // Set canvas buffer size (physical pixels for HiDPI)
  canvas.width = Math.round(logicalWidth * devicePixelRatio);
  canvas.height = Math.round(logicalHeight * devicePixelRatio);

  // Set CSS size (logical pixels)
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;

  // Reset and apply scale once
  if(!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(devicePixelRatio, devicePixelRatio);
  //debug
  console.log({
    cssWidth: canvas.style.width,
    cssHeight: canvas.style.height,
    bufferWidth: canvas.width,
    bufferHeight: canvas.height,
    expectedCssWidth: `${c.width * font.width}px`,
    expectedCssHeight: `${c.height * font.height}px`,
    logicalWidth: c.width * font.width,
    logicalHeight: c.height * font.height
  });
}

export function redraw() {
  if (!ctx || !state || !font || !palette) return;
  const c = state.currentRoom?.canvas;
  if (!c) return;
  if(!canvas) throw new Error('Failing loading canvas context!');

  // Clear the entire logical canvas area
  const logicalWidth = c.width * font.width;
  const logicalHeight = c.height * font.height;
  ctx.clearRect(0, 0, logicalWidth, logicalHeight);

  console.log('Grid size:', logicalWidth, logicalHeight);
console.log('state.currentRoom?.canvas:', state.currentRoom?.canvas);

  // rawdata is Uint8Array: [char, fg, bg, char, fg, bg, ...]
  const {width, height, rawdata} = c;
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      const idx = (y * width + x) * 3;
      const charCode = rawdata[idx];
      const fg = rawdata[idx + 1];
      const bg = rawdata[idx + 2];
      if (y === 0 && x < 5) {
        console.log(`cell[${y},${x}]: char=${charCode} fg=${fg} bg=${bg}`);
      }
      font.draw(charCode, fg, bg, ctx, x, y);
    }
  }
}

/**
 * Draws an ANSI half block cell at (x, halfBlockY) with color.
 * - halfBlockY: 0..(height*2-1) (even=upper ▀, odd=lower ▄)
 * - color: palette index
 */
export function drawHalfBlock(color: number, x: number, halfBlockY: number) {
 if (!state || !state.currentRoom) return;
  const c = state.currentRoom.canvas;
  if (x < 0 || x >= c.width) return;
  if (halfBlockY < 0 || halfBlockY >= c.height * 2) return;
  const charY = Math.floor(halfBlockY / 2);
  if (charY < 0 || charY >= c.height) return;
  const idx = (charY * c.width + x) * 3;
  if (idx < 0 || idx + 2 >= c.rawdata.length) return;
  const isUpper = (halfBlockY % 2 === 0);
  let charCode = c.rawdata[idx];
  let fg = c.rawdata[idx + 1];
  let bg = c.rawdata[idx + 2];

  // These are the classic ANSI block codes:
  // ▀ = 223 (upper half), ▄ = 220 (lower half), █ = 219 (full block), space = 32

  if (charCode === 0) charCode = 32; // treat NUL as space

  if (charCode === 219) {
    // Already full block. If the color matches one half, overwrite just that half.
    // But classic logic: if fg != color, and we're drawing that half, convert to half-block.
    if (isUpper) {
      if (fg !== color) {
        // Remove upper, keep lower
        charCode = 220; // ▄
        fg = color;
        // bg = old lower color
      }
    } else {
      if (bg !== color) {
        // Remove lower, keep upper
        charCode = 223; // ▀
        /* eslint-disable-next-line no-self-assign */
        fg = fg; // keep
        bg = color;
      }
    }
  } else if (charCode !== 220 && charCode !== 223) {
    // Neither half block, nor full. Blank or something else.
    if (isUpper) {
      charCode = 223; // ▀
      fg = color;
      // bg stays
    } else {
      charCode = 220; // ▄
      fg = color;
      // bg stays
    }
  } else {
    // char is either 223 (▀) or 220 (▄)
    if (isUpper) {
      if (charCode === 223) {
        // upper is already drawn
        if (bg === color) {
          // If lower matches this color, make full block
          charCode = 219;
          fg = color;
          bg = color;
        } else {
          fg = color;
          // keep bg
        }
      } else if (fg === color) {
        // lower is 220, but upper is now same color, full block
        charCode = 219;
        fg = color;
        bg = color;
      } else {
        charCode = 223;
        fg = color;
        // keep bg
      }
    } else {
      // is lower
      if (charCode === 220) {
        // lower is already drawn
        if (bg === color) {
          // If upper matches this color, make full block
          charCode = 219;
          fg = color;
          bg = color;
        } else {
          bg = color;
          // keep fg
        }
      } else if (fg === color) {
        // upper is 223, but lower is now same color, full block
        charCode = 219;
        fg = color;
        bg = color;
      } else {
        charCode = 220;
        bg = color;
        // keep fg
      }
    }
  }

  c.rawdata[idx] = charCode;
  c.rawdata[idx + 1] = fg;
  c.rawdata[idx + 2] = bg;
  console.log('drawHalfBlock written', idx, c.rawdata[idx], c.rawdata[idx + 1], c.rawdata[idx + 2]);
  redraw();
}

//const SHADE_CYCLE = [176, 177, 178, 219]; // light to dark
export function shadeCell(x: number, y: number, fg: number, bg: number, reduce: boolean) {
  if (!state || !state.currentRoom) return;
  const c = state.currentRoom.canvas;
  if (x < 0 || x >= c.width || y < 0 || y >= c.height) return;
  const idx = (y * c.width + x) * 3;
  let code = c.rawdata[idx];
  const currentFg = c.rawdata[idx + 1];
  //let currentBg = c.rawdata[idx + 2];

  if (reduce) {
    // lighten (backwards in the cycle, or erase if already lightest)
    switch (code) {
      case 176: // lightest shading
        code = 32; // space
        break;
      case 177:
        code = 176;
        break;
      case 178:
        code = 177;
        break;
      case 219:
        code = (currentFg === fg) ? 178 : 176;
        break;
      default:
        code = 32;
    }
  } else {
    // darken (forwards in the cycle)
    switch (code) {
      case 219:
        code = (currentFg !== fg) ? 176 : 219; // overwrite with new fg if diff color
        break;
      case 178:
        code = 219;
        break;
      case 177:
        code = 178;
        break;
      case 176:
        code = 177;
        break;
      default:
        code = 176;
    }
  }
  c.rawdata[idx] = code;
  c.rawdata[idx + 1] = fg;
  c.rawdata[idx + 2] = bg;
}

export function createOfflineCanvasState(): CanvasState {
  const width = 80, height = 25;
  const rawdata = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; ++i) {
    rawdata[i * 3 + 0] = 32; // space
    rawdata[i * 3 + 1] = 7;  // white fg
    rawdata[i * 3 + 2] = 0;  // black bg
  }
  return {
    id: 0,
    name: 'Offline Canvas',
    width,
    height,
    font: 'CP437 8x16',
    fontType: 'cp437',
    spacing: 1,
    ice: false,
    colors: new Array<number>(16).fill(0),
    rawdata,
    updatedAt: new Date().toISOString(),
  };
}

// --- Utility for external mutation (e.g., after a draw op)
export function updateCanvasData(newCanvas: CanvasState) {
  if (state && state.currentRoom) {
    state.currentRoom.canvas = newCanvas;
    eventBus.publish('ui:state:changed', {state});
    redraw();
  }
}

// --- Exposes a way to get the canvas image (for saving/exporting)
export function getCanvasImage(): HTMLCanvasElement | null {
  return canvas;
}
