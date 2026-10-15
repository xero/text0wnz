/**
 * Pure cell-level editing algebra (half blocks, mirror, shading,
 * bright-background normalization), kept parity-equivalent with v2.
 * Everything here is integer math over `{charCode, fg, bg}` cells in
 * classic16 terms (palette indices 0-15, bg 8-15 = ice-bright or blink
 * per the doc flag); the editor layer owns the plane-word encoding.
 */

export const FULL_BLOCK = 219; // █
export const LOWER_HALF = 220; // ▄ (fg fills the bottom half)
export const LEFT_HALF = 221; // ▌
export const RIGHT_HALF = 222; // ▐
export const UPPER_HALF = 223; // ▀ (fg fills the top half)

export const SHADE_LIGHT = 176; // ░
export const SHADE_MEDIUM = 177; // ▒
export const SHADE_DARK = 178; // ▓

/** A cell in classic16 editing terms. */
export interface EditCell {
	charCode: number;
	fg: number;
	bg: number;
}

// ---------------------------------------------------------------- mirror

/** Mirror column for x, or -1 for the center column of an odd canvas. */
export const mirrorX = (columns: number, x: number): number => {
	if (columns % 2 !== 0 && x === Math.floor(columns / 2)) {
		return -1;
	}
	return columns - 1 - x;
};

const MIRROR_CHARS = new Map<number, number>([
	[LEFT_HALF, RIGHT_HALF],
	[RIGHT_HALF, LEFT_HALF],
	[40, 41], // ( )
	[41, 40],
	[91, 93], // [ ]
	[93, 91],
	[123, 125], // { }
	[125, 123],
	[47, 92], // / \
	[92, 47],
	[96, 39], // ` '
	[39, 96],
	[60, 62], // < >
	[62, 60],
	[57, 80], // 9 P
	[80, 57],
	// ascii brush junction glyphs: hooks and leans swap sides
	[74, 76], // J L
	[76, 74],
	[55, 114], // 7 r
	[114, 55],
	// nu skool ribbon chisels
	[100, 98], // d b
	[98, 100],
]);

export const mirrorCharCode = (charCode: number): number =>
	MIRROR_CHARS.get(charCode) ?? charCode;

// ---------------------------------------------------------- half blocks

export interface HalfBlockInfo {
	isBlocky: boolean;
	upperBlockColor: number;
	lowerBlockColor: number;
	isVerticalBlocky: boolean;
	leftBlockColor: number | undefined;
	rightBlockColor: number | undefined;
}

/** v2 getHalfBlock classifier (sans coordinates). */
export const classifyHalfBlock = (cell: EditCell): HalfBlockInfo => {
	const { charCode, fg, bg } = cell;
	let upperBlockColor = 0;
	let lowerBlockColor = 0;
	let isBlocky = false;
	let isVerticalBlocky = false;
	let leftBlockColor: number | undefined;
	let rightBlockColor: number | undefined;
	switch (charCode) {
		case 0:
		case 32:
		case 255:
			upperBlockColor = bg;
			lowerBlockColor = bg;
			isBlocky = true;
			break;
		case LOWER_HALF:
			upperBlockColor = bg;
			lowerBlockColor = fg;
			isBlocky = true;
			break;
		case LEFT_HALF:
			isVerticalBlocky = true;
			leftBlockColor = fg;
			rightBlockColor = bg;
			break;
		case RIGHT_HALF:
			isVerticalBlocky = true;
			leftBlockColor = bg;
			rightBlockColor = fg;
			break;
		case UPPER_HALF:
			upperBlockColor = fg;
			lowerBlockColor = bg;
			isBlocky = true;
			break;
		case FULL_BLOCK:
			upperBlockColor = fg;
			lowerBlockColor = fg;
			isBlocky = true;
			break;
		default:
			if (fg === bg) {
				isBlocky = true;
				upperBlockColor = fg;
				lowerBlockColor = fg;
			}
	}
	return {
		isBlocky,
		upperBlockColor,
		lowerBlockColor,
		isVerticalBlocky,
		leftBlockColor,
		rightBlockColor,
	};
};

/**
 * v2 drawHalfBlock algebra: paint `foreground` onto the top
 * (`topHalf = true`) or bottom half of `cell`. Returns the replacement
 * cell, or null for the one no-op case (full block already in that
 * color). Repaints that change nothing still return a cell, exactly
 * like v2's shouldUpdate paths.
 */
export const overlayHalfBlock = (
	cell: EditCell,
	foreground: number,
	topHalf: boolean,
): EditCell | null => {
	const { charCode, fg, bg } = cell;
	const paintedGlyph = topHalf ? UPPER_HALF : LOWER_HALF;
	if (charCode === FULL_BLOCK) {
		if (fg === foreground) {
			return null;
		}
		// Split: painted half takes the new color, the other keeps the old
		return { charCode: paintedGlyph, fg: foreground, bg: fg };
	}
	if (charCode !== UPPER_HALF && charCode !== LOWER_HALF) {
		return { charCode: paintedGlyph, fg: foreground, bg };
	}
	if (charCode === paintedGlyph) {
		// Repainting the fg half; merge to a full block when both match
		if (bg === foreground) {
			return { charCode: FULL_BLOCK, fg: foreground, bg: 0 };
		}
		return { charCode: paintedGlyph, fg: foreground, bg };
	}
	// Painting the bg half of the opposite glyph
	if (fg === foreground) {
		return { charCode: FULL_BLOCK, fg: foreground, bg: 0 };
	}
	return { charCode: paintedGlyph, fg: foreground, bg: fg };
};

// ------------------------------------------------------------- optimize

/**
 * v2 optimizeBlocks per-cell pass: rewrite bright-background (bg >= 8)
 * blocky cells into equivalent dim-background forms so they stay legal
 * without ice colors. Returns the replacement or null to keep the cell.
 */
export const optimizeCell = (cell: EditCell): EditCell | null => {
	const { charCode, fg, bg } = cell;
	// the bright-bg rewrite is classic16 ice semantics only; extended
	// color words pass through untouched
	if (bg < 8 || bg > 15) {
		return null;
	}
	switch (charCode) {
		case 0:
		case 32:
		case 255:
			return { charCode: FULL_BLOCK, fg: bg, bg: 0 };
		case FULL_BLOCK:
			return { charCode: FULL_BLOCK, fg, bg: 0 };
		case LEFT_HALF:
			return fg < 8 ? { charCode: RIGHT_HALF, fg: bg, bg: fg } : null;
		case RIGHT_HALF:
			return fg < 8 ? { charCode: LEFT_HALF, fg: bg, bg: fg } : null;
		case UPPER_HALF:
			return fg < 8 ? { charCode: LOWER_HALF, fg: bg, bg: fg } : null;
		case LOWER_HALF:
			return fg < 8 ? { charCode: UPPER_HALF, fg: bg, bg: fg } : null;
		default:
			return null;
	}
};

// -------------------------------------------------------------- shading

/**
 * Shading brush cycle (freehandTools.js calculateShadingCharacter):
 * darken walks space -> ░ -> ▒ -> ▓ -> █; reduce walks back down to
 * space. Full blocks compare the cell's fg against the active color.
 */
export const shadeCycle = (
	charCode: number,
	cellFg: number,
	activeFg: number,
	reduce: boolean,
): number => {
	if (reduce) {
		switch (charCode) {
			case SHADE_LIGHT:
				return 32;
			case SHADE_MEDIUM:
				return SHADE_LIGHT;
			case SHADE_DARK:
				return SHADE_MEDIUM;
			case FULL_BLOCK:
				return cellFg === activeFg ? SHADE_DARK : SHADE_LIGHT;
			default:
				return 32;
		}
	}
	switch (charCode) {
		case FULL_BLOCK:
			return cellFg !== activeFg ? SHADE_LIGHT : FULL_BLOCK;
		case SHADE_DARK:
			return FULL_BLOCK;
		case SHADE_MEDIUM:
			return SHADE_DARK;
		case SHADE_LIGHT:
			return SHADE_MEDIUM;
		default:
			return SHADE_LIGHT;
	}
};
