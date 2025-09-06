import type {FontRenderer} from './fontManager';
import {eventBus} from './eventBus';

export class GridOverlay {
  private gridCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private enabled: boolean = false;
  private container: HTMLElement;
  private font: FontRenderer;
  private getColumns: () => number;
  private getRows: () => number;

  // State for avoiding unnecessary redraws
  private lastFontWidth = 0;
  private lastFontHeight = 0;
  private lastColumns = 0;
  private lastRows = 0;

  // Event listener holders for cleanup
  private _resizeListener: () => void;
  private _canvasResizeUnsub: (() => void) | null = null;

  // Offscreen cache for grid rendering (for large grids)
  private gridCache: HTMLCanvasElement | null = null;

  constructor(
    container: HTMLElement,
    font: FontRenderer,
    getColumns: () => number,
    getRows: () => number
  ) {
    this.container = container;
    this.font = font;
    this.getColumns = getColumns;
    this.getRows = getRows;
    this.gridCanvas = document.createElement('canvas');
    this.gridCanvas.id = 'grid-overlay';
    const ctx = this.gridCanvas.getContext('2d', {willReadFrequently: false});
    if (!ctx) throw new Error('Failed to get 2D context for grid overlay');
    this.ctx = ctx;
    this.container.appendChild(this.gridCanvas);

    // Bind event listeners for cleanup
    this._resizeListener = ()=>this.resize();
    window.addEventListener('resize', this._resizeListener);
    this._canvasResizeUnsub = eventBus.subscribe('ui:canvas:resize', this._resizeListener);
  }


  // Return font cell width including spacing if enabled
  private getFontCellWidth(): number {
    return this.font.width + (this.font.getLetterSpacing() ? 1 : 0);
  }

  private gridParamsChanged() {
    const fontWidth = this.getFontCellWidth();
    const fontHeight = this.font.height;
    const columns = this.getColumns();
    const rows = this.getRows();
    return (
      fontWidth !== this.lastFontWidth ||
      fontHeight !== this.lastFontHeight ||
      columns !== this.lastColumns ||
      rows !== this.lastRows
    );
  }

  private updateGridCache(fontWidth: number, fontHeight: number, columns: number, rows: number) {
    const cacheCanvas = document.createElement('canvas');
    cacheCanvas.width = fontWidth * columns;
    cacheCanvas.height = fontHeight * rows;
    const cacheCtx = cacheCanvas.getContext('2d', {willReadFrequently: false});
    if (!cacheCtx) return;

    cacheCtx.strokeStyle = 'rgba(63,63,63,0.7)';
    cacheCtx.lineWidth = 1;

    for (let y = 0; y <= rows; y++) {
      cacheCtx.beginPath();
      cacheCtx.moveTo(0, y * fontHeight + 0.5);
      cacheCtx.lineTo(columns * fontWidth, y * fontHeight + 0.5);
      cacheCtx.stroke();
    }

    for (let x = 0; x <= columns; x++) {
      cacheCtx.beginPath();
      cacheCtx.moveTo(x * fontWidth + 0.5, 0);
      cacheCtx.lineTo(x * fontWidth + 0.5, rows * fontHeight);
      cacheCtx.stroke();
    }

    this.gridCache = cacheCanvas;
  }

  resize() {
    const fontWidth = this.getFontCellWidth();
    const fontHeight = this.font.height;
    const columns = this.getColumns();
    const rows = this.getRows();
    const logicalWidth = fontWidth * columns;
    const logicalHeight = fontHeight * rows;

    const paramsChanged = this.gridParamsChanged();

    if (paramsChanged || this.enabled) {
      this.gridCanvas.width = logicalWidth;
      this.gridCanvas.height = logicalHeight;
      this.gridCanvas.style.width = `${logicalWidth}px`;
      this.gridCanvas.style.height = `${logicalHeight}px`;
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);

      if (columns * rows > 7500) {
        this.updateGridCache(fontWidth, fontHeight, columns, rows);
        this.renderGrid(true);
      } else {
        this.gridCache = null;
        this.renderGrid(false);
      }

      this.lastFontWidth = fontWidth;
      this.lastFontHeight = fontHeight;
      this.lastColumns = columns;
      this.lastRows = rows;
    }
  }

  setFont(font: FontRenderer) {
    this.font = font;
    this.resize();
  }

  renderGrid(useCache: boolean) {
    const fontWidth = this.getFontCellWidth();
    const fontHeight = this.font.height;
    const columns = this.getColumns();
    const rows = this.getRows();

    this.ctx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);

    if (useCache && this.gridCache) {
      this.ctx.drawImage(this.gridCache, 0, 0);
      return;
    }

    this.ctx.strokeStyle = 'rgba(63,63,63,0.7)';
    this.ctx.lineWidth = 1;

    for (let y = 0; y <= rows; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * fontHeight + 0.5);
      this.ctx.lineTo(columns * fontWidth, y * fontHeight + 0.5);
      this.ctx.stroke();
    }

    for (let x = 0; x <= columns; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * fontWidth + 0.5, 0);
      this.ctx.lineTo(x * fontWidth + 0.5, rows * fontHeight);
      this.ctx.stroke();
    }
  }

  show(turnOn: boolean) {
    if (turnOn && !this.enabled) {
      this.enabled = true;
      this.gridCanvas.classList.add('enabled');
      this.gridCanvas.style.display = '';
      this.resize();
    } else if (!turnOn && this.enabled) {
      this.enabled = false;
      this.gridCanvas.classList.remove('enabled');
      this.gridCanvas.style.display = 'none';
    }
  }

  isShown() {
    return this.enabled;
  }

  destroy() {
    window.removeEventListener('resize', this._resizeListener);
    if (this._canvasResizeUnsub) this._canvasResizeUnsub();
    this.container.removeChild(this.gridCanvas);
    this.gridCache = null;
  }
}
