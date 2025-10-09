import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseArgs } from '../../../src/js/server/config.js';

describe('Config Module - parseArgs', () => {
	let originalArgv;
	let consoleLogSpy;
	let processExitSpy;

	beforeEach(() => {
		// Store original argv
		originalArgv = process.argv;
		// Mock console.log and process.exit to avoid side effects
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
	});

	afterEach(() => {
		// Restore original argv
		process.argv = originalArgv;
		vi.restoreAllMocks();
	});

	it('should return default configuration when no arguments provided', () => {
		process.argv = ['node', 'server.js'];
		const config = parseArgs();

		expect(config).toEqual({
			ssl: false,
			sslDir: '/etc/ssl/private',
			saveInterval: 30 * 60 * 1000, // 30 minutes
			sessionName: 'joint',
			debug: false,
			port: 1337,
		});
	});

	it('should parse SSL flag correctly', () => {
		process.argv = ['node', 'server.js', '--ssl'];
		const config = parseArgs();

		expect(config.ssl).toBe(true);
	});

	it('should parse debug flag correctly', () => {
		process.argv = ['node', 'server.js', '--debug'];
		const config = parseArgs();

		expect(config.debug).toBe(true);
		expect(consoleLogSpy).toHaveBeenCalledWith('Server configuration:', config);
	});

	it('should parse port number correctly', () => {
		process.argv = ['node', 'server.js', '8080'];
		const config = parseArgs();

		expect(config.port).toBe(8080);
	});

	it('should parse SSL directory correctly', () => {
		process.argv = ['node', 'server.js', '--ssl-dir', '/custom/ssl/path'];
		const config = parseArgs();

		expect(config.sslDir).toBe('/custom/ssl/path');
	});

	it('should parse save interval correctly', () => {
		process.argv = ['node', 'server.js', '--save-interval', '60'];
		const config = parseArgs();

		expect(config.saveInterval).toBe(60 * 60 * 1000); // 60 minutes in milliseconds
	});

	it('should parse session name correctly', () => {
		process.argv = ['node', 'server.js', '--session-name', 'myart'];
		const config = parseArgs();

		expect(config.sessionName).toBe('myart');
	});

	it('should ignore invalid port numbers', () => {
		process.argv = ['node', 'server.js', 'invalid-port'];
		const config = parseArgs();

		expect(config.port).toBe(1337); // Should remain default
	});

	it('should ignore port numbers out of range', () => {
		process.argv = ['node', 'server.js', '99999'];
		const config = parseArgs();

		expect(config.port).toBe(1337); // Should remain default
	});

	it('should ignore negative save interval', () => {
		process.argv = ['node', 'server.js', '--save-interval', '-10'];
		const config = parseArgs();

		expect(config.saveInterval).toBe(30 * 60 * 1000); // Should remain default
	});

	it('should handle multiple flags correctly', () => {
		process.argv = [
			'node',
			'server.js',
			'8080',
			'--ssl',
			'--debug',
			'--session-name',
			'test',
		];
		const config = parseArgs();

		expect(config).toEqual({
			ssl: true,
			sslDir: '/etc/ssl/private',
			saveInterval: 30 * 60 * 1000,
			sessionName: 'test',
			debug: true,
			port: 8080,
		});
	});

	it('should handle help flag and exit', () => {
		process.argv = ['node', 'server.js', '--help'];
		parseArgs();

		expect(processExitSpy).toHaveBeenCalledWith(0);
	});

	it('should skip flag arguments that start with --', () => {
		process.argv = ['node', 'server.js', '--ssl-dir', '--debug'];
		const config = parseArgs();

		expect(config.sslDir).toBe('/etc/ssl/private'); // Should remain default
		expect(config.debug).toBe(true); // Should be set
	});
});
