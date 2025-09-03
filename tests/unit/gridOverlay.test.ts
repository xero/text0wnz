import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {GridOverlay} from '../../src/scripts/gridOverlay';
import type {FontRenderer} from '../../src/scripts/fontManager';

// Mock the eventBus module
vi.mock('../../src/scripts/eventBus', () => ({
  eventBus: {
    subscribe: vi.fn()
  }
}));

// Mock HTML canvas context
class MockCanvasRenderingContext2D {
  strokeStyle = '';
  lineWidth = 0;
  canvas = {
    width: 0,
    height: 0,
    style: {
      width: '',
      height: '',
      display: ''
    },
    classList: {
      add: vi.fn(),
      remove: vi.fn()
    }
  };

  clearRect = vi.fn();
  beginPath = vi.fn();
  moveTo = vi.fn();
  lineTo = vi.fn();
  stroke = vi.fn();
  setTransform = vi.fn();
}

describe('GridOverlay', () => {
  let gridOverlay: GridOverlay;
  let mockContainer: HTMLElement;
  let mockFont: FontRenderer;
  let getColumns: () => number;
  let getRows: () => number;
  let mockCtx: MockCanvasRenderingContext2D;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    // Mock container element
    mockContainer = {
      appendChild: vi.fn()
    } as any;

    // Mock font renderer
    mockFont = {
      width: 8,
      height: 16,
      fontType: 'cp437',
      setLetterSpacing: vi.fn(),
      getLetterSpacing: vi.fn(() => false),
      draw: vi.fn()
    };

    // Mock dimension getters
    getColumns = vi.fn(() => 80);
    getRows = vi.fn(() => 25);

    // Mock document.createElement
    mockCtx = new MockCanvasRenderingContext2D();
    originalCreateElement = document.createElement;
    (document as any).createElement = vi.fn((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          id: '',
          getContext: vi.fn(() => mockCtx),
          style: mockCtx.canvas.style,
          classList: mockCtx.canvas.classList,
          get width() { return mockCtx.canvas.width; },
          set width(value) { mockCtx.canvas.width = value; },
          get height() { return mockCtx.canvas.height; },
          set height(value) { mockCtx.canvas.height = value; }
        } as any;
      }
      return originalCreateElement.call(document, tagName);
    });

    // Mock window.addEventListener
    window.addEventListener = vi.fn();

    gridOverlay = new GridOverlay(mockContainer, mockFont, getColumns, getRows);
  });

  afterEach(() => {
    (document as any).createElement = originalCreateElement;
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create canvas element and append to container', () => {
      expect(document.createElement).toHaveBeenCalledWith('canvas');
      expect(mockContainer.appendChild).toHaveBeenCalled();
    });

    it('should set up event listeners', () => {
      expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('should throw error if canvas context is not available', () => {
      const brokenCreateElement = vi.fn(() => ({
        getContext: () => null
      }));
      (document as any).createElement = brokenCreateElement;

      expect(() => {
        new GridOverlay(mockContainer, mockFont, getColumns, getRows);
      }).toThrow('Failed to get 2D context for grid overlay');
    });

    it('should initially not be shown', () => {
      expect(gridOverlay.isShown()).toBe(false);
    });
  });

  describe('resize', () => {
    it('should calculate canvas dimensions based on font and grid size', () => {
      gridOverlay.resize();

      const expectedWidth = 8 * 80; // font.width * columns
      const expectedHeight = 16 * 25; // font.height * rows

      expect(mockCtx.canvas.width).toBe(expectedWidth);
      expect(mockCtx.canvas.height).toBe(expectedHeight);
      expect(mockCtx.canvas.style.width).toBe(`${expectedWidth}px`);
      expect(mockCtx.canvas.style.height).toBe(`${expectedHeight}px`);
    });

    it('should call setTransform and renderGrid', () => {
      gridOverlay.resize();

      expect(mockCtx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
      expect(mockCtx.clearRect).toHaveBeenCalled(); // Called during renderGrid
    });

    it('should handle different font sizes', () => {
      const bigFont = {
        ...mockFont,
        width: 16,
        height: 32
      };

      gridOverlay.setFont(bigFont);

      const expectedWidth = 16 * 80;
      const expectedHeight = 32 * 25;

      expect(mockCtx.canvas.width).toBe(expectedWidth);
      expect(mockCtx.canvas.height).toBe(expectedHeight);
    });
  });

  describe('setFont', () => {
    it('should update font and trigger resize', () => {
      const newFont = {
        ...mockFont,
        width: 12,
        height: 24
      };

      gridOverlay.setFont(newFont);

      // Verify new dimensions are calculated
      const expectedWidth = 12 * 80;
      const expectedHeight = 24 * 25;

      expect(mockCtx.canvas.width).toBe(expectedWidth);
      expect(mockCtx.canvas.height).toBe(expectedHeight);
    });
  });

  describe('renderGrid', () => {
    beforeEach(() => {
      // Set up canvas dimensions
      mockCtx.canvas.width = 640; // 8 * 80
      mockCtx.canvas.height = 400; // 16 * 25
    });

    it('should clear canvas before drawing', () => {
      gridOverlay.renderGrid();

      expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 640, 400);
    });

    it('should set stroke style and line width', () => {
      gridOverlay.renderGrid();

      expect(mockCtx.strokeStyle).toBe('rgba(63,63,63,0.7)');
      expect(mockCtx.lineWidth).toBe(1);
    });

    it('should draw horizontal lines for each row', () => {
      gridOverlay.renderGrid();

      // Should draw 26 horizontal lines (0 to 25 inclusive for 25 rows)
      const horizontalLineCalls = mockCtx.moveTo.mock.calls.filter(
        call => call[0] === 0 // Horizontal lines start at x=0
      );
      expect(horizontalLineCalls).toHaveLength(26);

      // Check first and last horizontal lines
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 0.5); // First line
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 400.5); // Last line (25 * 16 + 0.5)
    });

    it('should draw vertical lines for each column', () => {
      gridOverlay.renderGrid();

      // Should draw 81 vertical lines (0 to 80 inclusive for 80 columns)
      const verticalLineCalls = mockCtx.moveTo.mock.calls.filter(
        call => call[1] === 0 // Vertical lines start at y=0
      );
      expect(verticalLineCalls).toHaveLength(81);

      // Check first and last vertical lines
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0.5, 0); // First line
      expect(mockCtx.moveTo).toHaveBeenCalledWith(640.5, 0); // Last line (80 * 8 + 0.5)
    });

    it('should handle different grid dimensions', () => {
      // Change grid size
      getColumns = vi.fn(() => 40);
      getRows = vi.fn(() => 20);
      
      // Create new overlay with different dimensions
      const smallGridOverlay = new GridOverlay(mockContainer, mockFont, getColumns, getRows);
      smallGridOverlay.renderGrid();

      // Should account for new dimensions in line drawing
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 320.5); // 20 * 16 + 0.5
      expect(mockCtx.moveTo).toHaveBeenCalledWith(320.5, 0); // 40 * 8 + 0.5
    });
  });

  describe('show', () => {
    it('should show grid when turned on', () => {
      gridOverlay.show(true);

      expect(gridOverlay.isShown()).toBe(true);
      expect(mockCtx.canvas.classList.add).toHaveBeenCalledWith('enabled');
      expect(mockCtx.canvas.style.display).toBe('');
    });

    it('should hide grid when turned off', () => {
      gridOverlay.show(true); // First show it
      gridOverlay.show(false); // Then hide it

      expect(gridOverlay.isShown()).toBe(false);
      expect(mockCtx.canvas.classList.remove).toHaveBeenCalledWith('enabled');
      expect(mockCtx.canvas.style.display).toBe('none');
    });

    it('should trigger resize when showing', () => {
      const resizeSpy = vi.spyOn(gridOverlay, 'resize');
      
      gridOverlay.show(true);

      expect(resizeSpy).toHaveBeenCalled();
    });

    it('should not trigger resize when hiding', () => {
      gridOverlay.show(true); // First show it
      vi.clearAllMocks();

      gridOverlay.show(false);

      // resize should not be called when hiding
      expect(mockCtx.setTransform).not.toHaveBeenCalled();
    });
  });

  describe('isShown', () => {
    it('should return false initially', () => {
      expect(gridOverlay.isShown()).toBe(false);
    });

    it('should return true when shown', () => {
      gridOverlay.show(true);
      expect(gridOverlay.isShown()).toBe(true);
    });

    it('should return false when hidden after being shown', () => {
      gridOverlay.show(true);
      gridOverlay.show(false);
      expect(gridOverlay.isShown()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should remove canvas from container', () => {
      mockContainer.removeChild = vi.fn();
      
      gridOverlay.destroy();

      expect(mockContainer.removeChild).toHaveBeenCalled();
    });
  });
});