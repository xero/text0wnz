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

## Outstanding Decisions / TODOs

- [x] Decide on vanilla JS vs TypeScript for core codebase (**TypeScript chosen**)
- [ ] Define event/pubsub system API in `events.ts`
- [ ] **Review and finalize the drafted tool interface before implementing all tools**
- [ ] Structure for room/collab support in network & state
- [ ] UI wireframes for menus, dialogs, and toolbars
- [x] Add new room creation to collab flow
- [x] Add error handling, user feedback for network/server errors
- [x] Add heartbeats/presence for user list and session reliability
- [x] Add chat join/leave system messages
- [x] Add automatic nickname disambiguation to avoid collisions

---

