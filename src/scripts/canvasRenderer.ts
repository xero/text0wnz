// canvas drawing, listens for state changes
import type {GlobalState, CanvasState} from './state';
import {eventBus} from './eventBus';
import {setCursorPos} from './uiController';
import {FontRenderer} from './fontManager';

// --- Types
type RGBA = [number, number, number, number];

export type DirtyRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export interface Palette {
  getRGBAColor(index: number): RGBA;
  getForegroundColor(): number;
  getBackgroundColor(): number;
  setForegroundColor(n: number): void;
  setBackgroundColor(n: number): void;
}

// --- Globals
let ctx: CanvasRenderingContext2D | null = null;    // onscreen ctx
let canvas: HTMLCanvasElement | null = null;        // onscreen canvas
let offscreen: HTMLCanvasElement | null = null;     // offscreen buffer
let offctx: CanvasRenderingContext2D | null = null; // offscreen ctx
let font: FontRenderer | null = null;
let palette: Palette | null = null;
let state: GlobalState | null = null;

const dirtyCells: Set<number> = new Set();
const dirtyRegions: DirtyRegion[] = [];
let needsFullRedraw = true;
let rafQueued = false;

// ICE colors / blinking support
let blinkTimer: ReturnType<typeof setInterval> | undefined = undefined;
let blinkVisible = true;
const blinkInterval = 500; // milliseconds

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

  eventBus.subscribe('ui:state:changed', ({state})=>{
    void state;
    resizeCanvasToState();
    forceFullRedraw();
  });

  eventBus.subscribe('local:palette:changed', ()=>{
    forceFullRedraw();
  });

  eventBus.subscribe('local:file:loaded', ()=>{
    forceFullRedraw();
  });

  eventBus.subscribe('local:canvas:cleared', ()=>{
    forceFullRedraw();
  });

  // Initialize ICE colors state and blinking
  if (state.currentRoom?.canvas) {
    const c = state.currentRoom.canvas;
    if (c.ice) {
      stopBlinkTimer();
    } else {
      startBlinkTimer();
    }
    // Notify UI of initial ICE state
    eventBus.publish('ui:ice:changed', {ice: c.ice});
  }

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

export function resizeCanvasToState() {
  if (!canvas || !state || !font) return;
  const c = state.currentRoom?.canvas;
  if (!c) return;
  const cellWidth = font.width + (font.getLetterSpacing() ? 1 : 0);
  const cellHeight = font.height;
  const logicalWidth = c.width * cellWidth;
  const logicalHeight = c.height * cellHeight;
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

function flushDirtyCells() {
  rafQueued = false;
  if (!ctx || !offctx || !state || !font || !palette || !canvas || !offscreen) return;
  const c = state.currentRoom?.canvas;
  if (!c) return;

  const {width, height, rawdata, ice} = c; // Get the ice setting from canvas
  let needsFullBlit = false;

  if (needsFullRedraw) {
    offctx.clearRect(0, 0, offscreen.width, offscreen.height);
    for (let y = 0; y < height; ++y) {
      for (let x = 0; x < width; ++x) {
        const idx = (y * width + x) * 3;
        const charCode = rawdata[idx];
        const fg = rawdata[idx + 1];
        const bg = rawdata[idx + 2];

        if (ice) {
          // In ICE colors mode, use colors as-is (bright colors are displayed, not blinking)
          font.draw(charCode, fg, bg, offctx, x, y);
        } else {
          // In non-ICE mode, handle background colors >= 8 specially (blink state)
          const actualBg = bg >= 8 ? bg - 8 : bg;
          if (bg >= 8 && blinkVisible) {
            // During blink-on phase, background color becomes foreground color
            font.draw(charCode, fg, fg, offctx, x, y);
          } else {
            font.draw(charCode, fg, actualBg, offctx, x, y);
          }
        }
      }
    }
    dirtyCells.clear();
    dirtyRegions.length = 0;
    needsFullRedraw = false;
    needsFullBlit = true;
  } else if (dirtyCells.size > 0 || dirtyRegions.length > 0) {
    const hasDirtyCells = dirtyCells.size > 0;
    for (const idx of dirtyCells) {
      const cell = Math.floor(idx / 3);
      const x = cell % width;
      const y = Math.floor(cell / width);
      const charCode = rawdata[idx];
      const fg = rawdata[idx + 1];
      const bg = rawdata[idx + 2];
      // clear cell area
      offctx.clearRect(x * font.width, y * font.height, font.width, font.height);

      if (ice) {
        // In ICE colors mode, use colors as-is (bright colors are displayed, not blinking)
        font.draw(charCode, fg, bg, offctx, x, y);
      } else {
        // In non-ICE mode, handle background colors >= 8 specially (blink state)
        const actualBg = bg >= 8 ? bg - 8 : bg;
        if (bg >= 8 && blinkVisible) {
          // During blink-on phase, background color becomes foreground color
          font.draw(charCode, fg, fg, offctx, x, y);
        } else {
          font.draw(charCode, fg, actualBg, offctx, x, y);
        }
      }
    }
    dirtyCells.clear();
    processDirtyRegions();
    needsFullBlit = hasDirtyCells;
  }
  if (needsFullBlit) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreen, 0, 0);
  }
}

export function forceFullRedraw() {
  needsFullRedraw = true;
  queueFlushDirty();
}

/* @param region - The dirty region to enqueue
 * @param immediate - If true, process immediately (for local edits). If false, use RAF batching (for network edits)
 */
export function enqueueDirtyRegion(region: DirtyRegion, immediate: boolean = false) {
  if (!state || !state.currentRoom) return;
  const c = state.currentRoom.canvas;

  // Clamp region to canvas bounds
  const clampedRegion: DirtyRegion = {
    x: Math.max(0, Math.min(region.x, c.width)),
    y: Math.max(0, Math.min(region.y, c.height)),
    w: Math.max(0, Math.min(region.w, c.width - Math.max(0, region.x))),
    h: Math.max(0, Math.min(region.h, c.height - Math.max(0, region.y)))
  };

  // Skip empty regions
  if (clampedRegion.w <= 0 || clampedRegion.h <= 0) return;

  // Try to merge with existing regions to reduce redraw overhead
  let merged = false;
  for (let i = 0; i < dirtyRegions.length; i++) {
    const existing = dirtyRegions[i];
    const mergedRegion = tryMergeRegions(existing, clampedRegion);
    if (mergedRegion) {
      dirtyRegions[i] = mergedRegion;
      merged = true;
      break;
    }
  }

  if (!merged) {
    dirtyRegions.push(clampedRegion);
  }

  if (immediate) {
    processDirtyRegions();
  } else {
    queueFlushDirty();
  }
}

/**
 * Attempt to merge two regions if they overlap or are adjacent.
 * Returns the merged region if possible, null otherwise.
 */
function tryMergeRegions(a: DirtyRegion, b: DirtyRegion): DirtyRegion | null {
  // Calculate bounds
  const aRight = a.x + a.w;
  const aBottom = a.y + a.h;
  const bRight = b.x + b.w;
  const bBottom = b.y + b.h;

  // Check if regions overlap or are adjacent (allowing 1-pixel gap for efficiency)
  const overlapX = Math.max(0, Math.min(aRight, bRight) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(aBottom, bBottom) - Math.max(a.y, b.y));
  const adjacentX = (aRight === b.x) || (bRight === a.x);
  const adjacentY = (aBottom === b.y) || (bBottom === a.y);

  // Merge if overlapping or adjacent
  if ((overlapX > 0 && overlapY > 0) ||
      (adjacentX && overlapY > 0) ||
      (adjacentY && overlapX > 0)) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.max(aRight, bRight) - Math.min(a.x, b.x),
      h: Math.max(aBottom, bBottom) - Math.min(a.y, b.y)
    };
  }

  return null;
}

export function clearDirtyRegions() {
  dirtyRegions.length = 0;
}

/**
 * Get the current list of dirty regions (read-only).
 * Useful for debugging or external systems that need to inspect dirty state.
 */
export function getDirtyRegions(): readonly DirtyRegion[] {
  return dirtyRegions;
}

export function processDirtyRegions(): number {
  if (dirtyRegions.length === 0) {
    return 0;
  }
  const processedCount = dirtyRegions.length;
  for (const region of dirtyRegions) {
    drawRegion(region.x, region.y, region.w, region.h);
  }
  dirtyRegions.length = 0;
  return processedCount;
}

/**
 * Queue a dirty region processing with requestAnimationFrame for smooth batched updates.
 * This provides an alternative to immediate processing for performance-critical scenarios.
 * Multiple calls within the same frame will be batched into a single processing call.
 *
 * @returns Promise that resolves with the number of regions processed
 */
export function processDirtyRegionsAsync(): Promise<number> {
  return new Promise((resolve)=>{
    if (rafQueued) {
      requestAnimationFrame(()=>{
        const processed = processDirtyRegions();
        resolve(processed);
      });
      return;
    }
    rafQueued = true;
    requestAnimationFrame(()=>{
      rafQueued = false;
      const processed = processDirtyRegions();
      resolve(processed);
    });
  });
}

/**
 * Draw a specific region of the canvas.
 * Only updates the specified region, handling empty/out-of-bounds regions gracefully.
 *
 * @param x - Starting x coordinate in canvas cells
 * @param y - Starting y coordinate in canvas cells
 * @param w - Width in canvas cells
 * @param h - Height in canvas cells
 */
export function drawRegion(x: number, y: number, w: number, h: number) {
  if (!ctx || !offctx || !state || !font || !palette || !canvas || !offscreen) return;
  const c = state.currentRoom?.canvas;
  if (!c) return;

  const {width, height, rawdata} = c;
  if (w <= 0 || h <= 0) return;
  const clampedX = Math.max(0, Math.min(x, width));
  const clampedY = Math.max(0, Math.min(y, height));
  const clampedW = Math.max(0, Math.min(w, width - clampedX));
  const clampedH = Math.max(0, Math.min(h, height - clampedY));
  if (clampedW <= 0 || clampedH <= 0) return;
  for (let cellY = clampedY; cellY < clampedY + clampedH; cellY++) {
    for (let cellX = clampedX; cellX < clampedX + clampedW; cellX++) {
      const idx = (cellY * width + cellX) * 3;
      const charCode = rawdata[idx];
      const fg = rawdata[idx + 1];
      const bg = rawdata[idx + 2];
      offctx.clearRect(cellX * font.width, cellY * font.height, font.width, font.height);

      if (c.ice) {
        // In ICE colors mode, use colors as-is (bright colors are displayed, not blinking)
        font.draw(charCode, fg, bg, offctx, cellX, cellY);
      } else {
        // In non-ICE mode, handle background colors >= 8 specially (blink state)
        const actualBg = bg >= 8 ? bg - 8 : bg;
        if (bg >= 8 && blinkVisible) {
          // During blink-on phase, background color becomes foreground color
          font.draw(charCode, fg, fg, offctx, cellX, cellY);
        } else {
          font.draw(charCode, fg, actualBg, offctx, cellX, cellY);
        }
      }
    }
  }
  const pixelX = clampedX * font.width;
  const pixelY = clampedY * font.height;
  const pixelW = clampedW * font.width;
  const pixelH = clampedH * font.height;

  ctx.clearRect(pixelX, pixelY, pixelW, pixelH);
  ctx.drawImage(offscreen, pixelX, pixelY, pixelW, pixelH, pixelX, pixelY, pixelW, pixelH);
}

export function resetCanvasRenderer(
  newState?: GlobalState,
  newPalette?: Palette,
  newFont?: FontRenderer
) {
  // Clean up blinking timer
  stopBlinkTimer();

  ctx = null;
  canvas = null;
  offctx = null;
  offscreen = null;
  font = null;
  palette = null;
  state = null;
  dirtyCells.clear();
  dirtyRegions.length = 0;
  needsFullRedraw = true;
  rafQueued = false;
  if (newState && newPalette && newFont) {
    return initCanvasRenderer(newState, newPalette, newFont);
  }
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
  setCursorPos(x + 1,charY + 1);
  enqueueDirtyRegion({x, y: charY, w: 1, h: 1}, true); // immediate=true for local edits
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
  setCursorPos(x + 1,y + 1);
  enqueueDirtyRegion({x, y, w: 1, h: 1}, true); // immediate=true for local edits
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

// --- ICE Colors / Blinking Support

/**
 * Start the blinking timer for non-ICE mode
 */
function startBlinkTimer() {
  if (blinkTimer) clearInterval(blinkTimer);

  blinkTimer = setInterval(()=>{
    blinkVisible = !blinkVisible;
    // Re-render cells that have blinking characters (bg colors 8-15 in non-ICE mode)
    triggerBlinkRedraw();
  }, blinkInterval);
}

/**
 * Stop the blinking timer
 */
function stopBlinkTimer() {
  if (blinkTimer) {
    clearInterval(blinkTimer);
    blinkTimer = undefined;
  }
  blinkVisible = true; // Always show when not blinking
}

/**
 * Check if we need blinking based on canvas state and trigger redraw for blinking cells
 */
function triggerBlinkRedraw() {
  if (!state || !state.currentRoom) return;
  const c = state.currentRoom.canvas;

  // Only redraw if we're in non-ICE mode and have blinking characters
  if (c.ice) return;

  let hasBlinkingCells = false;
  const {width, height, rawdata} = c;

  // Check for cells with background colors 8-15 (blinking in non-ICE mode)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const bg = rawdata[idx + 2];

      if (bg >= 8 && bg <= 15) {
        hasBlinkingCells = true;
        dirtyCells.add(idx);
      }
    }
  }

  if (hasBlinkingCells) {
    queueFlushDirty();
  }
}

/**
 * Toggle ICE colors mode and update rendering
 */
export function toggleIceColors() {
  if (!state || !state.currentRoom) return;
  const c = state.currentRoom.canvas;

  c.ice = !c.ice;

  // Update blinking timer based on new ICE state
  if (c.ice) {
    stopBlinkTimer();
  } else {
    startBlinkTimer();
  }

  // Trigger full redraw to update all cells
  needsFullRedraw = true;
  queueFlushDirty();

  // Notify UI of ICE state change
  eventBus.publish('ui:ice:changed', {ice: c.ice});
}

/**
 * Set ICE colors mode explicitly
 */
export function setIceColors(enabled: boolean) {
  if (!state || !state.currentRoom) return;
  const c = state.currentRoom.canvas;

  if (c.ice === enabled) return; // No change needed

  c.ice = enabled;

  // Update blinking timer based on new ICE state
  if (c.ice) {
    stopBlinkTimer();
  } else {
    startBlinkTimer();
  }

  // Trigger full redraw to update all cells
  needsFullRedraw = true;
  queueFlushDirty();

  // Notify UI of ICE state change
  eventBus.publish('ui:ice:changed', {ice: c.ice});
}

// Initialize blinking support when canvas state changes
eventBus.subscribe('canvas:state:changed', ()=>{
  if (!state || !state.currentRoom) return;
  const c = state.currentRoom.canvas;

  if (c.ice) {
    stopBlinkTimer();
  } else {
    startBlinkTimer();
  }
});

