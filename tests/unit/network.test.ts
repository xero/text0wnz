import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  processNetworkPatch,
  createNetworkPatch,
  handleOrderedNetworkPatch,
  resetPatchState,
  getPatchStats,
  initializeNetworkSync,
  serializeNetworkPatch,
  type NetworkPatch
} from '../../src/scripts/network';
import { createState, createOfflineCanvasState, createDefaultUserState, createOfflineRoomState } from '../../src/scripts/state';
import { enqueueDirtyRegion } from '../../src/scripts/canvasRenderer';
import { eventBus } from '../../src/scripts/eventBus';

// Mock the canvas renderer functions
vi.mock('../../src/scripts/canvasRenderer', () => ({
  enqueueDirtyRegion: vi.fn(),
}));

// Mock the event bus
vi.mock('../../src/scripts/eventBus', () => ({
  eventBus: {
    subscribe: vi.fn(),
    publish: vi.fn(),
  },
}));

describe('network patch processing', () => {
  let state: any;
  let mockCanvasData: Uint8Array;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create test state with canvas
    const user = createDefaultUserState();
    user.id = 'test-user';
    user.nickname = 'TestUser';
    
    const canvas = createOfflineCanvasState();
    canvas.width = 10;
    canvas.height = 10;
    mockCanvasData = new Uint8Array(10 * 10 * 3);
    // Fill with test data: space, white fg, black bg
    for (let i = 0; i < 10 * 10; i++) {
      mockCanvasData[i * 3] = 32;     // space character
      mockCanvasData[i * 3 + 1] = 7;  // white fg
      mockCanvasData[i * 3 + 2] = 0;  // black bg
    }
    canvas.rawdata = mockCanvasData;

    state = createState();
    state.user = user;
    state.currentRoom = createOfflineRoomState(user);
    state.currentRoom.canvas = canvas;

    // Reset patch state
    resetPatchState();
  });

  describe('processNetworkPatch', () => {
    it('should apply valid patch to canvas buffer', () => {
      const patch: NetworkPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 2, y: 3, w: 2, h: 1 },
        data: [65, 1, 2, 66, 3, 4] // Two cells: 'A' with fg=1,bg=2 and 'B' with fg=3,bg=4
      };

      const result = processNetworkPatch(patch, state);

      expect(result).toBe(true);
      
      // Check that canvas data was updated
      const canvas = state.currentRoom.canvas;
      const baseIndex = (3 * 10 + 2) * 3; // y=3, x=2
      
      expect(canvas.rawdata[baseIndex]).toBe(65);     // 'A'
      expect(canvas.rawdata[baseIndex + 1]).toBe(1);  // fg
      expect(canvas.rawdata[baseIndex + 2]).toBe(2);  // bg
      expect(canvas.rawdata[baseIndex + 3]).toBe(66); // 'B'
      expect(canvas.rawdata[baseIndex + 4]).toBe(3);  // fg
      expect(canvas.rawdata[baseIndex + 5]).toBe(4);  // bg

      // Check that dirty region was enqueued with batched processing for network edits
      expect(enqueueDirtyRegion).toHaveBeenCalledWith({
        x: 2, y: 3, w: 2, h: 1
      }, false);
    });

    it('should reject patch with invalid format', () => {
      const invalidPatch = {
        type: 'invalid-type',
        sequence: 1,
        userId: 'other-user'
      } as any;

      const result = processNetworkPatch(invalidPatch, state);

      expect(result).toBe(false);
      expect(enqueueDirtyRegion).not.toHaveBeenCalled();
    });

    it('should reject patch with out-of-bounds region', () => {
      const patch: NetworkPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 8, y: 8, w: 5, h: 5 }, // Extends beyond 10x10 canvas
        data: new Array(5 * 5 * 3).fill(32)
      };

      const result = processNetworkPatch(patch, state);

      expect(result).toBe(false);
      expect(enqueueDirtyRegion).not.toHaveBeenCalled();
    });

    it('should reject patch with mismatched data length', () => {
      const patch: NetworkPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 0, y: 0, w: 2, h: 2 },
        data: [32, 7, 0] // Should be 2*2*3 = 12 elements, but only 3
      };

      const result = processNetworkPatch(patch, state);

      expect(result).toBe(false);
      expect(enqueueDirtyRegion).not.toHaveBeenCalled();
    });

    it('should handle patch when no current room exists', () => {
      state.currentRoom = null;

      const patch: NetworkPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 0, y: 0, w: 1, h: 1 },
        data: [32, 7, 0]
      };

      const result = processNetworkPatch(patch, state);

      expect(result).toBe(false);
      expect(enqueueDirtyRegion).not.toHaveBeenCalled();
    });

    it('should update canvas timestamp after successful patch', async () => {
      const beforeTimestamp = state.currentRoom.canvas.updatedAt;
      
      // Add a small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const patch: NetworkPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 0, y: 0, w: 1, h: 1 },
        data: [88, 15, 8] // 'X' with bright white fg, dark gray bg
      };

      processNetworkPatch(patch, state);

      const afterTimestamp = state.currentRoom.canvas.updatedAt;
      
      // Check that the timestamp was updated
      expect(afterTimestamp).not.toBe(beforeTimestamp);
      expect(new Date(afterTimestamp).getTime()).toBeGreaterThan(new Date(beforeTimestamp).getTime());
    });
  });

  describe('createNetworkPatch', () => {
    it('should create valid patch from canvas region', () => {
      // Set up some test data in the canvas
      const canvas = state.currentRoom.canvas;
      const baseIndex = (2 * 10 + 3) * 3; // y=2, x=3
      canvas.rawdata[baseIndex] = 72;     // 'H'
      canvas.rawdata[baseIndex + 1] = 10; // fg
      canvas.rawdata[baseIndex + 2] = 5;  // bg

      const region = { x: 3, y: 2, w: 1, h: 1 };
      const patch = createNetworkPatch(region, state);

      expect(patch).toBeTruthy();
      expect(patch!.type).toBe('region-update');
      expect(patch!.userId).toBe('test-user');
      expect(patch!.region).toEqual(region);
      expect(patch!.data).toEqual([72, 10, 5]);
      expect(patch!.sequence).toBeGreaterThan(0);
      expect(patch!.timestamp).toBeTruthy();
    });

    it('should extract multi-cell region data correctly', () => {
      const canvas = state.currentRoom.canvas;
      
      // Set up 2x2 region with different data
      const testData = [
        [65, 1, 2], [66, 3, 4],  // Row 0: 'A' and 'B'
        [67, 5, 6], [68, 7, 8]   // Row 1: 'C' and 'D'
      ];

      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          const baseIndex = ((y + 1) * 10 + (x + 1)) * 3; // Start at (1,1)
          canvas.rawdata[baseIndex] = testData[y * 2 + x][0];     // char
          canvas.rawdata[baseIndex + 1] = testData[y * 2 + x][1]; // fg
          canvas.rawdata[baseIndex + 2] = testData[y * 2 + x][2]; // bg
        }
      }

      const region = { x: 1, y: 1, w: 2, h: 2 };
      const patch = createNetworkPatch(region, state);

      expect(patch).toBeTruthy();
      expect(patch!.data).toEqual([
        65, 1, 2,  // 'A'
        66, 3, 4,  // 'B'
        67, 5, 6,  // 'C'
        68, 7, 8   // 'D'
      ]);
    });

    it('should return null when no current room exists', () => {
      state.currentRoom = null;

      const region = { x: 0, y: 0, w: 1, h: 1 };
      const patch = createNetworkPatch(region, state);

      expect(patch).toBeNull();
    });

    it('should increment sequence numbers', () => {
      const region = { x: 0, y: 0, w: 1, h: 1 };
      
      const patch1 = createNetworkPatch(region, state);
      const patch2 = createNetworkPatch(region, state);

      expect(patch1!.sequence).toBeLessThan(patch2!.sequence);
      expect(patch2!.sequence).toBe(patch1!.sequence + 1);
    });
  });

  describe('handleOrderedNetworkPatch', () => {
    it('should apply patches in sequence order', () => {
      const patch1: NetworkPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 0, y: 0, w: 1, h: 1 },
        data: [65, 1, 2] // 'A'
      };

      const patch2: NetworkPatch = {
        type: 'region-update',
        sequence: 2,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 1, y: 0, w: 1, h: 1 },
        data: [66, 3, 4] // 'B'
      };

      handleOrderedNetworkPatch(patch1, state);
      handleOrderedNetworkPatch(patch2, state);

      // Both patches should be applied
      expect(enqueueDirtyRegion).toHaveBeenCalledTimes(2);
      expect(state.currentRoom.canvas.rawdata[0]).toBe(65); // 'A'
      expect(state.currentRoom.canvas.rawdata[3]).toBe(66); // 'B'
    });

    it('should buffer out-of-order patches', () => {
      const patch1: NetworkPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 0, y: 0, w: 1, h: 1 },
        data: [65, 1, 2]
      };

      const patch3: NetworkPatch = {
        type: 'region-update',
        sequence: 3,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 2, y: 0, w: 1, h: 1 },
        data: [67, 5, 6]
      };

      const patch2: NetworkPatch = {
        type: 'region-update',
        sequence: 2,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 1, y: 0, w: 1, h: 1 },
        data: [66, 3, 4]
      };

      // Apply patches in order: 1, 3, 2
      handleOrderedNetworkPatch(patch1, state);
      handleOrderedNetworkPatch(patch3, state); // This should be buffered
      handleOrderedNetworkPatch(patch2, state); // This should trigger processing of patch3

      // All patches should eventually be applied
      expect(enqueueDirtyRegion).toHaveBeenCalledTimes(3);
      expect(state.currentRoom.canvas.rawdata[0]).toBe(65); // 'A'
      expect(state.currentRoom.canvas.rawdata[3]).toBe(66); // 'B'
      expect(state.currentRoom.canvas.rawdata[6]).toBe(67); // 'C'
    });

    it('should ignore duplicate/old patches', () => {
      const patch1: NetworkPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 0, y: 0, w: 1, h: 1 },
        data: [65, 1, 2]
      };

      handleOrderedNetworkPatch(patch1, state);
      
      // Try to apply the same patch again
      handleOrderedNetworkPatch(patch1, state);

      // Should only be applied once
      expect(enqueueDirtyRegion).toHaveBeenCalledTimes(1);
    });
  });

  describe('patch state management', () => {
    it('should track patch statistics correctly', () => {
      const initialStats = getPatchStats();
      expect(initialStats.lastSequence).toBe(0);
      expect(initialStats.pendingCount).toBe(0);
      expect(initialStats.localSequence).toBe(0);

      // Create a local patch
      const region = { x: 0, y: 0, w: 1, h: 1 };
      createNetworkPatch(region, state);

      const afterLocalStats = getPatchStats();
      expect(afterLocalStats.localSequence).toBe(1);

      // Apply a remote patch in order (sequence 1)
      const remotePatch: NetworkPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 0, y: 0, w: 1, h: 1 },
        data: [65, 1, 2]
      };

      handleOrderedNetworkPatch(remotePatch, state);

      const afterRemoteStats = getPatchStats();
      expect(afterRemoteStats.lastSequence).toBe(1);

      // Apply an out-of-order patch that gets buffered
      const outOfOrderPatch: NetworkPatch = {
        type: 'region-update',
        sequence: 5,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 1, y: 0, w: 1, h: 1 },
        data: [66, 2, 3]
      };

      handleOrderedNetworkPatch(outOfOrderPatch, state);

      const afterBufferedStats = getPatchStats();
      expect(afterBufferedStats.lastSequence).toBe(1); // Should still be 1 since patch was buffered
      expect(afterBufferedStats.pendingCount).toBe(1); // One patch should be pending
    });

    it('should reset patch state correctly', () => {
      // Create some state
      createNetworkPatch({ x: 0, y: 0, w: 1, h: 1 }, state);
      
      const patch: NetworkPatch = {
        type: 'region-update',
        sequence: 10,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 0, y: 0, w: 1, h: 1 },
        data: [65, 1, 2]
      };
      handleOrderedNetworkPatch(patch, state);

      // Reset and verify
      resetPatchState();
      
      const stats = getPatchStats();
      expect(stats.lastSequence).toBe(0);
      expect(stats.pendingCount).toBe(0);
      expect(stats.localSequence).toBe(0);
    });
  });

  describe('network sync initialization', () => {
    it('should register event listeners', () => {
      initializeNetworkSync(state);
      
      expect(eventBus.subscribe).toHaveBeenCalledWith(
        'network:canvas:update',
        expect.any(Function)
      );
    });
  });

  describe('patch serialization', () => {
    it('should serialize patch to Uint8Array', () => {
      const patch: NetworkPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'test-user',
        timestamp: '2024-01-01T00:00:00.000Z',
        region: { x: 0, y: 0, w: 1, h: 1 },
        data: [65, 1, 2]
      };

      const serialized = serializeNetworkPatch(patch);
      
      // Check constructor name to avoid Vitest instanceof issues
      expect(serialized.constructor.name).toBe('Uint8Array');
      expect(serialized.length).toBeGreaterThan(0);

      // Verify it can be deserialized back
      const jsonStr = new TextDecoder().decode(serialized);
      const deserialized = JSON.parse(jsonStr);
      
      expect(deserialized).toEqual(patch);
    });

    it('should handle serialization errors gracefully', () => {
      // Create a patch with circular reference that can't be serialized
      const circularPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'test-user',
        timestamp: '2024-01-01T00:00:00.000Z',
        region: { x: 0, y: 0, w: 1, h: 1 },
        data: [65, 1, 2],
      } as any;
      
      circularPatch.circular = circularPatch; // Create circular reference

      const serialized = serializeNetworkPatch(circularPatch);
      
      expect(serialized).toBeInstanceOf(Uint8Array);
      expect(serialized.length).toBe(0); // Should return empty array on error
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty region patches', () => {
      const patch: NetworkPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 0, y: 0, w: 0, h: 0 },
        data: []
      };

      const result = processNetworkPatch(patch, state);
      
      expect(result).toBe(true); // Should succeed even with empty region
      expect(enqueueDirtyRegion).toHaveBeenCalledWith({
        x: 0, y: 0, w: 0, h: 0
      }, false);
    });

    it('should handle patches with invalid data values', () => {
      const patch: NetworkPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 0, y: 0, w: 1, h: 1 },
        data: [256, -1, 1000] // Values outside typical ranges
      };

      const result = processNetworkPatch(patch, state);
      
      expect(result).toBe(true); // Should still apply the patch
      
      // Check that the values were applied to the canvas
      // Note: Uint8Array automatically clamps values to 0-255 range
      const canvas = state.currentRoom.canvas;
      expect(canvas.rawdata[0]).toBe(0);   // 256 % 256 = 0
      expect(canvas.rawdata[1]).toBe(255); // -1 becomes 255 in Uint8Array
      expect(canvas.rawdata[2]).toBe(232); // 1000 % 256 = 232 (1000 - 3*256)
    });

    it('should handle patches at canvas boundaries', () => {
      const patch: NetworkPatch = {
        type: 'region-update',
        sequence: 1,
        userId: 'other-user',
        timestamp: new Date().toISOString(),
        region: { x: 9, y: 9, w: 1, h: 1 }, // Bottom-right corner
        data: [88, 15, 0] // 'X'
      };

      const result = processNetworkPatch(patch, state);
      
      expect(result).toBe(true);
      
      const lastIndex = (9 * 10 + 9) * 3;
      expect(state.currentRoom.canvas.rawdata[lastIndex]).toBe(88);
    });
  });
});