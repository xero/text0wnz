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

/** v2 cell word, high bits first: charCode:8 | bg:4 | fg:4. */
const v2Cell = (charCode: number, fg: number, bg: number): number =>
	(charCode << 8) | (fg & 0x0f) | ((bg & 0x0f) << 4);

const snapshot = () => {
	const imageData = new Uint16Array(8 * 2);
	imageData[0] = v2Cell(219, 14, 1);
	imageData[9] = v2Cell(176, 7, 0);
	return {
		canvasData: { imageData, columns: 8, rows: 2 },
		settings: {
			iceColors: true,
			letterSpacing: true,
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
		const { doc } = migrated!;
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
		// the migrated doc is still u16-faithful
		expect(v3ToU16(doc).imageData).toEqual(snapshot().canvasData.imageData);
	});

	it('feeds straight into an OPFS journal keyframe', async () => {
		const migrated = migrateV2Autosave(snapshot());
		const journal = await createJournal(migrated!.doc);
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
