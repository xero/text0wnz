/**
 * The u16 mirror must be path independent: the incremental projection
 * (readCell -> packWord, surfaced through getAreaU16) and the full
 * rebuild (v3ToU16Lossy) have to agree word for word, and the plane
 * native area ops must round trip content the u16 model cannot hold.
 * The two collision cases that threaten this: a steady bright classic bg
 * without ice, and raw RGB words 0-15 (tundra near-black fades).
 */
import { describe, it, expect } from 'vitest';
import {
	ATTR_BLINK,
	createDocV3,
	glyphWord,
	paletteColor,
	rgbColor,
} from '../../src/js/core/doc.js';
import { v3ToU16Lossy } from '../../src/js/core/convert.js';
import { createEditorCore } from '../../src/js/core/editor.js';
import { createPatchArena } from '../../src/js/core/patchArena.js';

const makeEditor = (ice = false) => {
	const doc = createDocV3({
		columns: 4,
		rows: 2,
		mode: 'free',
		iceColors: ice,
	});
	const editor = createEditorCore(doc, { arena: createPatchArena() });
	return { doc, editor };
};

describe('mirror path independence', () => {
	it('steady bright classic bg quantizes the same on both paths', () => {
		const { doc, editor } = makeEditor(false);
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(65, 0),
			fg: paletteColor(7),
			bg: paletteColor(9), // steady bright, legal only under ice
		});
		const rebuild = v3ToU16Lossy(doc).imageData[1];
		const incremental = editor.getAreaU16(1, 0, 1, 1).data[0];
		expect(incremental).toBe(rebuild);
		// and the mirror word must read steady (dim bg nibble), not blink
		expect((incremental >> 4) & 8).toBe(0);
	});

	it('raw RGB words 0-15 quantize the same on both paths', () => {
		const { doc, editor } = makeEditor(false);
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(219, 0),
			fg: rgbColor(0, 0, 15), // numerically 15: NOT bright white
			bg: paletteColor(0),
		});
		const rebuild = v3ToU16Lossy(doc).imageData[0];
		const incremental = editor.getAreaU16(0, 0, 1, 1).data[0];
		expect(incremental).toBe(rebuild);
		expect(incremental & 15).toBe(0); // nearest palette entry is black
	});

	it('blink on an RGB bg projects blinking on both paths', () => {
		const { doc, editor } = makeEditor(false);
		doc.setCell(0, 2, 0, {
			glyph: glyphWord(65, ATTR_BLINK),
			fg: paletteColor(7),
			bg: rgbColor(100, 0, 0),
		});
		const rebuild = v3ToU16Lossy(doc).imageData[2];
		const incremental = editor.getAreaU16(2, 0, 1, 1).data[0];
		expect(incremental).toBe(rebuild);
		expect((incremental >> 4) & 8).toBe(8);
	});

	it('blink on a high palette index bg projects the same', () => {
		const { doc, editor } = makeEditor(false);
		doc.setCell(0, 2, 0, {
			glyph: glyphWord(65, ATTR_BLINK),
			fg: paletteColor(7),
			bg: paletteColor(42),
		});
		expect(editor.getAreaU16(2, 0, 1, 1).data[0]).toBe(
			v3ToU16Lossy(doc).imageData[2],
		);
	});

	it('bright fg rides beside an ext bg blink untouched', () => {
		const { doc, editor } = makeEditor(false);
		doc.setCell(0, 2, 0, {
			glyph: glyphWord(65, ATTR_BLINK),
			fg: paletteColor(15),
			bg: rgbColor(100, 0, 0),
		});
		const word = editor.getAreaU16(2, 0, 1, 1).data[0];
		expect(word).toBe(v3ToU16Lossy(doc).imageData[2]);
		expect(word & 15).toBe(15);
		expect((word >> 4) & 8).toBe(8);
	});

	it('ice drops the ext bg blink on both paths alike', () => {
		const { doc, editor } = makeEditor(true);
		doc.setCell(0, 2, 0, {
			glyph: glyphWord(65, ATTR_BLINK),
			fg: paletteColor(7),
			bg: rgbColor(100, 0, 0),
		});
		expect(editor.getAreaU16(2, 0, 1, 1).data[0]).toBe(
			v3ToU16Lossy(doc).imageData[2],
		);
	});
});

describe('plane native area round trips', () => {
	it('raw RGB near-black moves without recoloring', () => {
		const { doc, editor } = makeEditor(false);
		const fade = rgbColor(0, 0, 15);
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(219, 0),
			fg: fade,
			bg: paletteColor(0),
		});
		const area = editor.getAreaCells(0, 0, 1, 1);
		editor.setAreaCells(area, 2, 1);
		expect(doc.getCell(0, 2, 1).fg).toBe(fade);
	});

	it('steady bright bg and unicode glyphs survive a move', () => {
		const { doc, editor } = makeEditor(false);
		const snowman = doc.glyphTable.idFor(0, 0x2603);
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(snowman, 0),
			fg: paletteColor(7),
			bg: paletteColor(12),
		});
		const area = editor.getAreaCells(0, 0, 1, 1);
		editor.setAreaCells(area, 3, 1);
		const moved = doc.getCell(0, 3, 1);
		expect(moved.glyph & 0xffff).toBe(snowman);
		expect(moved.bg).toBe(paletteColor(12));
	});

	it('classic blink cells round trip their fold', () => {
		const { editor } = makeEditor(false);
		editor.drawBlocks(draw => draw(219, 14, 9, 0, 0), false); // bg 9 = blink + dim 1
		const area = editor.getAreaCells(0, 0, 1, 1);
		editor.setAreaCells(area, 1, 1);
		expect(editor.getAreaU16(1, 1, 1, 1).data[0]).toBe(
			editor.getAreaU16(0, 0, 1, 1).data[0],
		);
	});

	it('an ext bg blink cell stays path independent after a move', () => {
		const { doc, editor } = makeEditor(false);
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(65, ATTR_BLINK),
			fg: paletteColor(7),
			bg: rgbColor(100, 0, 0),
		});
		const area = editor.getAreaCells(0, 0, 1, 1);
		editor.setAreaCells(area, 2, 1);
		expect(editor.getAreaU16(2, 1, 1, 1).data[0]).toBe(
			v3ToU16Lossy(doc).imageData[6],
		);
	});
});
