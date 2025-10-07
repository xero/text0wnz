import { describe, it, expect } from 'vitest';

describe('Server Main Module', () => {
	describe('Module Structure', () => {
		it('should have correct module structure', async () => {
			// The main module is a bootstrapping module that runs on import
			// We test its dependencies and structure rather than runtime behavior
			const module = await import('../../../src/js/server/main.js');

			// Verify the module loads without errors
			expect(module).toBeDefined();
		});
	});

	describe('Configuration Module Tests', () => {
		it('should export parseArgs function', async () => {
			const { parseArgs } = await import('../../../src/js/server/config.js');

			// Test that parseArgs returns a configuration object
			const config = parseArgs();
			expect(config).toHaveProperty('port');
			expect(config).toHaveProperty('sessionName');
			expect(config).toHaveProperty('saveInterval');
			expect(config).toHaveProperty('ssl');
			expect(config).toHaveProperty('sslDir');
			expect(config).toHaveProperty('debug');
		});

		it('should have correct default values', async () => {
			const { parseArgs } = await import('../../../src/js/server/config.js');

			const config = parseArgs();
			expect(config.port).toBe(1337); // Default port
			expect(config.sessionName).toBe('joint'); // Default session name
			expect(config.saveInterval).toBe(30 * 60 * 1000); // 30 minutes in ms
			expect(config.ssl).toBe(false); // SSL disabled by default
			expect(config.sslDir).toBe('/etc/ssl/private'); // Default SSL dir
			expect(config.debug).toBe(false); // Debug off by default
		});

		it('should validate configuration types', async () => {
			const { parseArgs } = await import('../../../src/js/server/config.js');

			const config = parseArgs();
			expect(typeof config.port).toBe('number');
			expect(typeof config.sessionName).toBe('string');
			expect(typeof config.saveInterval).toBe('number');
			expect(typeof config.ssl).toBe('boolean');
			expect(typeof config.sslDir).toBe('string');
			expect(typeof config.debug).toBe('boolean');
		});

		it('should have valid port range', async () => {
			const { parseArgs } = await import('../../../src/js/server/config.js');

			const config = parseArgs();
			expect(config.port).toBeGreaterThan(0);
			expect(config.port).toBeLessThanOrEqual(65535);
		});

		it('should have valid save interval', async () => {
			const { parseArgs } = await import('../../../src/js/server/config.js');

			const config = parseArgs();
			expect(config.saveInterval).toBeGreaterThan(0);
			expect(config.saveInterval).toBe(30 * 60 * 1000); // Should be in milliseconds
		});
	});

	describe('Server Component Exports', () => {
		it('should export startServer function', async () => {
			const serverModule = await import('../../../src/js/server/server.js');

			expect(serverModule.startServer).toBeDefined();
			expect(typeof serverModule.startServer).toBe('function');
		});

		it('should export text0wnz default with initialize', async () => {
			const text0wnzModule = await import(
				'../../../src/js/server/text0wnz.js'
			);

			expect(text0wnzModule.default).toBeDefined();
			expect(typeof text0wnzModule.default.initialize).toBe('function');
			expect(typeof text0wnzModule.default.message).toBe('function');
			expect(typeof text0wnzModule.default.getImageData).toBe('function');
		});
	});

	describe('Module Dependency Integration', () => {
		it('should have all required server components available', async () => {
			// Verify all required modules are importable
			const configModule = await import('../../../src/js/server/config.js');
			const serverModule = await import('../../../src/js/server/server.js');
			const text0wnzModule = await import(
				'../../../src/js/server/text0wnz.js'
			);

			expect(configModule.parseArgs).toBeDefined();
			expect(serverModule.startServer).toBeDefined();
			expect(text0wnzModule.default.initialize).toBeDefined();
		});

		it('should have correct module types', async () => {
			const configModule = await import('../../../src/js/server/config.js');
			const serverModule = await import('../../../src/js/server/server.js');
			const text0wnzModule = await import(
				'../../../src/js/server/text0wnz.js'
			);

			expect(typeof configModule.parseArgs).toBe('function');
			expect(typeof serverModule.startServer).toBe('function');
			expect(typeof text0wnzModule.default).toBe('object');
		});

		it('should export utils module functions', async () => {
			const utilsModule = await import('../../../src/js/server/utils.js');

			expect(utilsModule.printHelp).toBeDefined();
			expect(typeof utilsModule.printHelp).toBe('function');
			expect(utilsModule.cleanHeaders).toBeDefined();
			expect(typeof utilsModule.cleanHeaders).toBe('function');
			expect(utilsModule.createTimestampedFilename).toBeDefined();
			expect(typeof utilsModule.createTimestampedFilename).toBe('function');
		});
	});

	describe('Configuration Validation', () => {
		it('should validate session name is not empty', async () => {
			const { parseArgs } = await import('../../../src/js/server/config.js');

			const config = parseArgs();
			expect(config.sessionName).toBeTruthy();
			expect(config.sessionName.length).toBeGreaterThan(0);
		});

		it('should validate SSL directory path format', async () => {
			const { parseArgs } = await import('../../../src/js/server/config.js');

			const config = parseArgs();
			expect(config.sslDir).toBeTruthy();
			expect(config.sslDir).toMatch(/^\/|^[A-Za-z]:\\/); // Starts with / (Unix) or drive letter (Windows)
		});

		it('should have numeric save interval', async () => {
			const { parseArgs } = await import('../../../src/js/server/config.js');

			const config = parseArgs();
			expect(Number.isFinite(config.saveInterval)).toBe(true);
			expect(config.saveInterval).toBeGreaterThan(0);
		});
	});
});


