import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock text0wnz module
vi.mock('../../../src/js/server/text0wnz.js', () => ({
	default: {
		getStart: vi.fn(),
		getImageData: vi.fn(),
		message: vi.fn(),
		closeSession: vi.fn(),
	},
}));

import { webSocketInit, onWebSocketConnection } from '../../../src/js/server/websockets.js';
import text0wnz from '../../../src/js/server/text0wnz.js';

describe('WebSockets Module', () => {
	let mockWs;
	let mockReq;
	let mockClients;
	let consoleLogSpy;
	let consoleErrorSpy;

	beforeEach(() => {
		// Create mock WebSocket
		mockWs = {
			send: vi.fn(),
			close: vi.fn(),
			on: vi.fn(),
			readyState: 1, // OPEN
		};

		// Create mock request
		mockReq = {
			sessionID: 'test-session-123',
			connection: { remoteAddress: '127.0.0.1' },
			ip: '127.0.0.1',
		};

		// Create mock clients set
		mockClients = new Set();

		// Mock console methods
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		// Reset mocks
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('webSocketInit', () => {
		it('should initialize with config and clients', () => {
			const config = { debug: true };
			const clients = new Set();

			// Should not throw
			expect(() => {
				webSocketInit(config, clients);
			}).not.toThrow();
		});

		it('should handle config without debug flag', () => {
			const config = {};
			const clients = new Set();

			expect(() => {
				webSocketInit(config, clients);
			}).not.toThrow();
		});
	});

	describe('onWebSocketConnection', () => {
		beforeEach(() => {
			// Initialize the module first
			webSocketInit({ debug: false }, mockClients);
		});

		it('should log connection details on new connection', () => {
			onWebSocketConnection(mockWs, mockReq);

			expect(consoleLogSpy).toHaveBeenCalledWith('╓───── New WebSocket Connection');
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining(`- Session ID: ${mockReq.sessionID}`)
			);
		});

		it('should add client to clients set', () => {
			expect(mockClients.size).toBe(0);
			
			onWebSocketConnection(mockWs, mockReq);
			
			expect(mockClients.has(mockWs)).toBe(true);
			expect(mockClients.size).toBe(1);
		});

		it('should send initial start data to client', () => {
			const mockStartData = JSON.stringify(['start', { columns: 80, rows: 25 }]);
			text0wnz.getStart.mockReturnValue(mockStartData);

			onWebSocketConnection(mockWs, mockReq);

			expect(text0wnz.getStart).toHaveBeenCalledWith(mockReq.sessionID);
			expect(mockWs.send).toHaveBeenCalledWith(mockStartData);
		});

		it('should send image data if available', () => {
			const mockImageData = { data: new ArrayBuffer(100) };
			text0wnz.getImageData.mockReturnValue(mockImageData);

			onWebSocketConnection(mockWs, mockReq);

			expect(text0wnz.getImageData).toHaveBeenCalled();
			expect(mockWs.send).toHaveBeenCalledWith(mockImageData.data, { binary: true });
		});

		it('should not send image data if not available', () => {
			text0wnz.getImageData.mockReturnValue(null);

			onWebSocketConnection(mockWs, mockReq);

			expect(text0wnz.getImageData).toHaveBeenCalled();
			// Should only have one call for start data, not for image data
			expect(mockWs.send).toHaveBeenCalledTimes(1);
		});

		it('should handle errors during initialization', () => {
			text0wnz.getStart.mockImplementation(() => {
				throw new Error('Start data error');
			});

			onWebSocketConnection(mockWs, mockReq);

			expect(consoleErrorSpy).toHaveBeenCalledWith('Error sending initial data:', expect.any(Error));
			expect(mockWs.close).toHaveBeenCalledWith(1011, 'Server error during initialization');
		});

		it('should set up message event handler', () => {
			onWebSocketConnection(mockWs, mockReq);

			expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
		});

		it('should set up close event handler', () => {
			onWebSocketConnection(mockWs, mockReq);

			expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
		});

		it('should set up error event handler', () => {
			onWebSocketConnection(mockWs, mockReq);

			expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));
		});

		it('should handle message events correctly', () => {
			let messageHandler;
			mockWs.on.mockImplementation((event, handler) => {
				if (event === 'message') {
					messageHandler = handler;
				}
			});

			onWebSocketConnection(mockWs, mockReq);

			// Simulate a message
			const testMessage = JSON.stringify(['draw', [1, 2, 3]]);
			messageHandler(testMessage);

			expect(text0wnz.message).toHaveBeenCalledWith(
				['draw', [1, 2, 3]],
				mockReq.sessionID,
				mockClients
			);
		});

		it('should handle malformed message events', () => {
			let messageHandler;
			mockWs.on.mockImplementation((event, handler) => {
				if (event === 'message') {
					messageHandler = handler;
				}
			});

			onWebSocketConnection(mockWs, mockReq);

			// Simulate malformed message
			const malformedMessage = 'invalid json';
			messageHandler(malformedMessage);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'Error parsing message:',
				expect.any(Error),
				malformedMessage
			);
			expect(text0wnz.message).not.toHaveBeenCalled();
		});

		it('should handle close events correctly', () => {
			let closeHandler;
			mockWs.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					closeHandler = handler;
				}
			});

			onWebSocketConnection(mockWs, mockReq);
			
			// Add to clients first
			expect(mockClients.has(mockWs)).toBe(true);

			// Simulate close event
			closeHandler(1000, 'Normal closure');

			expect(mockClients.has(mockWs)).toBe(false);
			expect(text0wnz.closeSession).toHaveBeenCalledWith(mockReq.sessionID, mockClients);
		});

		it('should handle error events correctly', () => {
			let errorHandler;
			mockWs.on.mockImplementation((event, handler) => {
				if (event === 'error') {
					errorHandler = handler;
				}
			});

			onWebSocketConnection(mockWs, mockReq);
			
			// Simulate error event
			const testError = new Error('WebSocket error');
			errorHandler(testError);

			expect(consoleErrorSpy).toHaveBeenCalledWith('WebSocket error:', testError);
			expect(mockClients.has(mockWs)).toBe(false);
		});

		it('should log additional debug info when debug is enabled', () => {
			// Reinitialize with debug enabled
			webSocketInit({ debug: true }, mockClients);

			onWebSocketConnection(mockWs, mockReq);

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining(`- Remote address: ${mockReq.connection.remoteAddress}`)
			);
		});

		it('should handle missing image data gracefully', () => {
			text0wnz.getImageData.mockReturnValue({ data: null });

			expect(() => {
				onWebSocketConnection(mockWs, mockReq);
			}).not.toThrow();

			// Should send start data but not image data
			expect(mockWs.send).toHaveBeenCalledTimes(1);
		});
	});
});