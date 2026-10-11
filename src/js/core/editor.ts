/**
 * The v3 editing engine core (PLAN.md §4 P2 "engine swap"): v2
 * canvas.js's document mutations — draw entry points, half-block
 * painting, mirror mode, bright-bg optimize, areas, undo groups —
 * reproduced verbatim over the three-plane doc and the patch arena.
 * Pure TS: rendering, collab packets, and persistence stay in the
 * client, wired through the onWrite observer.
 *
 * Scope: classic16 editing (palette indices 0-15, CP437 glyphs), which
 * is everything the P2 tools emit. Cells holding raw-RGB colors or
 * unicode glyphs (tnd/dur/envelope loads) pass through untouched by the
 * optimize pass and read as non-blocky; painting over them works.
 *
 * Blink folding: v2 stores bg nibbles 8-15 raw and interprets bright-vs-
 * blink at render time via the ice flag. v3 bakes the interpretation
 * into the planes (attr bit 0 + dim bg) per the u16<->v3 round-trip law,
 * so writes fold by the doc's current flag and setIceColors REWRITES the
 * planes. toU16() output stays word-identical with v2 across toggles.
 */

import {
	ATTR_BLINK,
	Cell,
	DocV3,
	attrsOf,
	glyphIdOf,
	glyphWord,
	isPaletteColor,
	paletteColor,
	paletteIndexOf,
} from './doc.js';
import { U16Doc, v3ToU16, v3ToU16Lossy } from './convert.js';
import { unicodeToCp437Strict } from './cp437.js';
import {
	EditCell,
	classifyHalfBlock,
	mirrorCharCode,
	mirrorX,
	optimizeCell,
	overlayHalfBlock,
} from './cellops.js';
import { PatchArena, createPatchArena } from './patchArena.js';

/** One applied cell write, in both v3 and u16 terms. */
export interface EditorWrite {
	index: number;
	x: number;
	y: number;
	/** v2-packed u16 word (charCode<<8 | bg<<4 | fg) after the write. */
	word: number;
	/**
	 * True when the write belongs in the collab draw history (local
	 * edits, undo, redo); false for network echoes (v2 quickDraw).
	 */
	history: boolean;
}

export interface EditorCoreOptions {
	arena?: PatchArena;
	/** Observer for every visible cell change (draws, undo, redo). */
	onWrite?: (write: EditorWrite) => void;
}

export type DrawBlock = (
	charCode: number,
	foreground: number,
	background: number,
	x: number,
	y: number,
) => void;

export type DrawHalfBlock = (foreground: number, x: number, y: number) => void;

export interface HalfBlockAt {
	x: number;
	y: number;
	textY: number;
	halfBlockY: number;
	isBlocky: boolean;
	upperBlockColor: number;
	lowerBlockColor: number;
	isVerticalBlocky: boolean;
	leftBlockColor: number | undefined;
	rightBlockColor: number | undefined;
}

export interface EditorCore {
	readonly doc: DocV3;
	readonly arena: PatchArena;
	getBlock: (
		x: number,
		y: number,
	) => {
		x: number;
		y: number;
		charCode: number;
		foregroundColor: number;
		backgroundColor: number;
	};
	getHalfBlockAt: (x: number, y: number) => HalfBlockAt;
	/** v2 drawEntryPoint: one undoable batch, mirror + optional optimize. */
	drawBlocks: (callback: (draw: DrawBlock) => void, optimise?: boolean) => void;
	/** v2 drawHalfBlockEntryPoint: half-block painting, always optimized. */
	drawHalfBlocks: (callback: (draw: DrawHalfBlock) => void) => void;
	deleteArea: (
		x: number,
		y: number,
		width: number,
		height: number,
		background: number,
	) => void;
	getAreaU16: (
		x: number,
		y: number,
		width: number,
		height: number,
	) => { data: Uint16Array; width: number; height: number };
	setAreaU16: (
		area: { data: Uint16Array; width: number; height: number },
		x: number,
		y: number,
	) => void;
	/** Network writes: [index, u16word, x, y][], never undoable. */
	quickDrawU16: (blocks: ReadonlyArray<ReadonlyArray<number>>) => void;
	startUndo: () => void;
	undo: () => boolean;
	redo: () => boolean;
	setMirrorMode: (enabled: boolean) => void;
	getMirrorMode: () => boolean;
	getMirrorX: (x: number) => number;
	/** Rewrites the planes to the new blink interpretation. */
	setIceColors: (ice: boolean) => void;
	toU16: () => U16Doc;
	/** Quantized projection for the fallback renderer/collab mirror. */
	toU16Lossy: () => U16Doc;
	/** v2 setImageData: replace content wholesale, clearing history. */
	loadU16: (
		imageData: Uint16Array,
		columns: number,
		rows: number,
		iceColors: boolean,
	) => void;
	/**
	 * Adopt a decoded DocV3's content (tnd/dur/envelope loads): glyphs
	 * remap through this doc's table, palette indexes past 15 freeze to
	 * their RGB (no 256-entry rendering until P3), frames carry over,
	 * history clears. The doc object identity is preserved for the
	 * renderer bridges.
	 */
	loadDoc: (source: DocV3) => void;
	/** v2 resize semantics: overlap copy, history cleared. */
	resize: (columns: number, rows: number) => void;
	clear: () => void;
}

export const createEditorCore = (
	doc: DocV3,
	options: EditorCoreOptions = {},
): EditorCore => {
	const arena = options.arena ?? createPatchArena();
	let mirrorMode = false;

	const columns = () => doc.getColumns();

	// ------------------------------------------------------- cell access

	/** Classic16 view of a cell; non-classic parts degrade like v2 nibbles. */
	const readCell = (index: number): EditCell => {
		const frame = doc.frames[0];
		const glyph = frame.glyph[index];
		const fgWord = frame.fg[index];
		const bgWord = frame.bg[index];
		const blink = (attrsOf(glyph) & ATTR_BLINK) !== 0;
		const fg = isPaletteColor(fgWord) ? paletteIndexOf(fgWord) & 15 : 0;
		const bgIndex = isPaletteColor(bgWord) ? paletteIndexOf(bgWord) & 15 : 0;
		return {
			charCode: glyphIdOf(glyph),
			fg,
			bg: blink ? bgIndex | 8 : bgIndex,
		};
	};

	const packWord = (cell: EditCell): number => {
		let charCode = cell.charCode;
		if (charCode > 0xff) {
			// unicode glyph ids quantize for the u16 mirror and the vanilla
			// collab wire exactly like v3ToU16Lossy: strict reverse else '?'
			const def = doc.glyphTable.get(charCode);
			charCode = (def && unicodeToCp437Strict(def.codepoint)) ?? 63;
		}
		return (charCode << 8) | ((cell.bg & 15) << 4) | (cell.fg & 15);
	};

	/** Fold a classic16 cell into plane words per the doc's ice flag. */
	const planeWords = (cell: EditCell): Cell => {
		const blink = !doc.getIceColors() && cell.bg > 7;
		return {
			glyph: glyphWord(cell.charCode, blink ? ATTR_BLINK : 0),
			fg: paletteColor(cell.fg & 15),
			bg: paletteColor(blink ? cell.bg & 7 : cell.bg & 15),
		};
	};

	// --------------------------------------------------- stroke plumbing

	let strokeOpen = false;

	const ensureStroke = () => {
		if (!strokeOpen) {
			arena.beginStroke({ frame: 0 });
			strokeOpen = true;
		}
	};

	const flushStroke = () => {
		if (strokeOpen) {
			arena.endStroke();
			strokeOpen = false;
		}
	};

	const emit = (index: number, word: number, history: boolean) => {
		options.onWrite?.({
			index,
			x: index % columns(),
			y: Math.floor(index / columns()),
			word,
			history,
		});
	};

	const writeCell = (index: number, cell: EditCell, undoable: boolean) => {
		const frame = doc.frames[0];
		const words = planeWords(cell);
		if (undoable) {
			ensureStroke();
			arena.record('glyph', index, frame.glyph[index], words.glyph);
			arena.record('fg', index, frame.fg[index], words.fg);
			arena.record('bg', index, frame.bg[index], words.bg);
		}
		frame.glyph[index] = words.glyph;
		frame.fg[index] = words.fg;
		frame.bg[index] = words.bg;
		emit(index, packWord(cell), undoable);
	};

	// -------------------------------------------------------- operations

	const optimizeBlocks = (blocks: Array<[number, number, number]>) => {
		for (const [index] of blocks) {
			const replacement = optimizeCell(readCell(index));
			if (replacement) {
				writeCell(index, replacement, true);
			}
		}
	};

	const drawBlocks: EditorCore['drawBlocks'] = (callback, optimise) => {
		const blocks: Array<[number, number, number]> = [];
		callback((charCode, foreground, background, x, y) => {
			const index = y * columns() + x;
			blocks.push([index, x, y]);
			writeCell(index, { charCode, fg: foreground, bg: background }, true);
			if (mirrorMode) {
				const mx = mirrorX(columns(), x);
				if (mx >= 0 && mx < columns()) {
					const mirrorIndex = y * columns() + mx;
					blocks.push([mirrorIndex, mx, y]);
					writeCell(
						mirrorIndex,
						{
							charCode: mirrorCharCode(charCode),
							fg: foreground,
							bg: background,
						},
						true,
					);
				}
			}
		});
		if (optimise) {
			optimizeBlocks(blocks);
		}
	};

	const paintHalf = (index: number, foreground: number, y: number) => {
		// v2 drawWithUndo records the before-word even when the overlay
		// turns out to be a no-op; arena dedupe makes that harmless
		const cell = readCell(index);
		const replacement = overlayHalfBlock(cell, foreground, y % 2 === 0);
		if (replacement) {
			writeCell(index, replacement, true);
		} else {
			ensureStroke();
		}
	};

	const drawHalfBlocks: EditorCore['drawHalfBlocks'] = callback => {
		const blocks: Array<[number, number, number]> = [];
		callback((foreground, x, y) => {
			const textY = Math.floor(y / 2);
			const index = textY * columns() + x;
			blocks.push([index, x, textY]);
			paintHalf(index, foreground, y);
			if (mirrorMode) {
				const mx = mirrorX(columns(), x);
				if (mx >= 0 && mx < columns()) {
					const mirrorIndex = textY * columns() + mx;
					blocks.push([mirrorIndex, mx, textY]);
					paintHalf(mirrorIndex, foreground, y);
				}
			}
		});
		optimizeBlocks(blocks);
	};

	/**
	 * Re-express one cell under the given blink interpretation. u16
	 * words are invariant under this, which is exactly v2's flag flip.
	 */
	const refoldIndex = (
		frame: { glyph: Uint32Array; bg: Uint32Array },
		i: number,
		ice: boolean,
	) => {
		const attrs = attrsOf(frame.glyph[i]);
		if (ice && attrs & ATTR_BLINK) {
			const bgIndex = isPaletteColor(frame.bg[i])
				? paletteIndexOf(frame.bg[i]) & 7
				: 0;
			frame.glyph[i] = glyphWord(
				glyphIdOf(frame.glyph[i]),
				attrs & ~ATTR_BLINK,
			);
			frame.bg[i] = paletteColor(bgIndex | 8);
		} else if (
			!ice &&
			!(attrs & ATTR_BLINK) &&
			isPaletteColor(frame.bg[i]) &&
			(paletteIndexOf(frame.bg[i]) & 15) > 7
		) {
			const bgIndex = paletteIndexOf(frame.bg[i]) & 15;
			frame.glyph[i] = glyphWord(glyphIdOf(frame.glyph[i]), attrs | ATTR_BLINK);
			frame.bg[i] = paletteColor(bgIndex & 7);
		}
	};

	const refoldPlanes = (ice: boolean) => {
		for (const frame of doc.frames) {
			for (let i = 0; i < frame.glyph.length; i++) {
				refoldIndex(frame, i, ice);
			}
		}
	};

	return {
		doc,
		arena,
		getBlock: (x, y) => {
			const cell = readCell(y * columns() + x);
			return {
				x,
				y,
				charCode: cell.charCode,
				foregroundColor: cell.fg,
				backgroundColor: cell.bg,
			};
		},
		getHalfBlockAt: (x, y) => {
			const textY = Math.floor(y / 2);
			const info = classifyHalfBlock(readCell(textY * columns() + x));
			return { x, y, textY, halfBlockY: y % 2, ...info };
		},
		drawBlocks,
		drawHalfBlocks,
		deleteArea: (x, y, width, height, background) => {
			drawBlocks(draw => {
				for (let dy = y; dy < y + height; dy++) {
					for (let dx = x; dx < x + width; dx++) {
						draw(0, 0, background, dx, dy);
					}
				}
			});
		},
		getAreaU16: (x, y, width, height) => {
			const data = new Uint16Array(width * height);
			for (let dy = 0, j = 0; dy < height; dy++) {
				for (let dx = 0; dx < width; dx++, j++) {
					data[j] = packWord(readCell((y + dy) * columns() + (x + dx)));
				}
			}
			return { data, width, height };
		},
		setAreaU16: (area, x, y) => {
			const maxWidth = Math.min(area.width, columns() - x);
			const maxHeight = Math.min(area.height, doc.getRows() - y);
			drawBlocks(draw => {
				for (let py = 0; py < maxHeight; py++) {
					for (let px = 0; px < maxWidth; px++) {
						const attrib = area.data[py * area.width + px];
						draw(attrib >> 8, attrib & 15, (attrib >> 4) & 15, x + px, y + py);
					}
				}
			});
		},
		quickDrawU16: blocks => {
			for (const block of blocks) {
				const [index, word] = block;
				const cell: EditCell = {
					charCode: word >> 8,
					fg: word & 15,
					bg: (word >> 4) & 15,
				};
				if (packWord(readCell(index)) !== word) {
					writeCell(index, cell, false);
				}
			}
		},
		startUndo: () => {
			flushStroke();
			arena.dropRedo();
		},
		undo: () => {
			flushStroke();
			const touched = new Set<number>();
			const meta = arena.undo(doc, (_plane, index) => touched.add(index));
			for (const index of touched) {
				// Strokes recorded before an ice toggle restore words in the
				// old blink fold; re-express them like v2's flag semantics
				refoldIndex(doc.frames[0], index, doc.getIceColors());
				emit(index, packWord(readCell(index)), true);
			}
			return meta !== null;
		},
		redo: () => {
			// v2 redo is a FULL no-op on an empty redo buffer: the pending
			// stroke keeps accumulating (undo flushes it, redo does not)
			if (!arena.stats().canRedo) {
				return false;
			}
			flushStroke();
			const touched = new Set<number>();
			const meta = arena.redo(doc, (_plane, index) => touched.add(index));
			for (const index of touched) {
				refoldIndex(doc.frames[0], index, doc.getIceColors());
				emit(index, packWord(readCell(index)), true);
			}
			return meta !== null;
		},
		setMirrorMode: enabled => {
			mirrorMode = enabled;
		},
		getMirrorMode: () => mirrorMode,
		getMirrorX: x => mirrorX(columns(), x),
		setIceColors: ice => {
			if (doc.getIceColors() !== ice) {
				doc.setIceColors(ice);
				refoldPlanes(ice);
			}
		},
		toU16: () => v3ToU16(doc),
		toU16Lossy: () => v3ToU16Lossy(doc),
		loadDoc: source => {
			flushStroke();
			arena.clear();
			doc.resize(source.getColumns(), source.getRows());
			doc.setIceColors(source.getIceColors());
			doc.setLetterSpacing(source.getLetterSpacing());
			doc.setGlobalDelayMs(source.getGlobalDelayMs());
			while (doc.frames.length > source.frames.length) {
				doc.removeFrame(doc.frames.length - 1);
			}
			while (doc.frames.length < source.frames.length) {
				doc.addFrame({ force: true });
			}
			const freeze = (word: number): number => {
				if (!isPaletteColor(word)) {
					return word;
				}
				const index = paletteIndexOf(word);
				if (index < 16) {
					return word; // live palette semantics, like every classic load
				}
				return index < source.palette.length
					? source.palette[index] & 0x00ffffff
					: 0;
			};
			source.frames.forEach((src, f) => {
				const target = doc.frames[f];
				target.delayMs = src.delayMs;
				for (let i = 0; i < src.glyph.length; i++) {
					const def = source.glyphTable.get(glyphIdOf(src.glyph[i]));
					const id = def
						? doc.glyphTable.idFor(def.fontSlot, def.codepoint)
						: 0;
					target.glyph[i] = glyphWord(id, attrsOf(src.glyph[i]));
					target.fg[i] = freeze(src.fg[i]);
					target.bg[i] = freeze(src.bg[i]);
				}
			});
		},
		loadU16: (imageData, newColumns, newRows, iceColors) => {
			flushStroke();
			arena.clear();
			doc.resize(newColumns, newRows);
			doc.setIceColors(iceColors);
			const frame = doc.frames[0];
			for (let i = 0; i < imageData.length && i < frame.glyph.length; i++) {
				const word = imageData[i];
				const bgNibble = (word >> 4) & 15;
				const blink = !iceColors && bgNibble > 7;
				frame.glyph[i] = glyphWord(word >> 8, blink ? ATTR_BLINK : 0);
				frame.fg[i] = paletteColor(word & 15);
				frame.bg[i] = paletteColor(blink ? bgNibble & 7 : bgNibble);
			}
		},
		resize: (newColumns, newRows) => {
			if (
				(newColumns !== columns() || newRows !== doc.getRows()) &&
				newColumns > 0 &&
				newRows > 0
			) {
				flushStroke();
				arena.clear();
				doc.resize(newColumns, newRows);
			}
		},
		clear: () => {
			flushStroke();
			arena.clear();
			const frame = doc.frames[0];
			frame.glyph.fill(0);
			frame.fg.fill(paletteColor(0));
			frame.bg.fill(paletteColor(0));
			doc.setIceColors(false);
		},
	};
};
