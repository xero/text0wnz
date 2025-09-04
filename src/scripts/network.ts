// websocket logic and network patch processing
import type {GlobalState} from './state';
import {enqueueDirtyRegion} from './canvasRenderer';
import {eventBus} from './eventBus';

/**
 * Network patch format for collaborative editing.
 * This defines the protocol that will be used by the future server implementation.
 *
 * Protocol Assumptions:
 * - Patches are applied in the order they are received (FIFO)
 * - Each patch has a unique sequence number for ordering
 * - Patches are idempotent - applying the same patch twice has no effect
 * - Server will broadcast patches to all connected clients
 * - Local edits should be applied immediately and then sent to server
 */
export interface NetworkPatch {
  /** Patch type identifier */
  type: 'region-update';

  /** Unique sequence number for ordering patches */
  sequence: number;

  /** User ID who made the change */
  userId: string;

  /** Timestamp when the patch was created (ISO8601) */
  timestamp: string;

  /** Canvas region coordinates (in cells) */
  region: {
    x: number;
    y: number;
    w: number;
    h: number;
  };

  /**
   * Raw canvas data for the region.
   * Array of [charCode, fg, bg] triplets for each cell in the region.
   * Length should be region.w * region.h * 3
   */
  data: number[];

  /**
   * Optional checksum for data integrity verification
   * Future enhancement for robust networking
   */
  checksum?: string;
}

/**
 * Network patch processing state for conflict resolution and ordering
 */
interface PatchState {
  /** Last processed sequence number */
  lastSequence: number;

  /** Buffer for out-of-order patches */
  pendingPatches: Map<number, NetworkPatch>;

  /** Current user's sequence counter for outgoing patches */
  localSequence: number;
}

// Global patch processing state
let patchState: PatchState = {
  lastSequence: 0,
  pendingPatches: new Map(),
  localSequence: 0
};

/**
 * Process incoming network patch and apply it to the canvas.
 *
 * This function implements the core network sync logic:
 * 1. Apply the patch to the raw buffer
 * 2. Enqueue the changed region as dirty
 * 3. Process dirty regions for immediate display
 *
 * @param patch - Network patch to apply
 * @param state - Current global state
 * @returns true if patch was applied successfully, false otherwise
 */
export function processNetworkPatch(patch: NetworkPatch, state: GlobalState): boolean {
  try {
    // Validate patch format
    if (!isValidPatch(patch)) {
      console.warn('Invalid network patch received:', patch);
      return false;
    }

    // Check if we have a current room and canvas to patch
    if (!state.currentRoom?.canvas) {
      console.warn('No active canvas to apply network patch');
      return false;
    }

    const canvas = state.currentRoom.canvas;
    const {region, data} = patch;

    // Validate region bounds
    if (region.x < 0 || region.y < 0 ||
        region.x + region.w > canvas.width ||
        region.y + region.h > canvas.height) {
      console.warn('Network patch region out of bounds:', region);
      return false;
    }

    // Validate data length
    const expectedDataLength = region.w * region.h * 3;
    if (data.length !== expectedDataLength) {
      console.warn(`Network patch data length mismatch. Expected ${expectedDataLength}, got ${data.length}`);
      return false;
    }

    // Apply patch to canvas buffer
    let dataIndex = 0;
    for (let y = region.y; y < region.y + region.h; y++) {
      for (let x = region.x; x < region.x + region.w; x++) {
        const bufferIndex = (y * canvas.width + x) * 3;

        // Apply the three values: charCode, fg, bg
        canvas.rawdata[bufferIndex] = data[dataIndex++];      // charCode
        canvas.rawdata[bufferIndex + 1] = data[dataIndex++];  // fg
        canvas.rawdata[bufferIndex + 2] = data[dataIndex++];  // bg
      }
    }

    // Enqueue the dirty region for redraw
    enqueueDirtyRegion({
      x: region.x,
      y: region.y,
      w: region.w,
      h: region.h
    });

    // Update patch processing state
    patchState.lastSequence = Math.max(patchState.lastSequence, patch.sequence);

    // Update canvas timestamp
    canvas.updatedAt = new Date().toISOString();

    console.debug(`Applied network patch from user ${patch.userId}:`, {
      sequence: patch.sequence,
      region: patch.region,
      dataLength: data.length
    });

    return true;

  } catch (error) {
    console.error('Error processing network patch:', error);
    return false;
  }
}

/**
 * Create a network patch for a local change.
 * This function will be used when sending local edits to the server.
 *
 * @param region - Canvas region that changed
 * @param state - Current global state
 * @returns Network patch ready to send to server
 */
export function createNetworkPatch(
  region: { x: number; y: number; w: number; h: number },
  state: GlobalState
): NetworkPatch | null {
  try {
    if (!state.currentRoom?.canvas) {
      console.warn('No active canvas to create network patch');
      return null;
    }

    const canvas = state.currentRoom.canvas;

    // Extract data from the specified region
    const data: number[] = [];
    for (let y = region.y; y < region.y + region.h; y++) {
      for (let x = region.x; x < region.x + region.w; x++) {
        const bufferIndex = (y * canvas.width + x) * 3;
        data.push(
          canvas.rawdata[bufferIndex],      // charCode
          canvas.rawdata[bufferIndex + 1],  // fg
          canvas.rawdata[bufferIndex + 2]   // bg
        );
      }
    }

    // Generate next sequence number
    const sequence = ++patchState.localSequence;

    const patch: NetworkPatch = {
      type: 'region-update',
      sequence,
      userId: state.user.id || 'unknown-user',
      timestamp: new Date().toISOString(),
      region: {...region},
      data
    };

    console.debug(`Created network patch for local change:`, {
      sequence: patch.sequence,
      region: patch.region,
      dataLength: data.length
    });

    return patch;

  } catch (error) {
    console.error('Error creating network patch:', error);
    return null;
  }
}

/**
 * Handle network patches with sequence ordering.
 * This function ensures patches are applied in the correct order.
 *
 * @param patch - Incoming network patch
 * @param state - Current global state
 */
export function handleOrderedNetworkPatch(patch: NetworkPatch, state: GlobalState): void {
  const expectedSequence = patchState.lastSequence + 1;

  if (patch.sequence === expectedSequence) {
    // Patch is in order, apply it immediately
    processNetworkPatch(patch, state);

    // Check if any pending patches can now be applied
    processPendingPatches(state);
  } else if (patch.sequence > expectedSequence) {
    // Patch is out of order, buffer it
    console.debug(`Buffering out-of-order patch. Expected ${expectedSequence}, got ${patch.sequence}`);
    patchState.pendingPatches.set(patch.sequence, patch);
  } else {
    // Patch is duplicate or too old, ignore it
    console.debug(`Ignoring old/duplicate patch. Expected ${expectedSequence}, got ${patch.sequence}`);
  }
}

/**
 * Process any pending patches that are now in order.
 * @param state - Current global state
 */
function processPendingPatches(state: GlobalState): void {
  let nextSequence = patchState.lastSequence + 1;

  while (patchState.pendingPatches.has(nextSequence)) {
    const patch = patchState.pendingPatches.get(nextSequence)!;
    patchState.pendingPatches.delete(nextSequence);

    processNetworkPatch(patch, state);
    nextSequence++;
  }
}

/**
 * Validate network patch format and required fields.
 * @param patch - Patch to validate
 * @returns true if patch is valid
 */
function isValidPatch(patch: any): patch is NetworkPatch {
  return (
    patch &&
    typeof patch === 'object' &&
    patch.type === 'region-update' &&
    typeof patch.sequence === 'number' &&
    typeof patch.userId === 'string' &&
    typeof patch.timestamp === 'string' &&
    patch.region &&
    typeof patch.region.x === 'number' &&
    typeof patch.region.y === 'number' &&
    typeof patch.region.w === 'number' &&
    typeof patch.region.h === 'number' &&
    Array.isArray(patch.data) &&
    patch.data.every((val: any)=>typeof val === 'number')
  );
}

/**
 * Reset patch processing state.
 * Useful for reconnection scenarios.
 */
export function resetPatchState(): void {
  patchState = {
    lastSequence: 0,
    pendingPatches: new Map(),
    localSequence: 0
  };
  console.debug('Reset network patch state');
}

/**
 * Get current patch processing statistics.
 * Useful for debugging and monitoring.
 */
export function getPatchStats(): {
  lastSequence: number;
  pendingCount: number;
  localSequence: number;
} {
  return {
    lastSequence: patchState.lastSequence,
    pendingCount: patchState.pendingPatches.size,
    localSequence: patchState.localSequence
  };
}

/**
 * Initialize network event listeners.
 * Sets up the integration between network events and patch processing.
 */
export function initializeNetworkSync(state: GlobalState): void {
  // Listen for network canvas updates and process them
  eventBus.subscribe('network:canvas:update', ({patch, userId})=>{
    try {
      // Convert the Uint8Array patch to our NetworkPatch format
      // This is a placeholder - actual implementation would depend on
      // how the server sends the patch data
      const networkPatch = deserializeNetworkPatch(patch, userId);
      if (networkPatch) {
        handleOrderedNetworkPatch(networkPatch, state);
      }
    } catch (error) {
      console.error('Error handling network canvas update:', error);
    }
  });

  console.debug('Network sync initialized');
}

/**
 * Placeholder function to deserialize patch data from network.
 * This would be implemented based on the actual server protocol.
 *
 * @param patchData - Raw patch data from network
 * @param userId - User who sent the patch
 * @returns Parsed network patch or null if invalid
 */
function deserializeNetworkPatch(patchData: Uint8Array, userId: string): NetworkPatch | null {
  try {
    // This is a placeholder implementation
    // In a real implementation, this would parse the binary or JSON data
    // For now, we'll assume the data is JSON-encoded
    const jsonStr = new TextDecoder().decode(patchData);
    const patch = JSON.parse(jsonStr) as NetworkPatch;

    // Ensure userId matches
    if (patch.userId !== userId) {
      patch.userId = userId; // Server-provided userId takes precedence
    }

    return isValidPatch(patch) ? patch : null;
  } catch (error) {
    console.error('Error deserializing network patch:', error);
    return null;
  }
}

/**
 * Serialize a network patch for transmission.
 * This would be used when sending patches to the server.
 *
 * @param patch - Network patch to serialize
 * @returns Serialized patch data
 */
export function serializeNetworkPatch(patch: NetworkPatch): Uint8Array {
  try {
    const jsonStr = JSON.stringify(patch);
    return new TextEncoder().encode(jsonStr);
  } catch (error) {
    console.error('Error serializing network patch:', error);
    return new Uint8Array();
  }
}
