// ToolManager base class and Tool interface for teXt0wnz
// Copied and adapted from the architecture of the old moebius-web's freehand_tools.js
// All tool logic (drawing, preview, drag math, etc.) will be ported into new-style tools as classes or objects conforming to this interface.

import type {GlobalState} from './state';
import type {Palette} from './paletteManager';
import type {FontRenderer} from './fontManager';

// === Tool Interface ===
export interface ToolContext {
  state: GlobalState;
  palette: Palette;
  font: FontRenderer;
  // Add more as needed: canvas renderer, clipboard, eventBus, etc.
}

export interface Tool {
  /** Unique tool id, e.g. 'brush' */
  id: string;
  /** Display name, e.g. 'Brush' */
  label: string;
  /** Called when the tool becomes active */
  activate(ctx: ToolContext): void;
  /** Called when the tool is deactivated */
  deactivate(ctx: ToolContext): void;
  /** Pointer event: mouse/touch pressed */
  onPointerDown?(e: ToolPointerEvent, ctx: ToolContext): void;
  /** Pointer event: mouse/touch moved */
  onPointerMove?(e: ToolPointerEvent, ctx: ToolContext): void;
  /** Pointer event: mouse/touch released */
  onPointerUp?(e: ToolPointerEvent, ctx: ToolContext): void;
  /** Pointer event: mouse/touch leaves canvas */
  onPointerLeave?(e: ToolPointerEvent, ctx: ToolContext): void;
  /** Keyboard event, if needed */
  onKeyDown?(e: KeyboardEvent, ctx: ToolContext): void;
  onKeyUp?(e: KeyboardEvent, ctx: ToolContext): void;
  /** Renders a tool preview, if applicable */
  renderPreview?(ctx: ToolContext): void;
  /** Clean up any overlays, previews, etc */
  cleanup?(ctx: ToolContext): void;
}

export interface ToolPointerEvent {
  x: number;
  y: number;
  button: number; // 0 = left, 2 = right, etc.
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  // Optionally: pressure, pointerType, etc.
}

// === ToolManager ===
export class ToolManager {
  private tools: Map<string, Tool> = new Map();
  private activeTool: Tool | null = null;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  registerTool(tool: Tool) {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool with id "${tool.id}" already registered.`);
    }
    this.tools.set(tool.id, tool);
  }

  setActiveTool(id: string) {
    if (this.activeTool) {
      this.activeTool.deactivate(this.ctx);
      if (this.activeTool.cleanup) this.activeTool.cleanup(this.ctx);
    }
    const tool = this.tools.get(id);
    if (!tool) throw new Error(`Tool "${id}" not found.`);
    this.activeTool = tool;
    tool.activate(this.ctx);
  }

  getActiveTool(): Tool | null {
    return this.activeTool;
  }

  handlePointerDown(e: ToolPointerEvent) {
    this.activeTool?.onPointerDown?.(e, this.ctx);
  }
  handlePointerMove(e: ToolPointerEvent) {
    this.activeTool?.onPointerMove?.(e, this.ctx);
  }
  handlePointerUp(e: ToolPointerEvent) {
    this.activeTool?.onPointerUp?.(e, this.ctx);
  }
  handlePointerLeave(e: ToolPointerEvent) {
    this.activeTool?.onPointerLeave?.(e, this.ctx);
  }
  handleKeyDown(e: KeyboardEvent) {
    this.activeTool?.onKeyDown?.(e, this.ctx);
  }
  handleKeyUp(e: KeyboardEvent) {
    this.activeTool?.onKeyUp?.(e, this.ctx);
  }
  renderToolPreview() {
    this.activeTool?.renderPreview?.(this.ctx);
  }
  cleanupTool() {
    this.activeTool?.cleanup?.(this.ctx);
  }
  /** Update the font in the tool context, and notify tools */
  setFont(font: FontRenderer) {
    this.ctx.font = font;
    for (const tool of this.tools.values()) {
      if (typeof (tool as any).setFont === "function") {
        (tool as any).setFont(font);
      }
    }
  }
  /** Utility: get a list of all registered tools for UI */
  getToolList(): { id: string; label: string }[] {
    return Array.from(this.tools.values()).map(t=>({id: t.id, label: t.label}));
  }
}

export default ToolManager;
