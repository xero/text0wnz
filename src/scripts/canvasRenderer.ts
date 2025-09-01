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
  if (!canvas || !state) return;
  const c = state.currentRoom?.canvas;
  if (!c) return;
  // Set canvas pixel buffer to match font * columns/rows
  if (font) {
    canvas.width = c.width * font.width;
    canvas.height = c.height * font.height;
  }
}

export function redraw() {
  if (!ctx || !state || !font || !palette) return;
  const c = state.currentRoom?.canvas;
  if (!c) return;
  if(!canvas) throw new Error('Failing loading canvas context!');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // rawdata is Uint8Array: [char, fg, bg, char, fg, bg, ...]
  const {width, height, rawdata} = c;
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      const idx = (y * width + x) * 3;
      const charCode = rawdata[idx];
      const fg = rawdata[idx + 1];
      const bg = rawdata[idx + 2];
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
  const isUpper = (halfBlockY % 2 === 0);
  const idx = (charY * c.width + x) * 3;
  let charCode = c.rawdata[idx];
  let fg = c.rawdata[idx + 1];
  let bg = c.rawdata[idx + 2];

  if (isUpper) {
    // If already lower drawn, use full block
    if (charCode === 220) { // already lower
      charCode = 219; // full block
      fg = color; // upper = fg
      // keep bg as lower
    } else if (charCode === 223) {
      // already upper, just update fg
      fg = color;
    } else if (charCode === 219) {
      fg = color;
    } else {
      charCode = 223; // upper only
      fg = color;
      // bg unchanged
    }
  } else {
    // is lower
    if (charCode === 223) { // already upper
      charCode = 219; // full block
      bg = color; // lower = bg
      // keep fg as upper
    } else if (charCode === 220) {
      // already lower, just update bg
      bg = color;
    } else if (charCode === 219) {
      bg = color;
    } else {
      charCode = 220; // lower only
      bg = color;
      // fg unchanged
    }
  }

  c.rawdata[idx] = charCode;
  c.rawdata[idx + 1] = fg;
  c.rawdata[idx + 2] = bg;
  redraw();
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
    colors: Array(16).fill(0), // adjust as needed
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
