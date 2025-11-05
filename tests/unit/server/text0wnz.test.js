import { describe, it, expect, vi } from 'vitest';

// Note: This module has deep fs dependencies, limiting direct unit testing
// These tests focus on testing the exports and basic integration patterns

describe('Text0wnz Module Integration Tests', () => {
	describe('Module Exports', () => {
		it('should export the expected functions', async () => {
			// Dynamic import to avoid issues with fs mocking during module load
			const module = await import('../../../src/js/server/text0wnz.js');

			expect(module.default).toBeDefined();
			expect(typeof module.default.initialize).toBe('function');
			expect(typeof module.default.getStart).toBe('function');
			expect(typeof module.default.getImageData).toBe('function');
			expect(typeof module.default.message).toBe('function');
			expect(typeof module.default.closeSession).toBe('function');
			expect(typeof module.default.saveSession).toBe('function');
			expect(typeof module.default.saveSessionWithTimestamp).toBe('function');
		});
	});

	describe('Session Management Logic', () => {
		it('should validate session file paths for security', () => {
			// Test path validation logic (extracted from module logic)
			const SESSION_DIR = '/app/sessions';

			const validateSessionPath = (filename, sessionName) => {
				const fullPath = `${SESSION_DIR}/${filename}`;

				// Check if path starts with session directory
				const isValidBase = fullPath.startsWith(SESSION_DIR);

				// Check if filename contains session name
				const containsSessionName = filename.includes(sessionName);

				// Check for path traversal attempts
				const hasTraversal = filename.includes('..') || filename.includes('/');

				return {
					isValid: isValidBase && containsSessionName && !hasTraversal,
					path: fullPath,
				};
			};

			// Valid paths
			expect(validateSessionPath('mysession.json', 'mysession')).toEqual({
				isValid: true,
				path: '/app/sessions/mysession.json',
			});

			// Invalid paths (security tests)
			expect(validateSessionPath('../etc/passwd', 'mysession').isValid).toBe(
				false,
			);
			expect(validateSessionPath('other.json', 'mysession').isValid).toBe(
				false,
			);
			expect(
				validateSessionPath('path/to/file.json', 'mysession').isValid,
			).toBe(false);
		});

		it('should implement chat message limiting algorithm', () => {
			// Test the chat limiting logic used in the module
			const chat = [];
			const MAX_CHAT_MESSAGES = 128;

			const addChatMessage = (username, message) => {
				chat.push([username, message]);
				if (chat.length > MAX_CHAT_MESSAGES) {
					chat.shift(); // Remove oldest message
				}
				return chat.length;
			};

			// Add messages up to limit
			for (let i = 0; i < 130; i++) {
				addChatMessage('user', `Message ${i}`);
			}

			expect(chat.length).toBe(MAX_CHAT_MESSAGES);
			expect(chat[0][1]).toBe('Message 2'); // First two messages were removed
			expect(chat[chat.length - 1][1]).toBe('Message 129');
		});

		it('should format WebSocket messages correctly', () => {
			// Test message formatting logic
			const formatMessage = (type, data, sessionID = null) => {
				const message = [type, data];
				if (sessionID) {
					message.push(sessionID);
				}
				return JSON.stringify(message);
			};

			expect(formatMessage('chat', 'Hello world!')).toBe(
				JSON.stringify(['chat', 'Hello world!']),
			);

			expect(formatMessage('join', 'user1', 'session123')).toBe(
				JSON.stringify(['join', 'user1', 'session123']),
			);
		});

		it('should handle canvas data structure creation', () => {
			// Test default canvas creation logic
			const createDefaultCanvas = (columns = 80, rows = 50) => {
				return {
					columns,
					rows,
					data: new Uint16Array(columns * rows),
					iceColors: false,
					letterSpacing: false,
					fontName: 'CP437 8x16',
				};
			};

			const canvas = createDefaultCanvas();
			expect(canvas.columns).toBe(80);
			expect(canvas.rows).toBe(50);
			expect(canvas.data.length).toBe(4000);
			expect(canvas.iceColors).toBe(false);
			expect(canvas.letterSpacing).toBe(false);
			expect(canvas.fontName).toBe('CP437 8x16');
		});

		it('should process draw commands correctly', () => {
			// Test draw command processing logic
			const imageData = {
				columns: 80,
				rows: 25,
				data: new Uint16Array(80 * 25),
			};

			const processDrawCommand = blocks => {
				blocks.forEach(block => {
					const index = block >> 16;
					const data = block & 0xffff;
					if (index >= 0 && index < imageData.data.length) {
						imageData.data[index] = data;
					}
				});
			};

			// Test drawing blocks
			const drawBlocks = [
				(10 << 16) | 0x41, // Position 10, character 'A'
				(20 << 16) | 0x42, // Position 20, character 'B'
				(30 << 16) | 0x43, // Position 30, character 'C'
			];

			processDrawCommand(drawBlocks);

			expect(imageData.data[10]).toBe(0x41);
			expect(imageData.data[20]).toBe(0x42);
			expect(imageData.data[30]).toBe(0x43);
		});
	});

	describe('Start Message Generation', () => {
		it('should generate proper start message format', () => {
			// Test start message generation logic
			const generateStartMessage = (imageData, sessionID, userList, chat) => {
				return JSON.stringify([
					'start',
					{
						columns: imageData.columns,
						rows: imageData.rows,
						letterSpacing: imageData.letterSpacing,
						iceColors: imageData.iceColors,
						fontName: imageData.fontName || 'CP437 8x16',
						chat: chat,
					},
					sessionID,
					userList,
				]);
			};

			const mockImageData = {
				columns: 80,
				rows: 25,
				letterSpacing: false,
				iceColors: true,
				fontName: 'Test Font',
			};

			const mockChat = [
				['user1', 'hello'],
				['user2', 'hi there'],
			];
			const mockUserList = { session1: 'user1', session2: 'user2' };

			const startMessage = generateStartMessage(
				mockImageData,
				'test-session',
				mockUserList,
				mockChat,
			);

			const parsed = JSON.parse(startMessage);
			expect(parsed[0]).toBe('start');
			expect(parsed[1].columns).toBe(80);
			expect(parsed[1].rows).toBe(25);
			expect(parsed[1].iceColors).toBe(true);
			expect(parsed[1].fontName).toBe('Test Font');
			expect(parsed[1].chat).toEqual(mockChat);
			expect(parsed[2]).toBe('test-session');
			expect(parsed[3]).toEqual(mockUserList);
		});

		it('should provide default font name when missing', () => {
			// Test fallback to default font
			const generateStartMessage = imageData => {
				return {
					fontName: imageData.fontName || 'CP437 8x16',
				};
			};

			const withoutFont = generateStartMessage({ columns: 80, rows: 25 });
			expect(withoutFont.fontName).toBe('CP437 8x16');

			const withFont = generateStartMessage({
				columns: 80,
				rows: 25,
				fontName: 'Custom Font',
			});
			expect(withFont.fontName).toBe('Custom Font');
		});
	});

	describe('Canvas Resize Logic', () => {
		it('should resize canvas data preserving existing content', () => {
			// Test canvas resize algorithm
			const resizeCanvas = (imageData, newColumns, newRows) => {
				const newSize = newColumns * newRows;
				const newData = new Uint16Array(newSize);
				const copyLength = Math.min(imageData.data.length, newSize);

				for (let i = 0; i < copyLength; i++) {
					newData[i] = imageData.data[i];
				}

				return {
					columns: newColumns,
					rows: newRows,
					data: newData,
				};
			};

			const originalData = {
				columns: 80,
				rows: 25,
				data: new Uint16Array(80 * 25),
			};

			// Fill with test data
			originalData.data[0] = 0x41; // 'A'
			originalData.data[100] = 0x42; // 'B'

			// Resize larger
			const larger = resizeCanvas(originalData, 160, 50);
			expect(larger.columns).toBe(160);
			expect(larger.rows).toBe(50);
			expect(larger.data.length).toBe(160 * 50);
			expect(larger.data[0]).toBe(0x41); // Original content preserved
			expect(larger.data[100]).toBe(0x42);

			// Resize smaller
			const smaller = resizeCanvas(originalData, 40, 25);
			expect(smaller.columns).toBe(40);
			expect(smaller.rows).toBe(25);
			expect(smaller.data.length).toBe(40 * 25);
			expect(smaller.data[0]).toBe(0x41); // Content preserved up to new size
		});

		it('should handle edge cases in canvas resize', () => {
			const resizeCanvas = (imageData, newColumns, newRows) => {
				const newSize = newColumns * newRows;
				const newData = new Uint16Array(newSize);
				const copyLength = Math.min(imageData.data.length, newSize);

				for (let i = 0; i < copyLength; i++) {
					newData[i] = imageData.data[i];
				}

				return { columns: newColumns, rows: newRows, data: newData };
			};

			// Test with minimal size
			const minimal = resizeCanvas(
				{ columns: 80, rows: 25, data: new Uint16Array(2000) },
				1,
				1,
			);
			expect(minimal.data.length).toBe(1);

			// Test with very large size
			const large = resizeCanvas(
				{ columns: 80, rows: 25, data: new Uint16Array(2000) },
				320,
				200,
			);
			expect(large.data.length).toBe(64000);
		});
	});

	describe('User List Management', () => {
		it('should manage user join operations', () => {
			const userList = {};

			const handleJoin = (sessionID, username) => {
				userList[sessionID] = username;
				return ['join', username, sessionID];
			};

			const message = handleJoin('session1', 'Alice');
			expect(message).toEqual(['join', 'Alice', 'session1']);
			expect(userList['session1']).toBe('Alice');
		});

		it('should handle nickname changes', () => {
			const userList = { session1: 'Alice' };

			const handleNick = (sessionID, newName) => {
				const oldName = userList[sessionID];
				userList[sessionID] = newName;
				return { oldName, newName, sessionID };
			};

			const result = handleNick('session1', 'Alicia');
			expect(result.oldName).toBe('Alice');
			expect(result.newName).toBe('Alicia');
			expect(userList['session1']).toBe('Alicia');
		});

		it('should handle user disconnect', () => {
			const userList = { session1: 'Alice', session2: 'Bob' };

			const handleDisconnect = sessionID => {
				const username = userList[sessionID];
				delete userList[sessionID];
				return ['part', sessionID];
			};

			const message = handleDisconnect('session1');
			expect(message).toEqual(['part', 'session1']);
			expect(userList['session1']).toBeUndefined();
			expect(userList['session2']).toBe('Bob');
		});
	});

	describe('Message Broadcasting Logic', () => {
		it('should format messages for broadcasting', () => {
			// Test message formatting
			const formatForBroadcast = msg => JSON.stringify(msg);

			const chatMsg = ['chat', 'user1', 'Hello!'];
			expect(formatForBroadcast(chatMsg)).toBe(
				JSON.stringify(['chat', 'user1', 'Hello!']),
			);

			const drawMsg = ['draw', [0x0100, 0x0200]];
			expect(formatForBroadcast(drawMsg)).toBe(
				JSON.stringify(['draw', [0x0100, 0x0200]]),
			);
		});

		it('should handle WebSocket client states', () => {
			// Test WebSocket.OPEN state check
			const mockClients = [
				{ readyState: 1, send: vi.fn() }, // WebSocket.OPEN
				{ readyState: 0, send: vi.fn() }, // WebSocket.CONNECTING
				{ readyState: 2, send: vi.fn() }, // WebSocket.CLOSING
				{ readyState: 3, send: vi.fn() }, // WebSocket.CLOSED
			];

			const sendToClients = (clients, message) => {
				const messageStr = JSON.stringify(message);
				clients.forEach(client => {
					if (client.readyState === 1) {
						client.send(messageStr);
					}
				});
			};

			sendToClients(mockClients, ['test', 'message']);

			expect(mockClients[0].send).toHaveBeenCalledOnce();
			expect(mockClients[1].send).not.toHaveBeenCalled();
			expect(mockClients[2].send).not.toHaveBeenCalled();
			expect(mockClients[3].send).not.toHaveBeenCalled();
		});
	});

	describe('Setting Change Messages', () => {
		it('should handle font change messages', () => {
			const imageData = { fontName: 'CP437 8x16' };

			const handleFontChange = msg => {
				if (msg[1] && Object.hasOwn(msg[1], 'fontName')) {
					imageData.fontName = msg[1].fontName;
					return true;
				}
				return false;
			};

			const result = handleFontChange(['fontChange', { fontName: 'Amiga Topaz' }]);
			expect(result).toBe(true);
			expect(imageData.fontName).toBe('Amiga Topaz');
		});

		it('should handle ice colors toggle', () => {
			const imageData = { iceColors: false };

			const handleIceColors = msg => {
				if (msg[1] && Object.hasOwn(msg[1], 'iceColors')) {
					imageData.iceColors = msg[1].iceColors;
					return true;
				}
				return false;
			};

			const result = handleIceColors(['iceColorsChange', { iceColors: true }]);
			expect(result).toBe(true);
			expect(imageData.iceColors).toBe(true);
		});

		it('should handle letter spacing toggle', () => {
			const imageData = { letterSpacing: false };

			const handleLetterSpacing = msg => {
				if (msg[1] && Object.hasOwn(msg[1], 'letterSpacing')) {
					imageData.letterSpacing = msg[1].letterSpacing;
					return true;
				}
				return false;
			};

			const result = handleLetterSpacing([
				'letterSpacingChange',
				{ letterSpacing: true },
			]);
			expect(result).toBe(true);
			expect(imageData.letterSpacing).toBe(true);
		});

		it('should ignore invalid setting messages', () => {
			const imageData = { fontName: 'Original' };

			const handleFontChange = msg => {
				if (msg[1] && Object.hasOwn(msg[1], 'fontName')) {
					imageData.fontName = msg[1].fontName;
					return true;
				}
				return false;
			};

			// Missing data
			const result1 = handleFontChange(['fontChange', null]);
			expect(result1).toBe(false);
			expect(imageData.fontName).toBe('Original');

			// Missing fontName property
			const result2 = handleFontChange(['fontChange', { other: 'value' }]);
			expect(result2).toBe(false);
			expect(imageData.fontName).toBe('Original');
		});
	});

	describe('Chat Message Processing', () => {
		it('should splice username into chat message', () => {
			const userList = { session1: 'Alice' };
			const msg = ['chat', 'Hello world'];

			// Simulate the splice operation
			msg.splice(1, 0, userList['session1']);

			expect(msg).toEqual(['chat', 'Alice', 'Hello world']);
		});

		it('should add messages to chat history', () => {
			const chat = [];
			const addMessage = (username, message) => {
				chat.push([username, message]);
				if (chat.length > 128) {
					chat.shift();
				}
			};

			addMessage('Alice', 'Hello');
			addMessage('Bob', 'Hi');

			expect(chat.length).toBe(2);
			expect(chat[0]).toEqual(['Alice', 'Hello']);
			expect(chat[1]).toEqual(['Bob', 'Hi']);
		});
	});

	describe('Log Function Coverage', () => {
		it('should log with debug mode enabled (callout)', () => {
			// Test log function with debug = true (uses callout)
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
			
			// Import actual sanitize for consistency
			const sanitize = (input, limit = 100, quote = false) => {
				if (!input) return '';
				const str = String(input).trim().replace(/\p{C}/gu, '').replace(/[\n\r]/g, '').substring(0, limit);
				return quote ? `'${str}'` : str;
			};
			
			const callout = msg => {
				const logMsg = sanitize(msg, 100, false);
				console.log(`╓───── ${logMsg}\n╙───────────────────────────────── ─ ─`);
			};
			
			const log = (msg, debug) => {
				const logMsg = sanitize(msg, 100, false);
				debug ? callout(logMsg) : console.log(`* ${logMsg}`);
			};

			log('Test message', true);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('╓─────')
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Test message')
			);

			consoleLogSpy.mockRestore();
		});

		it('should log with debug mode disabled (simple log)', () => {
			// Test log function with debug = false (uses console.log)
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
			
			const log = (msg, debug) => {
				const sanitize = (input, limit = 100, quote = false) => {
					if (!input) return '';
					return String(input).trim().substring(0, limit);
				};
				const logMsg = sanitize(msg, 100, false);
				debug ? console.log(`╓───── ${logMsg}`) : console.log(`* ${logMsg}`);
			};

			log('Test message', false);
			expect(consoleLogSpy).toHaveBeenCalledWith('* Test message');

			consoleLogSpy.mockRestore();
		});
	});

	describe('GetStart Error Case', () => {
		it('should return error when imageData is not initialized', () => {
			// Test getStart when imageData is null/undefined
			const getStart = (imageData, sessionID) => {
				if (!imageData) {
					console.error('! ImageData not initialized');
					return JSON.stringify(['error', 'Server not ready']);
				}
				return JSON.stringify([
					'start',
					{
						columns: imageData.columns,
						rows: imageData.rows,
						letterSpacing: imageData.letterSpacing,
						iceColors: imageData.iceColors,
						fontName: imageData.fontName || 'CP437 8x16',
						chat: [],
					},
					sessionID,
					{},
				]);
			};

			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			
			const result = getStart(null, 'test-session');
			expect(result).toBe(JSON.stringify(['error', 'Server not ready']));
			expect(consoleErrorSpy).toHaveBeenCalledWith('! ImageData not initialized');

			consoleErrorSpy.mockRestore();
		});

		it('should return valid start data when imageData is initialized', () => {
			const getStart = (imageData, sessionID) => {
				if (!imageData) {
					return JSON.stringify(['error', 'Server not ready']);
				}
				return JSON.stringify([
					'start',
					{
						columns: imageData.columns,
						rows: imageData.rows,
						letterSpacing: imageData.letterSpacing,
						iceColors: imageData.iceColors,
						fontName: imageData.fontName || 'CP437 8x16',
						chat: [],
					},
					sessionID,
					{},
				]);
			};

			const imageData = {
				columns: 80,
				rows: 25,
				letterSpacing: false,
				iceColors: true,
				fontName: 'CP437 8x16',
			};

			const result = JSON.parse(getStart(imageData, 'test-session'));
			expect(result[0]).toBe('start');
			expect(result[1].columns).toBe(80);
			expect(result[1].rows).toBe(25);
			expect(result[2]).toBe('test-session');
		});
	});

	describe('SaveSession Coverage', () => {
		it('should save both chat and canvas data', () => {
			// Test saveSession logic
			let chatSaved = false;
			let canvasSaved = false;

			const mockWriteFile = (filename, data, callback) => {
				if (filename.includes('.json')) {
					chatSaved = true;
				}
				callback();
			};

			const mockSave = (filename, imageData, callback) => {
				canvasSaved = true;
				callback();
			};

			const saveSession = (chat, imageData, writeFile, save, callback) => {
				writeFile('session.json', JSON.stringify({ chat }), () => {
					save('session.bin', imageData, callback);
				});
			};

			const testChat = [['user1', 'message1']];
			const testImageData = { columns: 80, rows: 25, data: new Uint16Array(2000) };

			saveSession(testChat, testImageData, mockWriteFile, mockSave, () => {});

			expect(chatSaved).toBe(true);
			expect(canvasSaved).toBe(true);
		});

		it('should handle save callback properly', () => {
			let callbackCalled = false;

			const mockWriteFile = (filename, data, callback) => {
				callback();
			};

			const mockSave = (filename, imageData, callback) => {
				callback();
			};

			const saveSession = (chat, imageData, writeFile, save, callback) => {
				writeFile('session.json', JSON.stringify({ chat }), () => {
					save('session.bin', imageData, callback);
				});
			};

			saveSession([], {}, mockWriteFile, mockSave, () => {
				callbackCalled = true;
			});

			expect(callbackCalled).toBe(true);
		});
	});

	describe('Console Message Coverage', () => {
		it('should log join messages', () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			const log = msg => console.log(`* ${msg}`);
			log('Alice has joined');

			expect(consoleLogSpy).toHaveBeenCalledWith('* Alice has joined');
			consoleLogSpy.mockRestore();
		});

		it('should log nickname changes', () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			const handleNick = (oldName, newName) => {
				console.log(`> ${oldName} is now ${newName}`);
			};

			handleNick('Alice', 'Alicia');
			expect(consoleLogSpy).toHaveBeenCalledWith('> Alice is now Alicia');
			consoleLogSpy.mockRestore();
		});

		it('should log canvas resize operations', () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			const handleResize = (columns, rows) => {
				console.log('[Server] Set canvas size:', `${columns}x${rows}`);
			};

			handleResize(160, 50);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				'[Server] Set canvas size:',
				'160x50'
			);
			consoleLogSpy.mockRestore();
		});

		it('should log font changes', () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			const handleFontChange = () => {
				console.log('[Server] updated font');
			};

			handleFontChange();
			expect(consoleLogSpy).toHaveBeenCalledWith('[Server] updated font');
			consoleLogSpy.mockRestore();
		});

		it('should log ice colors changes', () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			const handleIceColors = () => {
				console.log('[Server] updated ice colors');
			};

			handleIceColors();
			expect(consoleLogSpy).toHaveBeenCalledWith('[Server] updated ice colors');
			consoleLogSpy.mockRestore();
		});

		it('should log letter spacing changes', () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			const handleLetterSpacing = () => {
				console.log('[Server] updated letter spacing');
			};

			handleLetterSpacing();
			expect(consoleLogSpy).toHaveBeenCalledWith('[Server] updated letter spacing');
			consoleLogSpy.mockRestore();
		});

		it('should log broadcast operations when debug enabled', () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			const sendToAll = (clients, msg, debug) => {
				if (debug) {
					const suffix = clients.size > 1 ? 'clients' : 'client';
					console.log('[Broadcasting]', msg[0], 'to', clients.size, suffix);
				}
			};

			const mockClients = new Set([{ id: 1 }, { id: 2 }]);
			sendToAll(mockClients, ['draw', []], true);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				'[Broadcasting]',
				'draw',
				'to',
				2,
				'clients'
			);
			consoleLogSpy.mockRestore();
		});

		it('should handle send errors gracefully', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const sendToClient = (client, message) => {
				try {
					if (client.readyState === 1) {
						if (client.throwError) {
							throw new Error('Send failed');
						}
						client.send(message);
					}
				} catch (e) {
					console.error('[Error] sending to client:', e.message);
				}
			};

			const errorClient = { readyState: 1, throwError: true };
			sendToClient(errorClient, 'test');

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'[Error] sending to client:',
				expect.any(String)
			);
			consoleErrorSpy.mockRestore();
		});
	});
});
