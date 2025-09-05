# Network Protocol Documentation

This document defines the network protocol for collaborative editing in text0wnz, specifically the patch format and network sync behavior implemented in Step 4 of the "Efficient Selective Canvas Redraw" refactor.

## Overview

The network sync system provides real-time collaborative editing by transmitting canvas patches between clients. All patches use the same data structures and processing pipeline as local edits, ensuring consistency and simplifying the codebase.

## Protocol Specifications

### NetworkPatch Format

The core protocol is based on JSON patches with the following structure:

```typescript
interface NetworkPatch {
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
```

### Example Patch

```json
{
  "type": "region-update",
  "sequence": 42,
  "userId": "user-123",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "region": {
    "x": 10,
    "y": 5,
    "w": 2,
    "h": 1
  },
  "data": [65, 7, 0, 66, 7, 0],
  "checksum": "sha256:abc123..."
}
```

This patch updates a 2x1 region at position (10,5) with characters 'A' and 'B', both with white foreground (7) and black background (0).

## Protocol Assumptions

### Ordering and Delivery

1. **FIFO Processing**: Patches are applied in the order they are received
2. **Sequence Numbers**: Each patch has a unique sequence number for ordering
3. **Out-of-Order Buffering**: Patches received out-of-order are buffered until missing patches arrive
4. **Idempotency**: Applying the same patch twice has no effect
5. **Server Broadcasting**: Server broadcasts patches to all connected clients

### Conflict Resolution

1. **Last-Write-Wins**: No complex conflict resolution in this version
2. **Local Priority**: Local edits are applied immediately for responsiveness
3. **Network Reconciliation**: Network patches are processed after local edits
4. **Future CRDTs**: Design supports future conflict-free replicated data types

### Data Integrity

1. **Region Validation**: All regions are validated against canvas bounds
2. **Data Length Validation**: Patch data length must match region size
3. **Type Safety**: All data values are validated as numbers
4. **Error Handling**: Invalid patches are logged and ignored

## Network Sync Workflow

### Local Edit Flow

```
1. User performs action (e.g., draws with pen tool)
2. Tool calls drawHalfBlock() or shadeCell()
3. Function patches buffer directly
4. Function calls enqueueDirtyRegion()
5. Dirty region is processed and rendered immediately
6. createNetworkPatch() generates patch for network
7. Patch is serialized and sent to server
```

### Remote Edit Flow

```
1. Network patch arrives via WebSocket
2. deserializeNetworkPatch() parses the data
3. handleOrderedNetworkPatch() manages sequencing
4. processNetworkPatch() applies patch to buffer
5. enqueueDirtyRegion() queues region for redraw
6. Dirty region is processed and rendered
```

## API Reference

### Core Functions

#### `processNetworkPatch(patch: NetworkPatch, state: GlobalState): boolean`

Applies a network patch to the canvas buffer and enqueues the region for redraw.

**Parameters:**
- `patch`: The network patch to apply
- `state`: Current global application state

**Returns:** `true` if patch was applied successfully, `false` otherwise

**Behavior:**
- Validates patch format and region bounds
- Applies patch data to canvas buffer
- Enqueues dirty region for immediate redraw
- Updates canvas timestamp
- Handles all error cases gracefully

#### `createNetworkPatch(region: DirtyRegion, state: GlobalState): NetworkPatch | null`

Creates a network patch from a local canvas change.

**Parameters:**
- `region`: Canvas region that changed
- `state`: Current global application state

**Returns:** Network patch ready for transmission, or `null` if error

**Behavior:**
- Extracts data from specified region
- Generates unique sequence number
- Creates properly formatted patch
- Handles edge cases (no canvas, invalid region)

#### `handleOrderedNetworkPatch(patch: NetworkPatch, state: GlobalState): void`

Handles network patches with proper sequence ordering.

**Parameters:**
- `patch`: Incoming network patch
- `state`: Current global application state

**Behavior:**
- Applies patches in correct sequence order
- Buffers out-of-order patches
- Ignores duplicate/old patches
- Processes pending patches when missing patches arrive

### Utility Functions

#### `resetPatchState(): void`

Resets patch processing state (useful for reconnection scenarios).

#### `getPatchStats(): object`

Returns current patch processing statistics for debugging.

#### `serializeNetworkPatch(patch: NetworkPatch): Uint8Array`

Serializes a patch for network transmission (JSON encoding).

#### `initializeNetworkSync(state: GlobalState): void`

Initializes network event listeners and integration.

## Server Implementation Guidelines

While this version implements only the client-side logic, the protocol is designed to guide future server implementation:

### Server Responsibilities

1. **Patch Broadcasting**: Receive patches from clients and broadcast to all other clients
2. **Sequence Management**: Assign global sequence numbers to patches
3. **Authentication**: Validate user permissions for edits
4. **Persistence**: Store patches for history/recovery
5. **Rate Limiting**: Prevent abuse with rate limits
6. **Conflict Detection**: Detect and handle simultaneous edits (future)

### WebSocket Message Format

```typescript
// Client -> Server
{
  "type": "patch",
  "data": "<serialized NetworkPatch>"
}

// Server -> Client
{
  "type": "patch",
  "data": "<serialized NetworkPatch>",
  "globalSequence": 12345
}
```

### Example Server Flow

```
1. Client sends patch to server
2. Server validates patch and user permissions
3. Server assigns global sequence number
4. Server stores patch in history
5. Server broadcasts patch to all other clients
6. Clients receive and process patch
```

## Testing

The network sync system includes comprehensive tests:

- **Unit Tests**: 21 tests covering all functions and edge cases
- **Mocked Network**: Tests use mocked network events
- **Error Handling**: Tests for invalid patches, bounds checking, ordering
- **Integration**: Tests for event bus integration
- **Edge Cases**: Tests for empty regions, boundary conditions, data validation

## Performance Considerations

### Optimization Features

1. **Region Merging**: Adjacent/overlapping dirty regions are automatically merged
2. **Selective Updates**: Only changed regions are redrawn, never full canvas
3. **Efficient Serialization**: JSON format with minimal overhead
4. **Sequence Buffering**: Out-of-order patch buffering prevents blocking

### Future Optimizations

1. **Binary Protocol**: Replace JSON with binary format for large patches
2. **Compression**: Compress patch data for network efficiency
3. **Batching**: Batch multiple small patches into single transmission
4. **Spatial Indexing**: Use spatial data structures for very large canvases

## Migration and Compatibility

The network sync system is designed to be:

1. **Backward Compatible**: Existing cell-based dirty tracking still works
2. **Forward Compatible**: Protocol supports future enhancements
3. **Extensible**: Easy to add new patch types or metadata
4. **Testable**: Full test coverage enables confident refactoring

## Error Handling and Recovery

### Client-Side Error Handling

1. **Invalid Patches**: Logged and ignored, no application crash
2. **Network Errors**: Graceful degradation to offline mode
3. **Sequence Gaps**: Buffering system handles missing patches
4. **Canvas Bounds**: All regions are clamped to valid bounds

### Recovery Mechanisms

1. **State Reset**: `resetPatchState()` for reconnection scenarios
2. **Full Sync**: Server can request full canvas state if needed
3. **Patch Replay**: History can be replayed for synchronization
4. **Local Persistence**: Local changes preserved during network issues

## Security Considerations

### Input Validation

1. **Patch Validation**: All patches validated for type safety
2. **Region Bounds**: Regions clamped to prevent buffer overruns
3. **Data Sanitization**: All numeric values validated
4. **User Verification**: Server should validate user permissions

### Future Security Features

1. **Digital Signatures**: Sign patches for authenticity
2. **Encryption**: Encrypt sensitive canvas data
3. **Rate Limiting**: Prevent spam and abuse
4. **Access Control**: Room-based permissions system