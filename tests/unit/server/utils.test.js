import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	printHelp,
	cleanHeaders,
	createTimestampedFilename,
	sanitize,
	anonymizeIp,
	callout,
} from '../../../src/js/server/utils.js';

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
				expect.stringContaining('teXt0wnz backend server'),
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Usage: {bun,node} server [port] [options]'),
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('--ssl'),
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('--debug'),
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
			Date.prototype.toISOString = vi
				.fn()
				.mockReturnValue('2023-12-25T10:30:45.123Z');
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

	describe('sanitize', () => {
		it('should sanitize normal strings with quotes', () => {
			const result = sanitize('Hello World', 100, true);
			expect(result).toBe("'Hello World'");
		});

		it('should sanitize strings without quotes when quote is false', () => {
			const result = sanitize('Hello World', 100, false);
			expect(result).toBe('Hello World');
		});

		it('should handle null input', () => {
			const result = sanitize(null, 100, true);
			expect(result).toBe('');
		});

		it('should handle undefined input', () => {
			const result = sanitize(undefined, 100, true);
			expect(result).toBe('');
		});

		it('should trim whitespace', () => {
			const result = sanitize('  Hello World  ', 100, false);
			expect(result).toBe('Hello World');
		});

		it('should remove newlines', () => {
			const result = sanitize('Hello\nWorld\r\nTest', 100, false);
			expect(result).toBe('HelloWorldTest');
		});

		it('should remove Unicode control characters', () => {
			const result = sanitize('Hello\x00World\x1F', 100, false);
			expect(result).toBe('HelloWorld');
		});

		it('should limit string length', () => {
			const longString = 'a'.repeat(200);
			const result = sanitize(longString, 50, false);
			expect(result).toBe('a'.repeat(50));
		});

		it('should convert non-string inputs to string', () => {
			const result = sanitize(12345, 100, false);
			expect(result).toBe('12345');
		});

		it('should use default limit of 100 when not specified', () => {
			const longString = 'a'.repeat(200);
			const result = sanitize(longString);
			expect(result.length).toBe(102); // 100 chars + 2 quotes
		});

		it('should use default quote=true when not specified', () => {
			const result = sanitize('test');
			expect(result).toBe("'test'");
		});
	});

	describe('anonymizeIp', () => {
		describe('IPv4 addresses', () => {
			it('should anonymize standard IPv4 addresses', () => {
				expect(anonymizeIp('192.168.1.100')).toBe('192.168.1.X');
				expect(anonymizeIp('10.0.0.1')).toBe('10.0.0.X');
				expect(anonymizeIp('172.16.254.1')).toBe('172.16.254.X');
			});

			it('should handle IPv4-mapped IPv6 addresses', () => {
				expect(anonymizeIp('::ffff:192.168.1.100')).toBe('192.168.1.X');
				expect(anonymizeIp('::ffff:10.0.0.1')).toBe('10.0.0.X');
			});

			it('should return "invalid ip" for malformed IPv4', () => {
				expect(anonymizeIp('192.168.1')).toBe('invalid ip');
				expect(anonymizeIp('192.168.1.1.1')).toBe('invalid ip');
			});
		});

		describe('IPv6 addresses', () => {
			it('should anonymize full IPv6 addresses', () => {
				const result = anonymizeIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
				expect(result).toBe('2001:0db8:85a3:0000:X:X:X:X');
			});

			it('should anonymize compressed IPv6 addresses', () => {
				const result = anonymizeIp('2001:db8::1');
				expect(result).toBe('2001:db8:0:0:X:X:X:X');
			});

			it('should handle IPv6 with double colon at start', () => {
				const result = anonymizeIp('::1');
				expect(result).toBe('0:0:0:0:X:X:X:X');
			});

			it('should handle IPv6 with double colon at end', () => {
				const result = anonymizeIp('fe80::');
				expect(result).toBe('fe80:0:0:0:X:X:X:X');
			});

			it('should handle IPv6 with double colon in middle', () => {
				const result = anonymizeIp('2001:db8::8a2e:370:7334');
				expect(result).toBe('2001:db8:0:0:X:X:X:X');
			});

			it('should return "invalid ip" for malformed IPv6', () => {
				expect(anonymizeIp('2001:db8')).toBe('invalid ip');
				// Note: anonymizeIp doesn't validate hex characters, only structure
			});
		});

		describe('Edge cases', () => {
			it('should handle null/undefined/empty input', () => {
				expect(anonymizeIp(null)).toBe('unknown');
				expect(anonymizeIp(undefined)).toBe('unknown');
				expect(anonymizeIp('')).toBe('unknown');
			});

			it('should handle malformed input', () => {
				expect(anonymizeIp('not-an-ip')).toBe('unknown');
				expect(anonymizeIp('192.168')).toBe('invalid ip');
			});
		});
	});

	describe('callout', () => {
		let consoleLogSpy;

		beforeEach(() => {
			consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should print a callout box with sanitized message', () => {
			callout('Test message');

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('╓─────'),
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Test message'),
			);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('╙───────────────────────────────── ─ ─'),
			);
		});

		it('should sanitize the message', () => {
			callout('Test\nWith\rNewlines');

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('TestWithNewlines'),
			);
		});

		it('should limit message length to 100 chars', () => {
			const longMsg = 'a'.repeat(200);
			callout(longMsg);

			const call = consoleLogSpy.mock.calls[0][0];
			// The message should be truncated to 100 chars (not counting the box chars)
			expect(call).toContain('a'.repeat(100));
			expect(call).not.toContain('a'.repeat(150));
		});
	});
});
