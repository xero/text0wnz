import { Tool, ToolContext, ToolPointerEvent } from '../toolManager';
import { shadeCell, redraw } from '../canvasRenderer';

export class ShadeBrushTool implements Tool {
  id = 'shade';
  label = 'Shade';

  private lastPoint: { x: number; y: number } | null = null;

  activate(ctx: ToolContext) {
    void ctx;
  }

  deactivate(ctx: ToolContext) {
    void ctx;
    this.lastPoint = null;
  }

  onPointerDown(e: ToolPointerEvent, ctx: ToolContext) {
    this.lastPoint = { x: e.x, y: e.y };
    this.shade(e, ctx);
  }

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext) {
    if (this.lastPoint) {
      // @TODO: Begin undo group
      //ctx.state.currentRoom?.canvas?.startUndo?.();
      this.shade(e, ctx);
      this.lastPoint = { x: e.x, y: e.y };
    }
  }
  onPointerUp(e: ToolPointerEvent, ctx: ToolContext) {
    void e;
    void ctx;
    this.lastPoint = null;
  }

  onPointerLeave(e: ToolPointerEvent, ctx: ToolContext) {
    void e;
    void ctx;
    this.lastPoint = null;
  }

  private shade(e: ToolPointerEvent, ctx: ToolContext) {
    // Use right mouse or shift for reduce, left to darken
    let reduce = false;
    if(e.button === 2 || e.shiftKey) reduce=true;
    const fg = ctx.palette.getForegroundColor();
    const bg = ctx.palette.getBackgroundColor();
    shadeCell(e.x, e.y-1, fg, bg, reduce);
    redraw();
  }
}
