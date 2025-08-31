// Collaborative Editor State Definitions

export type FontType = 'cp437' | 'utf8' | 'unicode';
export type NetworkStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface NetworkState {
  status: NetworkStatus;
  lastPing: number;               // ms timestamp of last heartbeat
  latency: number;                // ms roundtrip (optional)
  serverTimeOffset: number;       // ms offset from server (optional)
}

export interface RoomSummary {
  id: number;
  name: string;
  owner: string;
  users: string[];                // Nicknames only
  canvasId: number;
  updatedAt: string;              // ISO8601
}

export interface UserState {
  id: string;                     // Unique session/user id
  nickname: string;
  roomId: number | null;
}

export interface UserSummary {
  id: string;
  nickname: string;
  connectedAt: string;            // ISO8601
  lastSeen: string;               // ISO8601
}

export interface RoomSettings {
  // Extend for future per-room options
  maxUsers?: number;
  isPublic?: boolean;
}

export interface CanvasState {
  id: number;
  name: string;
  width: number;
  height: number;
  font: string;          // font file or name (e.g. "CP437 8x16", "TOPAZ_437", "utf8-system")
  fontType: FontType;    // new: type of font (cp437, utf8, unicode)
  spacing: number;       // spacing in pixels or 0/1 for ANSI art spacing
  ice: boolean;
  colors: number[];      // Palette as array of numbers
  rawdata: Uint8Array;   // Canvas binary data (interpretation depends on fontType)
  updatedAt: string;     // ISO8601
}

export interface FontState {
  name: string;          // font name or id
  type: FontType;
  size: number;          // e.g. 16
  bold?: boolean;
  italic?: boolean;
  // ...more as needed
}

export interface ChatMessage {
  id: number;
  roomId: number;
  name: string;                   // Username or "server"
  msg: string;
  type: 0 | 1;                    // 0 = server message, 1 = user chat
  timestamp: string;              // ISO8601
}

export interface RoomState {
  id: number;
  name: string;
  owner: string;
  users: UserSummary[];
  canvas: CanvasState;
  chat: ChatMessage[];
  settings: RoomSettings;
  updatedAt: string;              // ISO8601
}
export interface UndoRedoState {
  undoStack: CanvasState[];
  redoStack: CanvasState[];
}

export interface ToolState {
  current: string; // e.g. 'brush', 'select', etc.
  options: Record<string, unknown>; // tool-specific config
}

export interface SelectionState {
  start: { x: number, y: number };
  end: { x: number, y: number };
  active: boolean;
}

export interface ClipboardState {
  data: Uint8Array; // or a structure matching a region of CanvasState
  width: number;
  height: number;
}

export interface GlobalState {
  network: NetworkState;
  rooms: RoomSummary[];
  currentRoom: RoomState | null;
  user: UserState;
  error?: string;
  undoRedo: UndoRedoState;
  tool: ToolState;
  selection: SelectionState | null;
  clipboard: ClipboardState | null;
}

export interface GlobalState {
  network: NetworkState;
  rooms: RoomSummary[];           // All available rooms (for selection UI)
  currentRoom: RoomState | null;  // Populated after joining/creating a room
  user: UserState;                // Client's own user info
  error?: string;                 // Last error (network, server, etc.)
}

export function createState(): GlobalState {
  return {
    network: {
      status: 'disconnected',
      lastPing: 0,
      latency: 0,
      serverTimeOffset: 0,
    },
    rooms: [],
    currentRoom: null,
    user: {
      id: '',
      nickname: '',
      roomId: null,
    },
    error: undefined,
    undoRedo: {
      undoStack: [],
      redoStack: [],
    },
    tool: {
      current: 'brush',
      options: {},
    },
    selection: null,
    clipboard: null,
  };
}
