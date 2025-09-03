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

    // Listen for events to resize/redraw
    window.addEventListener('resize',_=>this.resize());
    // Listen for canvas:resized and update the grid
    eventBus.subscribe('ui:canvas:resize',_=>this.resize());
  }

  resize() {
    const fontWidth = this.font.width;
    const fontHeight = this.font.height;
    const columns = this.getColumns();
    const rows = this.getRows();

    // Add this:
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = fontWidth * columns;
    const logicalHeight = fontHeight * rows;

    // Buffer size for HiDPI
    this.gridCanvas.width = Math.round(logicalWidth * dpr);
    this.gridCanvas.height = Math.round(logicalHeight * dpr);
    // CSS size (logical)
    this.gridCanvas.style.width = `${logicalWidth}px`;
    this.gridCanvas.style.height = `${logicalHeight}px`;

    // Scale the context
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    this.renderGrid();
  }

  setFont(font: FontRenderer) {
    this.font = font;
    this.resize();
  }

  renderGrid() {
    const fontWidth = this.font.width;
    const fontHeight = this.font.height;
    const columns = this.getColumns();
    const rows = this.getRows();

    this.ctx.clearRect(0, 0, this.gridCanvas.width, this.gridCanvas.height);

    this.ctx.strokeStyle = 'rgba(63,63,63,0.7)';
    this.ctx.lineWidth = 1;

    // Draw horizontal lines
    for (let y = 0; y <= rows; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * fontHeight + 0.5);
      this.ctx.lineTo(columns * fontWidth, y * fontHeight + 0.5);
      this.ctx.stroke();
    }

    // Draw vertical lines
    for (let x = 0; x <= columns; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * fontWidth + 0.5, 0);
      this.ctx.lineTo(x * fontWidth + 0.5, rows * fontHeight);
      this.ctx.stroke();
    }
  }

  show(turnOn: boolean) {
    this.enabled = turnOn;
    if (turnOn) {
      this.gridCanvas.classList.add('enabled');
      this.gridCanvas.style.display = '';
      this.resize();
    } else {
      this.gridCanvas.classList.remove('enabled');
      this.gridCanvas.style.display = 'none';
    }
  }

  isShown() {
    return this.enabled;
  }

  destroy() {
    this.container.removeChild(this.gridCanvas);
  }
}
