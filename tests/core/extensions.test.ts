/**
 * t0wnz extension suite v1 (PLAN §3.6.3): wire validation, the sync
 * RLE, and the down-conversion that keeps vanilla peers coherent in
 * mixed rooms. Down-convert semantics are pinned against
 * v3ToU16Lossy's blink/ice fold — the two projections must never
 * drift apart.
 */
import { describe, it, expect } from 'vitest';
import {
	EXT_BATCH_LIMIT,
	EXT_SUITE_CAP,
	T0wnzAction,
	blockToExtCell,
	compressExtCells,
	expandExtCells,
	extCellToBlock,
	normalizeColorWord,
	paletteWordsFromJoin,
	sanitizeExtCell,
	sanitizeExtDraw,
	sanitizeExtPalette,
	ProtocolError,
	MOEBIUS_EXTENSION_BASE,
} from '../../src/js/core/index.js';
import { createDefaultPaletteRGB, paletteColor } from '../../src/js/core/doc.js';

const defaults = createDefaultPaletteRGB();

describe('suite constants', () => {
	it('ids start at the extension base and stay dense', () => {
		expect(T0wnzAction.EXT_DRAW).toBe(MOEBIUS_EXTENSION_BASE);
		expect(Object.values(T0wnzAction).sort((a, b) => a - b)).toEqual([
			23, 24, 25, 26, 27, 28,
		]);
		expect(EXT_SUITE_CAP).toBe('t0wnz-ext-1');
		expect(EXT_BATCH_LIMIT).toBeGreaterThan(0);
	});
});

describe('normalizeColorWord', () => {
	it('keeps 8-bit palette indexes and 24-bit RGB only', () => {
		expect(normalizeColorWord(paletteColor(7))).toBe(paletteColor(7));
		// junk bits between 24 and 30 are stripped from RGB words
		expect(normalizeColorWord(0x7f123456)).toBe(0x123456);
		// palette words keep only the low byte of the index
		expect(normalizeColorWord(paletteColor(0x1ff))).toBe(paletteColor(0xff));
		expect(normalizeColorWord('red')).toBeNull();
		expect(normalizeColorWord(NaN)).toBeNull();
	});
});

describe('sanitizeExtCell / sanitizeExtDraw', () => {
	it('accepts a full-fidelity cell and defaults attrs', () => {
		const cell = sanitizeExtCell({ u: 0x2588, fg: 0xff0000, bg: paletteColor(0) });
		expect(cell).toEqual({ u: 0x2588, a: 0, fg: 0xff0000, bg: paletteColor(0) });
	});

	it('rejects surrogates, bad codepoints, and bad colors', () => {
		expect(sanitizeExtCell({ u: 0xd800, fg: 0, bg: 0 })).toBeNull();
		expect(sanitizeExtCell({ u: 0x110000, fg: 0, bg: 0 })).toBeNull();
		expect(sanitizeExtCell({ u: -1, fg: 0, bg: 0 })).toBeNull();
		expect(sanitizeExtCell({ u: 65, fg: 'x', bg: 0 })).toBeNull();
		expect(sanitizeExtCell(null)).toBeNull();
	});

	it('bounds-checks draw coordinates against the live doc', () => {
		const data = { x: 3, y: 1, u: 65, a: 1, fg: paletteColor(7), bg: paletteColor(0) };
		expect(sanitizeExtDraw(data, 4, 2)).toEqual({ ...data });
		expect(sanitizeExtDraw({ ...data, x: 4 }, 4, 2)).toBeNull();
		expect(sanitizeExtDraw({ ...data, y: -1 }, 4, 2)).toBeNull();
		expect(sanitizeExtDraw({ ...data, x: 1.5 }, 4, 2)).toBeNull();
	});
});

describe('extCellToBlock down-conversion', () => {
	it('reverse-maps cp437 glyphs losslessly and substitutes the rest', () => {
		// ░ is cp437 176
		const shade = extCellToBlock(
			{ u: 0x2591, a: 0, fg: paletteColor(7), bg: paletteColor(0) },
			false,
			defaults,
		);
		expect(shade).toEqual({ code: 176, fg: 7, bg: 0 });
		// CJK has no cp437 home -> '?'
		const cjk = extCellToBlock(
			{ u: 0x4e2d, a: 0, fg: paletteColor(7), bg: paletteColor(0) },
			false,
			defaults,
		);
		expect(cjk.code).toBe(63);
	});

	it('quantizes RGB words to the nearest classic index', () => {
		const block = extCellToBlock(
			{ u: 65, a: 0, fg: 0xff0000, bg: 0x000000 },
			false,
			defaults,
		);
		// pure red lands on dim red 4 (the P5 lesson: not bright 12)
		expect(block.fg).toBe(4);
		expect(block.bg).toBe(0);
	});

	it('folds blink to a bright bg nibble without ice, drops it with ice', () => {
		const cell = { u: 65, a: 1, fg: paletteColor(7), bg: paletteColor(1) };
		expect(extCellToBlock(cell, false, defaults).bg).toBe(9);
		expect(extCellToBlock(cell, true, defaults).bg).toBe(1);
	});

	it('clamps non-blink bgs to the dim half without ice', () => {
		const cell = { u: 65, a: 0, fg: paletteColor(7), bg: paletteColor(12) };
		const block = extCellToBlock(cell, false, defaults);
		expect(block.bg).toBeLessThan(8);
		expect(extCellToBlock(cell, true, defaults).bg).toBe(12);
	});
});

describe('blockToExtCell', () => {
	it('prefers a stored ext payload', () => {
		const ext = { u: 0x4e2d, a: 1, fg: 0xff8800, bg: paletteColor(200) };
		expect(blockToExtCell({ code: 63, fg: 7, bg: 0, ext })).toEqual(ext);
	});

	it('derives cp437 bytes and icy codepoints from vanilla blocks', () => {
		expect(blockToExtCell({ code: 176, fg: 7, bg: 8 })).toEqual({
			u: 0x2591,
			a: 0,
			fg: paletteColor(7),
			bg: paletteColor(8),
		});
		// icy-style raw codepoint above the byte range passes through
		expect(blockToExtCell({ code: 0x2764, fg: 1, bg: 0 }).u).toBe(0x2764);
	});
});

describe('sync RLE', () => {
	const cells = [
		{ u: 32, a: 0, fg: paletteColor(7), bg: paletteColor(0) },
		{ u: 32, a: 0, fg: paletteColor(7), bg: paletteColor(0) },
		{ u: 0x2588, a: 1, fg: 0x123456, bg: paletteColor(255) },
	];

	it('round-trips with plain counts (no repeat+1 quirk)', () => {
		const runs = compressExtCells(cells);
		expect(runs).toEqual([
			[32, 0, paletteColor(7), paletteColor(0), 2],
			[0x2588, 1, 0x123456, paletteColor(255), 1],
		]);
		expect(expandExtCells(runs, 3)).toEqual(cells);
	});

	it('refuses hostile lengths before allocating', () => {
		expect(() =>
			expandExtCells([[32, 0, 0, 0, 1e9]], 100),
		).toThrow(ProtocolError);
		expect(() => expandExtCells([[32, 0, 0, 0, 1]], 2)).toThrow(ProtocolError);
		expect(() => expandExtCells('junk', 1)).toThrow(ProtocolError);
		expect(() => expandExtCells([[0xd800, 0, 0, 0, 1]], 1)).toThrow(
			ProtocolError,
		);
	});
});

describe('palettes', () => {
	it('expands a 6-bit join palette into resolve words', () => {
		const words = paletteWordsFromJoin([[63, 0, 0]]);
		expect(words[0]).toBe(0xff0000);
		// entries beyond the join palette keep the defaults
		expect(words[7]).toBe(defaults[7]);
	});

	it('falls back to the default palette', () => {
		expect([...paletteWordsFromJoin()]).toEqual([...defaults]);
	});

	it('sanitizes EXT_PALETTE payloads', () => {
		expect(sanitizeExtPalette([0xff0000, 0x00ff00])).toEqual([
			0xff0000, 0x00ff00,
		]);
		expect(sanitizeExtPalette([0x7f123456])).toEqual([0x123456]);
		expect(sanitizeExtPalette([])).toBeNull();
		expect(sanitizeExtPalette(new Array(257).fill(0))).toBeNull();
		expect(sanitizeExtPalette([1, 'x'])).toBeNull();
		expect(sanitizeExtPalette('vga')).toBeNull();
	});
});
