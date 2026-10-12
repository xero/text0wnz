/**
 * v2 autosave migration: IndexedDB -> OPFS importer.
 * v2 persists three pieces: the canvas snapshot
 * (`canvasData.currentCanvas` = {imageData: Uint16Array, columns,
 * rows}), an optional XB font (`fontData.XBIN` = {bytes, width,
 * height}), and lightweight settings in localStorage
 * (`text0wnz-settings` = {fontName, iceColors, letterSpacing,
 * scaleFactor, paletteColors: 6-bit [r,g,b,a][]}).
 *
 * This module is the pure transform: v2 shapes in, a v3 doc (plus the
 * client-side leftovers the doc does not model) out. The client store
 * reads IndexedDB/localStorage, calls this, and writes the result as
 * the opening keyframe of a fresh OPFS journal. The old stores are left
 * untouched; deleting them is the owner's call once v3 autosave has
 * proven itself.
 *
 * v2 undo history (`undoHistory.currentUndoHistory`) is deliberately
 * NOT migrated: its chunk format encodes v2 engine internals, and
 * replaying it against the v3 planes would need the old engine anyway.
 * Content survives; the undo stack starts fresh after the swap.
 *
 * Palette note: v2 saves 6-bit channels and restores them through
 * setRGBAColor's round(v/63*255) expansion; v3 canonicalizes on
 * high-bit replication (expand6to8, the Moebius rule). Migrated
 * palettes take the canonical path, so a handful of channel values land
 * one step off v2's rendering (e.g. 15 -> 60, not 61). That is the
 * documented doc.ts reconciliation, applied here at the wiring seam.
 */

import { DocV3, expand6to8, rgbColor } from './doc.js';
import { u16ToV3 } from './convert.js';

export interface V2CanvasData {
	imageData: Uint16Array | ArrayLike<number>;
	columns: number;
	rows: number;
}

export interface V2XBFont {
	bytes: Uint8Array | ArrayLike<number>;
	width: number;
	height: number;
}

export interface V2Settings {
	fontName?: string;
	iceColors?: boolean;
	letterSpacing?: boolean;
	scaleFactor?: number;
	/** 6-bit [r, g, b, alpha] per entry, alpha ignored. */
	paletteColors?: ReadonlyArray<ReadonlyArray<number>>;
}

export interface V2AutosaveSnapshot {
	canvasData?: V2CanvasData | null;
	settings?: V2Settings | null;
	xbFont?: V2XBFont | null;
}

export interface MigratedAutosave {
	doc: DocV3;
	/** XB font planes for the envelope keyframe, when v2 carried one. */
	fontBytes: Uint8Array | null;
	fontHeight: number | null;
	/** Client-side leftovers the doc does not model. */
	fontName: string | null;
	scaleFactor: number;
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

	let fontBytes: Uint8Array | null = null;
	let fontHeight: number | null = null;
	const xbFont = snapshot.xbFont;
	if (xbFont && xbFont.bytes && xbFont.height > 0) {
		fontBytes =
			xbFont.bytes instanceof Uint8Array
				? xbFont.bytes
				: Uint8Array.from(xbFont.bytes);
		fontHeight = xbFont.height;
	}
	return {
		doc,
		fontBytes,
		fontHeight,
		fontName: settings.fontName ?? null,
		scaleFactor: settings.scaleFactor ?? 1,
	};
};
