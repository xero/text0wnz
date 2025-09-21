import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printHelp, cleanHeaders, createTimestampedFilename } from '../../../src/js/server/utils.js';

describe('Utils Module', () => {
	describe('printHelp', () => {
		let consoleLogSpy;
		let processExitSpy;

		beforeEach(() => {
			consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
			processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should print help message and exit', () => {
			printHelp();

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('teXt0wnz backend server')
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Usage: {bun,node} server.js [port] [options]')
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('--ssl')
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('--debug')
			);
			expect(processExitSpy).toHaveBeenCalledWith(0);
		});
	});

	describe('cleanHeaders', () => {
		it('should redact sensitive headers', () => {
			const headers = {
				'authorization': 'Bearer token123',
				'cookie': 'sessionid=abc123',
				'set-cookie': 'auth=xyz789',
				'proxy-authorization': 'Basic credentials',
				'x-api-key': 'secret-key',
				'content-type': 'application/json',
				'user-agent': 'Mozilla/5.0',
			};

			const cleaned = cleanHeaders(headers);

			expect(cleaned.authorization).toBe('[REDACTED]');
			expect(cleaned.cookie).toBe('[REDACTED]');
			expect(cleaned['set-cookie']).toBe('[REDACTED]');
			expect(cleaned['proxy-authorization']).toBe('[REDACTED]');
			expect(cleaned['x-api-key']).toBe('[REDACTED]');
			// Non-sensitive headers should remain unchanged
			expect(cleaned['content-type']).toBe('application/json');
			expect(cleaned['user-agent']).toBe('Mozilla/5.0');
		});

		it('should handle case-insensitive header names', () => {
			const headers = {
				'Authorization': 'Bearer token123',
				'COOKIE': 'sessionid=abc123',
				'Content-Type': 'application/json',
			};

			const cleaned = cleanHeaders(headers);

			expect(cleaned.Authorization).toBe('[REDACTED]');
			expect(cleaned.COOKIE).toBe('[REDACTED]');
			expect(cleaned['Content-Type']).toBe('application/json');
		});

		it('should handle empty headers object', () => {
			const headers = {};
			const cleaned = cleanHeaders(headers);

			expect(cleaned).toEqual({});
		});

		it('should not modify the original headers object', () => {
			const headers = {
				'authorization': 'Bearer token123',
				'content-type': 'application/json',
			};
			const originalHeaders = { ...headers };

			cleanHeaders(headers);

			expect(headers).toEqual(originalHeaders);
		});
	});

	describe('createTimestampedFilename', () => {
		let originalToISOString;

		beforeEach(() => {
			// Mock Date.prototype.toISOString to return a consistent timestamp
			originalToISOString = Date.prototype.toISOString;
			Date.prototype.toISOString = vi.fn().mockReturnValue('2023-12-25T10:30:45.123Z');
		});

		afterEach(() => {
			// Restore original toISOString
			Date.prototype.toISOString = originalToISOString;
		});

		it('should create timestamped filename with session name and extension', () => {
			const filename = createTimestampedFilename('myart', 'bin');
			
			expect(filename).toBe('myart-2023-12-25T10-30-45.123Z.bin');
		});

		it('should replace colons with hyphens for Windows compatibility', () => {
			const filename = createTimestampedFilename('session', 'json');
			
			// Should not contain colons
			expect(filename).not.toContain(':');
			// Should contain hyphens where colons were
			expect(filename).toBe('session-2023-12-25T10-30-45.123Z.json');
		});

		it('should work with different session names and extensions', () => {
			const filename1 = createTimestampedFilename('art-session', 'backup');
			const filename2 = createTimestampedFilename('collaborative', 'data');
			
			expect(filename1).toBe('art-session-2023-12-25T10-30-45.123Z.backup');
			expect(filename2).toBe('collaborative-2023-12-25T10-30-45.123Z.data');
		});

		it('should handle empty session name', () => {
			const filename = createTimestampedFilename('', 'bin');
			
			expect(filename).toBe('-2023-12-25T10-30-45.123Z.bin');
		});

		it('should handle session names with special characters', () => {
			const filename = createTimestampedFilename('my-art_session.v2', 'bin');
			
			expect(filename).toBe('my-art_session.v2-2023-12-25T10-30-45.123Z.bin');
		});
	});
});