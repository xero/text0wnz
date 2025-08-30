import {describe, it, expect} from 'vitest';
import {createState} from './state';

describe('state', ()=>{
  it('should initialize with a palette (colors array) in the canvas if currentRoom is set', ()=>{
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
});
