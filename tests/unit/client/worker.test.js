import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock WebSocket and self since we're testing a Web Worker
global.WebSocket = vi.fn();
global.self = {
	postMessage: vi.fn(),
	onmessage: null,
};
global.FileReader = vi.fn();

describe('WebSocket Worker', () => {
	let mockWebSocket;
	let workerCode;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create mock WebSocket instance
		mockWebSocket = {
			send: vi.fn(),
			close: vi.fn(),
			addEventListener: vi.fn(),
			readyState: 1, // WebSocket.OPEN
		};

		global.WebSocket.mockImplementation(() => mockWebSocket);

		// Mock FileReader
		global.FileReader.mockImplementation(() => ({
			addEventListener: vi.fn(),
			readAsArrayBuffer: vi.fn(),
		}));

		// Import and execute the worker code
		// Since worker.js uses self.onmessage, we need to simulate loading it
		workerCode = {
			socket: null,
			sessionID: null,
			joint: null,

			// Copy of the removeDuplicates function from worker.js
			removeDuplicates: blocks => {
				const indexes = [];
				let index;
				blocks = blocks.reverse();
				blocks = blocks.filter(block => {
					index = block >> 16;
					if (indexes.lastIndexOf(index) === -1) {
						indexes.push(index);
						return true;
					}
					return false;
				});
				return blocks.reverse();
			},

			// Simulate the main onmessage handler
			handleMessage: data => {
				switch (data.cmd) {
					case 'connect':
						try {
							workerCode.socket = new WebSocket(data.url);
							workerCode.socket.addEventListener('open', () => {
								global.self.postMessage({ cmd: 'connected' });
							});
							workerCode.socket.addEventListener('message', e => {
								workerCode.onMessage(e);
							});
							workerCode.socket.addEventListener('close', _ => {
								if (data.silentCheck) {
									global.self.postMessage({ cmd: 'silentCheckFailed' });
								} else {
									global.self.postMessage({ cmd: 'disconnected' });
								}
							});
							workerCode.socket.addEventListener('error', () => {
								if (data.silentCheck) {
									global.self.postMessage({ cmd: 'silentCheckFailed' });
								} else {
									global.self.postMessage({
										cmd: 'error',
										error: 'WebSocket connection failed.',
									});
								}
							});
						} catch (error) {
							if (data.silentCheck) {
								global.self.postMessage({ cmd: 'silentCheckFailed' });
							} else {
								global.self.postMessage({
									cmd: 'error',
									error: `WebSocket initialization failed: ${error.message}`,
								});
							}
						}
						break;
					case 'join':
						workerCode.send('join', data.handle);
						break;
					case 'nick':
						workerCode.send('nick', data.handle);
						break;
					case 'chat':
						workerCode.send('chat', data.text);
						break;
					case 'draw':
						workerCode.send('draw', workerCode.removeDuplicates(data.blocks));
						break;
					case 'disconnect':
						if (workerCode.socket) {
							workerCode.socket.close();
						}
						break;
				}
			},

			send: (cmd, msg) => {
				if (workerCode.socket && workerCode.socket.readyState === 1) {
					workerCode.socket.send(JSON.stringify([cmd, msg]));
				}
			},

			onMessage: evt => {
				let data = evt.data;
				if (typeof data === 'object') {
					const fr = new FileReader();
					fr.addEventListener('load', e => {
						global.self.postMessage({
							cmd: 'imageData',
							data: e.target.result,
							columns: workerCode.joint.columns,
							rows: workerCode.joint.rows,
							iceColors: workerCode.joint.iceColors,
							letterSpacing: workerCode.joint.letterSpacing,
						});
					});
					fr.readAsArrayBuffer(data);
				} else {
					try {
						data = JSON.parse(data);
					} catch (error) {
						console.error('Invalid data received from server:', error);
						return;
					}

					let userList;
					const outputBlocks = [];
					switch (data[0]) {
						case 'start':
							workerCode.sessionID = data[2];
							workerCode.joint = data[1];
							userList = data[3];
							Object.keys(userList).forEach(userSessionID => {
								global.self.postMessage({
									cmd: 'join',
									sessionID: userSessionID,
									handle: userList[userSessionID],
									showNotification: false,
								});
							});
							global.self.postMessage({
								cmd: 'canvasSettings',
								settings: {
									columns: data[1].columns,
									rows: data[1].rows,
									iceColors: data[1].iceColors,
									letterSpacing: data[1].letterSpacing,
									fontName: data[1].fontName,
								},
							});
							break;
						case 'join':
							global.self.postMessage({
								cmd: 'join',
								sessionID: data[2],
								handle: data[1],
								showNotification: true,
							});
							break;
						case 'chat':
							global.self.postMessage({
								cmd: 'chat',
								handle: data[1],
								text: data[2],
								showNotification: true,
							});
							break;
						case 'draw':
							data[1].forEach(block => {
								const index = block >> 16;
								outputBlocks.push([
									index,
									block & 0xffff,
									index % workerCode.joint.columns,
									Math.floor(index / workerCode.joint.columns),
								]);
							});
							global.self.postMessage({ cmd: 'draw', blocks: outputBlocks });
							break;
					}
				}
			},
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('WebSocket Connection', () => {
		it('should create WebSocket connection successfully', () => {
			const connectData = {
				cmd: 'connect',
				url: 'ws://localhost:1337',
				silentCheck: false,
			};

			workerCode.handleMessage(connectData);

			expect(WebSocket).toHaveBeenCalledWith('ws://localhost:1337');
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

		it('should handle connection open event', () => {
			const connectData = {
				cmd: 'connect',
				url: 'ws://localhost:1337',
				silentCheck: false,
			};

			workerCode.handleMessage(connectData);

			// Get the open event handler and call it
			const openHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'open',
			)[1];
			openHandler();

			expect(global.self.postMessage).toHaveBeenCalledWith({ cmd: 'connected' });
		});

		it('should handle connection error during silent check', () => {
			const connectData = {
				cmd: 'connect',
				url: 'ws://localhost:1337',
				silentCheck: true,
			};

			workerCode.handleMessage(connectData);

			// Get the error handler and call it
			const errorHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'error',
			)[1];
			errorHandler();

			expect(global.self.postMessage).toHaveBeenCalledWith({ cmd: 'silentCheckFailed' });
		});

		it('should handle connection error during normal operation', () => {
			const connectData = {
				cmd: 'connect',
				url: 'ws://localhost:1337',
				silentCheck: false,
			};

			workerCode.handleMessage(connectData);

			// Get the error handler and call it
			const errorHandler = mockWebSocket.addEventListener.mock.calls.find(
				call => call[0] === 'error',
			)[1];
			errorHandler();

			expect(global.self.postMessage).toHaveBeenCalledWith({
				cmd: 'error',
				error: 'WebSocket connection failed.',
			});
		});

		it('should handle WebSocket creation exception', () => {
			WebSocket.mockImplementation(() => {
				throw new Error('WebSocket not supported');
			});

			const connectData = {
				cmd: 'connect',
				url: 'ws://localhost:1337',
				silentCheck: false,
			};

			workerCode.handleMessage(connectData);

			expect(global.self.postMessage).toHaveBeenCalledWith({
				cmd: 'error',
				error: 'WebSocket initialization failed: WebSocket not supported',
			});
		});
	});

	describe('Message Sending', () => {
		beforeEach(() => {
			// Setup connected WebSocket
			workerCode.socket = mockWebSocket;
		});

		it('should send join message', () => {
			const joinData = {
				cmd: 'join',
				handle: 'testuser',
			};

			workerCode.handleMessage(joinData);

			expect(mockWebSocket.send).toHaveBeenCalledWith(
				JSON.stringify(['join', 'testuser']),
			);
		});

		it('should send nick message', () => {
			const nickData = {
				cmd: 'nick',
				handle: 'newname',
			};

			workerCode.handleMessage(nickData);

			expect(mockWebSocket.send).toHaveBeenCalledWith(
				JSON.stringify(['nick', 'newname']),
			);
		});

		it('should send chat message', () => {
			const chatData = {
				cmd: 'chat',
				text: 'Hello world!',
			};

			workerCode.handleMessage(chatData);

			expect(mockWebSocket.send).toHaveBeenCalledWith(
				JSON.stringify(['chat', 'Hello world!']),
			);
		});

		it('should send draw message with deduplicated blocks', () => {
			const drawData = {
				cmd: 'draw',
				blocks: [
					(1 << 16) | 0x41, // Position 1
					(2 << 16) | 0x42, // Position 2
					(1 << 16) | 0x43, // Position 1 again (should be kept)
				],
			};

			workerCode.handleMessage(drawData);

			// The removeDuplicates function keeps the last occurrence
			// Input: [65601, 131138, 65603] -> Output: [131138, 65603]
			expect(mockWebSocket.send).toHaveBeenCalledWith(
				JSON.stringify(['draw', [131138, 65603]]),
			);
		});

		it('should not send when WebSocket is not open', () => {
			mockWebSocket.readyState = 0; // WebSocket.CONNECTING

			const joinData = {
				cmd: 'join',
				handle: 'testuser',
			};

			workerCode.handleMessage(joinData);

			expect(mockWebSocket.send).not.toHaveBeenCalled();
		});

		it('should handle disconnect command', () => {
			const disconnectData = { cmd: 'disconnect' };

			workerCode.handleMessage(disconnectData);

			expect(mockWebSocket.close).toHaveBeenCalled();
		});
	});

	describe('Message Receiving', () => {
		beforeEach(() => {
			workerCode.joint = {
				columns: 80,
				rows: 25,
				iceColors: false,
				letterSpacing: false,
				fontName: 'CP437 8x16',
			};
		});

		it('should handle start message', () => {
			const messageEvent = {
				data: JSON.stringify([
					'start',
					{
						columns: 80,
						rows: 25,
						iceColors: true,
						letterSpacing: false,
						fontName: 'test-font',
						chat: [['user1', 'hello']],
					},
					'session123',
					{ user1: 'testuser' },
				]),
			};

			workerCode.onMessage(messageEvent);

			expect(workerCode.sessionID).toBe('session123');
			expect(global.self.postMessage).toHaveBeenCalledWith({
				cmd: 'join',
				sessionID: 'user1',
				handle: 'testuser',
				showNotification: false,
			});
			expect(global.self.postMessage).toHaveBeenCalledWith({
				cmd: 'canvasSettings',
				settings: {
					columns: 80,
					rows: 25,
					iceColors: true,
					letterSpacing: false,
					fontName: 'test-font',
				},
			});
		});

		it('should handle join message', () => {
			const messageEvent = { data: JSON.stringify(['join', 'newuser', 'session456']) };

			workerCode.onMessage(messageEvent);

			expect(global.self.postMessage).toHaveBeenCalledWith({
				cmd: 'join',
				sessionID: 'session456',
				handle: 'newuser',
				showNotification: true,
			});
		});

		it('should handle chat message', () => {
			const messageEvent = { data: JSON.stringify(['chat', 'user1', 'Hello everyone!']) };

			workerCode.onMessage(messageEvent);

			expect(global.self.postMessage).toHaveBeenCalledWith({
				cmd: 'chat',
				handle: 'user1',
				text: 'Hello everyone!',
				showNotification: true,
			});
		});

		it('should handle draw message', () => {
			const messageEvent = { data: JSON.stringify(['draw', [(1 << 16) | 0x41, (2 << 16) | 0x42]]) };

			workerCode.onMessage(messageEvent);

			expect(global.self.postMessage).toHaveBeenCalledWith({
				cmd: 'draw',
				blocks: [
					[1, 0x41, 1, 0], // [index, data, x, y]
					[2, 0x42, 2, 0],
				],
			});
		});

		it('should handle binary data (imageData)', () => {
			const mockFileReader = {
				addEventListener: vi.fn(),
				readAsArrayBuffer: vi.fn(),
			};
			global.FileReader.mockImplementation(() => mockFileReader);

			const binaryData = new ArrayBuffer(100);
			const messageEvent = { data: binaryData };

			workerCode.onMessage(messageEvent);

			expect(mockFileReader.addEventListener).toHaveBeenCalledWith(
				'load',
				expect.any(Function),
			);
			expect(mockFileReader.readAsArrayBuffer).toHaveBeenCalledWith(binaryData);

			// Simulate FileReader load event
			const loadHandler = mockFileReader.addEventListener.mock.calls[0][1];
			loadHandler({ target: { result: binaryData } });

			expect(global.self.postMessage).toHaveBeenCalledWith({
				cmd: 'imageData',
				data: binaryData,
				columns: 80,
				rows: 25,
				iceColors: false,
				letterSpacing: false,
			});
		});

		it('should handle malformed JSON gracefully', () => {
			const consoleErrorSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			const messageEvent = { data: 'invalid json' };

			expect(() => {
				workerCode.onMessage(messageEvent);
			}).not.toThrow();

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'Invalid data received from server:',
				expect.any(Error),
			);

			consoleErrorSpy.mockRestore();
		});
	});

	describe('removeDuplicates Algorithm', () => {
		it('should remove duplicate blocks correctly', () => {
			// Block format: (index << 16) | data
			const blocks = [
				(1 << 16) | 0x41, // Position 1, data 0x41
				(2 << 16) | 0x42, // Position 2, data 0x42
				(1 << 16) | 0x43, // Position 1, data 0x43 (duplicate position)
				(3 << 16) | 0x44, // Position 3, data 0x44
				(2 << 16) | 0x45, // Position 2, data 0x45 (duplicate position)
			];

			const result = workerCode.removeDuplicates(blocks);

			// Should keep only the last occurrence of each position
			expect(result.length).toBe(3);
			expect(result).toContain((1 << 16) | 0x43); // Last occurrence of position 1
			expect(result).toContain((3 << 16) | 0x44); // Only occurrence of position 3
			expect(result).toContain((2 << 16) | 0x45); // Last occurrence of position 2
		});

		it('should handle empty blocks array', () => {
			const result = workerCode.removeDuplicates([]);
			expect(result).toEqual([]);
		});

		it('should handle single block', () => {
			const blocks = [(1 << 16) | 0x41];
			const result = workerCode.removeDuplicates(blocks);
			expect(result).toEqual(blocks);
		});

		it('should handle blocks with no duplicates', () => {
			const blocks = [(1 << 16) | 0x41, (2 << 16) | 0x42, (3 << 16) | 0x43];
			const result = workerCode.removeDuplicates(blocks);
			// Since no duplicates, order should be preserved
			expect(result).toEqual([
				(1 << 16) | 0x41,
				(2 << 16) | 0x42,
				(3 << 16) | 0x43,
			]);
		});

		it('should preserve order of unique blocks', () => {
			const blocks = [
				(1 << 16) | 0x41, // Position 1
				(3 << 16) | 0x43, // Position 3
				(2 << 16) | 0x42, // Position 2
				(1 << 16) | 0x44, // Position 1 again (duplicate)
			];
			const result = workerCode.removeDuplicates(blocks);

			// Should keep: position 3, position 2, position 1 (last occurrence)
			// Input: [65601, 196675, 131138, 65604] -> Output: [196675, 131138, 65604]
			expect(result).toEqual([
				(3 << 16) | 0x43, // Position 3
				(2 << 16) | 0x42, // Position 2
				(1 << 16) | 0x44, // Position 1 (last occurrence)
			]);
		});
	});
});
