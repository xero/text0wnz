import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all the dependencies
vi.mock('http', () => ({
	createServer: vi.fn(() => ({
		listen: vi.fn(),
	})),
}));

vi.mock('https', () => ({
	createServer: vi.fn(() => ({
		listen: vi.fn(),
	})),
}));

vi.mock('fs', () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

vi.mock('express', () => ({
	default: vi.fn(() => ({
		use: vi.fn(),
		ws: vi.fn(),
	})),
	static: vi.fn(),
}));

vi.mock('express-session', () => ({
	default: vi.fn(),
}));

vi.mock('express-ws', () => ({
	default: vi.fn(),
}));

vi.mock('../../../src/js/server/utils.js', () => ({
	cleanHeaders: vi.fn(headers => headers),
}));

vi.mock('../../../src/js/server/websockets.js', () => ({
	webSocketInit: vi.fn(),
	onWebSocketConnection: vi.fn(),
}));

vi.mock('../../../src/js/server/text0wnz.js', () => ({
	default: {
		saveSessionWithTimestamp: vi.fn(),
		saveSession: vi.fn(),
	},
}));

// Import mocked modules
import { startServer } from '../../../src/js/server/server.js';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { existsSync, readFileSync } from 'fs';
import express from 'express';
import session from 'express-session';
import expressWs from 'express-ws';
import { webSocketInit, onWebSocketConnection } from '../../../src/js/server/websockets.js';
import text0wnz from '../../../src/js/server/text0wnz.js';

describe('Server Module', () => {
	let consoleLogSpy;
	let consoleErrorSpy;
	let processOnSpy;
	let setIntervalSpy;
	let mockServer;
	let mockApp;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();
		
		// Create mock objects
		mockServer = {
			listen: vi.fn((port, callback) => {
				if (callback) callback();
			}),
		};
		
		mockApp = {
			use: vi.fn(),
			ws: vi.fn(),
		};
		
		// Setup mock returns
		createHttpServer.mockReturnValue(mockServer);
		createHttpsServer.mockReturnValue(mockServer);
		express.default.mockReturnValue(mockApp);
		
		// Mock console methods
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		
		// Mock process.on and setInterval
		processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => {});
		setIntervalSpy = vi.spyOn(global, 'setInterval').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('HTTP Server Setup', () => {
		it('should create HTTP server when SSL is disabled', () => {
			const config = {
				ssl: false,
				port: 8080,
				debug: false,
				saveInterval: 30000,
			};

			startServer(config);

			expect(createHttpServer).toHaveBeenCalled();
			expect(createHttpsServer).not.toHaveBeenCalled();
			expect(consoleLogSpy).toHaveBeenCalledWith('Using HTTP server (SSL disabled)');
		});

		it('should create HTTPS server when SSL is enabled and certificates exist', () => {
			const config = {
				ssl: true,
				sslDir: '/test/ssl',
				port: 8080,
				debug: false,
				saveInterval: 30000,
			};

			// Mock certificate files exist
			existsSync.mockReturnValue(true);
			readFileSync.mockReturnValue('mock-cert-content');

			startServer(config);

			expect(createHttpsServer).toHaveBeenCalledWith({
				cert: 'mock-cert-content',
				key: 'mock-cert-content',
			});
			expect(consoleLogSpy).toHaveBeenCalledWith(
				'Using HTTPS server with SSL certificates from:',
				'/test/ssl'
			);
		});

		it('should fallback to HTTP when SSL certificates do not exist', () => {
			const config = {
				ssl: true,
				sslDir: '/nonexistent/ssl',
				port: 8080,
				debug: false,
				saveInterval: 30000,
			};

			// Mock certificate files do not exist
			existsSync.mockReturnValue(false);

			startServer(config);

			expect(createHttpServer).toHaveBeenCalled();
			expect(createHttpsServer).toHaveBeenCalled(); // Called but fails
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'SSL Error:',
				expect.stringContaining('SSL certificates not found')
			);
			expect(consoleLogSpy).toHaveBeenCalledWith('Falling back to HTTP server');
		});

		it('should fallback to HTTP when SSL certificate reading fails', () => {
			const config = {
				ssl: true,
				sslDir: '/test/ssl',
				port: 8080,
				debug: false,
				saveInterval: 30000,
			};

			existsSync.mockReturnValue(true);
			readFileSync.mockImplementation(() => {
				throw new Error('Permission denied');
			});

			startServer(config);

			expect(createHttpServer).toHaveBeenCalled();
			expect(consoleErrorSpy).toHaveBeenCalledWith('SSL Error:', expect.stringContaining('Permission denied'));
			expect(consoleLogSpy).toHaveBeenCalledWith('Falling back to HTTP server');
		});
	});

	describe('Express App Configuration', () => {
		it('should configure Express app with session middleware', () => {
			const config = {
				ssl: false,
				port: 8080,
				debug: false,
				saveInterval: 30000,
			};

			startServer(config);

			expect(express).toHaveBeenCalled();
			expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // session middleware
			expect(session).toHaveBeenCalledWith({
				resave: false,
				saveUninitialized: true,
				secret: 'sauce',
			});
		});

		it('should configure static file serving', () => {
			const config = {
				ssl: false,
				port: 8080,
				debug: false,
				saveInterval: 30000,
			};

			startServer(config);

			expect(express.static).toHaveBeenCalledWith('public');
			expect(mockApp.use).toHaveBeenCalledWith(expect.any(Function)); // static middleware
		});

		it('should configure WebSocket support', () => {
			const config = {
				ssl: false,
				port: 8080,
				debug: false,
				saveInterval: 30000,
			};

			startServer(config);

			expect(expressWs).toHaveBeenCalledWith(mockApp, mockServer);
		});

		it('should set up WebSocket routes', () => {
			const config = {
				ssl: false,
				port: 8080,
				debug: false,
				saveInterval: 30000,
			};

			startServer(config);

			expect(webSocketInit).toHaveBeenCalledWith(config, expect.any(Set));
			expect(mockApp.ws).toHaveBeenCalledWith('/', onWebSocketConnection);
			expect(mockApp.ws).toHaveBeenCalledWith('/server', onWebSocketConnection);
		});

		it('should add debug middleware when debug is enabled', () => {
			const config = {
				ssl: false,
				port: 8080,
				debug: true,
				saveInterval: 30000,
			};

			startServer(config);

			// Check that debug middleware was added
			expect(mockApp.use).toHaveBeenCalledWith('/server', expect.any(Function));
		});
	});

	describe('Server Startup', () => {
		it('should start server on specified port', () => {
			const config = {
				ssl: false,
				port: 3000,
				debug: false,
				saveInterval: 30000,
			};

			startServer(config);

			expect(mockServer.listen).toHaveBeenCalledWith(3000, expect.any(Function));
		});

		it('should log server start when debug is enabled', () => {
			const config = {
				ssl: false,
				port: 3000,
				debug: true,
				saveInterval: 30000,
			};

			startServer(config);

			expect(consoleLogSpy).toHaveBeenCalledWith('Server listening on port: 3000');
		});

		it('should not log server start when debug is disabled', () => {
			const config = {
				ssl: false,
				port: 3000,
				debug: false,
				saveInterval: 30000,
			};

			startServer(config);

			expect(consoleLogSpy).not.toHaveBeenCalledWith('Server listening on port: 3000');
		});
	});

	describe('Auto-save Setup', () => {
		it('should set up auto-save interval', () => {
			const config = {
				ssl: false,
				port: 8080,
				debug: false,
				saveInterval: 60000, // 1 minute
			};

			startServer(config);

			expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
		});

		it('should call save functions in interval', () => {
			let intervalCallback;
			setIntervalSpy.mockImplementation((callback, interval) => {
				intervalCallback = callback;
			});

			const config = {
				ssl: false,
				port: 8080,
				debug: false,
				saveInterval: 30000,
			};

			startServer(config);

			// Execute the interval callback
			intervalCallback();

			expect(text0wnz.saveSessionWithTimestamp).toHaveBeenCalledWith(expect.any(Function));
			expect(text0wnz.saveSession).toHaveBeenCalledWith(expect.any(Function));
		});
	});

	describe('Signal Handling', () => {
		it('should set up SIGINT handler', () => {
			const config = {
				ssl: false,
				port: 8080,
				debug: false,
				saveInterval: 30000,
			};

			startServer(config);

			expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
		});

		it('should save session on SIGINT', () => {
			let sigintHandler;
			processOnSpy.mockImplementation((signal, handler) => {
				if (signal === 'SIGINT') {
					sigintHandler = handler;
				}
			});

			const config = {
				ssl: false,
				port: 8080,
				debug: false,
				saveInterval: 30000,
			};

			startServer(config);

			// Mock process.exit
			const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

			// Execute SIGINT handler
			sigintHandler();

			expect(text0wnz.saveSession).toHaveBeenCalledWith(expect.any(Function));
			
			processExitSpy.mockRestore();
		});
	});
});