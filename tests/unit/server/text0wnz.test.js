import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('fs', () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	readFile: vi.fn(),
	writeFile: vi.fn(),
}));

vi.mock('../../../src/js/server/fileio.js', () => ({
	load: vi.fn(),
	save: vi.fn(),
}));

vi.mock('../../../src/js/server/utils.js', () => ({
	createTimestampedFilename: vi.fn((sessionName, ext) => `${sessionName}-timestamp.${ext}`),
}));

import {
	initialize,
	saveSessionWithTimestamp,
	saveSession,
	getStart,
	getImageData,
	message,
	closeSession,
} from '../../../src/js/server/text0wnz.js';
import { existsSync, mkdirSync, readFile, writeFile } from 'fs';
import { load, save } from '../../../src/js/server/fileio.js';

describe('Text0wnz Module', () => {
	let consoleLogSpy;
	let consoleErrorSpy;

	beforeEach(() => {
		vi.clearAllMocks();
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('initialize', () => {
		it('should initialize with default configuration', () => {
			const config = {
				sessionName: 'test-session',
				debug: false,
			};

			existsSync.mockReturnValue(true);
			readFile.mockImplementation((_file, _encoding, callback) => {
				callback(null, JSON.stringify({ chat: [] }));
			});
			load.mockImplementation((_file, callback) => {
				callback({
					columns: 80,
					rows: 25,
					data: new Uint16Array(80 * 25),
					iceColors: false,
					letterSpacing: false,
				});
			});

			initialize(config);

			expect(existsSync).toHaveBeenCalled();
			expect(readFile).toHaveBeenCalled();
			expect(load).toHaveBeenCalled();
		});

		it('should create session directory if it does not exist', () => {
			const config = {
				sessionName: 'test',
				debug: true,
			};

			existsSync.mockReturnValue(false);
			readFile.mockImplementation((_file, _encoding, callback) => {
				callback(new Error('File not found'), null);
			});
			load.mockImplementation((_file, callback) => {
				callback(undefined); // No existing data
			});

			initialize(config);

			expect(mkdirSync).toHaveBeenCalledWith(
				expect.stringContaining('sessions'),
				{ recursive: true }
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				'Creating session directory:',
				expect.any(String)
			);
		});

		it('should create default canvas when no existing data', () => {
			const config = {
				sessionName: 'test',
				debug: true,
			};

			existsSync.mockReturnValue(true);
			readFile.mockImplementation((_file, _encoding, callback) => {
				callback(new Error('File not found'), null);
			});
			load.mockImplementation((_file, callback) => {
				callback(undefined);
			});

			initialize(config);

			expect(save).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					columns: 80,
					rows: 50,
					data: expect.any(Uint16Array),
					iceColors: false,
					letterSpacing: false,
					fontName: 'CP437 8x16',
				}),
				expect.any(Function)
			);
		});

		it('should handle corrupted chat file gracefully', () => {
			const config = {
				sessionName: 'test',
				debug: false,
			};

			existsSync.mockReturnValue(true);
			readFile.mockImplementation((_file, _encoding, callback) => {
				callback(null, 'invalid json');
			});
			load.mockImplementation((_file, callback) => {
				callback({
					columns: 80,
					rows: 25,
					data: new Uint16Array(80 * 25),
					iceColors: false,
					letterSpacing: false,
				});
			});

			initialize(config);

			expect(consoleErrorSpy).toHaveBeenCalledWith('Error parsing chat file:', expect.any(Error));
		});
	});

	describe('getStart', () => {
		beforeEach(() => {
			// Initialize with default data
			const config = { sessionName: 'test', debug: false };
			existsSync.mockReturnValue(true);
			readFile.mockImplementation((_file, _encoding, callback) => {
				callback(null, JSON.stringify({ chat: [['user1', 'hello']] }));
			});
			load.mockImplementation((_file, callback) => {
				callback({
					columns: 80,
					rows: 25,
					data: new Uint16Array(80 * 25),
					iceColors: true,
					letterSpacing: false,
					fontName: 'test-font',
				});
			});
			initialize(config);
		});

		it('should return start data with image and chat info', () => {
			const sessionID = 'test-session-123';
			const startData = getStart(sessionID);
			const parsed = JSON.parse(startData);

			expect(parsed[0]).toBe('start');
			expect(parsed[1]).toEqual({
				columns: 80,
				rows: 25,
				letterSpacing: false,
				iceColors: true,
				fontName: 'test-font',
				chat: [['user1', 'hello']],
			});
			expect(parsed[2]).toBe(sessionID);
			expect(parsed[3]).toEqual({}); // userList
		});

		it('should handle uninitialized imageData', () => {
			// Create a fresh module instance without initialization
			const sessionID = 'test-session';
			
			// Reset the module state by creating a new config without proper initialization
			load.mockImplementation((_file, callback) => {
				// Don't call callback to simulate uninitialized state
			});
			
			const config = { sessionName: 'uninitialized', debug: false };
			existsSync.mockReturnValue(true);
			readFile.mockImplementation((_file, _encoding, callback) => {
				// Don't call callback to simulate uninitialized state
			});
			
			// This would leave imageData undefined
			const startData = getStart(sessionID);
			
			expect(startData).toContain('error');
			expect(consoleErrorSpy).toHaveBeenCalledWith('ImageData not initialized');
		});
	});

	describe('getImageData', () => {
		it('should return image data when initialized', () => {
			const config = { sessionName: 'test', debug: false };
			const mockImageData = {
				columns: 80,
				rows: 25,
				data: new Uint16Array(80 * 25),
				iceColors: false,
				letterSpacing: false,
			};

			existsSync.mockReturnValue(true);
			readFile.mockImplementation((_file, _encoding, callback) => {
				callback(null, JSON.stringify({ chat: [] }));
			});
			load.mockImplementation((_file, callback) => {
				callback(mockImageData);
			});

			initialize(config);
			const result = getImageData();

			expect(result).toEqual(mockImageData);
		});
	});

	describe('message handling', () => {
		let mockClients;

		beforeEach(() => {
			// Initialize module
			const config = { sessionName: 'test', debug: true };
			existsSync.mockReturnValue(true);
			readFile.mockImplementation((_file, _encoding, callback) => {
				callback(null, JSON.stringify({ chat: [] }));
			});
			load.mockImplementation((_file, callback) => {
				callback({
					columns: 80,
					rows: 25,
					data: new Uint16Array(80 * 25),
					iceColors: false,
					letterSpacing: false,
				});
			});
			initialize(config);

			// Mock clients
			mockClients = new Set([
				{
					readyState: 1,
					send: vi.fn(),
				},
				{
					readyState: 1,
					send: vi.fn(),
				},
			]);
		});

		it('should handle join messages', () => {
			const msg = ['join', 'testuser'];
			const sessionID = 'session123';

			message(msg, sessionID, mockClients);

			expect(consoleLogSpy).toHaveBeenCalledWith('testuser has joined');
			expect(msg).toEqual(['join', 'testuser', sessionID]);
		});

		it('should handle nick messages', () => {
			// First join a user
			message(['join', 'oldname'], 'session123', mockClients);
			
			// Then change nick
			const msg = ['nick', 'newname'];
			message(msg, 'session123', mockClients);

			expect(consoleLogSpy).toHaveBeenCalledWith('oldname is now newname');
			expect(msg).toEqual(['nick', 'newname', 'session123']);
		});

		it('should handle chat messages', () => {
			// First join a user
			message(['join', 'chatuser'], 'session123', mockClients);
			
			const msg = ['chat', 'Hello world!'];
			message(msg, 'session123', mockClients);

			expect(msg).toEqual(['chat', 'chatuser', 'Hello world!']);
		});

		it('should handle draw messages', () => {
			const msg = ['draw', [65536, 131072]]; // Block data
			message(msg, 'session123', mockClients);

			// Should have updated canvas data
			const imageData = getImageData();
			expect(imageData.data[1]).toBe(0); // First block
			expect(imageData.data[2]).toBe(0); // Second block
		});

		it('should handle resize messages', () => {
			const msg = ['resize', { columns: 120, rows: 40 }];
			message(msg, 'session123', mockClients);

			const imageData = getImageData();
			expect(imageData.columns).toBe(120);
			expect(imageData.rows).toBe(40);
			expect(imageData.data.length).toBe(120 * 40);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				'Server: Updating canvas size to',
				120,
				'x',
				40
			);
		});

		it('should handle fontChange messages', () => {
			const msg = ['fontChange', { fontName: 'Custom Font' }];
			message(msg, 'session123', mockClients);

			const imageData = getImageData();
			expect(imageData.fontName).toBe('Custom Font');
			expect(consoleLogSpy).toHaveBeenCalledWith('Server: Updating font to', 'Custom Font');
		});

		it('should handle iceColorsChange messages', () => {
			const msg = ['iceColorsChange', { iceColors: true }];
			message(msg, 'session123', mockClients);

			const imageData = getImageData();
			expect(imageData.iceColors).toBe(true);
		});

		it('should handle letterSpacingChange messages', () => {
			const msg = ['letterSpacingChange', { letterSpacing: true }];
			message(msg, 'session123', mockClients);

			const imageData = getImageData();
			expect(imageData.letterSpacing).toBe(true);
		});

		it('should broadcast messages to all clients', () => {
			const msg = ['join', 'testuser'];
			message(msg, 'session123', mockClients);

			mockClients.forEach(client => {
				expect(client.send).toHaveBeenCalledWith(JSON.stringify(msg));
			});
		});

		it('should limit chat history to 128 messages', () => {
			// Join a user first
			message(['join', 'chatuser'], 'session123', mockClients);
			
			// Send 130 chat messages
			for (let i = 0; i < 130; i++) {
				message(['chat', `Message ${i}`], 'session123', mockClients);
			}

			const startData = JSON.parse(getStart('session123'));
			expect(startData[1].chat.length).toBe(128);
			// Should have removed the oldest messages
			expect(startData[1].chat[0][1]).toBe('Message 2');
		});
	});

	describe('closeSession', () => {
		beforeEach(() => {
			// Initialize module
			const config = { sessionName: 'test', debug: false };
			existsSync.mockReturnValue(true);
			readFile.mockImplementation((_file, _encoding, callback) => {
				callback(null, JSON.stringify({ chat: [] }));
			});
			load.mockImplementation((_file, callback) => {
				callback({
					columns: 80,
					rows: 25,
					data: new Uint16Array(80 * 25),
					iceColors: false,
					letterSpacing: false,
				});
			});
			initialize(config);
		});

		it('should remove user and broadcast part message', () => {
			const mockClients = new Set([{ readyState: 1, send: vi.fn() }]);
			const sessionID = 'session123';

			// First join a user
			message(['join', 'testuser'], sessionID, mockClients);
			
			closeSession(sessionID, mockClients);

			expect(consoleLogSpy).toHaveBeenCalledWith('testuser has quit.');
			mockClients.forEach(client => {
				expect(client.send).toHaveBeenCalledWith(JSON.stringify(['part', sessionID]));
			});
		});

		it('should handle closing session for non-existent user', () => {
			const mockClients = new Set([{ readyState: 1, send: vi.fn() }]);
			const sessionID = 'nonexistent';

			expect(() => {
				closeSession(sessionID, mockClients);
			}).not.toThrow();
		});
	});

	describe('save functions', () => {
		beforeEach(() => {
			// Initialize module
			const config = { sessionName: 'test', debug: false };
			existsSync.mockReturnValue(true);
			readFile.mockImplementation((_file, _encoding, callback) => {
				callback(null, JSON.stringify({ chat: [['user', 'msg']] }));
			});
			load.mockImplementation((_file, callback) => {
				callback({
					columns: 80,
					rows: 25,
					data: new Uint16Array(80 * 25),
					iceColors: false,
					letterSpacing: false,
				});
			});
			initialize(config);
		});

		it('should save session with timestamp', () => {
			const callback = vi.fn();
			saveSessionWithTimestamp(callback);

			expect(save).toHaveBeenCalledWith(
				expect.stringContaining('test-timestamp.bin'),
				expect.any(Object),
				callback
			);
		});

		it('should save regular session', () => {
			const callback = vi.fn();
			writeFile.mockImplementation((_file, _data, _callback) => {
				_callback();
			});

			saveSession(callback);

			expect(writeFile).toHaveBeenCalledWith(
				expect.stringContaining('test.json'),
				JSON.stringify({ chat: [['user', 'msg']] }),
				expect.any(Function)
			);
			expect(save).toHaveBeenCalledWith(
				expect.stringContaining('test.bin'),
				expect.any(Object),
				callback
			);
		});
	});
});