import type {FontRenderer} from './fontManager';

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
    this.gridCanvas.style.position = 'absolute';
    this.gridCanvas.style.left = '0';
    this.gridCanvas.style.top = '0';
    this.gridCanvas.style.pointerEvents = 'none';
    const ctx = this.gridCanvas.getContext('2d', {willReadFrequently: false});
    if (!ctx) throw new Error('Failed to get 2D context for grid overlay');
    this.ctx = ctx;
    this.container.appendChild(this.gridCanvas);

    // Listen for events to resize/redraw
    window.addEventListener('resize', ()=>this.resize());
  }

  resize() {
    const fontWidth = this.font.width;
    const fontHeight = this.font.height;
    const columns = this.getColumns();
    const rows = this.getRows();

    this.gridCanvas.width = fontWidth * columns;
    this.gridCanvas.height = fontHeight * rows;
    this.gridCanvas.style.width = `${this.gridCanvas.width}px`;
    this.gridCanvas.style.height = `${this.gridCanvas.height}px`;

    this.renderGrid();
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
