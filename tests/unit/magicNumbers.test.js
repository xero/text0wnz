import { describe, it, expect } from 'vitest';
import magicNumbers from '../../src/js/client/magicNumbers.js';

describe('Magic Numbers Constants', () => {
	describe('Font Constants', () => {
		it('should export default font name', () => {
			expect(magicNumbers.DEFAULT_FONT).toBe('CP437 8x16');
			expect(typeof magicNumbers.DEFAULT_FONT).toBe('string');
		});

		it('should export default font dimensions', () => {
			expect(magicNumbers.DEFAULT_FONT_WIDTH).toBe(8);
			expect(magicNumbers.DEFAULT_FONT_HEIGHT).toBe(16);
			expect(typeof magicNumbers.DEFAULT_FONT_WIDTH).toBe('number');
			expect(typeof magicNumbers.DEFAULT_FONT_HEIGHT).toBe('number');
		});

		it('should export NFO font name', () => {
			expect(magicNumbers.NFO_FONT).toBe('Topaz-437 8x16');
			expect(typeof magicNumbers.NFO_FONT).toBe('string');
		});
	});

	describe('Color Constants', () => {
		it('should export basic color values', () => {
			expect(magicNumbers.COLOR_WHITE).toBe(7);
			expect(magicNumbers.COLOR_BLACK).toBe(0);
		});

		it('should export default foreground and background', () => {
			expect(magicNumbers.DEFAULT_FOREGROUND).toBe(7);
			expect(magicNumbers.DEFAULT_BACKGROUND).toBe(0);
		});

		it('should have valid color indices', () => {
			expect(magicNumbers.COLOR_BLACK).toBeGreaterThanOrEqual(0);
			expect(magicNumbers.COLOR_BLACK).toBeLessThan(16);
			expect(magicNumbers.COLOR_WHITE).toBeGreaterThanOrEqual(0);
			expect(magicNumbers.COLOR_WHITE).toBeLessThan(16);
		});
	});

	describe('Character Constants', () => {
		it('should export the character codes', () => {
			expect(magicNumbers.CHAR_NULL).toBe(0);
			expect(magicNumbers.CHAR_SPACE).toBe(32);
			expect(magicNumbers.CHAR_SLASH).toBe(47);
			expect(magicNumbers.CHAR_PIPE).toBe(124);
			expect(magicNumbers.CHAR_CAPITAL_X).toBe(88);
		});
	});

	describe('Application Constants', () => {
		it('should export paste limit multiplier', () => {
			expect(magicNumbers.PASTE_LIMIT_MULTIPLIER).toBe(3);
			expect(typeof magicNumbers.PASTE_LIMIT_MULTIPLIER).toBe('number');
		});

		it('should export canvas resize limits', () => {
			expect(magicNumbers.MAX_COLUMNS).toBe(1000);
			expect(magicNumbers.MAX_ROWS).toBe(10000);
			expect(magicNumbers.RESIZE_WARN_CELLS).toBe(300000);
		});

		it('should have positive application constants', () => {
			expect(magicNumbers.PASTE_LIMIT_MULTIPLIER).toBeGreaterThan(0);
		});
	});

	describe('Constant Relationships', () => {
		it('should have consistent default colors', () => {
			expect(magicNumbers.DEFAULT_FOREGROUND).toBe(magicNumbers.COLOR_WHITE);
			expect(magicNumbers.DEFAULT_BACKGROUND).toBe(magicNumbers.COLOR_BLACK);
		});
	});

	describe('Module Exports', () => {
		it('should export all constants as an object', () => {
			expect(magicNumbers).toBeDefined();
			expect(typeof magicNumbers).toBe('object');
		});

		it('should not be undefined for any exported constant', () => {
			const keys = Object.keys(magicNumbers);
			expect(keys.length).toBeGreaterThan(0);

			keys.forEach(key => {
				expect(magicNumbers[key]).toBeDefined();
			});
		});

		it('should export expected number of constants', () => {
			const keys = Object.keys(magicNumbers);
			expect(keys.length).toBeGreaterThanOrEqual(23);
		});

		it('should have immutable exports', () => {
			expect(Object.isFrozen(magicNumbers)).toBe(true);
			expect(() => {
				magicNumbers.DEFAULT_FONT = 'NewFont';
			}).toThrow(TypeError);
			expect(magicNumbers.DEFAULT_FONT).toBe('CP437 8x16');
		});
	});
});
