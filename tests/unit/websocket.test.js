import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('WebSocket Worker Module', () => {
	let mockWebSocket;
	let mockSelf;

	beforeEach(() => {
		// Mock WebSocket
		mockWebSocket = {
			send: vi.fn(),
			close: vi.fn(),
			addEventListener: vi.fn(),
			readyState: 1, // OPEN
		};

		global.WebSocket = vi.fn(() => mockWebSocket);
		global.WebSocket.OPEN = 1;
		global.WebSocket.CLOSED = 3;

		// Mock FileReader
		global.FileReader = vi.fn(() => ({
			addEventListener: vi.fn((event, handler) => {
				if (event === 'load') {
					handler({ target: { result: new ArrayBuffer(8) } });
				}
			}),
			readAsArrayBuffer: vi.fn(),
		}));

		// Mock self (worker context)
		mockSelf = {
			postMessage: vi.fn(),
			onmessage: null,
		};
		global.self = mockSelf;

		// Import the module dynamically to capture the onmessage handler
		vi.resetModules();
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	describe('Connection Management', () => {
		it('should create WebSocket connection on connect command', async () => {
			await import('../../src/js/client/websocket.js');

			const connectMsg = {
				data: {
					cmd: 'connect',
					url: 'ws://localhost:1337',
					silentCheck: false,
				},
			};

			mockSelf.onmessage(connectMsg);

			expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:1337');
			expect(mockWebSocket.addEventListener).toHaveBeenCalledWith(
				'open',
				expect.any(Function),
			);
			expect(mockWebSocket.addEventListener).toHaveBeenCalledWith(
				'message',
				expect.any(Function),
			);
			expect(mockWebSocket.addEventListener).toHaveBeenCalledWith(
				'close',
				expect.any(Function),
			);
			expect(mockWebSocket.addEventListener).toHaveBeenCalledWith(
				'error',
				expect.any(Function),
			);
		});

		it('should handle silent connection check', async () => {
			await import('../../src/js/client/websocket.js');

			const connectMsg = {
				data: {
					cmd: 'connect',
					url: 'ws://localhost:1337',
					silentCheck: true,
				},
			};

			mockSelf.onmessage(connectMsg);

			// Get the error handler
			const errorHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'error',
			)?.[1];

			if (errorHandler) {
				errorHandler();
				expect(mockSelf.postMessage).toHaveBeenCalledWith({ cmd: 'silentCheckFailed' });
			}
		});

		it('should post connected message on socket open', async () => {
			await import('../../src/js/client/websocket.js');

			const connectMsg = {
				data: {
					cmd: 'connect',
					url: 'ws://localhost:1337',
					silentCheck: false,
				},
			};

			mockSelf.onmessage(connectMsg);

			// Get the open handler
			const openHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'open',
			)?.[1];

			if (openHandler) {
				openHandler();
				expect(mockSelf.postMessage).toHaveBeenCalledWith({ cmd: 'connected' });
			}
		});

		it('should handle disconnect command', async () => {
			await import('../../src/js/client/websocket.js');

			// First connect
			mockSelf.onmessage({
				data: {
					cmd: 'connect',
					url: 'ws://localhost:1337',
				},
			});

			// Then disconnect
			mockSelf.onmessage({ data: { cmd: 'disconnect' } });

			expect(mockWebSocket.close).toHaveBeenCalled();
		});
	});

	describe('Message Sending', () => {
		beforeEach(async () => {
			// Import and connect
			await import('../../src/js/client/websocket.js');
			mockSelf.onmessage({
				data: {
					cmd: 'connect',
					url: 'ws://localhost:1337',
				},
			});
		});

		it('should send join message', () => {
			mockSelf.onmessage({
				data: {
					cmd: 'join',
					handle: 'testUser',
				},
			});

			expect(mockWebSocket.send).toHaveBeenCalledWith(
				JSON.stringify(['join', 'testUser']),
			);
		});

		it('should send nick change message', () => {
			mockSelf.onmessage({
				data: {
					cmd: 'nick',
					handle: 'newName',
				},
			});

			expect(mockWebSocket.send).toHaveBeenCalledWith(
				JSON.stringify(['nick', 'newName']),
			);
		});

		it('should send chat message', () => {
			mockSelf.onmessage({
				data: {
					cmd: 'chat',
					text: 'Hello, world!',
				},
			});

			expect(mockWebSocket.send).toHaveBeenCalledWith(
				JSON.stringify(['chat', 'Hello, world!']),
			);
		});

		it('should send canvas settings', () => {
			const settings = {
				columns: 80,
				rows: 25,
				iceColors: true,
				letterSpacing: false,
			};

			mockSelf.onmessage({
				data: {
					cmd: 'canvasSettings',
					settings,
				},
			});

			expect(mockWebSocket.send).toHaveBeenCalledWith(
				JSON.stringify(['canvasSettings', settings]),
			);
		});

		it('should send resize message', () => {
			mockSelf.onmessage({
				data: {
					cmd: 'resize',
					columns: 100,
					rows: 30,
				},
			});

			expect(mockWebSocket.send).toHaveBeenCalledWith(
				JSON.stringify(['resize', { columns: 100, rows: 30 }]),
			);
		});

		it('should send font change', () => {
			mockSelf.onmessage({
				data: {
					cmd: 'fontChange',
					fontName: 'CP437 8x16',
				},
			});

			expect(mockWebSocket.send).toHaveBeenCalledWith(
				JSON.stringify(['fontChange', { fontName: 'CP437 8x16' }]),
			);
		});

		it('should send ice colors change', () => {
			mockSelf.onmessage({
				data: {
					cmd: 'iceColorsChange',
					iceColors: true,
				},
			});

			expect(mockWebSocket.send).toHaveBeenCalledWith(
				JSON.stringify(['iceColorsChange', { iceColors: true }]),
			);
		});

		it('should send letter spacing change', () => {
			mockSelf.onmessage({
				data: {
					cmd: 'letterSpacingChange',
					letterSpacing: true,
				},
			});

			expect(mockWebSocket.send).toHaveBeenCalledWith(
				JSON.stringify(['letterSpacingChange', { letterSpacing: true }]),
			);
		});

		it('should not send when socket is closed', () => {
			mockWebSocket.readyState = 3; // CLOSED

			mockSelf.onmessage({
				data: {
					cmd: 'chat',
					text: 'test',
				},
			});

			expect(mockWebSocket.send).not.toHaveBeenCalled();
		});
	});

	describe('Message Receiving', () => {
		beforeEach(async () => {
			await import('../../src/js/client/websocket.js');
			mockSelf.onmessage({
				data: {
					cmd: 'connect',
					url: 'ws://localhost:1337',
				},
			});
		});

		it('should handle start message', () => {
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			const startData = {
				columns: 80,
				rows: 25,
				iceColors: true,
				letterSpacing: false,
				fontName: 'CP437 8x16',
				chat: [
					['user1', 'Hello'],
					['user2', 'Hi'],
				],
			};

			messageHandler?.({
				data: JSON.stringify([
					'start',
					startData,
					'session123',
					{ user1: 'Alice', user2: 'Bob' },
				]),
			});

			// Should post canvas settings
			expect(mockSelf.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					cmd: 'canvasSettings',
					settings: expect.objectContaining({
						columns: 80,
						rows: 25,
						iceColors: true,
						letterSpacing: false,
						fontName: 'CP437 8x16',
					}),
				}),
			);

			// Should post chat messages
			expect(mockSelf.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					cmd: 'chat',
					handle: 'user1',
					text: 'Hello',
				}),
			);
		});

		it('should handle join message', () => {
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			messageHandler?.({ data: JSON.stringify(['join', 'newUser', 'session456']) });

			expect(mockSelf.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					cmd: 'join',
					handle: 'newUser',
					sessionID: 'session456',
					showNotification: true,
				}),
			);
		});

		it('should handle nick change message', () => {
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			messageHandler?.({ data: JSON.stringify(['nick', 'newNick', 'session789']) });

			expect(mockSelf.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					cmd: 'nick',
					handle: 'newNick',
					sessionID: 'session789',
				}),
			);
		});

		it('should handle part message', () => {
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			messageHandler?.({ data: JSON.stringify(['part', 'session999']) });

			expect(mockSelf.postMessage).toHaveBeenCalledWith({
				cmd: 'part',
				sessionID: 'session999',
			});
		});

		it('should handle chat message', () => {
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			messageHandler?.({ data: JSON.stringify(['chat', 'Alice', 'Hello everyone!']) });

			expect(mockSelf.postMessage).toHaveBeenCalledWith({
				cmd: 'chat',
				handle: 'Alice',
				text: 'Hello everyone!',
				showNotification: true,
			});
		});

		it('should handle canvas settings message', () => {
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			const settings = { columns: 100, rows: 40 };
			messageHandler?.({ data: JSON.stringify(['canvasSettings', settings]) });

			expect(mockSelf.postMessage).toHaveBeenCalledWith({
				cmd: 'canvasSettings',
				settings,
			});
		});

		it('should handle resize message', () => {
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			messageHandler?.({ data: JSON.stringify(['resize', { columns: 120, rows: 50 }]) });

			expect(mockSelf.postMessage).toHaveBeenCalledWith({
				cmd: 'resize',
				columns: 120,
				rows: 50,
			});
		});

		it('should handle font change message', () => {
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			messageHandler?.({ data: JSON.stringify(['fontChange', { fontName: 'Topaz-437 8x16' }]) });

			expect(mockSelf.postMessage).toHaveBeenCalledWith({
				cmd: 'fontChange',
				fontName: 'Topaz-437 8x16',
			});
		});

		it('should handle ice colors change message', () => {
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			messageHandler?.({ data: JSON.stringify(['iceColorsChange', { iceColors: true }]) });

			expect(mockSelf.postMessage).toHaveBeenCalledWith({
				cmd: 'iceColorsChange',
				iceColors: true,
			});
		});

		it('should handle letter spacing change message', () => {
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			messageHandler?.({ data: JSON.stringify(['letterSpacingChange', { letterSpacing: true }]) });

			expect(mockSelf.postMessage).toHaveBeenCalledWith({
				cmd: 'letterSpacingChange',
				letterSpacing: true,
			});
		});

		it('should handle invalid JSON data', () => {
			const consoleErrorSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			messageHandler?.({ data: 'invalid json{' });

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('[Worker] Invalid data received'),
				expect.any(String),
				expect.any(String),
				expect.any(Error),
			);

			consoleErrorSpy.mockRestore();
		});

		it('should warn on unknown command', () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			messageHandler?.({ data: JSON.stringify(['unknownCommand', {}]) });

			expect(consoleWarnSpy).toHaveBeenCalledWith(
				'[Worker] Unknown command:',
				'unknownCommand',
			);

			consoleWarnSpy.mockRestore();
		});
	});

	describe('Draw Block Handling', () => {
		beforeEach(async () => {
			await import('../../src/js/client/websocket.js');
			mockSelf.onmessage({
				data: {
					cmd: 'connect',
					url: 'ws://localhost:1337',
				},
			});

			// Set up joint data by sending a start message first
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			messageHandler?.({
				data: JSON.stringify([
					'start',
					{
						columns: 80,
						rows: 25,
						chat: [],
					},
					'session123',
					{},
				]),
			});
		});

		it('should handle draw message with blocks', () => {
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			// Block format: (index << 16) | charCode
			const blocks = [
				(0 << 16) | 65, // index 0, char 'A'
				(1 << 16) | 66, // index 1, char 'B'
				(80 << 16) | 67, // index 80, char 'C'
			];

			messageHandler?.({ data: JSON.stringify(['draw', blocks]) });

			expect(mockSelf.postMessage).toHaveBeenCalledWith({
				cmd: 'draw',
				blocks: [
					[0, 65, 0, 0], // [index, charCode, x, y]
					[1, 66, 1, 0],
					[80, 67, 0, 1],
				],
			});
		});

		it('should remove duplicate blocks when sending', () => {
			mockSelf.postMessage.mockClear();

			// Duplicate blocks (same index)
			const blocks = [
				(0 << 16) | 65, // index 0
				(1 << 16) | 66, // index 1
				(0 << 16) | 67, // index 0 again (duplicate)
			];

			mockSelf.onmessage({
				data: {
					cmd: 'draw',
					blocks,
				},
			});

			// Should only send the last occurrence of each index
			const sentData = JSON.parse(mockWebSocket.send.mock.calls[0][0]);
			expect(sentData[0]).toBe('draw');
			expect(sentData[1].length).toBe(2); // Should have removed duplicate
		});
	});

	describe('Binary Data Handling', () => {
		beforeEach(async () => {
			await import('../../src/js/client/websocket.js');
			mockSelf.onmessage({
				data: {
					cmd: 'connect',
					url: 'ws://localhost:1337',
				},
			});

			// Set up joint data
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			messageHandler?.({
				data: JSON.stringify([
					'start',
					{
						columns: 80,
						rows: 25,
						iceColors: true,
						letterSpacing: false,
						chat: [],
					},
					'session123',
					{},
				]),
			});
		});

		it('should handle binary data with FileReader', () => {
			const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)?.[1];

			const binaryData = new ArrayBuffer(8);

			messageHandler?.({ data: binaryData });

			// The mock FileReader will immediately trigger the load event
			expect(mockSelf.postMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					cmd: 'imageData',
					data: expect.any(ArrayBuffer),
					columns: 80,
					rows: 25,
					iceColors: true,
					letterSpacing: false,
				}),
			);
		});
	});

	describe('Error Handling', () => {
		it('should handle WebSocket connection errors', async () => {
			global.WebSocket = vi.fn(() => {
				throw new Error('Connection failed');
			});

			await import('../../src/js/client/websocket.js');

			mockSelf.onmessage({
				data: {
					cmd: 'connect',
					url: 'ws://localhost:1337',
					silentCheck: false,
				},
			});

			expect(mockSelf.postMessage).toHaveBeenCalledWith({
				cmd: 'error',
				error: 'WebSocket initialization failed: Connection failed',
			});
		});

		it('should handle silent check connection errors', async () => {
			global.WebSocket = vi.fn(() => {
				throw new Error('Connection failed');
			});

			await import('../../src/js/client/websocket.js');

			mockSelf.onmessage({
				data: {
					cmd: 'connect',
					url: 'ws://localhost:1337',
					silentCheck: true,
				},
			});

			expect(mockSelf.postMessage).toHaveBeenCalledWith({ cmd: 'silentCheckFailed' });
		});

		it('should handle close event with reason', async () => {
			const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

			await import('../../src/js/client/websocket.js');

			mockSelf.onmessage({
				data: {
					cmd: 'connect',
					url: 'ws://localhost:1337',
					silentCheck: false,
				},
			});

			const closeHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'close',
			)?.[1];

			closeHandler?.({ code: 1000, reason: 'Normal closure' });

			expect(consoleInfoSpy).toHaveBeenCalledWith(
				'[Worker] WebSocket connection closed. Code:',
				1000,
				'Reason:',
				'Normal closure',
			);
			expect(mockSelf.postMessage).toHaveBeenCalledWith({ cmd: 'disconnected' });

			consoleInfoSpy.mockRestore();
		});
	});
});
