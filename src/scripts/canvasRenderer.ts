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
let ctx: CanvasRenderingContext2D | null = null;           // onscreen ctx
let canvas: HTMLCanvasElement | null = null;               // onscreen canvas
let offscreen: HTMLCanvasElement | null = null;            // offscreen buffer
let offctx: CanvasRenderingContext2D | null = null;        // offscreen ctx
let font: FontRenderer | null = null;
let palette: Palette | null = null;
let state: GlobalState | null = null;

const dirtyCells: Set<number> = new Set();
let needsFullRedraw = true;
let rafQueued = false;

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
  ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) throw new Error('2D context not available on #art');

  setupOffscreen();

  resizeCanvasToState();

  // Listen for relevant events
  eventBus.subscribe('ui:state:changed', ({state})=>{
    void state;
    // If canvas size or font changes, resize/redraw
    resizeCanvasToState();
    forceFullRedraw();
  });

  eventBus.subscribe('local:palette:changed', ()=>{
    forceFullRedraw();
  });

  eventBus.subscribe('local:tool:activated', ()=>{
    // Might need to redraw if tool overlays are needed
    forceFullRedraw();
  });

  // Add more as needed: file load, undo/redo, etc.

  // Initial draw
  forceFullRedraw();

  // --- Return mutator API for palette/font switching
  return {
    setFont(newFont: FontRenderer) {
      font = newFont;
      resizeCanvasToState();
      forceFullRedraw();
    },
    setPalette(newPalette: Palette) {
      palette = newPalette;
      forceFullRedraw();
    },
    redraw: forceFullRedraw,
    getCanvasImage,
  };
}

function setupOffscreen() {
  if (!canvas) return;
  if (offscreen) {
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
  } else {
    offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
  }
  offctx = offscreen.getContext('2d', {willReadFrequently: false});
}

function resizeCanvasToState() {
  if (!canvas || !state || !font) return;
  const c = state.currentRoom?.canvas;
  if (!c) return;
  const logicalWidth = c.width * font.width;
  const logicalHeight = c.height * font.height;
  canvas.width = logicalWidth;
  canvas.height = logicalHeight;
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;

  setupOffscreen();
  if (offscreen) {
    offscreen.width = logicalWidth;
    offscreen.height = logicalHeight;
  }
  if (ctx) ctx.setTransform(1, 0, 0, 1, 0, 0);

  eventBus.publish('ui:canvas:resize', {
    width: logicalWidth,
    height: logicalHeight,
    font,
    columns: c.width,
    rows: c.height,
    dpr: 1
  });
  needsFullRedraw = true;
  queueFlushDirty();
}

function queueFlushDirty() {
  if (!rafQueued) {
    rafQueued = true;
    requestAnimationFrame(flushDirtyCells);
  }
}

// --- Draws all cells, or just dirty ones if possible
function flushDirtyCells() {
  rafQueued = false;
  if (!ctx || !offctx || !state || !font || !palette || !canvas || !offscreen) return;
  const c = state.currentRoom?.canvas;
  if (!c) return;

  const {width, height, rawdata} = c;

  if (needsFullRedraw) {
    // Full redraw: clear offscreen and re-render everything
    offctx.clearRect(0, 0, offscreen.width, offscreen.height);
    for (let y = 0; y < height; ++y) {
      for (let x = 0; x < width; ++x) {
        const idx = (y * width + x) * 3;
        const charCode = rawdata[idx];
        const fg = rawdata[idx + 1];
        const bg = rawdata[idx + 2];
        font.draw(charCode, fg, bg, offctx, x, y);
      }
    }
    dirtyCells.clear();
    needsFullRedraw = false;
  } else if (dirtyCells.size > 0) {
    // Dirty cell redraw
    for (const idx of dirtyCells) {
      const cell = Math.floor(idx / 3);
      const x = cell % width;
      const y = Math.floor(cell / width);
      const charCode = rawdata[idx];
      const fg = rawdata[idx + 1];
      const bg = rawdata[idx + 2];
      // clear cell area
      offctx.clearRect(x * font.width, y * font.height, font.width, font.height);
      font.draw(charCode, fg, bg, offctx, x, y);
    }
    dirtyCells.clear();
  }

  // Blit offscreen to onscreen
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(offscreen, 0, 0);
}

// Use this to force a full redraw (e.g., on resize, font/palette change)
function forceFullRedraw() {
  needsFullRedraw = true;
  queueFlushDirty();
}

// Call this to mark a cell as dirty (cellIdx is the *cell*, not the byte offset)
function markDirtyCell(x: number, y: number) {
  if (!state || !state.currentRoom) return;
  const c = state.currentRoom.canvas;
  if (x < 0 || x >= c.width || y < 0 || y >= c.height) return;
  const idx = (y * c.width + x) * 3;
  dirtyCells.add(idx);
  queueFlushDirty();
}

// --- Drawing API

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
        }
      } else if (fg === color) {
        // lower is 220, but upper is now same color, full block
        charCode = 219;
        fg = color;
        bg = color;
      } else {
        charCode = 223;
        fg = color;
      }
    } else {
      // is lower
      if (charCode === 220) {
        // lower is already drawn
        if (bg === color) {
          charCode = 219;
          fg = color;
          bg = color;
        } else {
          bg = color;
        }
      } else if (fg === color) {
        // upper is 223, but lower is now same color, full block
        charCode = 219;
        fg = color;
        bg = color;
      } else {
        charCode = 220;
        bg = color;
      }
    }
  }

  c.rawdata[idx] = charCode;
  c.rawdata[idx + 1] = fg;
  c.rawdata[idx + 2] = bg;
  markDirtyCell(x, charY);
}

/**
 * Shade a cell (ANSI shading block codes).
 */
export function shadeCell(x: number, y: number, fg: number, bg: number, reduce: boolean) {
  if (!state || !state.currentRoom) return;
  const c = state.currentRoom.canvas;
  if (x < 0 || x >= c.width || y < 0 || y >= c.height) return;
  const idx = (y * c.width + x) * 3;
  let code = c.rawdata[idx];
  const currentFg = c.rawdata[idx + 1];

  if (reduce) {
    // lighten (backwards in the cycle, or erase if already lightest)
    switch (code) {
      case 176: code = 32; break;
      case 177: code = 176; break;
      case 178: code = 177; break;
      case 219: code = (currentFg === fg) ? 178 : 176; break;
      default: code = 32;
    }
  } else {
    // darken (forwards in the cycle)
    switch (code) {
      case 219: code = (currentFg !== fg) ? 176 : 219; break;
      case 178: code = 219; break;
      case 177: code = 178; break;
      case 176: code = 177; break;
      default: code = 176;
    }
  }
  c.rawdata[idx] = code;
  c.rawdata[idx + 1] = fg;
  c.rawdata[idx + 2] = bg;
  markDirtyCell(x, y);
}

/**
 * Utility for external mutation (e.g., after a draw op)
 * Forces full redraw for now. (Optionally, could diff and dirty only changed cells.)
 */
export function updateCanvasData(newCanvas: CanvasState) {
  if (state && state.currentRoom) {
    state.currentRoom.canvas = newCanvas;
    needsFullRedraw = true;
    queueFlushDirty();
  }
}

// --- Exposes a way to get the canvas image (for saving/exporting)
export function getCanvasImage(): HTMLCanvasElement | null {
  return canvas;
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
