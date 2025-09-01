/**
 * ANSI freehand drawing tool (pen)
 * Draws with half-block precision, using Bresenham for lines.
 */
import {Tool, ToolContext, ToolPointerEvent} from '../toolManager';
import {drawHalfBlock} from '../canvasRenderer';

export class PenTool implements Tool {
  id = 'pen';
  label = 'Pen';

  private lastPoint: { x: number; y: number } | null = null;

  activate(ctx: ToolContext) {}
  deactivate(ctx: ToolContext) {
    this.lastPoint = null;
  }

  onPointerDown(ev: ToolPointerEvent, ctx: ToolContext) {
    this.lastPoint = {x: ev.x, y: ev.y};
    // @TODO: Begin undo group
    //ctx.state.currentRoom?.canvas?.startUndo?.();
    this.drawPoint(ev, ctx);
  }

  onPointerMove(ev: ToolPointerEvent, ctx: ToolContext) {
    if (this.lastPoint) {
      this.drawLine(this.lastPoint.x, this.lastPoint.y, ev.x, ev.y, ev, ctx);
      this.lastPoint = {x: ev.x, y: ev.y};
    }
  }

  onPointerUp(ev: ToolPointerEvent, ctx: ToolContext) {
    this.lastPoint = null;
  }
  onPointerLeave(ev: ToolPointerEvent, ctx: ToolContext) {
    this.lastPoint = null;
  }

  /**
   * Draws a single point (half block) at pointer position.
   */
  private drawPoint(ev: ToolPointerEvent, ctx: ToolContext) {
    const color = this.getDrawColor(ev, ctx);
    drawHalfBlock(color, ev.x, ev.y);
  }

  /**
   * Draws a line from (x0, y0) to (x1, y1) using Bresenham.
   */
  private drawLine(
    x0: number, y0: number, x1: number, y1: number,
    ev: ToolPointerEvent, ctx: ToolContext
  ) {
    const color = this.getDrawColor(ev, ctx);
    // Bresenham's line algorithm (integer math, handles all octants)
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    /* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition */
    while (true) {
      drawHalfBlock(color, x, y);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  /**
   * Determines draw color (foreground or background) based on button.
   */
  private getDrawColor(ev: ToolPointerEvent, ctx: ToolContext): number {
    // Left button (0) = foreground, right button (2) = background
    if (ev.button === 2) {
      return ctx.palette.getBackgroundColor();
    }
    return ctx.palette.getForegroundColor();
  }
}
