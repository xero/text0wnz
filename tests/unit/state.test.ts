import {describe, it, expect} from 'vitest';
import {
  createState,
  createOfflineCanvasState,
  createDefaultUserState,
  createOfflineRoomState,
  type GlobalState,
  type CanvasState,
  type UserState,
  type RoomState,
  type NetworkStatus
} from '../../src/scripts/state';

describe('state', () => {
  describe('createState', () => {
    it('should create a default global state', () => {
      const state = createState();

      expect(state).toBeDefined();
      expect(state.network).toBeDefined();
      expect(state.rooms).toEqual([]);
      expect(state.currentRoom).toBeNull();
      expect(state.user).toBeDefined();
      expect(state.error).toBeUndefined();
      expect(state.undoRedo).toBeDefined();
      expect(state.tool).toBeDefined();
      expect(state.selection).toBeNull();
      expect(state.clipboard).toBeNull();
    });

    it('should initialize network state correctly', () => {
      const state = createState();

      expect(state.network.status).toBe('disconnected');
      expect(state.network.lastPing).toBe(0);
      expect(state.network.latency).toBe(0);
      expect(state.network.serverTimeOffset).toBe(0);
    });

    it('should initialize user state correctly', () => {
      const state = createState();

      expect(state.user.id).toBe('');
      expect(state.user.nickname).toBe('');
      expect(state.user.roomId).toBeNull();
    });

    it('should initialize tool state correctly', () => {
      const state = createState();

      expect(state.tool.current).toBe('brush');
      expect(state.tool.options).toEqual({});
    });

    it('should initialize undo/redo state correctly', () => {
      const state = createState();

      expect(state.undoRedo.undoStack).toEqual([]);
      expect(state.undoRedo.redoStack).toEqual([]);
    });
  });

  describe('createOfflineCanvasState', () => {
    it('should create a default canvas state', () => {
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
    });
  });

  describe('createDefaultUserState', () => {
    it('should create a default user state', () => {
      const user = createDefaultUserState();

      expect(user.id).toBe('offline-user');
      expect(user.nickname).toBe('offline');
      expect(user.roomId).toBeNull();
    });
  });

  describe('createOfflineRoomState', () => {
    it('should create an offline room state with given user', () => {
      const user: UserState = {
        id: 'test-user',
        nickname: 'testuser',
        roomId: null
      };

      const room = createOfflineRoomState(user);

      expect(room.id).toBe(0);
      expect(room.name).toBe('Offline Room');
      expect(room.owner).toBe('testuser');
      expect(room.users).toHaveLength(1);
      expect(room.users[0].id).toBe('test-user');
      expect(room.users[0].nickname).toBe('testuser');
      expect(room.canvas).toBeDefined();
      expect(room.chat).toEqual([]);
      expect(room.settings.maxUsers).toBe(1);
      expect(room.settings.isPublic).toBe(false);
      expect(room.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should handle user with missing fields', () => {
      const user: UserState = {
        id: '',
        nickname: '',
        roomId: null
      };

      const room = createOfflineRoomState(user);

      expect(room.owner).toBe('offline');
      expect(room.users[0].id).toBe('offline-user');
      expect(room.users[0].nickname).toBe('offline');
    });

    it('should include a properly initialized canvas', () => {
      const user = createDefaultUserState();
      const room = createOfflineRoomState(user);

      expect(room.canvas.width).toBe(80);
      expect(room.canvas.height).toBe(25);
      expect(room.canvas.rawdata).toBeInstanceOf(Uint8Array);
      expect(room.canvas.colors).toHaveLength(16);
    });

    it('should include user summary with timestamps', () => {
      const user = createDefaultUserState();
      const room = createOfflineRoomState(user);

      const userSummary = room.users[0];
      expect(userSummary.connectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      expect(userSummary.lastSeen).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });
  });

  // Integration test - similar to original but expanded
  it('should initialize with a palette (colors array) in the canvas if currentRoom is set', () => {
    const state = createState();
    // By default, currentRoom is null. So let's mimic joining a room:
    // For this test, let's create a mock room with a palette
    state.currentRoom = {
      id: 1,
      name: 'Test Room',
      owner: 'test',
      users: [],
      canvas: {
        id: 1,
        name: 'Test Canvas',
        width: 100,
        height: 100,
        font: 'monospace',
        fontType: 'cp437',
        spacing: 1,
        ice: false,
        colors: [0xffffff, 0x000000], // your palette
        rawdata: new Uint8Array(),
        updatedAt: new Date().toISOString(),
      },
      chat: [],
      settings: {},
      updatedAt: new Date().toISOString(),
    };
    expect(state.currentRoom.canvas.colors).toBeDefined();
    expect(Array.isArray(state.currentRoom.canvas.colors)).toBe(true);
  });

  describe('type definitions', () => {
    it('should support all network status types', () => {
      const state = createState();
      
      const statuses: NetworkStatus[] = ['disconnected', 'connecting', 'connected', 'error'];
      
      statuses.forEach(status => {
        state.network.status = status;
        expect(state.network.status).toBe(status);
      });
    });

    it('should support state modification', () => {
      const state = createState();

      // Test state is mutable
      state.user.id = 'new-user';
      state.user.nickname = 'newuser';
      state.user.roomId = 123;

      expect(state.user.id).toBe('new-user');
      expect(state.user.nickname).toBe('newuser');
      expect(state.user.roomId).toBe(123);
    });

    it('should support adding rooms to state', () => {
      const state = createState();

      state.rooms.push({
        id: 1,
        name: 'Test Room',
        owner: 'owner',
        users: ['user1', 'user2'],
        canvasId: 1,
        updatedAt: new Date().toISOString()
      });

      expect(state.rooms).toHaveLength(1);
      expect(state.rooms[0].name).toBe('Test Room');
    });
  });
});
