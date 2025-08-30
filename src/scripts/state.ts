// Collaborative Editor State Definitions

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
  // Add more as needed
}

export interface CanvasState {
  id: number;
  name: string;
  width: number;
  height: number;
  font: string;
  spacing: number;
  ice: boolean;
  colors: number[];               // Palette as array of numbers
  rawdata: Uint8Array;            // Canvas binary data
  updatedAt: string;              // ISO8601
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
  };
}
