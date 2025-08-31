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
