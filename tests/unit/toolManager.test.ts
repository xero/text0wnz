import {describe, it, expect, vi, beforeEach} from 'vitest';
import {ToolManager, type Tool, type ToolContext, type ToolPointerEvent} from '../../src/scripts/toolManager';
import {createState} from '../../src/scripts/state';
import {createDefaultPalette} from '../../src/scripts/paletteManager';

// Mock tool implementations for testing
class MockTool implements Tool {
  id: string;
  label: string;
  activate = vi.fn();
  deactivate = vi.fn();
  onPointerDown = vi.fn();
  onPointerMove = vi.fn();
  onPointerUp = vi.fn();
  onPointerLeave = vi.fn();
  onKeyDown = vi.fn();
  onKeyUp = vi.fn();
  renderPreview = vi.fn();
  cleanup = vi.fn();

  constructor(id: string, label: string) {
    this.id = id;
    this.label = label;
  }
}

class MinimalTool implements Tool {
  id: string;
  label: string;
  activate = vi.fn();
  deactivate = vi.fn();

  constructor(id: string, label: string) {
    this.id = id;
    this.label = label;
  }
}

describe('ToolManager', () => {
  let toolManager: ToolManager;
  let mockContext: ToolContext;
  let mockTool: MockTool;
  let minimalTool: MinimalTool;

  beforeEach(() => {
    const state = createState();
    const palette = createDefaultPalette();
    const mockFont = {
      width: 8,
      height: 16,
      fontType: 'cp437' as const,
      setLetterSpacing: vi.fn(),
      getLetterSpacing: vi.fn(() => false),
      draw: vi.fn()
    };

    mockContext = {
      state,
      palette,
      font: mockFont
    };

    toolManager = new ToolManager(mockContext);
    mockTool = new MockTool('brush', 'Brush Tool');
    minimalTool = new MinimalTool('pen', 'Pen Tool');

    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided context', () => {
      expect(toolManager).toBeDefined();
      expect(toolManager.getActiveTool()).toBeNull();
    });
  });

  describe('registerTool', () => {
    it('should register a tool successfully', () => {
      expect(() => toolManager.registerTool(mockTool)).not.toThrow();
      
      const toolList = toolManager.getToolList();
      expect(toolList).toHaveLength(1);
      expect(toolList[0]).toEqual({id: 'brush', label: 'Brush Tool'});
    });

    it('should prevent registering duplicate tool IDs', () => {
      toolManager.registerTool(mockTool);
      
      const duplicateTool = new MockTool('brush', 'Another Brush');
      expect(() => toolManager.registerTool(duplicateTool)).toThrow('Tool with id "brush" already registered.');
    });

    it('should allow registering multiple different tools', () => {
      toolManager.registerTool(mockTool);
      toolManager.registerTool(minimalTool);
      
      const toolList = toolManager.getToolList();
      expect(toolList).toHaveLength(2);
      expect(toolList.find(t => t.id === 'brush')).toBeDefined();
      expect(toolList.find(t => t.id === 'pen')).toBeDefined();
    });
  });

  describe('setActiveTool', () => {
    beforeEach(() => {
      toolManager.registerTool(mockTool);
      toolManager.registerTool(minimalTool);
    });

    it('should activate a registered tool', () => {
      toolManager.setActiveTool('brush');
      
      expect(mockTool.activate).toHaveBeenCalledWith(mockContext);
      expect(toolManager.getActiveTool()).toBe(mockTool);
    });

    it('should throw error for unregistered tool', () => {
      expect(() => toolManager.setActiveTool('nonexistent')).toThrow('Tool "nonexistent" not found.');
    });

    it('should deactivate previous tool when switching', () => {
      toolManager.setActiveTool('brush');
      toolManager.setActiveTool('pen');
      
      expect(mockTool.deactivate).toHaveBeenCalledWith(mockContext);
      expect(mockTool.cleanup).toHaveBeenCalledWith(mockContext);
      expect(minimalTool.activate).toHaveBeenCalledWith(mockContext);
      expect(toolManager.getActiveTool()).toBe(minimalTool);
    });

    it('should not call cleanup if tool does not have cleanup method', () => {
      toolManager.setActiveTool('pen');
      toolManager.setActiveTool('brush');
      
      // No error should occur even though minimalTool doesn't have cleanup
      expect(minimalTool.deactivate).toHaveBeenCalledWith(mockContext);
      expect(mockTool.activate).toHaveBeenCalledWith(mockContext);
    });
  });

  describe('getActiveTool', () => {
    it('should return null when no tool is active', () => {
      expect(toolManager.getActiveTool()).toBeNull();
    });

    it('should return the currently active tool', () => {
      toolManager.registerTool(mockTool);
      toolManager.setActiveTool('brush');
      
      expect(toolManager.getActiveTool()).toBe(mockTool);
    });
  });

  describe('pointer event handling', () => {
    const mockPointerEvent: ToolPointerEvent = {
      x: 10,
      y: 20,
      button: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false
    };

    beforeEach(() => {
      toolManager.registerTool(mockTool);
      toolManager.setActiveTool('brush');
    });

    it('should delegate pointer down events to active tool', () => {
      toolManager.handlePointerDown(mockPointerEvent);
      
      expect(mockTool.onPointerDown).toHaveBeenCalledWith(mockPointerEvent, mockContext);
    });

    it('should delegate pointer move events to active tool', () => {
      toolManager.handlePointerMove(mockPointerEvent);
      
      expect(mockTool.onPointerMove).toHaveBeenCalledWith(mockPointerEvent, mockContext);
    });

    it('should delegate pointer up events to active tool', () => {
      toolManager.handlePointerUp(mockPointerEvent);
      
      expect(mockTool.onPointerUp).toHaveBeenCalledWith(mockPointerEvent, mockContext);
    });

    it('should delegate pointer leave events to active tool', () => {
      toolManager.handlePointerLeave(mockPointerEvent);
      
      expect(mockTool.onPointerLeave).toHaveBeenCalledWith(mockPointerEvent, mockContext);
    });

    it('should handle pointer events gracefully when no tool is active', () => {
      const emptyManager = new ToolManager(mockContext);
      
      expect(() => emptyManager.handlePointerDown(mockPointerEvent)).not.toThrow();
      expect(() => emptyManager.handlePointerMove(mockPointerEvent)).not.toThrow();
      expect(() => emptyManager.handlePointerUp(mockPointerEvent)).not.toThrow();
      expect(() => emptyManager.handlePointerLeave(mockPointerEvent)).not.toThrow();
    });

    it('should handle tools without optional pointer handlers', () => {
      const simpleManager = new ToolManager(mockContext);
      simpleManager.registerTool(minimalTool);
      simpleManager.setActiveTool('pen');
      
      expect(() => simpleManager.handlePointerDown(mockPointerEvent)).not.toThrow();
      expect(() => simpleManager.handlePointerMove(mockPointerEvent)).not.toThrow();
    });
  });

  describe('keyboard event handling', () => {
    const mockKeyEvent = new KeyboardEvent('keydown', {key: 'Enter'});

    beforeEach(() => {
      toolManager.registerTool(mockTool);
      toolManager.setActiveTool('brush');
    });

    it('should delegate key down events to active tool', () => {
      toolManager.handleKeyDown(mockKeyEvent);
      
      expect(mockTool.onKeyDown).toHaveBeenCalledWith(mockKeyEvent, mockContext);
    });

    it('should delegate key up events to active tool', () => {
      const keyUpEvent = new KeyboardEvent('keyup', {key: 'Enter'});
      toolManager.handleKeyUp(keyUpEvent);
      
      expect(mockTool.onKeyUp).toHaveBeenCalledWith(keyUpEvent, mockContext);
    });

    it('should handle keyboard events gracefully when no tool is active', () => {
      const emptyManager = new ToolManager(mockContext);
      
      expect(() => emptyManager.handleKeyDown(mockKeyEvent)).not.toThrow();
      expect(() => emptyManager.handleKeyUp(mockKeyEvent)).not.toThrow();
    });
  });

  describe('renderToolPreview', () => {
    beforeEach(() => {
      toolManager.registerTool(mockTool);
      toolManager.setActiveTool('brush');
    });

    it('should call renderPreview on active tool', () => {
      toolManager.renderToolPreview();
      
      expect(mockTool.renderPreview).toHaveBeenCalledWith(mockContext);
    });

    it('should handle renderPreview gracefully when no tool is active', () => {
      const emptyManager = new ToolManager(mockContext);
      
      expect(() => emptyManager.renderToolPreview()).not.toThrow();
    });
  });

  describe('cleanupTool', () => {
    beforeEach(() => {
      toolManager.registerTool(mockTool);
      toolManager.setActiveTool('brush');
    });

    it('should call cleanup on active tool', () => {
      toolManager.cleanupTool();
      
      expect(mockTool.cleanup).toHaveBeenCalledWith(mockContext);
    });

    it('should handle cleanup gracefully when no tool is active', () => {
      const emptyManager = new ToolManager(mockContext);
      
      expect(() => emptyManager.cleanupTool()).not.toThrow();
    });
  });

  describe('setFont', () => {
    it('should update font in context', () => {
      const newFont = {
        width: 16,
        height: 32,
        fontType: 'utf8' as const,
        setLetterSpacing: vi.fn(),
        getLetterSpacing: vi.fn(() => true),
        draw: vi.fn()
      };
      
      toolManager.setFont(newFont);
      
      expect(mockContext.font).toBe(newFont);
    });
  });

  describe('getToolList', () => {
    it('should return empty array when no tools registered', () => {
      const toolList = toolManager.getToolList();
      
      expect(toolList).toEqual([]);
    });

    it('should return list of registered tools', () => {
      toolManager.registerTool(mockTool);
      toolManager.registerTool(minimalTool);
      
      const toolList = toolManager.getToolList();
      
      expect(toolList).toHaveLength(2);
      expect(toolList).toContainEqual({id: 'brush', label: 'Brush Tool'});
      expect(toolList).toContainEqual({id: 'pen', label: 'Pen Tool'});
    });

    it('should return tools in registration order', () => {
      toolManager.registerTool(minimalTool);
      toolManager.registerTool(mockTool);
      
      const toolList = toolManager.getToolList();
      
      expect(toolList[0]).toEqual({id: 'pen', label: 'Pen Tool'});
      expect(toolList[1]).toEqual({id: 'brush', label: 'Brush Tool'});
    });
  });
});