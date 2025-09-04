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

## 3. Step-by-Step Implementation

### Step 1: Define the Dirty Region System

- Create a `DirtyRegion` type:
  ```ts
  type DirtyRegion = { x: number, y: number, w: number, h: number }
  ```
- Implement a queue/list: `let dirtyRegions: DirtyRegion[] = []` (or use a Set for deduplication).
- Utility: `function enqueueDirtyRegion(region: DirtyRegion)`
  - Optionally, merge/coalesce overlapping or adjacent regions before enqueueing.

### Step 2: Refactor Renderer to Support Region Drawing

- Update your `canvasRenderer` (or equivalent) to expose a method:
  ```ts
  drawRegion(x: number, y: number, w: number, h: number)
  ```
  - This method copies only the specified region from your data buffer to the visible canvas using `putImageData`, `drawImage`, or direct pixel ops.
  - For batched regions, loop over all dirty regions.
  - Ensure `drawRegion` is a no-op for empty or out-of-bounds regions.

### Step 3: Tool Logic — Patch Buffer & Enqueue Dirty Regions

- Update all tool actions (pen, shape, fill, etc.) so that:
  1. They patch the raw buffer directly.
  2. For each cell/pixel/region affected, they enqueue a corresponding dirty region.
  3. Call a function to process the queue (see Step 5).
- Always favor local edit responsiveness—patch and render immediately.

### Step 4: Network Sync — Patch Buffer & Enqueue Dirty Regions

- When a patch arrives from the network:
  1. Apply the patch to the raw buffer.
  2. Enqueue the changed region(s) as dirty.
  3. Call the same function to process the queue.
- If you expect out-of-order or overlapping patches, consider versioning or sequencing in the future.

### Step 5: Process Dirty Queue & Redraw

- Implement a function (could be called after every mutation or debounced per animation frame):
  ```ts
  function processDirtyRegions() {
    while (dirtyRegions.length > 0) {
      const region = dirtyRegions.shift();
      canvasRenderer.drawRegion(region.x, region.y, region.w, region.h);
    }
  }
  ```
- Optionally, process dirty regions in a `requestAnimationFrame` loop for smooth UI and batching.
- For batching, coalesce overlapping/adjacent regions for maximum performance.

### Step 6: Favor Local Edits

- Local edits should be patched and drawn immediately.
- Network edits can use the same queue, but always process local dirty regions first if batching.
- If a network change conflicts with a local edit, local should win (last-write-wins or more advanced CRDTs later).

### Step 7: Full Redraw Only as Fallback

- Only call a full-canvas redraw when:
  - The canvas is resized.
  - The palette/font is changed.
  - The buffer is reset (clear, new file, etc.).
- Clearly define reset triggers and avoid accidental full redraws.

---

## 4. Optional/Advanced Additions

- **Dirty Region Coalescing:** Merge overlapping/adjacent dirty regions for fewer redraws, especially after fills/rapid edits.
- **Time-slicing:** For very large queues, break up processing over multiple animation frames for smooth UI.
- **Conflict Resolution:** Add CRDTs or “last write wins” logic if multiple edits to the same cell can happen in one frame/network tick.
- **Partial Invalidation:** For massive canvases, use a spatial index (e.g., grid) to make region coalescing and lookup faster.
- **Performance Metrics:** Add profiling (e.g., regions processed per frame, draw time) to identify future bottlenecks.

---

## 5. Deliverables

- Refactored `canvasRenderer` with `drawRegion`.
- Updated tool and network logic to patch buffer and enqueue dirty regions.
- Dirty queue and processing logic (with optional coalescing).
- Full-canvas redraw logic for fallback/reset only.
- Documentation and type definitions for all new/changed APIs.
- (Optional) Unit tests for region queue and renderer.
- (Optional) Protocol/patch format documentation for future network/server implementation.

---

## 6. Suggested File/Function Changes

- **canvasRenderer.ts**:
  - Add `drawRegion(x, y, w, h)` and ensure robust handling of region boundaries.
- **tools/ToolManager.ts & all tool classes**:
  - Patch buffer, enqueue dirty region after each action.
- **network/collab.ts**:
  - Patch buffer, enqueue region for network patches.
- **uiController.ts**:
  - Manage/process dirty queue after user/network events.
- **Optional:** Add performance profiling hooks or metrics.
- **docs/protocol.md** (suggested):
  - Document the patch/region message format and assumptions for server-side reference.

---

## 7. Testing Plan

- **Correctness:** Test with single-pixel edits, lines, shapes, and fills: only affected area is redrawn.
- **Collab:** Simulate network patches: ensure both local and remote changes appear instantly in their regions.
- **Performance:** Stress test with huge canvases and rapid, multi-user edits.
- **Edge Cases:** Confirm correct redraw after full reset/resize, and no-op on out-of-bounds/empty regions.
- **Profiling:** Optionally log/track dirty region processing time and frequency.
- **Protocol Simulation:** Test patch application using simulated/fake network patches before any server code exists.

---

## 8. Documentation

- Document new renderer API (`drawRegion`).
- Explain queueing/processing of dirty regions and region coalescing.
- Comment on favoring local edits for user experience.
- Note advanced options (CRDTs, time-slicing, spatial indices) for future reference.
- **Patch/Protocol Definition:**
  - As you implement, document the structure of a patch/region message (JSON or binary), including:
    - Required fields (`x`, `y`, `w`, `h`, `data`, etc.)
    - User/timestamp/version if needed
    - Delivery/order assumptions (FIFO, idempotency, conflict behavior)
  - This documentation will guide the future server implementation and simplify integration.

---

## 9. Notes on Client-Driven Protocol & Server Planning

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

