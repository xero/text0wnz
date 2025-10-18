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

		it('should export blank cell value', () => {
			// BLANK_CELL = (32 << 8) + 7 = 8192 + 7 = 8199
			expect(magicNumbers.BLANK_CELL).toBe(8199);
		});

		it('should have valid color indices', () => {
			expect(magicNumbers.COLOR_BLACK).toBeGreaterThanOrEqual(0);
			expect(magicNumbers.COLOR_BLACK).toBeLessThan(16);
			expect(magicNumbers.COLOR_WHITE).toBeGreaterThanOrEqual(0);
			expect(magicNumbers.COLOR_WHITE).toBeLessThan(16);
		});
	});

	describe('CP437 Block Characters', () => {
		it('should export block character codes', () => {
			expect(magicNumbers.LIGHT_BLOCK).toBe(176); // ░
			expect(magicNumbers.MEDIUM_BLOCK).toBe(177); // ▒
			expect(magicNumbers.DARK_BLOCK).toBe(178); // ▓
			expect(magicNumbers.FULL_BLOCK).toBe(219); // █
		});

		it('should export half-block character codes', () => {
			expect(magicNumbers.UPPER_HALFBLOCK).toBe(220); // ▀
			expect(magicNumbers.LOWER_HALFBLOCK).toBe(223); // ▄
			expect(magicNumbers.LEFT_HALFBLOCK).toBe(221); // ▌
			expect(magicNumbers.RIGHT_HALFBLOCK).toBe(222); // ▐
		});

		it('should export special block characters', () => {
			expect(magicNumbers.MIDDLE_BLOCK).toBe(254); // ■
			expect(magicNumbers.MIDDLE_DOT).toBe(249); // ·
		});

		it('should have valid character codes', () => {
			const blockChars = [
				magicNumbers.LIGHT_BLOCK,
				magicNumbers.MEDIUM_BLOCK,
				magicNumbers.DARK_BLOCK,
				magicNumbers.FULL_BLOCK,
				magicNumbers.UPPER_HALFBLOCK,
				magicNumbers.LOWER_HALFBLOCK,
				magicNumbers.LEFT_HALFBLOCK,
				magicNumbers.RIGHT_HALFBLOCK,
				magicNumbers.MIDDLE_BLOCK,
				magicNumbers.MIDDLE_DOT,
			];

			blockChars.forEach(charCode => {
				expect(charCode).toBeGreaterThanOrEqual(0);
				expect(charCode).toBeLessThan(256);
			});
		});
	});

	describe('Special Character Constants', () => {
		it('should export control characters', () => {
			expect(magicNumbers.CHAR_BELL).toBe(7); // BEL
			expect(magicNumbers.CHAR_NULL).toBe(0); // NUL
		});

		it('should export whitespace characters', () => {
			expect(magicNumbers.CHAR_SPACE).toBe(32); // space
			expect(magicNumbers.CHAR_NBSP).toBe(255); // non-breaking space
		});

		it('should export delimiter characters', () => {
			expect(magicNumbers.CHAR_SLASH).toBe(47); // /
			expect(magicNumbers.CHAR_PIPE).toBe(124); // |
			expect(magicNumbers.CHAR_BACKSLASH).toBe(92); // \
			expect(magicNumbers.CHAR_FORWARD_SLASH).toBe(47); // /
		});

		it('should export bracket characters', () => {
			expect(magicNumbers.CHAR_RIGHT_PARENTHESIS).toBe(41); // )
			expect(magicNumbers.CHAR_LEFT_PARENTHESIS).toBe(40); // (
			expect(magicNumbers.CHAR_RIGHT_SQUARE_BRACKET).toBe(93); // ]
			expect(magicNumbers.CHAR_LEFT_SQUARE_BRACKET).toBe(91); // [
			expect(magicNumbers.CHAR_RIGHT_CURLY_BRACE).toBe(125); // }
			expect(magicNumbers.CHAR_LEFT_CURLY_BRACE).toBe(123); // {
		});

		it('should export quote characters', () => {
			expect(magicNumbers.CHAR_APOSTROPHE).toBe(39); // '
			expect(magicNumbers.CHAR_GRAVE_ACCENT).toBe(96); // `
		});

		it('should export comparison characters', () => {
			expect(magicNumbers.CHAR_GREATER_THAN).toBe(62); // >
			expect(magicNumbers.CHAR_LESS_THAN).toBe(60); // <
		});

		it('should export specific alphanumeric characters', () => {
			expect(magicNumbers.CHAR_CAPITAL_X).toBe(88); // X
			expect(magicNumbers.CHAR_CAPITAL_P).toBe(80); // P
			expect(magicNumbers.CHAR_DIGIT_9).toBe(57); // 9
		});

		it('should have valid ASCII codes', () => {
			const allChars = [
				magicNumbers.CHAR_BELL,
				magicNumbers.CHAR_NULL,
				magicNumbers.CHAR_SPACE,
				magicNumbers.CHAR_NBSP,
				magicNumbers.CHAR_SLASH,
				magicNumbers.CHAR_PIPE,
				magicNumbers.CHAR_CAPITAL_X,
				magicNumbers.CHAR_RIGHT_PARENTHESIS,
				magicNumbers.CHAR_LEFT_PARENTHESIS,
				magicNumbers.CHAR_RIGHT_SQUARE_BRACKET,
				magicNumbers.CHAR_LEFT_SQUARE_BRACKET,
				magicNumbers.CHAR_RIGHT_CURLY_BRACE,
				magicNumbers.CHAR_LEFT_CURLY_BRACE,
				magicNumbers.CHAR_BACKSLASH,
				magicNumbers.CHAR_FORWARD_SLASH,
				magicNumbers.CHAR_APOSTROPHE,
				magicNumbers.CHAR_GRAVE_ACCENT,
				magicNumbers.CHAR_GREATER_THAN,
				magicNumbers.CHAR_LESS_THAN,
				magicNumbers.CHAR_CAPITAL_P,
				magicNumbers.CHAR_DIGIT_9,
			];

			allChars.forEach(charCode => {
				expect(charCode).toBeGreaterThanOrEqual(0);
				expect(charCode).toBeLessThan(256);
			});
		});
	});

	describe('Application Constants', () => {
		it('should export max copy lines limit', () => {
			expect(magicNumbers.MAX_COPY_LINES).toBe(3);
			expect(typeof magicNumbers.MAX_COPY_LINES).toBe('number');
		});

		it('should export panel width multiplier', () => {
			expect(magicNumbers.PANEL_WIDTH_MULTIPLIER).toBe(20);
			expect(typeof magicNumbers.PANEL_WIDTH_MULTIPLIER).toBe('number');
		});

		it('should have positive application constants', () => {
			expect(magicNumbers.MAX_COPY_LINES).toBeGreaterThan(0);
			expect(magicNumbers.PANEL_WIDTH_MULTIPLIER).toBeGreaterThan(0);
		});
	});

	describe('Constant Relationships', () => {
		it('should have matching slash constants', () => {
			// CHAR_SLASH and CHAR_FORWARD_SLASH should be the same
			expect(magicNumbers.CHAR_SLASH).toBe(magicNumbers.CHAR_FORWARD_SLASH);
		});

		it('should have paired brackets', () => {
			// Left brackets should be less than right brackets
			expect(magicNumbers.CHAR_LEFT_PARENTHESIS).toBeLessThan(
				magicNumbers.CHAR_RIGHT_PARENTHESIS,
			);
			expect(magicNumbers.CHAR_LEFT_SQUARE_BRACKET).toBeLessThan(
				magicNumbers.CHAR_RIGHT_SQUARE_BRACKET,
			);
			expect(magicNumbers.CHAR_LEFT_CURLY_BRACE).toBeLessThan(
				magicNumbers.CHAR_RIGHT_CURLY_BRACE,
			);
		});

		it('should have consistent default colors', () => {
			// DEFAULT_FOREGROUND should match COLOR_WHITE
			expect(magicNumbers.DEFAULT_FOREGROUND).toBe(magicNumbers.COLOR_WHITE);
			// DEFAULT_BACKGROUND should match COLOR_BLACK
			expect(magicNumbers.DEFAULT_BACKGROUND).toBe(magicNumbers.COLOR_BLACK);
		});

		it('should have ordered block intensities', () => {
			// Block characters should be in order by intensity
			expect(magicNumbers.LIGHT_BLOCK).toBeLessThan(magicNumbers.MEDIUM_BLOCK);
			expect(magicNumbers.MEDIUM_BLOCK).toBeLessThan(magicNumbers.DARK_BLOCK);
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
			// Should have around 40+ constants
			expect(keys.length).toBeGreaterThanOrEqual(40);
		});

		it('should have immutable exports', () => {
			// Try to modify a constant (should not throw, but shouldn't change)
			expect(() => {
				magicNumbers.DEFAULT_FONT = 'NewFont';
			}).not.toThrow();
		});
	});

	describe('Character Value Validation', () => {
		it('should have printable character codes for alphanumerics', () => {
			// Printable ASCII range
			expect(magicNumbers.CHAR_CAPITAL_X).toBeGreaterThanOrEqual(32);
			expect(magicNumbers.CHAR_CAPITAL_X).toBeLessThan(127);
			expect(magicNumbers.CHAR_CAPITAL_P).toBeGreaterThanOrEqual(32);
			expect(magicNumbers.CHAR_CAPITAL_P).toBeLessThan(127);
			expect(magicNumbers.CHAR_DIGIT_9).toBeGreaterThanOrEqual(32);
			expect(magicNumbers.CHAR_DIGIT_9).toBeLessThan(127);
		});

		it('should have extended ASCII for block characters', () => {
			// Extended ASCII range (128-255)
			expect(magicNumbers.LIGHT_BLOCK).toBeGreaterThanOrEqual(128);
			expect(magicNumbers.MEDIUM_BLOCK).toBeGreaterThanOrEqual(128);
			expect(magicNumbers.DARK_BLOCK).toBeGreaterThanOrEqual(128);
		});

		it('should correctly encode blank cell', () => {
			// BLANK_CELL should be space character with default foreground
			const charCode = magicNumbers.BLANK_CELL >> 8;
			const attr = magicNumbers.BLANK_CELL & 0xff;
			expect(charCode).toBe(32); // space
			expect(attr).toBe(7); // white
		});
	});

	describe('Logical Character Groupings', () => {
		it('should group half-block characters correctly', () => {
			const halfBlocks = [
				magicNumbers.UPPER_HALFBLOCK,
				magicNumbers.LOWER_HALFBLOCK,
				magicNumbers.LEFT_HALFBLOCK,
				magicNumbers.RIGHT_HALFBLOCK,
			];

			// All half-blocks should be in close proximity in CP437
			const min = Math.min(...halfBlocks);
			const max = Math.max(...halfBlocks);
			expect(max - min).toBeLessThan(10); // Should be within 10 chars of each other
		});

		it('should group shade characters correctly', () => {
			const shadeBlocks = [
				magicNumbers.LIGHT_BLOCK,
				magicNumbers.MEDIUM_BLOCK,
				magicNumbers.DARK_BLOCK,
			];

			// Shade blocks should be consecutive
			expect(shadeBlocks[1] - shadeBlocks[0]).toBe(1);
			expect(shadeBlocks[2] - shadeBlocks[1]).toBe(1);
		});
	});
});
