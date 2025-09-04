import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createOfflineCanvasState, getCanvasImage, enqueueDirtyRegion, clearDirtyRegions, getDirtyRegions, type DirtyRegion} from '../../src/scripts/canvasRenderer';

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
});