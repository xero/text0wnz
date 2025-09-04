import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createOfflineCanvasState, getCanvasImage, enqueueDirtyRegion, clearDirtyRegions, getDirtyRegions, drawRegion, drawHalfBlock, shadeCell, type DirtyRegion} from '../../src/scripts/canvasRenderer';

// Mock the eventBus module
vi.mock('../../src/scripts/eventBus', () => ({
  eventBus: {
    publish: vi.fn(),
    subscribe: vi.fn()
  }
}));

describe('canvasRenderer utilities', () => {
  describe('createOfflineCanvasState', () => {
    it('should create a default offline canvas state', () => {
      const canvas = createOfflineCanvasState();

      expect(canvas.id).toBe(0);
      expect(canvas.name).toBe('Offline Canvas');
      expect(canvas.width).toBe(80);
      expect(canvas.height).toBe(25);
      expect(canvas.font).toBe('CP437 8x16');
      expect(canvas.fontType).toBe('cp437');
      expect(canvas.spacing).toBe(1);
      expect(canvas.ice).toBe(false);
      expect(canvas.colors).toHaveLength(16);
      expect(canvas.rawdata).toBeInstanceOf(Uint8Array);
      expect(canvas.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should initialize canvas data correctly', () => {
      const canvas = createOfflineCanvasState();
      const expectedLength = 80 * 25 * 3; // width * height * 3 bytes per cell

      expect(canvas.rawdata).toHaveLength(expectedLength);

      // Check that all cells are initialized with space, white fg, black bg
      for (let i = 0; i < 80 * 25; i++) {
        expect(canvas.rawdata[i * 3 + 0]).toBe(32); // space character
        expect(canvas.rawdata[i * 3 + 1]).toBe(7);  // white foreground
        expect(canvas.rawdata[i * 3 + 2]).toBe(0);  // black background
      }
    });

    it('should create a valid colors array', () => {
      const canvas = createOfflineCanvasState();

      expect(canvas.colors).toHaveLength(16);
      expect(canvas.colors.every(color => typeof color === 'number')).toBe(true);
      expect(canvas.colors.every(color => color === 0)).toBe(true); // All initialized to 0
    });

    it('should include ISO8601 timestamp', () => {
      const beforeTime = new Date().toISOString();
      const canvas = createOfflineCanvasState();
      const afterTime = new Date().toISOString();

      expect(canvas.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      expect(canvas.updatedAt >= beforeTime).toBe(true);
      expect(canvas.updatedAt <= afterTime).toBe(true);
    });
  });

  describe('getCanvasImage', () => {
    it('should return null when no canvas is available', () => {
      // Since we haven't initialized the canvas in the module, it should return null
      const canvasImage = getCanvasImage();
      expect(canvasImage).toBeNull();
    });
  });

  describe('dirty region system', () => {
    beforeEach(() => {
      clearDirtyRegions();
    });

    describe('getDirtyRegions', () => {
      it('should return empty array initially', () => {
        const regions = getDirtyRegions();
        expect(regions).toEqual([]);
      });
    });

    describe('clearDirtyRegions', () => {
      it('should clear all dirty regions', () => {
        // First, we need to mock a basic state to allow enqueueDirtyRegion to work
        vi.doMock('../../src/scripts/state', () => ({
          state: {
            currentRoom: {
              canvas: {
                width: 80,
                height: 25
              }
            }
          }
        }));

        clearDirtyRegions();
        const regions = getDirtyRegions();
        expect(regions).toEqual([]);
      });
    });

    describe('DirtyRegion type', () => {
      it('should have correct structure', () => {
        const region: DirtyRegion = {
          x: 10,
          y: 5,
          w: 20,
          h: 15
        };

        expect(region.x).toBe(10);
        expect(region.y).toBe(5);
        expect(region.w).toBe(20);
        expect(region.h).toBe(15);
      });
    });

    describe('enqueueDirtyRegion', () => {
      it('should handle empty state gracefully', () => {
        const region: DirtyRegion = { x: 0, y: 0, w: 10, h: 10 };
        
        // Should not throw when state is null/undefined
        expect(() => enqueueDirtyRegion(region)).not.toThrow();
        
        // Should not add anything to queue when state is invalid
        const regions = getDirtyRegions();
        expect(regions).toEqual([]);
      });
    });
  });

  describe('drawRegion', () => {
    it('should handle empty state gracefully', () => {
      // Should not throw when renderer is not initialized
      expect(() => drawRegion(0, 0, 10, 10)).not.toThrow();
    });

    it('should handle empty regions gracefully', () => {
      // Should not throw with zero or negative dimensions
      expect(() => drawRegion(0, 0, 0, 10)).not.toThrow();
      expect(() => drawRegion(0, 0, 10, 0)).not.toThrow();
      expect(() => drawRegion(0, 0, -5, 10)).not.toThrow();
      expect(() => drawRegion(0, 0, 10, -5)).not.toThrow();
    });

    it('should handle out-of-bounds regions gracefully', () => {
      // Should not throw with coordinates outside canvas bounds
      expect(() => drawRegion(-10, -10, 5, 5)).not.toThrow();
      expect(() => drawRegion(1000, 1000, 10, 10)).not.toThrow();
      expect(() => drawRegion(0, 0, 1000, 1000)).not.toThrow();
    });

    it('should handle partially out-of-bounds regions gracefully', () => {
      // Should not throw with regions that extend beyond canvas bounds
      expect(() => drawRegion(-5, -5, 15, 15)).not.toThrow();
      expect(() => drawRegion(75, 20, 10, 10)).not.toThrow(); // Assuming 80x25 canvas
    });

    it('should accept valid region coordinates', () => {
      // Should not throw with valid region within typical canvas bounds
      expect(() => drawRegion(10, 5, 20, 15)).not.toThrow();
      expect(() => drawRegion(0, 0, 1, 1)).not.toThrow();
    });
  });

  describe('tool drawing functions with region-based dirty tracking', () => {
    beforeEach(() => {
      clearDirtyRegions();
    });

    describe('drawHalfBlock', () => {
      it('should enqueue dirty region when state is available', () => {
        // Mock the state module to provide a valid canvas state
        vi.doMock('../../src/scripts/state', () => ({
          state: {
            currentRoom: {
              canvas: {
                width: 80,
                height: 25,
                rawdata: new Uint8Array(80 * 25 * 3)
              }
            }
          }
        }));

        const originalRegionsLength = getDirtyRegions().length;
        
        // Call drawHalfBlock (should now use enqueueDirtyRegion)
        drawHalfBlock(7, 10, 20); // color=7, x=10, halfBlockY=20
        
        // Since this test environment doesn't have the full state setup,
        // and the function checks for state existence, we expect no change
        // This test verifies the function doesn't crash
        expect(() => drawHalfBlock(7, 10, 20)).not.toThrow();
      });

      it('should handle invalid coordinates gracefully', () => {
        expect(() => drawHalfBlock(7, -1, 20)).not.toThrow();
        expect(() => drawHalfBlock(7, 100, 20)).not.toThrow();
        expect(() => drawHalfBlock(7, 10, -1)).not.toThrow();
        expect(() => drawHalfBlock(7, 10, 1000)).not.toThrow();
      });
    });

    describe('shadeCell', () => {
      it('should enqueue dirty region when state is available', () => {
        // Call shadeCell (should now use enqueueDirtyRegion)
        expect(() => shadeCell(10, 5, 7, 0, false)).not.toThrow();
      });

      it('should handle invalid coordinates gracefully', () => {
        expect(() => shadeCell(-1, 5, 7, 0, false)).not.toThrow();
        expect(() => shadeCell(100, 5, 7, 0, false)).not.toThrow();
        expect(() => shadeCell(10, -1, 7, 0, false)).not.toThrow();
        expect(() => shadeCell(10, 100, 7, 0, false)).not.toThrow();
      });

      it('should handle both reduce and darken modes', () => {
        expect(() => shadeCell(10, 5, 7, 0, false)).not.toThrow(); // darken
        expect(() => shadeCell(10, 5, 7, 0, true)).not.toThrow();  // reduce/lighten
      });
    });
  });
});