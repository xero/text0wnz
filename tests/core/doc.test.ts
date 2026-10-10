import { describe, it, expect } from 'vitest';
import {
	ATTR_BLINK,
	DEFAULT_FRAME_CELL_BUDGET,
	PALETTE_TAG,
	attrsOf,
	createCP437GlyphTable,
	createDefaultPaletteRGB,
	createDocV3,
	createGlyphTable,
	expand6to8,
	glyphIdOf,
	glyphWord,
	isPaletteColor,
	paletteColor,
	paletteIndexOf,
	rgbColor,
	rgbOf,
} from '../../src/js/core/doc.js';

describe('word packing', () => {
	it('packs and unpacks glyph words', () => {
		const word = glyphWord(0x1234, ATTR_BLINK);
		expect(glyphIdOf(word)).toBe(0x1234);
		expect(attrsOf(word)).toBe(ATTR_BLINK);
		expect(glyphIdOf(glyphWord(0xffff, 0xff))).toBe(0xffff);
		expect(attrsOf(glyphWord(0xffff, 0xff))).toBe(0xff);
	});

	it('tags palette colors with bit 31 and keeps RGB words clear', () => {
		const pal = paletteColor(7);
		expect(isPaletteColor(pal)).toBe(true);
		expect(paletteIndexOf(pal)).toBe(7);
		expect(pal).toBe((PALETTE_TAG | 7) >>> 0);

		const rgb = rgbColor(0xaa, 0xbb, 0xcc);
		expect(isPaletteColor(rgb)).toBe(false);
		expect(rgbOf(rgb)).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
	});

	it('palette words are unsigned', () => {
		expect(paletteColor(0)).toBeGreaterThan(0);
		expect(paletteColor(255) >>> 0).toBe(paletteColor(255));
	});
});

describe('palette', () => {
	it('expands 6-bit channels by high-bit replication', () => {
		expect(expand6to8(0)).toBe(0);
		expect(expand6to8(21)).toBe(85);
		expect(expand6to8(42)).toBe(170);
		expect(expand6to8(63)).toBe(255);
		// The replication form, NOT round(v/63*255): 15 -> 60, not 61
		expect(expand6to8(15)).toBe(60);
	});

	it('default palette matches VGA 16 through the canonical expansion', () => {
		const palette = createDefaultPaletteRGB();
		expect(palette.length).toBe(16);
		expect(palette[0]).toBe(rgbColor(0, 0, 0));
		expect(palette[7]).toBe(rgbColor(170, 170, 170));
		expect(palette[14]).toBe(rgbColor(255, 255, 85));
		expect(palette[15]).toBe(rgbColor(255, 255, 255));
	});
});

describe('glyph table', () => {
	it('seeds CP437 identity for 256 glyphs', () => {
		const table = createCP437GlyphTable();
		expect(table.size()).toBe(256);
		expect(table.get(65)).toEqual({ fontSlot: 0, codepoint: 65 });
		expect(table.get(1)?.codepoint).toBe(0x263a);
	});

	it('appends unicode entries on demand and dedupes', () => {
		const table = createCP437GlyphTable();
		const id = table.idFor(0, 0x2592);
		expect(id).toBe(177); // medium shade is already CP437 177
		const snowman = table.idFor(1, 0x2603);
		expect(snowman).toBe(256);
		expect(table.idFor(1, 0x2603)).toBe(snowman);
		expect(table.size()).toBe(257);
	});
});

describe('docV3', () => {
	it('creates a blank single-frame doc matching a zeroed v2 doc', () => {
		const doc = createDocV3({ columns: 4, rows: 3 });
		expect(doc.frames.length).toBe(1);
		const cell = doc.getCell(0, 0, 0);
		expect(cell.glyph).toBe(0);
		expect(cell.fg).toBe(paletteColor(0));
		expect(cell.bg).toBe(paletteColor(0));
	});

	it('set/getCell round-trips and bounds-checks', () => {
		const doc = createDocV3({ columns: 10, rows: 5 });
		const cell = {
			glyph: glyphWord(219, 0),
			fg: paletteColor(14),
			bg: rgbColor(1, 2, 3),
		};
		doc.setCell(0, 9, 4, cell);
		expect(doc.getCell(0, 9, 4)).toEqual(cell);
		expect(() => doc.getCell(0, 10, 0)).toThrow(RangeError);
		expect(() => doc.getCell(1, 0, 0)).toThrow(RangeError);
	});

	it('getArea/setArea copy rectangles faithfully', () => {
		const doc = createDocV3({ columns: 8, rows: 8 });
		for (let y = 0; y < 8; y++) {
			for (let x = 0; x < 8; x++) {
				doc.setCell(0, x, y, {
					glyph: glyphWord(y * 8 + x, 0),
					fg: paletteColor(x & 15),
					bg: paletteColor(y & 15),
				});
			}
		}
		const area = doc.getArea(0, 2, 3, 4, 2);
		expect(area.width).toBe(4);
		expect(glyphIdOf(area.glyph[0])).toBe(3 * 8 + 2);
		const target = createDocV3({ columns: 8, rows: 8 });
		target.setArea(0, 1, 1, area);
		expect(target.getCell(0, 1, 1)).toEqual(doc.getCell(0, 2, 3));
		expect(target.getCell(0, 4, 2)).toEqual(doc.getCell(0, 5, 4));
		expect(target.getCell(0, 0, 0).glyph).toBe(0);
	});

	it('addFrame copies, removeFrame guards the last frame', () => {
		const doc = createDocV3({ columns: 2, rows: 2 });
		doc.setCell(0, 1, 1, {
			glyph: glyphWord(88, 0),
			fg: paletteColor(1),
			bg: paletteColor(2),
		});
		const second = doc.addFrame({ copyFrom: 0 });
		expect(second).toBe(1);
		expect(doc.getCell(1, 1, 1)).toEqual(doc.getCell(0, 1, 1));
		const third = doc.addFrame();
		expect(doc.getCell(third, 1, 1).glyph).toBe(0);
		doc.removeFrame(2);
		doc.removeFrame(1);
		expect(() => doc.removeFrame(0)).toThrow();
	});

	it('enforces the O13 frame budget unless forced', () => {
		const doc = createDocV3({ columns: 10, rows: 10, frameCellBudget: 250 });
		doc.addFrame(); // 200 cells, fits
		expect(doc.canAddFrame()).toBe(false);
		expect(() => doc.addFrame()).toThrow(/frame budget/);
		expect(doc.addFrame({ force: true })).toBe(2);
		expect(DEFAULT_FRAME_CELL_BUDGET).toBeGreaterThan(80 * 25 * 50);
	});

	it('resize preserves the overlap region in every frame', () => {
		const doc = createDocV3({ columns: 4, rows: 4 });
		doc.addFrame();
		doc.setCell(0, 3, 3, {
			glyph: glyphWord(1, 0),
			fg: paletteColor(1),
			bg: paletteColor(1),
		});
		doc.setCell(1, 0, 0, {
			glyph: glyphWord(2, 0),
			fg: paletteColor(2),
			bg: paletteColor(2),
		});
		doc.resize(6, 2);
		expect(doc.getColumns()).toBe(6);
		expect(doc.getRows()).toBe(2);
		expect(glyphIdOf(doc.getCell(1, 0, 0).glyph)).toBe(2);
		// New territory is blank
		expect(doc.getCell(0, 5, 1).glyph).toBe(0);
		expect(doc.getCell(0, 5, 1).fg).toBe(paletteColor(0));
	});

	it('custom glyph tables flow through', () => {
		const table = createGlyphTable([{ fontSlot: 2, codepoint: 0x41 }]);
		const doc = createDocV3({ columns: 1, rows: 1, glyphTable: table });
		expect(doc.glyphTable.size()).toBe(1);
		expect(doc.glyphTable.get(0)).toEqual({ fontSlot: 2, codepoint: 0x41 });
	});
});
