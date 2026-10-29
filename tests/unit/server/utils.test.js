import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	printHelp,
	sanitize,
	callout,
	authCooldownMs,
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

	describe('sanitize', () => {
		it('should sanitize normal strings with quotes', () => {
			const result = sanitize('Hello World', 100, true);
			expect(result).toBe('\'Hello World\'');
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
			expect(result).toBe('\'test\'');
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
			expect(call).toContain('a'.repeat(100));
			expect(call).not.toContain('a'.repeat(150));
		});
	});

	describe('authCooldownMs', () => {
		it('gives two free tries then doubles to a 30s cap', () => {
			expect(authCooldownMs(1)).toBe(0);
			expect(authCooldownMs(2)).toBe(0);
			expect(authCooldownMs(3)).toBe(500);
			expect(authCooldownMs(4)).toBe(1000);
			expect(authCooldownMs(9)).toBe(30_000);
			expect(authCooldownMs(50)).toBe(30_000);
		});
	});
});
