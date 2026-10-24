/**
 * The v3 editing engine core: v2 canvas.js's document mutations (draw
 * entry points, half-block painting, mirror mode, bright-bg optimize,
 * areas, undo groups) reproduced verbatim over the three-plane doc and
 * the patch arena. Pure TS: rendering, collab packets, and persistence
 * stay in the client, wired through the onWrite observer.
 *
 * Scope: classic16 editing (palette indices 0-15, CP437 glyphs). Cells
 * holding raw-RGB colors or unicode glyphs (tnd/dur/envelope loads)
 * pass through untouched by the optimize pass and read as non-blocky;
 * painting over them works.
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
import { U16Doc, quantizeColorWord, v3ToU16, v3ToU16Lossy } from './convert.js';
import { unicodeToCp437Strict } from './cp437.js';
import {
	EditCell,
	classifyHalfBlock,
	mirrorCharCode,
	mirrorX,
	optimizeCell,
	overlayHalfBlock,
} from './cellops.js';
import { cellInRange } from './mapping.js';
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
	/**
	 * Fires when the edited frame changes: explicit navigation, or an
	 * undo/redo landing on a stroke recorded in another frame. The
	 * client re-mirrors and repaints wholesale on this.
	 */
	onFrameChange?: (frameIndex: number) => void;
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
	getCurrentFrame: () => number;
	setCurrentFrame: (index: number) => boolean;
	addFrame: (options?: { copyFrom?: number; force?: boolean }) => number;
	removeFrame: (index: number) => void;
	/** remote ext cells: raw plane words, no undo/history (collab) */
	quickDrawExt: (
		cells: ReadonlyArray<{
			index: number;
			glyph: number;
			fg: number;
			bg: number;
		}>,
	) => void;
	startUndo: () => void;
	/** Commit the open stroke now instead of at the next flush point. */
	endUndo: () => void;
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
	 * remap through this doc's table, the palette is adopted wholesale
	 * (index words stay live), frames carry over, history clears. The
	 * doc object identity is preserved for the renderer bridges.
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

	/**
	 * Cell view for the tools. Colors are classic 0-15 indexes when the
	 * plane word is one; anything else (extended colors: tag-bit
	 * indexes above 15, raw RGB words) passes through as the WORD so a
	 * read-then-rewrite round trip cannot corrupt it. Values 0-15 and
	 * words are distinguishable everywhere that matters: index words
	 * carry bit 31, and the color picker never emits RGB words <= 15.
	 * Accepted loss: blink folds into the bg only for classic bgs, so
	 * ATTR_BLINK on an extended bg is invisible here and normalizes
	 * away on rewrite (still narrower than the u16 area paths, which
	 * quantize such cells entirely).
	 */
	const readCell = (index: number): EditCell => {
		const frame = doc.frames[currentFrame];
		// out of range reads return a blank cell instead of undefined
		// plane words; wrapped positive indexes are the callers' guard
		if (!Number.isInteger(index) || index < 0 || index >= frame.glyph.length) {
			return { charCode: 0, fg: 0, bg: 0 };
		}
		const glyph = frame.glyph[index];
		const blink = (attrsOf(glyph) & ATTR_BLINK) !== 0;
		const classic = (word: number): number | null =>
			isPaletteColor(word) && paletteIndexOf(word) <= 15
				? paletteIndexOf(word)
				: null;
		const fgIndex = classic(frame.fg[index]);
		const bgIndex = classic(frame.bg[index]);
		return {
			charCode: glyphIdOf(glyph),
			fg: fgIndex ?? frame.fg[index] >>> 0,
			bg:
				bgIndex !== null
					? blink
						? bgIndex | 8
						: bgIndex
					: frame.bg[index] >>> 0,
		};
	};

	const isClassic = (value: number): boolean => value >= 0 && value <= 15;

	const packWord = (cell: EditCell): number => {
		let charCode = cell.charCode;
		if (charCode > 0xff) {
			// unicode glyph ids quantize for the u16 mirror and the vanilla
			// collab wire exactly like v3ToU16Lossy: strict reverse else '?'
			const def = doc.glyphTable.get(charCode);
			charCode = (def && unicodeToCp437Strict(def.codepoint)) ?? 63;
		}
		// extended colors quantize the same way v3ToU16Lossy does, so the
		// mirror, the wire, and the lossy projection can never disagree
		const fgIndex = isClassic(cell.fg)
			? cell.fg & 15
			: quantizeColorWord(cell.fg >>> 0, doc, 16);
		const bgNibble = isClassic(cell.bg)
			? cell.bg & 15
			: quantizeColorWord(cell.bg >>> 0, doc, doc.getIceColors() ? 16 : 8);
		return (charCode << 8) | (bgNibble << 4) | fgIndex;
	};

	/** Fold a cell into plane words per the doc's ice flag. */
	const planeWords = (cell: EditCell): Cell => {
		const classicBg = isClassic(cell.bg);
		const blink = !doc.getIceColors() && classicBg && cell.bg > 7;
		return {
			glyph: glyphWord(cell.charCode, blink ? ATTR_BLINK : 0),
			fg: isClassic(cell.fg) ? paletteColor(cell.fg & 15) : cell.fg >>> 0,
			bg: classicBg
				? paletteColor(blink ? cell.bg & 7 : cell.bg & 15)
				: cell.bg >>> 0,
		};
	};

	// --------------------------------------------------- stroke plumbing

	let strokeOpen = false;
	// the frame every read/write/draw targets; strokes record it, and
	// undo/redo navigate back to the frame they touch
	let currentFrame = 0;

	const ensureStroke = () => {
		if (!strokeOpen) {
			arena.beginStroke({ frame: currentFrame });
			strokeOpen = true;
		}
	};

	const switchFrame = (index: number): boolean => {
		if (!Number.isInteger(index) || index < 0 || index >= doc.frames.length) {
			return false;
		}
		if (index === currentFrame) {
			return true;
		}
		flushStroke();
		currentFrame = index;
		options.onFrameChange?.(index);
		return true;
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
		const frame = doc.frames[currentFrame];
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
		const cols = columns();
		const rowCount = doc.getRows();
		callback((charCode, foreground, background, x, y) => {
			// defense in depth (wrap audit): a fractional or out of range
			// cell would wrap through the index to another row, or no-op
			// past the planes while still recording undo and echoing to
			// collab; tools clamp, but no future tool's math may corrupt
			if (!cellInRange(x, y, cols, rowCount)) {
				return;
			}
			const index = y * cols + x;
			blocks.push([index, x, y]);
			writeCell(index, { charCode, fg: foreground, bg: background }, true);
			if (mirrorMode) {
				const mx = mirrorX(cols, x);
				if (mx >= 0 && mx < cols) {
					const mirrorIndex = y * cols + mx;
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
		const cols = columns();
		const rowCount = doc.getRows();
		callback((foreground, x, y) => {
			const textY = Math.floor(y / 2);
			// same wrap guard as drawBlocks, in half block coordinates
			if (!cellInRange(x, textY, cols, rowCount)) {
				return;
			}
			const index = textY * cols + x;
			blocks.push([index, x, textY]);
			paintHalf(index, foreground, y);
			if (mirrorMode) {
				const mx = mirrorX(cols, x);
				if (mx >= 0 && mx < cols) {
					const mirrorIndex = textY * cols + mx;
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
		// the blink<->bright fold is CLASSIC16 semantics only: extended
		// backgrounds (raw RGB, palette indexes above 15) pass through the
		// ice toggle untouched, keeping their blink attr as-is (the attr
		// bit exists everywhere; ice folding is 16-color-only)
		const classicBg =
			isPaletteColor(frame.bg[i]) && paletteIndexOf(frame.bg[i]) <= 15;
		if (!classicBg) {
			return;
		}
		if (ice && attrs & ATTR_BLINK) {
			const bgIndex = paletteIndexOf(frame.bg[i]) & 7;
			frame.glyph[i] = glyphWord(
				glyphIdOf(frame.glyph[i]),
				attrs & ~ATTR_BLINK,
			);
			frame.bg[i] = paletteColor(bgIndex | 8);
		} else if (
			!ice &&
			!(attrs & ATTR_BLINK) &&
			paletteIndexOf(frame.bg[i]) > 7
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
			// a wrapped read is as wrong as a wrapped write: out of range
			// coordinates read as a blank cell, never a neighboring row
			const cell = cellInRange(x, y, columns(), doc.getRows())
				? readCell(y * columns() + x)
				: { charCode: 0, fg: 0, bg: 0 };
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
			const info = classifyHalfBlock(
				cellInRange(x, textY, columns(), doc.getRows())
					? readCell(textY * columns() + x)
					: { charCode: 0, fg: 0, bg: 0 },
			);
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
			const cols = columns();
			const rowCount = doc.getRows();
			for (let dy = 0, j = 0; dy < height; dy++) {
				for (let dx = 0; dx < width; dx++, j++) {
					// cells sampled past an edge read blank, never wrapped
					data[j] = cellInRange(x + dx, y + dy, cols, rowCount)
						? packWord(readCell((y + dy) * cols + (x + dx)))
						: 0;
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
			const frameLength = doc.frames[currentFrame].glyph.length;
			for (const block of blocks) {
				const [index, word] = block;
				// network input: a wrapped or out of range index must not
				// land in another row, and a word outside u16 must not
				// store garbage glyphs that echo back onto the wire
				if (
					!Number.isInteger(index) ||
					index < 0 ||
					index >= frameLength ||
					!Number.isInteger(word) ||
					word < 0 ||
					word > 0xffff
				) {
					continue;
				}
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
		quickDrawExt: cells => {
			// remote full-fidelity cells (collab extension suite): raw plane
			// words, no undo, no history; like quickDrawU16, the mirror
			// stays consistent through the same packWord projection
			const frame = doc.frames[currentFrame];
			for (const { index, glyph, fg, bg } of cells) {
				if (
					!Number.isInteger(index) ||
					index < 0 ||
					index >= frame.glyph.length
				) {
					continue;
				}
				frame.glyph[index] = glyph >>> 0;
				frame.fg[index] = fg >>> 0;
				frame.bg[index] = bg >>> 0;
				emit(index, packWord(readCell(index)), false);
			}
		},
		startUndo: () => {
			flushStroke();
			arena.dropRedo();
		},
		endUndo: () => {
			flushStroke();
		},
		undo: () => {
			flushStroke();
			const touched = new Set<number>();
			const meta = arena.undo(doc, (_plane, index) => touched.add(index));
			// a stroke from another frame pulls the view there first, so
			// the refold, the mirror, and the repaint all see that frame
			if (meta && meta.frame !== currentFrame) {
				switchFrame(meta.frame);
			}
			for (const index of touched) {
				// Strokes recorded before an ice toggle restore words in the
				// old blink fold; re-express them like v2's flag semantics
				refoldIndex(doc.frames[currentFrame], index, doc.getIceColors());
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
			if (meta && meta.frame !== currentFrame) {
				switchFrame(meta.frame);
			}
			for (const index of touched) {
				refoldIndex(doc.frames[currentFrame], index, doc.getIceColors());
				emit(index, packWord(readCell(index)), true);
			}
			return meta !== null;
		},
		getCurrentFrame: () => currentFrame,
		/** navigation, never undoable; false = index out of range */
		setCurrentFrame: index => switchFrame(index),
		/** append a frame (blank or copied); undo history survives */
		addFrame: addOptions => {
			flushStroke();
			return doc.addFrame(addOptions);
		},
		/**
		 * remove a frame; later frames shift down, leaving recorded
		 * stroke frame indexes stale, so the undo history drops (as on
		 * resize) and the view lands on the nearest surviving frame
		 */
		removeFrame: index => {
			flushStroke();
			arena.clear();
			doc.removeFrame(index);
			currentFrame = Math.min(
				index < currentFrame ? currentFrame - 1 : currentFrame,
				doc.frames.length - 1,
			);
			options.onFrameChange?.(currentFrame);
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
			currentFrame = 0; // silent: loadDoc callers rebuild wholesale
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
			// adopt the source palette wholesale: index words stay LIVE; the
			// renderers resolve indexes past the palette length through the
			// canonical xterm table (freezing to RGB would turn a short
			// palette's high indexes black)
			doc.palette = new Uint32Array(source.palette);
			source.frames.forEach((src, f) => {
				const target = doc.frames[f];
				target.delayMs = src.delayMs;
				for (let i = 0; i < src.glyph.length; i++) {
					const def = source.glyphTable.get(glyphIdOf(src.glyph[i]));
					const id = def
						? doc.glyphTable.idFor(def.fontSlot, def.codepoint)
						: 0;
					target.glyph[i] = glyphWord(id, attrsOf(src.glyph[i]));
					target.fg[i] = src.fg[i];
					target.bg[i] = src.bg[i];
				}
			});
		},
		loadU16: (imageData, newColumns, newRows, iceColors) => {
			flushStroke();
			arena.clear();
			currentFrame = 0; // silent: callers rebuild wholesale
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
			// New-document semantics: back to a single blank frame
			currentFrame = 0;
			while (doc.frames.length > 1) {
				doc.removeFrame(doc.frames.length - 1);
			}
			const frame = doc.frames[0];
			frame.glyph.fill(0);
			frame.fg.fill(paletteColor(0));
			frame.bg.fill(paletteColor(0));
			doc.setIceColors(false);
		},
	};
};
