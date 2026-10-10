import { describe, it, expect } from 'vitest';
import {
	ATTR_BLINK,
	attrsOf,
	createDocV3,
	glyphIdOf,
	glyphWord,
	paletteColor,
	paletteIndexOf,
	rgbColor,
} from '../../src/js/core/doc.js';
import { ConvertError, u16ToV3, v3ToU16 } from '../../src/js/core/convert.js';

// Deterministic LCG, same shape the corpus generators use
const lcg = (seed: number) => {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 0x100000000;
	};
};

const randomU16Doc = (
	seed: number,
	columns: number,
	rows: number,
	iceColors: boolean,
) => {
	const rand = lcg(seed);
	const imageData = new Uint16Array(columns * rows);
	for (let i = 0; i < imageData.length; i++) {
		imageData[i] = Math.floor(rand() * 0x10000);
	}
	return { imageData, columns, rows, iceColors };
};

describe('u16 -> v3', () => {
	it('maps charCode, fg, bg, and the ice/blink fold', () => {
		// charCode 65, bg 12 (bright), fg 3
		const word = (65 << 8) | (12 << 4) | 3;
		const ice = u16ToV3({
			imageData: Uint16Array.of(word),
			columns: 1,
			rows: 1,
			iceColors: true,
		});
		const iceCell = ice.getCell(0, 0, 0);
		expect(glyphIdOf(iceCell.glyph)).toBe(65);
		expect(attrsOf(iceCell.glyph)).toBe(0);
		expect(paletteIndexOf(iceCell.bg)).toBe(12);
		expect(paletteIndexOf(iceCell.fg)).toBe(3);

		const blink = u16ToV3({
			imageData: Uint16Array.of(word),
			columns: 1,
			rows: 1,
			iceColors: false,
		});
		const blinkCell = blink.getCell(0, 0, 0);
		expect(attrsOf(blinkCell.glyph)).toBe(ATTR_BLINK);
		expect(paletteIndexOf(blinkCell.bg)).toBe(4); // 12 & 7
	});

	it('rejects mismatched dimensions', () => {
		expect(() =>
			u16ToV3({
				imageData: new Uint16Array(5),
				columns: 2,
				rows: 3,
				iceColors: false,
			}),
		).toThrow(ConvertError);
	});
});

describe('round-trip law', () => {
	it('v3ToU16(u16ToV3(doc)) is byte-identical for both ice flags', () => {
		for (const iceColors of [false, true]) {
			for (const seed of [1, 42, 0xbeef, 20261010]) {
				const source = randomU16Doc(seed, 80, 25, iceColors);
				const back = v3ToU16(u16ToV3(source));
				expect(back.columns).toBe(source.columns);
				expect(back.rows).toBe(source.rows);
				expect(back.iceColors).toBe(iceColors);
				expect(back.imageData).toEqual(source.imageData);
			}
		}
	});

	it('every one-cell value round-trips (exhaustive 16-bit sweep)', () => {
		for (const iceColors of [false, true]) {
			const imageData = new Uint16Array(0x10000);
			for (let w = 0; w < 0x10000; w++) {
				imageData[w] = w;
			}
			const source = { imageData, columns: 256, rows: 256, iceColors };
			const back = v3ToU16(u16ToV3(source));
			expect(back.imageData).toEqual(imageData);
		}
	});
});

describe('v3 -> u16 strictness', () => {
	it('rejects non-CP437 glyphs, RGB colors, and out-of-range indices', () => {
		const base = () => createDocV3({ columns: 1, rows: 1 });

		const unicode = base();
		const id = unicode.glyphTable.idFor(1, 0x2603);
		unicode.setCell(0, 0, 0, {
			glyph: glyphWord(id, 0),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		expect(() => v3ToU16(unicode)).toThrow(/not CP437-identity/);

		const rgb = base();
		rgb.setCell(0, 0, 0, {
			glyph: glyphWord(65, 0),
			fg: rgbColor(255, 0, 0),
			bg: paletteColor(0),
		});
		expect(() => v3ToU16(rgb)).toThrow(/raw RGB/);

		const brightFg = base();
		brightFg.setCell(0, 0, 0, {
			glyph: glyphWord(65, 0),
			fg: paletteColor(16),
			bg: paletteColor(0),
		});
		expect(() => v3ToU16(brightFg)).toThrow(/fg palette index/);
	});

	it('rejects blink combinations u16 cannot hold', () => {
		const iceDoc = createDocV3({ columns: 1, rows: 1, iceColors: true });
		iceDoc.setCell(0, 0, 0, {
			glyph: glyphWord(65, ATTR_BLINK),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		expect(() => v3ToU16(iceDoc)).toThrow(/blink cell in an ice doc/);

		const brightBlink = createDocV3({ columns: 1, rows: 1 });
		brightBlink.setCell(0, 0, 0, {
			glyph: glyphWord(65, ATTR_BLINK),
			fg: paletteColor(7),
			bg: paletteColor(9),
		});
		expect(() => v3ToU16(brightBlink)).toThrow(/bright bg/);

		const brightBgNoIce = createDocV3({ columns: 1, rows: 1 });
		brightBgNoIce.setCell(0, 0, 0, {
			glyph: glyphWord(65, 0),
			fg: paletteColor(7),
			bg: paletteColor(9),
		});
		expect(() => v3ToU16(brightBgNoIce)).toThrow(/needs ice/);
	});

	it('names the offending cell', () => {
		const doc = createDocV3({ columns: 4, rows: 2 });
		doc.setCell(0, 3, 1, {
			glyph: glyphWord(65, 0),
			fg: rgbColor(1, 2, 3),
			bg: paletteColor(0),
		});
		try {
			v3ToU16(doc);
			expect.unreachable();
		} catch (error) {
			expect((error as ConvertError).cellIndex).toBe(7);
		}
	});
});
