import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs module
vi.mock('fs', () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
}));

import { load, save } from '../../../src/js/server/fileio.js';
import { readFile, writeFile } from 'fs';

describe('FileIO Module', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('load', () => {
		it('should load file successfully and parse SAUCE data', async () => {
			// Create mock SAUCE data with proper structure
			const mockData = new Uint8Array(256); // Small test file
			
			// Add SAUCE signature at the end (128 bytes from end)
			const sauceStart = mockData.length - 128;
			const sauceSignature = new TextEncoder().encode('SAUCE00');
			mockData.set(sauceSignature, sauceStart);
			
			// Set columns and rows in SAUCE (little-endian)
			mockData[sauceStart + 96] = 80; // columns = 80
			mockData[sauceStart + 97] = 0;
			mockData[sauceStart + 99] = 25; // rows = 25
			mockData[sauceStart + 100] = 0;
			
			// Mock readFile to call callback with success
			readFile.mockImplementation((filename, callback) => {
				callback(null, Buffer.from(mockData));
			});

			const result = await new Promise(resolve => {
				load('test.bin', resolve);
			});

			expect(readFile).toHaveBeenCalledWith('test.bin', expect.any(Function));
			expect(result).toBeDefined();
			expect(result.columns).toBe(80);
			expect(result.rows).toBe(25);
			expect(result.data).toBeInstanceOf(Uint16Array);
			expect(result.iceColors).toBe(false);
			expect(result.letterSpacing).toBe(false);
		});

		it('should handle file not found error', async () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
			
			// Mock readFile to call callback with error
			readFile.mockImplementation((filename, callback) => {
				callback(new Error('ENOENT: no such file or directory'), null);
			});

			const result = await new Promise(resolve => {
				load('nonexistent.bin', resolve);
			});

			expect(readFile).toHaveBeenCalledWith('nonexistent.bin', expect.any(Function));
			expect(consoleLogSpy).toHaveBeenCalledWith('nonexistent.bin not found, generating new canvas');
			expect(result).toBeUndefined();
			
			consoleLogSpy.mockRestore();
		});

		it('should handle file without SAUCE data', async () => {
			// Create mock data without SAUCE signature
			const mockData = new Uint8Array(160 * 25 * 2); // 160x25 canvas
			
			// Mock readFile to call callback with success
			readFile.mockImplementation((filename, callback) => {
				callback(null, Buffer.from(mockData));
			});

			const result = await new Promise(resolve => {
				load('nosaucetest.bin', resolve);
			});

			expect(result).toBeDefined();
			expect(result.columns).toBe(160); // Default columns
			expect(result.rows).toBeUndefined(); // No SAUCE means no row info
			expect(result.iceColors).toBe(false);
			expect(result.letterSpacing).toBe(false);
		});

		it('should parse SAUCE with ice colors and letter spacing flags', async () => {
			const mockData = new Uint8Array(256);
			
			// Add SAUCE signature
			const sauceStart = mockData.length - 128;
			const sauceSignature = new TextEncoder().encode('SAUCE00');
			mockData.set(sauceSignature, sauceStart);
			
			// Set flags: bit 0 = ice colors, bit 1 shifted by 1 = letter spacing
			mockData[sauceStart + 105] = 0x01 | (0x02 << 1); // Both flags set
			
			// Set columns and rows
			mockData[sauceStart + 96] = 80;
			mockData[sauceStart + 97] = 0;
			mockData[sauceStart + 99] = 25;
			mockData[sauceStart + 100] = 0;

			readFile.mockImplementation((filename, callback) => {
				callback(null, Buffer.from(mockData));
			});

			const result = await new Promise(resolve => {
				load('test.bin', resolve);
			});

			expect(result.iceColors).toBe(true);
			expect(result.letterSpacing).toBe(true);
		});
	});

	describe('save', () => {
		it('should save file with SAUCE data', async () => {
			const mockImageData = {
				columns: 80,
				rows: 25,
				data: new Uint16Array(80 * 25), // Mock canvas data
				iceColors: true,
				letterSpacing: false,
			};

			// Mock writeFile to call callback with success
			writeFile.mockImplementation((filename, data, callback) => {
				callback();
			});

			const callbackSpy = vi.fn();
			
			save('test.bin', mockImageData, callbackSpy);

			// Wait for writeFile to be called
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(writeFile).toHaveBeenCalledWith(
				'test.bin',
				expect.any(Buffer),
				expect.any(Function)
			);
			expect(callbackSpy).toHaveBeenCalled();
		});

		it('should save file without callback', async () => {
			const mockImageData = {
				columns: 80,
				rows: 25,
				data: new Uint16Array(80 * 25),
				iceColors: false,
				letterSpacing: true,
			};

			writeFile.mockImplementation((filename, data, callback) => {
				callback();
			});
			
			// Should not throw when no callback provided
			expect(() => {
				save('test.bin', mockImageData);
			}).not.toThrow();

			await new Promise(resolve => setTimeout(resolve, 0));
			expect(writeFile).toHaveBeenCalled();
		});

		it('should create proper SAUCE structure in saved data', async () => {
			const mockImageData = {
				columns: 80,
				rows: 25,
				data: new Uint16Array(10), // Small data for testing
				iceColors: true,
				letterSpacing: false,
			};

			let savedBuffer;
			writeFile.mockImplementation((filename, data, callback) => {
				savedBuffer = data;
				callback();
			});

			save('test.bin', mockImageData);
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(savedBuffer).toBeInstanceOf(Buffer);
			// Check that SAUCE signature is present at the end
			const sauceStart = savedBuffer.length - 128;
			const sauceSignature = savedBuffer.subarray(sauceStart, sauceStart + 7).toString();
			expect(sauceSignature).toBe('SAUCE00');
		});

		it('should handle different canvas sizes', async () => {
			const smallCanvas = {
				columns: 40,
				rows: 10,
				data: new Uint16Array(40 * 10),
				iceColors: false,
				letterSpacing: false,
			};

			writeFile.mockImplementation((filename, data, callback) => {
				callback();
			});

			expect(() => {
				save('small.bin', smallCanvas);
			}).not.toThrow();

			await new Promise(resolve => setTimeout(resolve, 0));
			expect(writeFile).toHaveBeenCalled();
		});
	});

	describe('Internal functions behavior', () => {
		it('should handle binary data conversion correctly', async () => {
			// Test the conversion from Uint16Array to Uint8Array format
			const testData = new Uint16Array([0x4141, 0x0742, 0x1234]); // Test values
			const mockImageData = {
				columns: 3,
				rows: 1,
				data: testData,
				iceColors: false,
				letterSpacing: false,
			};

			let savedBuffer;
			writeFile.mockImplementation((filename, data, callback) => {
				savedBuffer = data;
				callback();
			});

			save('test.bin', mockImageData);
			await new Promise(resolve => setTimeout(resolve, 0));

			// Verify the binary data is correctly converted
			// The first part should be the canvas data (before SAUCE)
			expect(savedBuffer.length).toBeGreaterThan(testData.length * 2);
			
			// Check first few bytes match expected conversion
			expect(savedBuffer[0]).toBe(0x41); // High byte of 0x4141
			expect(savedBuffer[1]).toBe(0x41); // Low byte of 0x4141
			expect(savedBuffer[2]).toBe(0x07); // High byte of 0x0742
			expect(savedBuffer[3]).toBe(0x42); // Low byte of 0x0742
		});
	});
});