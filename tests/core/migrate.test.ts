import { describe, it, expect } from 'vitest';
import {
	expand6to8,
	glyphWord,
	paletteColor,
	rgbColor,
} from '../../src/js/core/doc.js';
import { migrateV2Autosave } from '../../src/js/core/migrate.js';
import { v3ToU16 } from '../../src/js/core/convert.js';
import { createJournal, replayJournal } from '../../src/js/core/journal.js';

/** v2 cell word: charCode:8 | fg:4 | bg:4 (big-endian u16 layout). */
const v2Cell = (charCode: number, fg: number, bg: number): number =>
	(charCode << 8) | (fg & 0x0f) | ((bg & 0x0f) << 4);

const snapshot = () => {
	const imageData = new Uint16Array(8 * 2);
	imageData[0] = v2Cell(219, 14, 1);
	imageData[9] = v2Cell(176, 7, 0);
	return {
		canvasData: { imageData, columns: 8, rows: 2 },
		settings: {
			fontName: 'CP437 8x16',
			iceColors: true,
			letterSpacing: true,
			scaleFactor: 2,
			paletteColors: [
				[0, 0, 0, 255],
				[0, 0, 63, 255], // v2 user remapped blue to bright blue
			] as number[][],
		},
	};
};

describe('v2 autosave migration', () => {
	it('converts the v2 snapshot into a v3 doc with settings applied', () => {
		const migrated = migrateV2Autosave(snapshot());
		expect(migrated).not.toBeNull();
		const { doc, fontName, scaleFactor, fontBytes, fontHeight } = migrated!;
		expect(doc.getColumns()).toBe(8);
		expect(doc.getRows()).toBe(2);
		expect(doc.getIceColors()).toBe(true);
		expect(doc.getLetterSpacing()).toBe(true);
		expect(doc.getCell(0, 0, 0)).toEqual({
			glyph: glyphWord(219, 0),
			fg: paletteColor(14),
			bg: paletteColor(1),
		});
		expect(doc.getCell(0, 1, 1).glyph).toBe(glyphWord(176, 0));
		// canonical 6->8 expansion, not v2's rounding path
		expect(doc.palette[1]).toBe(rgbColor(0, 0, expand6to8(63)));
		expect(fontName).toBe('CP437 8x16');
		expect(scaleFactor).toBe(2);
		expect(fontBytes).toBeNull();
		expect(fontHeight).toBeNull();
		// the migrated doc is still u16-faithful
		expect(v3ToU16(doc).imageData).toEqual(snapshot().canvasData.imageData);
	});

	it('carries the XB font through to the keyframe fields', () => {
		const font = new Uint8Array(256 * 14).fill(0xaa);
		const migrated = migrateV2Autosave({
			...snapshot(),
			xbFont: { bytes: font, width: 8, height: 14 },
		});
		expect(migrated?.fontBytes).toEqual(font);
		expect(migrated?.fontHeight).toBe(14);
	});

	it('feeds straight into an OPFS journal keyframe', async () => {
		const migrated = migrateV2Autosave(snapshot());
		const journal = await createJournal(migrated!.doc, {
			fontBytes: migrated!.fontBytes,
			fontHeight: migrated!.fontHeight ?? undefined,
		});
		const replay = await replayJournal(journal);
		expect(replay.doc.frames[0].glyph).toEqual(migrated!.doc.frames[0].glyph);
		expect(replay.doc.getIceColors()).toBe(true);
	});

	it('returns null without a usable canvas snapshot', () => {
		expect(migrateV2Autosave({})).toBeNull();
		expect(migrateV2Autosave({ canvasData: null, settings: {} })).toBeNull();
		expect(
			migrateV2Autosave({
				canvasData: { imageData: new Uint16Array(4), columns: 0, rows: 2 },
			}),
		).toBeNull();
		// truncated snapshot: starting fresh beats guessing
		expect(
			migrateV2Autosave({
				canvasData: { imageData: new Uint16Array(4), columns: 8, rows: 2 },
			}),
		).toBeNull();
	});

	it('tolerates plain-array image data from structured clones', () => {
		const migrated = migrateV2Autosave({
			canvasData: {
				imageData: [v2Cell(65, 7, 0), 0, 0, 0],
				columns: 2,
				rows: 2,
			},
		});
		expect(migrated?.doc.getCell(0, 0, 0).glyph).toBe(glyphWord(65, 0));
	});
});
