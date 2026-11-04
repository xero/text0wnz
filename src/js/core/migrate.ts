/**
 * v2 autosave migration: IndexedDB -> OPFS importer. v2 persists
 * three pieces: the canvas snapshot
 * (`canvasData.currentCanvas` = {imageData: Uint16Array, columns,
 * rows}), an optional XB font (`fontData.XBIN` = {bytes, width,
 * height}), and lightweight settings in localStorage
 * (`text0wnz-settings` = {fontName, iceColors, letterSpacing,
 * scaleFactor, paletteColors: 6-bit [r,g,b,a][]}).
 *
 * This module is the pure transform of the pieces the doc models (the
 * canvas snapshot plus its ice, spacing, and palette settings) into a
 * v3 doc. The v2 stores are left untouched.
 *
 * v2 undo history (`undoHistory.currentUndoHistory`) is deliberately
 * NOT migrated: its chunk format encodes v2 engine internals, and
 * replaying it against the v3 planes would need the v2 engine anyway.
 *
 * v2 restores its 6-bit palette channels through round(v/63*255); v3
 * canonicalizes on high-bit replication (expand6to8), so a handful of
 * migrated channel values land one step off v2's rendering (15 -> 60,
 * not 61).
 */

import { DocV3, expand6to8, rgbColor } from './doc.js';
import { u16ToV3 } from './convert.js';

export interface V2CanvasData {
	imageData: Uint16Array | ArrayLike<number>;
	columns: number;
	rows: number;
}

export interface V2Settings {
	iceColors?: boolean;
	letterSpacing?: boolean;
	/** 6-bit [r, g, b, alpha] per entry, alpha ignored. */
	paletteColors?: ReadonlyArray<ReadonlyArray<number>>;
}

export interface V2AutosaveSnapshot {
	canvasData?: V2CanvasData | null;
	settings?: V2Settings | null;
}

export interface MigratedAutosave {
	doc: DocV3;
}

/**
 * Transform a v2 autosave snapshot into a v3 doc. Returns null when
 * there is no canvas snapshot: settings alone are not worth a journal.
 */
export const migrateV2Autosave = (
	snapshot: V2AutosaveSnapshot,
): MigratedAutosave | null => {
	const canvas = snapshot.canvasData;
	if (
		!canvas ||
		!canvas.imageData ||
		!Number.isInteger(canvas.columns) ||
		!Number.isInteger(canvas.rows) ||
		canvas.columns <= 0 ||
		canvas.rows <= 0
	) {
		return null;
	}
	const cells = canvas.columns * canvas.rows;
	const imageData =
		canvas.imageData instanceof Uint16Array
			? canvas.imageData
			: Uint16Array.from(canvas.imageData);
	if (imageData.length < cells) {
		return null; // truncated snapshot: safer to start fresh than guess
	}
	const settings = snapshot.settings ?? {};
	const doc = u16ToV3({
		imageData: imageData.subarray(0, cells),
		columns: canvas.columns,
		rows: canvas.rows,
		iceColors: settings.iceColors ?? false,
		letterSpacing: settings.letterSpacing ?? false,
	});

	if (settings.paletteColors) {
		settings.paletteColors.forEach((entry, index) => {
			if (index < doc.palette.length && entry && entry.length >= 3) {
				doc.palette[index] = rgbColor(
					expand6to8(entry[0]),
					expand6to8(entry[1]),
					expand6to8(entry[2]),
				);
			}
		});
	}
	return { doc };
};
