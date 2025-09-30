import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules that UI depends on
vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

vi.mock('../../src/js/client/toolbar.js', () => ({ default: {} }));

// We'll test pure utility functions from ui.js
describe('UI Utilities', () => {
	describe('createCanvas', () => {
		beforeEach(() => {
			// Mock document.createElement for canvas
			global.document = {
				createElement: vi.fn(tagName => {
					if (tagName === 'canvas') {
						return {
							width: 0,
							height: 0,
						};
					}
					return {};
				}),
				getElementById: vi.fn(id => ({ id })),
				querySelector: vi.fn(selector => ({ selector })),
				querySelectorAll: vi.fn(selector => [
					{ selector, idx: 0 },
					{ selector, idx: 1 }
				]),
			};
		});

		it('should create a canvas with specified dimensions', async () => {
			// Import the module after setting up mocks
			const { createCanvas } = await import('../../src/js/client/ui.js');

			const canvas = createCanvas(800, 600);

			expect(document.createElement).toHaveBeenCalledWith('canvas');
			expect(canvas.width).toBe(800);
			expect(canvas.height).toBe(600);
		});

		it('should handle different dimensions', async () => {
			const { createCanvas } = await import('../../src/js/client/ui.js');

			const smallCanvas = createCanvas(100, 50);
			expect(smallCanvas.width).toBe(100);
			expect(smallCanvas.height).toBe(50);

			const largeCanvas = createCanvas(1920, 1080);
			expect(largeCanvas.width).toBe(1920);
			expect(largeCanvas.height).toBe(1080);
		});
	});

	describe('UTF-8 byte counting utility', () => {
		it('should count ASCII characters correctly', () => {
			// Test the TextEncoder functionality directly since getUtf8Bytes is internal
			const encoder = new TextEncoder();

			expect(encoder.encode('hello').length).toBe(5);
			expect(encoder.encode('a').length).toBe(1);
			expect(encoder.encode('').length).toBe(0);
		});

		it('should count multi-byte UTF-8 characters correctly', () => {
			const encoder = new TextEncoder();

			// Unicode characters that require multiple bytes
			expect(encoder.encode('café').length).toBe(5); // é is 2 bytes
			expect(encoder.encode('🎨').length).toBe(4); // emoji is 4 bytes
			expect(encoder.encode('测试').length).toBe(6); // Chinese chars are 3 bytes each
		});

		it('should handle mixed ASCII and Unicode', () => {
			const encoder = new TextEncoder();

			const mixed = 'Hello 世界! 🌍';
			const bytes = encoder.encode(mixed);
			// H(1) e(1) l(1) l(1) o(1) space(1) 世(3) 界(3) !(1) space(1) 🌍(4) = 18 bytes
			expect(bytes.length).toBe(18);
		});
	});

	describe('DOM selector utilities', () => {
		beforeEach(() => {
			// Mock document for DOM selectors with proper bind support
			global.document = {
				getElementById: vi.fn(id => ({ id })),
				querySelector: vi.fn(selector => ({ selector })),
			};
			// Ensure the functions have bind method
			global.document.getElementById.bind = vi.fn().mockReturnValue(global.document.getElementById);
			global.document.querySelector.bind = vi.fn().mockReturnValue(global.document.querySelector);
		});

		it('should create shorthand selectors correctly', async () => {
			const { $, $$ } = await import('../../src/js/client/ui.js');

			const element = $('test-id');
			expect(element.id).toBe('test-id');

			const queryElement = $$('.test-class');
			expect(queryElement.selector).toBe('.test-class');
		});
	});

	describe('Text processing edge cases', () => {
		it('should handle empty strings and special values', () => {
			const encoder = new TextEncoder();

			expect(encoder.encode('').length).toBe(0);
			// TextEncoder in Node.js actually converts null/undefined to strings
			expect(encoder.encode(String(null)).length).toBe(4); // "null"
			expect(encoder.encode(String(undefined)).length).toBe(9); // "undefined"
		});

		it('should handle very long strings', () => {
			const encoder = new TextEncoder();

			// Test with a string longer than SAUCE_MAX_BYTES (16320)
			const longString = 'a'.repeat(20000);
			const bytes = encoder.encode(longString);
			expect(bytes.length).toBe(20000);
		});

		it('should handle special characters', () => {
			const encoder = new TextEncoder();

			const special = '\n\r\t\0';
			const bytes = encoder.encode(special);
			expect(bytes.length).toBe(4); // All single-byte characters
		});
	});
});
