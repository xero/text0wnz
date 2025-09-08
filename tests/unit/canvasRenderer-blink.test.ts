import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {initCanvasRenderer, resetCanvasRenderer} from '../../src/scripts/canvasRenderer';
import {createDefaultPalette} from '../../src/scripts/paletteManager';
import {createState, createOfflineCanvasState} from '../../src/scripts/state';
import type {FontRenderer} from '../../src/scripts/fontManager';

// Mock Canvas and CanvasRenderingContext2D
class MockCanvasRenderingContext2D {
  font = '';
  textBaseline = '';
  fillStyle = '';

  fillText = vi.fn();
  fillRect = vi.fn();
  drawImage = vi.fn();
  getImageData = vi.fn();
  putImageData = vi.fn();
  clearRect = vi.fn();
  setTransform = vi.fn();
}

describe('canvasRenderer blinking functionality', () => {
  let mockCanvas: HTMLCanvasElement;
  let mockCtx: MockCanvasRenderingContext2D;
  let mockFontRenderer: FontRenderer;
  let globalState: any;
  let palette: any;

  beforeEach(() => {
    vi.useFakeTimers();
    
    // Reset DOM mocks
    mockCtx = new MockCanvasRenderingContext2D();
    mockCanvas = {
      width: 640,
      height: 400,
      style: {},
      getContext: vi.fn().mockReturnValue(mockCtx)
    } as any;

    // Mock document.getElementById to return our mock canvas
    vi.spyOn(document, 'getElementById').mockReturnValue(mockCanvas);
    
    // Mock document.createElement for offscreen canvas
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(mockCtx)
        } as any;
      }
      return {} as any;
    });

    // Create mock font renderer
    mockFontRenderer = {
      width: 8,
      height: 16,
      fontType: 'cp437',
      setLetterSpacing: vi.fn(),
      getLetterSpacing: vi.fn().mockReturnValue(false),
      draw: vi.fn()
    };

    // Create test state
    globalState = createState();
    const canvas = createOfflineCanvasState();
    // Set up a canvas with blinking cells (bg >= 8 when ice=false)
    canvas.ice = false; // Enable blinking mode
    canvas.rawdata[0] = 65; // 'A'
    canvas.rawdata[1] = 7;  // white fg
    canvas.rawdata[2] = 12; // bright red bg (should blink)
    
    canvas.rawdata[3] = 66; // 'B'
    canvas.rawdata[4] = 15; // bright white fg
    canvas.rawdata[5] = 4;  // normal red bg (should not blink)
    
    globalState.currentRoom = {
      canvas,
      users: [],
      messages: []
    };

    palette = createDefaultPalette();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetCanvasRenderer();
    vi.restoreAllMocks();
  });

  describe('blink timer management', () => {
    it('should start blink timer when canvas has blinking cells', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      
      initCanvasRenderer(globalState, palette, mockFontRenderer);
      
      // Advance time to trigger the initial render
      vi.runAllTimers();
      
      // Should have started a timer
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 500);
    });

    it('should not start blink timer when ice colors are enabled', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      
      // Enable ice colors (no blinking)
      globalState.currentRoom.canvas.ice = true;
      
      initCanvasRenderer(globalState, palette, mockFontRenderer);
      
      // Advance time to trigger the initial render
      vi.runAllTimers();
      
      // Should not have started a timer for blinking
      expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('should stop blink timer when resetCanvasRenderer is called', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      
      initCanvasRenderer(globalState, palette, mockFontRenderer);
      resetCanvasRenderer();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('blink state rendering', () => {
    it('should render cells correctly during initial draw', () => {
      initCanvasRenderer(globalState, palette, mockFontRenderer);
      
      // Trigger the initial render by advancing timers
      vi.runAllTimers();
      
      // Check that font.draw was called for our test cells
      expect(mockFontRenderer.draw).toHaveBeenCalled();
      
      // Check that it was called with the correct parameters for the blinking cell
      const blinkingCellCall = vi.mocked(mockFontRenderer.draw).mock.calls.find(call => 
        call[0] === 65 && call[1] === 7 && call[2] === 12
      );
      expect(blinkingCellCall).toBeDefined();
      if (blinkingCellCall) {
        expect(blinkingCellCall[6]).toBe(false); // ice=false
        expect(blinkingCellCall[7]).toBe(true);  // blinkState=true initially
      }
    });
  });

  describe('ice color vs blinking behavior', () => {
    it('should use ice colors when ice=true', () => {
      globalState.currentRoom.canvas.ice = true;
      
      initCanvasRenderer(globalState, palette, mockFontRenderer);
      
      // Trigger the initial render
      vi.runAllTimers();
      
      // Should have rendered with ice=true
      expect(mockFontRenderer.draw).toHaveBeenCalled();
      
      const iceColorCall = vi.mocked(mockFontRenderer.draw).mock.calls.find(call => 
        call[0] === 65 && call[1] === 7 && call[2] === 12
      );
      expect(iceColorCall).toBeDefined();
      if (iceColorCall) {
        expect(iceColorCall[6]).toBe(true); // ice=true
      }
    });

    it('should use blinking when ice=false', () => {
      globalState.currentRoom.canvas.ice = false;
      
      initCanvasRenderer(globalState, palette, mockFontRenderer);
      
      // Trigger the initial render
      vi.runAllTimers();
      
      // Should have rendered with ice=false
      expect(mockFontRenderer.draw).toHaveBeenCalled();
      
      const blinkingCall = vi.mocked(mockFontRenderer.draw).mock.calls.find(call => 
        call[0] === 65 && call[1] === 7 && call[2] === 12
      );
      expect(blinkingCall).toBeDefined();
      if (blinkingCall) {
        expect(blinkingCall[6]).toBe(false); // ice=false for blinking
      }
    });
  });
});