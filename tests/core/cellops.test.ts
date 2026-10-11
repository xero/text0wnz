import { describe, it, expect } from 'vitest';
import {
	FULL_BLOCK,
	LEFT_HALF,
	LOWER_HALF,
	RIGHT_HALF,
	SHADE_DARK,
	SHADE_LIGHT,
	SHADE_MEDIUM,
	UPPER_HALF,
	classifyHalfBlock,
	mirrorCharCode,
	mirrorX,
	optimizeCell,
	overlayHalfBlock,
	shadeCycle,
} from '../../src/js/core/cellops.js';

describe('cellops', () => {
	it('half-block glyph constants carry true CP437 meaning', () => {
		// v2 magicNumbers names these two the other way around; the port
		// is by value and these pins keep anyone from "fixing" it back
		expect(LOWER_HALF).toBe(220);
		expect(UPPER_HALF).toBe(223);
		expect(classifyHalfBlock({ charCode: 220, fg: 5, bg: 2 })).toMatchObject({
			upperBlockColor: 2,
			lowerBlockColor: 5,
		});
		expect(classifyHalfBlock({ charCode: 223, fg: 5, bg: 2 })).toMatchObject({
			upperBlockColor: 5,
			lowerBlockColor: 2,
		});
	});

	it('mirror tables swap the swappable pairs and keep the rest', () => {
		expect(mirrorCharCode(LEFT_HALF)).toBe(RIGHT_HALF);
		expect(mirrorCharCode(RIGHT_HALF)).toBe(LEFT_HALF);
		expect(mirrorCharCode(UPPER_HALF)).toBe(UPPER_HALF);
		expect(mirrorCharCode(40)).toBe(41);
		expect(mirrorCharCode(92)).toBe(47);
		expect(mirrorCharCode(57)).toBe(80); // 9 <-> P
		expect(mirrorCharCode(65)).toBe(65);
		// odd canvas: the center column has no mirror
		expect(mirrorX(81, 40)).toBe(-1);
		expect(mirrorX(80, 0)).toBe(79);
	});

	it('overlay merges matching halves into full blocks', () => {
		const lower = { charCode: LOWER_HALF, fg: 4, bg: 1 };
		// painting the top of a lower-half cell with its own fg merges
		expect(overlayHalfBlock(lower, 4, true)).toEqual({
			charCode: FULL_BLOCK,
			fg: 4,
			bg: 0,
		});
		// with a different color the halves swap roles
		expect(overlayHalfBlock(lower, 6, true)).toEqual({
			charCode: UPPER_HALF,
			fg: 6,
			bg: 4,
		});
		// full block in the same color is the one true no-op
		expect(
			overlayHalfBlock({ charCode: FULL_BLOCK, fg: 4, bg: 0 }, 4, false),
		).toBeNull();
	});

	it('optimize rewrites bright backgrounds into dim equivalents', () => {
		expect(optimizeCell({ charCode: 32, fg: 7, bg: 12 })).toEqual({
			charCode: FULL_BLOCK,
			fg: 12,
			bg: 0,
		});
		expect(optimizeCell({ charCode: UPPER_HALF, fg: 3, bg: 9 })).toEqual({
			charCode: LOWER_HALF,
			fg: 9,
			bg: 3,
		});
		// bright fg cannot host the swap
		expect(optimizeCell({ charCode: UPPER_HALF, fg: 12, bg: 9 })).toBeNull();
		expect(optimizeCell({ charCode: 65, fg: 7, bg: 9 })).toBeNull();
		expect(optimizeCell({ charCode: 32, fg: 7, bg: 2 })).toBeNull();
	});

	it('shade cycle walks both directions like the v2 brush', () => {
		expect(shadeCycle(65, 7, 7, false)).toBe(SHADE_LIGHT);
		expect(shadeCycle(SHADE_LIGHT, 7, 7, false)).toBe(SHADE_MEDIUM);
		expect(shadeCycle(SHADE_MEDIUM, 7, 7, false)).toBe(SHADE_DARK);
		expect(shadeCycle(SHADE_DARK, 7, 7, false)).toBe(FULL_BLOCK);
		expect(shadeCycle(FULL_BLOCK, 7, 7, false)).toBe(FULL_BLOCK);
		// a full block in a DIFFERENT color restarts the cycle
		expect(shadeCycle(FULL_BLOCK, 3, 7, false)).toBe(SHADE_LIGHT);

		expect(shadeCycle(FULL_BLOCK, 7, 7, true)).toBe(SHADE_DARK);
		expect(shadeCycle(FULL_BLOCK, 3, 7, true)).toBe(SHADE_LIGHT);
		expect(shadeCycle(SHADE_DARK, 7, 7, true)).toBe(SHADE_MEDIUM);
		expect(shadeCycle(SHADE_MEDIUM, 7, 7, true)).toBe(SHADE_LIGHT);
		expect(shadeCycle(SHADE_LIGHT, 7, 7, true)).toBe(32);
		expect(shadeCycle(65, 7, 7, true)).toBe(32);
	});
});
