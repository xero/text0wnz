import { describe, it, expect } from 'vitest';
import { Compression } from '../../src/js/client/compression.js';

describe('Compression Utilities', () => {
	describe('RLE Compression', () => {
		it('should compress uniform data effectively', () => {
			// Create array with repeating values
			const input = new Uint16Array(100);
			for (let i = 0; i < 100; i++) {
				input[i] = 42;
			}

			const compressed = Compression.compressUint16Array(input);
			expect(compressed).not.toBeNull();
			expect(compressed.length).toBeLessThan(input.length);
		});

		it('should not compress random data (return null)', () => {
			// Create array with random values
			const input = new Uint16Array(100);
			for (let i = 0; i < 100; i++) {
				input[i] = Math.floor(Math.random() * 65536);
			}

			const compressed = Compression.compressUint16Array(input);
			// Random data should not compress well
			expect(compressed).toBeNull();
		});

		it('should handle empty array', () => {
			const input = new Uint16Array(0);
			const compressed = Compression.compressUint16Array(input);
			expect(compressed).toBeNull();
		});

		it('should handle null input', () => {
			const compressed = Compression.compressUint16Array(null);
			expect(compressed).toBeNull();
		});

		it('should compress data with runs of different values', () => {
			const input = new Uint16Array(100);
			// First 50 are value 1, next 50 are value 2
			for (let i = 0; i < 50; i++) {
				input[i] = 1;
			}
			for (let i = 50; i < 100; i++) {
				input[i] = 2;
			}

			const compressed = Compression.compressUint16Array(input);
			expect(compressed).not.toBeNull();
			// Should be [50, 1, 50, 2] = 4 values
			expect(compressed.length).toBe(4);
			expect(compressed[0]).toBe(50); // count
			expect(compressed[1]).toBe(1); // value
			expect(compressed[2]).toBe(50); // count
			expect(compressed[3]).toBe(2); // value
		});
	});

	describe('RLE Decompression', () => {
		it('should decompress data correctly', () => {
			const original = new Uint16Array(100);
			for (let i = 0; i < 50; i++) {
				original[i] = 1;
			}
			for (let i = 50; i < 100; i++) {
				original[i] = 2;
			}

			const compressed = Compression.compressUint16Array(original);
			const decompressed = Compression.decompressToUint16Array(
				compressed,
				original.length,
			);

			expect(decompressed.length).toBe(original.length);
			for (let i = 0; i < original.length; i++) {
				expect(decompressed[i]).toBe(original[i]);
			}
		});

		it('should handle null compressed data', () => {
			const decompressed = Compression.decompressToUint16Array(null, 100);
			expect(decompressed).toBeNull();
		});

		it('should handle empty compressed data', () => {
			const compressed = new Uint32Array(0);
			const decompressed = Compression.decompressToUint16Array(compressed, 100);
			expect(decompressed).toBeNull();
		});

		it('should correctly decompress multiple runs', () => {
			const compressed = new Uint32Array([10, 5, 20, 10, 30, 15]);
			const decompressed = Compression.decompressToUint16Array(compressed, 60);

			expect(decompressed.length).toBe(60);

			// First 10 values should be 5
			for (let i = 0; i < 10; i++) {
				expect(decompressed[i]).toBe(5);
			}

			// Next 20 values should be 10
			for (let i = 10; i < 30; i++) {
				expect(decompressed[i]).toBe(10);
			}

			// Last 30 values should be 15
			for (let i = 30; i < 60; i++) {
				expect(decompressed[i]).toBe(15);
			}
		});
	});

	describe('Base64 Conversion', () => {
		it('should convert compressed data to base64', () => {
			const compressed = new Uint32Array([50, 1, 50, 2]);
			const base64 = Compression.compressedToBase64(compressed);

			expect(typeof base64).toBe('string');
			expect(base64.length).toBeGreaterThan(0);
		});

		it('should convert base64 back to compressed data', () => {
			const original = new Uint32Array([50, 1, 50, 2]);
			const base64 = Compression.compressedToBase64(original);
			const restored = Compression.base64ToCompressed(base64);

			expect(restored.length).toBe(original.length);
			for (let i = 0; i < original.length; i++) {
				expect(restored[i]).toBe(original[i]);
			}
		});

		it('should handle round-trip compression and base64 conversion', () => {
			const original = new Uint16Array(1000);
			// Create data with some repetition
			for (let i = 0; i < 500; i++) {
				original[i] = 10;
			}
			for (let i = 500; i < 1000; i++) {
				original[i] = 20;
			}

			// Compress
			const compressed = Compression.compressUint16Array(original);
			expect(compressed).not.toBeNull();

			// Convert to base64
			const base64 = Compression.compressedToBase64(compressed);

			// Convert back from base64
			const restoredCompressed = Compression.base64ToCompressed(base64);

			// Decompress
			const decompressed = Compression.decompressToUint16Array(
				restoredCompressed,
				original.length,
			);

			// Verify data integrity
			expect(decompressed.length).toBe(original.length);
			for (let i = 0; i < original.length; i++) {
				expect(decompressed[i]).toBe(original[i]);
			}
		});
	});

	describe('Edge Cases', () => {
		it('should handle maximum run length (65535)', () => {
			const input = new Uint16Array(65535);
			for (let i = 0; i < 65535; i++) {
				input[i] = 123;
			}

			const compressed = Compression.compressUint16Array(input);
			expect(compressed).not.toBeNull();
			expect(compressed.length).toBe(2); // [65535, 123]
		});

		it('should handle runs longer than 65535', () => {
			const input = new Uint16Array(100000);
			for (let i = 0; i < 100000; i++) {
				input[i] = 456;
			}

			const compressed = Compression.compressUint16Array(input);
			expect(compressed).not.toBeNull();
			// Should split into multiple runs
			expect(compressed.length).toBeGreaterThan(2);
		});

		it('should handle single element array', () => {
			const input = new Uint16Array([42]);
			const compressed = Compression.compressUint16Array(input);

			// Single element won't compress well
			expect(compressed).toBeNull();
		});

		it('should handle alternating values (worst case)', () => {
			const input = new Uint16Array(100);
			for (let i = 0; i < 100; i++) {
				input[i] = i % 2; // Alternates between 0 and 1
			}

			const compressed = Compression.compressUint16Array(input);
			// Alternating values won't compress well
			expect(compressed).toBeNull();
		});
	});
});
