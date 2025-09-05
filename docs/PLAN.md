# teXt0wnz: Editor Refactor Plan

This plan documents the evolving architecture, toolchain, and logic flow for the teXt0wnz project.


## Frontend File Structure

```
/src/scripts
  state.ts            # global state management
  network.ts          # websocket logic
  events.ts           # pub/sub or EventEmitter
  fileLoader.ts       # async file parsing, emits events
  paletteManager.ts   # palette logic
  fontManager.ts      # font logic
  canvasRenderer.ts   # canvas drawing, listens for state changes
  uiController.ts     # top-level UI orchestrator: handles global UI events, tool switching, dialog/menu logic, delegates to toolManager
  keybinds.ts         # keybinding logic (global and tool-specific)
  toolManager.ts      # manages active tool, delegates input/render events to tools (see tool interface)
  tools/
     keyboard.ts         # default mode: input characters to canvas via keyboard
     selection.ts        # select canvas sections, apply actions (move, mirror)
     pen.ts              # pointer drawing, draws ansi "half blocks"
     characterBrush.ts   # draw with selected chars from current font's map
     fill.ts             # area fill with solid color
     paint.ts            # recolor areas with current fg/bg
     sample.ts           # pick fg/bg from clicked cell
     mirror.ts           # mirror tool actions across canvas axis
     shapes/
        lineTool.ts      # draw straight lines in half blocks
        squareTool.ts    # draw square in half blocks
        circleTool.ts    # draw circle in half blocks
```

---

## Backend Architecture & Database Plan

### **Backend Stack**

- **Bun** server
- Native WebSocket server (Bun’s API)
- **SQLite** (WAL enabled) for all persistent storage (including canvas, chat, room/user data)
- Everything stored in SQLite, including canvas binary and palette JSON

### **Backend File Structure (suggested)**

```
/server
  index.ts           # Entry point (creates HTTP+WS server)
  db.ts              # SQLite schema & query helpers
  ws.ts              # WebSocket connection & message handling
  api.ts             # (Optional) HTTP API for admin/testing
  types.ts           # Shared TypeScript types/interfaces
```

### **SQLite Schema: Main Tables**

**rooms**
- id: INTEGER PRIMARY KEY AUTOINCREMENT
- name: TEXT (room display name)
- owner: TEXT (creator’s username or ID)
- canvas_id: INTEGER (foreign key to canvases.id)
- created_at: DATETIME (when the room was created)
- updated_at: DATETIME (last updated timestamp)

**users**
- id: INTEGER PRIMARY KEY AUTOINCREMENT
- room_id: INTEGER (FK)
- nickname: TEXT
- ws_id: TEXT (for active socket tracking)
- connected_at: DATETIME
- last_seen: DATETIME

**canvases**
- id: INTEGER PRIMARY KEY AUTOINCREMENT
- name: TEXT (filename/display name)
- width: INTEGER (canvas width in px/cells)
- height: INTEGER (canvas height in px/cells)
- font: TEXT (font name)
- spacing: INTEGER (letter/line spacing)
- ice: INTEGER (0/1, ICE colors enabled)
- colors: TEXT (JSON-encoded palette, e.g., '[0,1,2,...]')
- rawdata: BLOB (actual binary canvas data)
- created_at: DATETIME DEFAULT CURRENT_TIMESTAMP
- updated_at: DATETIME DEFAULT CURRENT_TIMESTAMP
- room_id: INTEGER (optional, if canvases are per-room)

**chats**
- id: INTEGER PRIMARY KEY AUTOINCREMENT
- room_id: INTEGER NOT NULL (foreign key to rooms.id)
- name: TEXT NOT NULL (username or "server" for system messages)
- msg: TEXT NOT NULL (chat or server message)
- type: INTEGER NOT NULL (0 = server message [join/part], 1 = user chat)
- timestamp: DATETIME DEFAULT CURRENT_TIMESTAMP (time the message was sent)

**events** (optional, for audit/history)
- id: INTEGER PRIMARY KEY AUTOINCREMENT
- room_id: INTEGER
- user_id: INTEGER
- action: TEXT
- payload: JSON
- timestamp: DATETIME

### **Chat Table Field Summary**

| Field     | Type      | Description                                                       |
|-----------|-----------|-------------------------------------------------------------------|
| id        | INTEGER   | Primary key                                                       |
| room_id   | INTEGER   | Foreign key to rooms table                                        |
| name      | TEXT      | Username or "server" for system messages                          |
| msg       | TEXT      | The actual chat or system message                                 |
| type      | INTEGER   | 0 = server (join/part), 1 = user chat                             |
| timestamp | DATETIME  | When the message was sent (always present, for sorting/history)    |

- **type:**
  - 0 = server message (e.g. join/part), name will be "server", msg will be the server-generated text
  - 1 = user chat

- **Timestamps are present on all tables** (created_at, updated_at, timestamp) for sorting, history, and auditing.

---

### **Backend Data Layer Suggestions**

- All reads/writes go through a DB abstraction/service.
- Use transactions for atomic updates (canvas + chat + event in one shot if needed).
- WAL mode for concurrency and reliability.
- Use Bun’s [SQLite API](https://bun.sh/docs/api/sqlite) for speed.
- All palette/color storage is as JSON strings (easy to read and edit).
- Manual inspection and testing: use the `sqlite3` CLI or a DB browser.

---

### **Migration Plan**

- Start with schema above.
- Abstract storage logic so it’s easy to extend or switch out (e.g., export/import, backup/restore).
- Write scripts for manual data inspection as needed.

---

## Tool Interface

- All tools must implement a common TypeScript interface so `toolManager` can activate, deactivate, and delegate input/render events in a generic way.
- **Tool interface skeleton is drafted—review and finalize before implementing all tools.**
- This interface covers:
  - `activate()` / `deactivate()`
  - `onPointerDown()` / `onPointerMove()` / `onPointerUp()` / `onPointerLeave()`
  - Optional: `onKeyDown()` / `onKeyUp()`
  - Optional: `renderPreview()`
  - (Optional for collab/network) `serializeAction()`
  - Each tool exports a unique `id` and human-friendly `label`

---

## UI Controller vs. Tool Logic

- **uiController.ts**
  - Orchestrates all top-level UI concerns (menus, dialogs, tool selection, app mode switching)
  - Listens for user events and delegates input to the currently active tool via `toolManager`
  - Handles global keybinds, menu/dialog state, and non-tool UI updates

- **tools/\*.ts**
  - Implements tool-specific behavior (drawing, selection, fill, etc.)
  - Responds to delegated input events only when active
  - Maintains internal tool state, and can render previews if needed
  - Optionally serializes actions for collaboration/network
  - Does **not** manage UI menus/dialogs or tool switching logic

---

## App Logic Flow

### Init Phase

- On DOM load, all basic HTML elements are present; only canvases update.
- Initialization logic:
  - Set up base state of the editor (palette, fonts, etc.)
  - Fill canvases as needed
  - Add all required event listeners
- Once init is complete, perform a silent network test.
  - If server is active, prompt user to join collab session, else stay local.

---

### Collab Mode Flow

#### Room Selection & Creation

- network detects the server
- editor sets the global network state to "connecting"
- ui prompts user for nickname
- user enters a nickname and clicks join
- network requests available rooms (listing)
- returns a list of: id:int, name:string, users:[string]
- ui displays list of rooms **and a "Create New Room" option**
- user can:
  - select a room to join
  - create a new room (enter room name, then sends `create` request to server)
  - cancel (goes to local mode/disconnects)

#### Name Collision Avoidance

- On nickname entry, **server verifies uniqueness in the room**
- If "anonymous" or another name is already used, server appends a numeric suffix (e.g., "anonymous2", "anonymous3")
- UI updates with the adjusted unique nickname, informing the user

#### Error Handling

- Any network or server-side error results in a clear, user-friendly message and options to retry or go local
- Handles:
  - network failures
  - room full/unavailable
  - invalid nickname/room name
  - file sync issues

#### If Join/Creation Succeeds

- network sends join/create command (with id and username to server)
- server returns:
  - `canvas.bin` (canvas data)
  - `chat.json` (chat history)
  - **room settings** (palette, font, spacing, canvas size, etc.)
  - **current user list**
- editor applies all received state, dispatches change events (colors, font, spacing, canvas size, canvas data, chat history, user list)
- tools update UI for collab settings
- sets global network state to "connected"
- **UI/tools start listening for network sync commands**
- **Tools dispatch network draw commands**
- **Chat window enabled, with current user list**

#### Presence/Heartbeats

- After joining, client sends periodic heartbeat messages to the server to maintain presence
- Server drops/disconnects users who miss heartbeats
- Presence reflected in user list

#### Chat Join/Leave Messages

- When a user joins/leaves, the server broadcasts a system message to the chat (e.g., "anonymous2 joined", "xero left")
- UI displays these in the chat window

---

### Logic Split

#### Cancel
- runs network disconnect, puts editor in local mode
- sets global network state to "disconnected"

#### Join (room or new room)
- completes join/create handshake, applies all settings and data
- global network state now "connected"
- UI and tools now dispatch/receive network sync

---

### UI Elements Overview

#### File Menu
- Touch-friendly menu for file IO and hotkey cheatsheet

#### Sidebar Menu
- Global color palette
- Current color selection
- Tool selection (some tools show/hide additional menus)

#### Footer Menu
- Tool options
- Editor state display (font, glyph size, cursor position, etc.)

#### Dialogs/Modals
- File open/save
- SAUCE editor (ANSI file metadata)
- Font selection
- Chat (collab mode only)
- **Room creation/join dialog**

---

### Global State/Network

- `state.ts`: single source of truth for palette, font, canvas data, tool state, etc.
- `network.ts`: manages WebSocket connection (join/collab, sync, send/receive actions, heartbeats, error handling)

---

# Efficient Selective Canvas Redraw — Refactor/Implementation Plan

---

## 1. Goals & Rationale

- **Efficient Rendering:** Only redraw canvas regions (cells/pixels) that have changed, never the whole canvas except on full reset/resize.
- **Unified Path:** Use the same rendering/patching logic for both local tool actions and remote/network sync events.
- **Batch-Friendly:** Support both single-pixel edits and batched region edits (lines, shapes, fills, etc.).
- **Extensible:** Easily add batching, dirty region coalescing, or CRDT/conflict handling later.
- **Performance:** Favor immediate feedback for local edits, ensuring UI responsiveness even with large canvases and rapid edits.
- **Scalability:** Architectural patterns should support future optimization for massive canvases or user counts.
- **Protocol-Driven:** Client logic and patch format will naturally define the future server implementation and network protocol.

---

## 2. Architectural Overview

- **Data Model:**
  - Single source of truth: a buffer (`Uint8Array`, etc.) representing the canvas state.
- **Renderer API:**
  - Exposes functions to redraw only a subregion (`drawRegion(x, y, w, h)`).
  - `drawRegion` must be robust to invalid/empty regions.
- **Dirty Queue:**
  - Maintain a queue/FIFO (or Set) of regions needing redraw.
  - Optionally coalesce overlapping or adjacent regions for performance.
  - Process dirty regions either immediately or in batches via animation frames.
- **Unified Change Application:**
  - Tools and network patches both call the same buffer/mutation code, and enqueue regions for redraw.
  - Local edits and remote patches are handled identically at the render level.
- **Networking/Collab-Ready:**
  - All edits, local or remote, use the same data flow and queue.
  - Patch/message format and queueing logic will be reused by the future server.

---

### Network Sync — Patch Buffer & Enqueue Dirty Regions

- When a patch arrives from the network:
  1. Apply the patch to the raw buffer.
  2. Enqueue the changed region(s) as dirty.
  3. Call the same function to process the queue.
- If you expect out-of-order or overlapping patches, consider versioning or sequencing in the future.

### Full Redraw Only as Fallback

- Only call a full-canvas redraw when:
  - The canvas is resized.
  - The palette/font is changed.
  - The buffer is reset (clear, new file, etc.).
- Clearly define reset triggers and avoid accidental full redraws.

### Optional/Advanced Additions

- **Dirty Region Coalescing:** Merge overlapping/adjacent dirty regions for fewer redraws, especially after fills/rapid edits.
- **Time-slicing:** For very large queues, break up processing over multiple animation frames for smooth UI.
- **Conflict Resolution:** Add CRDTs or “last write wins” logic if multiple edits to the same cell can happen in one frame/network tick.
- **Partial Invalidation:** For massive canvases, use a spatial index (e.g., grid) to make region coalescing and lookup faster.
- **Performance Metrics:** Add profiling (e.g., regions processed per frame, draw time) to identify future bottlenecks.

---

## Notes on Client-Driven Protocol & Server Planning

- **Client-First Design:**
  By designing the client’s data flow, patch logic, and protocol first, you define the requirements and shape of the future server.
- **Patch Format:**
  Document your JSON (or binary) patch format as you go. Example:
  ```json
  {
    "type": "patch",
    "x": 10,
    "y": 12,
    "w": 4,
    "h": 2,
    "data": [/* color values or indices */],
    "user": "xero",
    "timestamp": 1693830400
  }
  ```
- **Networking API Sketch:**
  - Clients will send and receive patches over WebSockets, WebRTC, or polling.
  - All local changes go through the same queue and renderer as remote/network patches.
- **Testing Without Server:**
  - Simulate incoming patches locally to test protocol handling and UI before implementing server logic.
- **Server Implementation:**
  - When ready, the server can simply pass patches between clients, enforce rules (auth, CRDT, validation), and persist state using the already-documented protocol.



# Local Edit Prioritization and Conflict Resolution

## Overview

This ensures local edits are processed immediately while network edits can be batched, and establishing a "last-write-wins" conflict resolution strategy.

## Implementation

### Local Edit Prioritization

The system now distinguishes between local edits (user interactions) and network edits (collaborative changes):

#### Enhanced `enqueueDirtyRegion()` Function

```typescript
export function enqueueDirtyRegion(region: DirtyRegion, immediate: boolean = false)
```

- **Local edits**: Call with `immediate=true` → processed immediately via `processDirtyRegions()`
- **Network edits**: Call with `immediate=false` → batched via `requestAnimationFrame`
- **Backward compatibility**: Default `immediate=false` maintains existing behavior

#### Tool Integration

All drawing tools now use immediate processing:

```typescript
// drawHalfBlock and shadeCell both use:
enqueueDirtyRegion({x, y, w: 1, h: 1}, true); // immediate=true for local edits
```

#### Network Integration

Network patches continue using batched processing:

```typescript
// processNetworkPatch uses:
enqueueDirtyRegion({...region}, false); // immediate=false for network edits - use batched processing
```

### Conflict Resolution Strategy

The system implements a comprehensive "last-write-wins" conflict resolution approach:

#### Temporal Prioritization

1. **Local edits** are processed immediately and take precedence
2. **Network edits** are processed in batches via requestAnimationFrame
3. **When conflicts occur** (same cell modified), the last operation wins
4. **Network patches** with higher sequence numbers override earlier ones
5. **Local edits** always override network edits due to immediate processing

#### Buffer-Based Resolution

- All edits directly overwrite the raw canvas buffer
- No complex conflict detection - simple override semantics
- Timestamps in patches allow for temporal ordering when needed
- Sequence numbering in network patches ensures proper ordering

#### Benefits

- **Immediate user feedback**: Local edits render instantly
- **Smooth collaboration**: Network edits processed efficiently in batches
- **Simple conflict model**: Easy to understand and debug
- **Performance optimized**: No expensive conflict detection algorithms

## Documentation

The conflict resolution strategy is documented in multiple locations:

1. **`network.ts`**: Comprehensive comment in `processNetworkPatch()` function
2. **`canvasRenderer.ts`**: Documentation in `enqueueDirtyRegion()` function
3. **This document**: High-level strategy overview

## Testing

- Parameter validation for immediate vs batched processing
- Backward compatibility verification
- Graceful handling of edge cases
- Integration with existing dirty region system

## Protocol Implications

The local-first approach with last-write-wins semantics provides a solid foundation for:

- Real-time collaborative editing
- Server-side implementation
- Future CRDT integration if needed
- Performance-oriented conflict resolution

This implementation ensures responsive user experience while maintaining efficient network synchronization and providing a clear, predictable conflict resolution model.

---

# Full Redraw Triggers - Implementation Documentation

This describes the implementation which defines exactly when full canvas redraws should occur.

## Full Redraw Triggers

Full canvas redraws are ONLY triggered for the following scenarios:

### 1. Canvas Resize
- **Trigger**: Canvas viewport or logical dimensions change
- **Event**: `ui:state:changed` when canvas size changes
- **Reason**: Canvas resize affects the entire visible area and requires complete re-rendering
- **Implementation**: `resizeCanvasToState()` → `forceFullRedraw()`

### 2. Font Changes
- **Trigger**: Font type, size, or renderer changes
- **Event**: Font change via `setFont()` mutator
- **Reason**: Font changes affect the rendering of every character on the canvas
- **Implementation**: `canvasRenderer.setFont()` → `forceFullRedraw()`

### 3. Palette Changes
- **Trigger**: Color palette is modified
- **Event**: `local:palette:changed`
- **Reason**: Palette changes affect the color rendering of all canvas content
- **Implementation**: Event listener → `forceFullRedraw()`

### 4. Buffer Reset Operations
- **Trigger**: Canvas data is completely replaced or reset
- **Events**:
  - `local:file:loaded` - New file loaded
  - `local:canvas:cleared` - Canvas explicitly cleared
  - `updateCanvasData()` - Canvas data replaced externally
- **Reason**: Buffer resets invalidate all existing content
- **Implementation**: Event listeners and function calls → `forceFullRedraw()`

### 5. Initial Render
- **Trigger**: Application startup
- **Event**: Canvas renderer initialization
- **Reason**: Initial state requires complete canvas setup
- **Implementation**: `initCanvasRenderer()` → `forceFullRedraw()`

## Operations That Do NOT Trigger Full Redraws

The following operations use the dirty region system instead:

### ❌ Tool Activation
- **Previous Behavior**: `local:tool:activated` triggered full redraw
- **New Behavior**: Removed event listener - tools only mark dirty regions
- **Reason**: Tool activation should not affect existing canvas content

### ❌ Single Cell Edits
- **Behavior**: Use `enqueueDirtyRegion()` with 1x1 regions
- **Reason**: Only the modified cell needs redraw

### ❌ Network Patches
- **Behavior**: Apply patch → enqueue dirty region → process region
- **Reason**: Network changes affect only specific regions

### ❌ Multi-Cell Drawing Operations
- **Behavior**: Mark affected regions as dirty
- **Reason**: Even large operations affect bounded regions, not the entire canvas

## Implementation Details

### Event Listeners
```typescript
// Full redraw triggers
eventBus.subscribe('ui:state:changed', () => {
  resizeCanvasToState();
  forceFullRedraw();
});

eventBus.subscribe('local:palette:changed', () => {
  forceFullRedraw();
});

eventBus.subscribe('local:file:loaded', () => {
  forceFullRedraw();
});

eventBus.subscribe('local:canvas:cleared', () => {
  forceFullRedraw();
});

// Removed: 'local:tool:activated' listener
```

### Function Flow
1. **Full Redraw**: `forceFullRedraw()` → `needsFullRedraw = true` → `queueFlushDirty()`
2. **Dirty Region**: `enqueueDirtyRegion()` → region queue → `processDirtyRegions()`

### Performance Impact
- **Full Redraw**: O(width × height) - renders every canvas cell
- **Dirty Region**: O(dirty cells) - renders only changed cells
- **Typical Improvement**: 100x-1000x faster for small edits

## Testing

### Unit Tests
- Full redraw triggers are clearly defined
- Tool activation no longer triggers full redraw
- Behavior is consistent across the application

### Validation
1. Check that tool usage doesn't cause full canvas refresh
2. Verify palette/font changes do cause full refresh
3. Confirm file loading triggers full refresh
4. Ensure single-cell edits only redraw affected areas

## Future Considerations

### Optimization Opportunities
- **Partial Palette Updates**: If only specific colors change, could mark regions using those colors
- **Smart Font Changes**: If font dimensions don't change, could avoid full redraw
- **Incremental Resize**: For small resize operations, could extend canvas rather than full redraw

### Monitoring
Consider adding metrics to track:
- Full redraw frequency
- Dirty region processing performance
- User operation response times

## Benefits

1. **Predictable Performance**: Clear rules for when expensive operations occur
2. **User Responsiveness**: Tool actions remain fast regardless of canvas size
3. **Efficient Collaboration**: Network updates don't trigger unnecessary redraws
4. **Scalability**: Large canvases remain performant for local edits
5. **Maintainability**: Clear separation between full redraw and incremental update logic

This establishes a solid foundation for efficient canvas rendering that scales with both canvas size and user activity.
