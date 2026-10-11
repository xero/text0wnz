import { describe, it, expect } from 'vitest';
import {
	ATTR_BLINK,
	createDocV3,
	glyphWord,
	paletteColor,
	rgbColor,
} from '../../src/js/core/doc.js';
import {
	decodeTundra,
	encodeTundra,
	isTundra,
} from '../../src/js/core/codecs/tundra.js';
import { buildSauce } from '../../src/js/core/codecs/sauce.js';
import { concatBytes } from '../../src/js/core/codecs/util.js';
import { v3ToU16 } from '../../src/js/core/convert.js';

const FIXED_DATE = new Date(2026, 9, 10);

const header = (): number[] => [
	24,
	...'TUNDRA24'.split('').map(ch => ch.charCodeAt(0)),
];

const be32 = (value: number): number[] => [
	(value >>> 24) & 0xff,
	(value >>> 16) & 0xff,
	(value >>> 8) & 0xff,
	value & 0xff,
];

const jump = (y: number, x: number): number[] => [1, ...be32(y), ...be32(x)];

const withSauce = (
	payload: number[],
	columns: number,
	rows: number,
	title?: string,
): Uint8Array =>
	concatBytes([
		Uint8Array.from(payload),
		Uint8Array.of(0x1a),
		buildSauce({
			dataType: 1,
			fileType: 8,
			fileSize: payload.length,
			columns,
			rows,
			iceColors: true,
			title,
			date: FIXED_DATE,
		}),
	]);

describe('tundra codec', () => {
	it('decodes the command stream (jumps, color state, literals)', () => {
		const bytes = Uint8Array.from([
			...header(),
			...jump(1, 2),
			// char 'X' with raw-RGB fg and palette-blue bg
			6,
			88,
			0,
			255,
			128,
			0,
			0,
			0,
			0,
			170,
			// literal 'Y' keeps both colors
			89,
			// char 'Z' switches fg to palette white, bg persists
			2,
			90,
			0,
			170,
			170,
			170,
			// literal space
			32,
		]);
		const { doc } = decodeTundra(bytes);
		expect(doc.getColumns()).toBe(80); // no SAUCE: tundra defaults to 80
		expect(doc.getRows()).toBe(2);
		expect(doc.getIceColors()).toBe(true);
		expect(doc.mode).toBe('free');
		expect(doc.getCell(0, 2, 1)).toEqual({
			glyph: glyphWord(88, 0),
			fg: rgbColor(255, 128, 0),
			bg: paletteColor(1),
		});
		expect(doc.getCell(0, 3, 1)).toEqual({
			glyph: glyphWord(89, 0),
			fg: rgbColor(255, 128, 0),
			bg: paletteColor(1),
		});
		expect(doc.getCell(0, 4, 1)).toEqual({
			glyph: glyphWord(90, 0),
			fg: paletteColor(7),
			bg: paletteColor(1),
		});
		expect(doc.getCell(0, 5, 1).glyph).toBe(glyphWord(32, 0));
		// untouched cells stay doc-blank
		expect(doc.getCell(0, 0, 0)).toEqual({
			glyph: 0,
			fg: paletteColor(0),
			bg: paletteColor(0),
		});
	});

	it('honors SAUCE columns and wraps at the right edge', () => {
		const bytes = withSauce([...header(), ...jump(0, 3), 65, 66], 4, 2, 'tnd');
		const { doc, meta, sauce } = decodeTundra(bytes);
		expect(doc.getColumns()).toBe(4);
		expect(doc.getRows()).toBe(2);
		expect(doc.getCell(0, 3, 0).glyph).toBe(glyphWord(65, 0));
		expect(doc.getCell(0, 0, 1).glyph).toBe(glyphWord(66, 0));
		expect(meta.title).toBe('tnd');
		expect(sauce?.fileType).toBe(8);
		// all-palette colors stay u16-convertible (ice is on)
		expect(() => v3ToU16(doc)).not.toThrow();
	});

	it('encode -> decode -> encode is a byte fixed point', () => {
		const doc = createDocV3({ columns: 8, rows: 3, mode: 'free' });
		doc.setIceColors(true);
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(219, 0),
			fg: rgbColor(10, 20, 30),
			bg: paletteColor(4),
		});
		doc.setCell(0, 2, 0, {
			glyph: glyphWord(176, 0),
			fg: rgbColor(10, 20, 30),
			bg: paletteColor(4),
		});
		// a gap (glyph 0) forces a re-anchoring cursor jump
		doc.setCell(0, 6, 2, {
			glyph: glyphWord(65, 0),
			fg: paletteColor(15),
			bg: paletteColor(0),
		});
		const e1 = encodeTundra(doc, { date: FIXED_DATE });
		expect(isTundra(e1)).toBe(true);
		const d1 = decodeTundra(e1);
		expect(d1.doc.getCell(0, 1, 0)).toEqual(doc.getCell(0, 1, 0));
		expect(d1.doc.getCell(0, 2, 0)).toEqual(doc.getCell(0, 2, 0));
		expect(d1.doc.getCell(0, 6, 2)).toEqual(doc.getCell(0, 6, 2));
		expect(d1.doc.getCell(0, 0, 1).glyph).toBe(0);
		const e2 = encodeTundra(d1.doc, { date: FIXED_DATE });
		expect(e2).toEqual(e1);
		const d2 = decodeTundra(e2);
		expect(d2.doc.frames[0].glyph).toEqual(d1.doc.frames[0].glyph);
		expect(d2.doc.frames[0].fg).toEqual(d1.doc.frames[0].fg);
		expect(d2.doc.frames[0].bg).toEqual(d1.doc.frames[0].bg);
	});

	it('drops glyphs 1-6 and never writes a foreground for spaces', () => {
		const doc = createDocV3({ columns: 6, rows: 1, mode: 'free' });
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(88, 0),
			fg: paletteColor(12),
			bg: paletteColor(0),
		});
		// glyph 3 collides with the command range: unencodable, dropped
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(3, 0),
			fg: paletteColor(14),
			bg: paletteColor(0),
		});
		// a space whose fg differs from the stream state: fg is not
		// written (PabloDraw quirk), so re-reading yields the run fg
		doc.setCell(0, 2, 0, {
			glyph: glyphWord(32, 0),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		const back = decodeTundra(encodeTundra(doc, { date: FIXED_DATE })).doc;
		expect(back.getCell(0, 0, 0).glyph).toBe(glyphWord(88, 0));
		expect(back.getCell(0, 1, 0)).toEqual({
			glyph: 0,
			fg: paletteColor(0),
			bg: paletteColor(0),
		});
		expect(back.getCell(0, 2, 0).glyph).toBe(glyphWord(32, 0));
		expect(back.getCell(0, 2, 0).fg).toBe(paletteColor(12));
	});

	it('rejects non-CP437 glyphs and blink attrs', () => {
		const unicode = createDocV3({ columns: 2, rows: 1, mode: 'free' });
		unicode.setCell(0, 0, 0, {
			glyph: glyphWord(unicode.glyphTable.idFor(0, 0x2603), 0),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		expect(() => encodeTundra(unicode)).toThrow(/not CP437/);

		const blink = createDocV3({ columns: 2, rows: 1 });
		blink.setCell(0, 0, 0, {
			glyph: glyphWord(65, ATTR_BLINK),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		expect(() => encodeTundra(blink)).toThrow(/blink/);
	});

	it('stops cleanly on a truncated color command', () => {
		const bytes = Uint8Array.from([
			...header(),
			65, // literal 'A'
			6,
			88,
			0,
			255, // fg command cut mid-color
		]);
		const { doc } = decodeTundra(bytes);
		expect(doc.getRows()).toBe(1);
		expect(doc.getCell(0, 0, 0).glyph).toBe(glyphWord(65, 0));
		expect(doc.getCell(0, 1, 0).glyph).toBe(0);
	});

	it('a trailing cursor jump extends the canvas (PabloDraw height rule)', () => {
		const bytes = Uint8Array.from([...header(), 65, ...jump(5, 0)]);
		expect(decodeTundra(bytes).doc.getRows()).toBe(6);
	});

	it('rejects a bad signature', () => {
		expect(() => decodeTundra(new Uint8Array(16))).toThrow(/signature/);
		expect(isTundra(new Uint8Array(16))).toBe(false);
	});
});
