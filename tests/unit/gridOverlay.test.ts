import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {GridOverlay} from '../../src/scripts/gridOverlay';
import type {FontRenderer} from '../../src/scripts/fontManager';

// Mock the eventBus module
vi.mock('../../src/scripts/eventBus', () => ({
  eventBus: {
    subscribe: vi.fn()
  }
}));

describe('GridOverlay', () => {
  let mockContainer: HTMLElement;
  let mockFont: FontRenderer;
  let getColumns: () => number;
  let getRows: () => number;
  let mockCanvas: any;
  let mockCtx: any;

  beforeEach(() => {
    // Mock container element
    mockContainer = {
      appendChild: vi.fn(),
      removeChild: vi.fn()
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

    // Mock canvas and context
    mockCtx = {
      strokeStyle: '',
      lineWidth: 0,
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      setTransform: vi.fn()
    };

    mockCanvas = {
      id: '',
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
      },
      getContext: vi.fn(() => mockCtx)
    };

    // Mock document.createElement
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas as any;
      }
      return document.createElement(tagName);
    });

    // Mock window.addEventListener
    vi.spyOn(window, 'addEventListener').mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create canvas element and append to container', () => {
      new GridOverlay(mockContainer, mockFont, getColumns, getRows);

      expect(document.createElement).toHaveBeenCalledWith('canvas');
      expect(mockContainer.appendChild).toHaveBeenCalledWith(mockCanvas);
    });

    it('should set up event listeners', () => {
      new GridOverlay(mockContainer, mockFont, getColumns, getRows);

      expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('should throw error if canvas context is not available', () => {
      mockCanvas.getContext = vi.fn(() => null);

      expect(() => {
        new GridOverlay(mockContainer, mockFont, getColumns, getRows);
      }).toThrow('Failed to get 2D context for grid overlay');
    });

    it('should initially not be shown', () => {
      const gridOverlay = new GridOverlay(mockContainer, mockFont, getColumns, getRows);
      expect(gridOverlay.isShown()).toBe(false);
    });
  });

  describe('show and isShown', () => {
    let gridOverlay: GridOverlay;

    beforeEach(() => {
      gridOverlay = new GridOverlay(mockContainer, mockFont, getColumns, getRows);
    });

    it('should return false initially', () => {
      expect(gridOverlay.isShown()).toBe(false);
    });

    it('should show grid when turned on', () => {
      gridOverlay.show(true);

      expect(gridOverlay.isShown()).toBe(true);
      expect(mockCanvas.classList.add).toHaveBeenCalledWith('enabled');
      expect(mockCanvas.style.display).toBe('');
    });

    it('should hide grid when turned off', () => {
      gridOverlay.show(true);
      gridOverlay.show(false);

      expect(gridOverlay.isShown()).toBe(false);
      expect(mockCanvas.classList.remove).toHaveBeenCalledWith('enabled');
      expect(mockCanvas.style.display).toBe('none');
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
      const gridOverlay = new GridOverlay(mockContainer, mockFont, getColumns, getRows);
      
      gridOverlay.destroy();

      expect(mockContainer.removeChild).toHaveBeenCalledWith(mockCanvas);
    });
  });

  describe('setFont', () => {
    it('should update font and trigger resize', () => {
      const gridOverlay = new GridOverlay(mockContainer, mockFont, getColumns, getRows);
      const newFont = {
        ...mockFont,
        width: 12,
        height: 24
      };

      // Mock the resize method to avoid complex canvas property updates
      const resizeSpy = vi.spyOn(gridOverlay, 'resize').mockImplementation(() => {});
      
      gridOverlay.setFont(newFont);

      expect(resizeSpy).toHaveBeenCalled();
    });
  });

  describe('renderGrid basics', () => {
    it('should set stroke style and line width', () => {
      const gridOverlay = new GridOverlay(mockContainer, mockFont, getColumns, getRows);
      
      gridOverlay.renderGrid();

      expect(mockCtx.strokeStyle).toBe('rgba(63,63,63,0.7)');
      expect(mockCtx.lineWidth).toBe(1);
    });

    it('should clear canvas before drawing', () => {
      const gridOverlay = new GridOverlay(mockContainer, mockFont, getColumns, getRows);
      
      gridOverlay.renderGrid();

      expect(mockCtx.clearRect).toHaveBeenCalled();
    });
  });
});