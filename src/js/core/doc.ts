/**
 * v3 document model (PLAN.md §3.2): three parallel Uint32Array planes per
 * frame, tag-bit colors, a per-doc glyph table, frames in the core from
 * day one. Pure TS, no DOM: this module is part of the shared codec
 * package surface (D19/O4) and is imported by client, workers, server,
 * and tests alike.
 *
 * Word layouts:
 * - glyph word: `glyphId:16 | attrs:8 | reserved:8`
 *   (bits 0-15 glyphId, bits 16-23 attrs, bits 24-31 reserved).
 *   Attr bit 0 = blink; bit 1 = wide-continuation (RESERVED until
 *   double-width ships).
 * - fg/bg words: tag-bit colors. Bit 31 set = palette index with live
 *   palette-swap semantics; bit 31 clear = frozen `0x00RRGGBB`.
 *   Indexed and raw RGB mix freely per doc.
 */

import { cp437ToUnicode } from './cp437.js';

// ---------------------------------------------------------------- words

export const ATTR_BLINK = 1 << 0;
/** Reserved until double-width ships (PLAN §3.2). */
export const ATTR_WIDE_CONTINUATION = 1 << 1;

export const glyphWord = (glyphId: number, attrs = 0): number =>
	((glyphId & 0xffff) | ((attrs & 0xff) << 16)) >>> 0;
export const glyphIdOf = (word: number): number => word & 0xffff;
export const attrsOf = (word: number): number => (word >>> 16) & 0xff;

export const PALETTE_TAG = 0x80000000;

export const paletteColor = (index: number): number =>
	(PALETTE_TAG | (index & 0x00ffffff)) >>> 0;
export const rgbColor = (r: number, g: number, b: number): number =>
	(((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >>> 0;
export const isPaletteColor = (word: number): boolean =>
	(word & PALETTE_TAG) !== 0;
export const paletteIndexOf = (word: number): number => word & 0x00ffffff;
export const rgbOf = (
	word: number,
): { r: number; g: number; b: number } => ({
	r: (word >>> 16) & 0xff,
	g: (word >>> 8) & 0xff,
	b: word & 0xff,
});

// -------------------------------------------------------------- palette

/**
 * Canonical 6-bit -> 8-bit channel expansion: high-bit replication,
 * exactly the Moebius join-doc rule (PLAN §3.6.2 #1) and the client's
 * createPalette. (v2's setRGBAColor path uses round(v/63*255) instead,
 * which diverges for some values, e.g. 15 -> 61 vs 60; the replication
 * form is canonical in v3 and the wart reconciles at wiring time.)
 */
export const expand6to8 = (v: number): number =>
	(((v & 0x3f) << 2) | ((v & 0x3f) >> 4)) & 0xff;

/** Default VGA 16 palette, 6-bit source values (matches palette.js). */
export const DEFAULT_PALETTE_6BIT: ReadonlyArray<
	readonly [number, number, number]
> = [
	[0, 0, 0],
	[0, 0, 42],
	[0, 42, 0],
	[0, 42, 42],
	[42, 0, 0],
	[42, 0, 42],
	[42, 21, 0],
	[42, 42, 42],
	[21, 21, 21],
	[21, 21, 63],
	[21, 63, 21],
	[21, 63, 63],
	[63, 21, 21],
	[63, 21, 63],
	[63, 63, 21],
	[63, 63, 63],
];

/** Default palette as 0x00RRGGBB words (expand6to8 per channel). */
export const createDefaultPaletteRGB = (): Uint32Array => {
	const palette = new Uint32Array(DEFAULT_PALETTE_6BIT.length);
	DEFAULT_PALETTE_6BIT.forEach(([r, g, b], i) => {
		palette[i] = rgbColor(expand6to8(r), expand6to8(g), expand6to8(b));
	});
	return palette;
};

// ---------------------------------------------------------- glyph table

export interface GlyphDef {
	fontSlot: number;
	codepoint: number;
}

export interface GlyphTable {
	get: (glyphId: number) => GlyphDef | undefined;
	/** Existing id for (fontSlot, codepoint), or append a new entry. */
	idFor: (fontSlot: number, codepoint: number) => number;
	size: () => number;
	entries: () => ReadonlyArray<GlyphDef>;
}

export const MAX_GLYPH_ID = 0xffff;

const glyphKey = (fontSlot: number, codepoint: number): number =>
	fontSlot * 0x200000 + codepoint; // codepoint <= 0x10FFFF (21 bits)

export const createGlyphTable = (
	seed: ReadonlyArray<GlyphDef> = [],
): GlyphTable => {
	const defs: GlyphDef[] = seed.map(d => ({ ...d }));
	const index = new Map<number, number>();
	defs.forEach((d, i) => {
		const key = glyphKey(d.fontSlot, d.codepoint);
		if (!index.has(key)) {
			index.set(key, i);
		}
	});
	return {
		get: glyphId => defs[glyphId],
		idFor: (fontSlot, codepoint) => {
			const key = glyphKey(fontSlot, codepoint);
			const existing = index.get(key);
			if (existing !== undefined) {
				return existing;
			}
			if (defs.length > MAX_GLYPH_ID) {
				throw new Error('[core/doc] glyph table full (65,536 entries)');
			}
			defs.push({ fontSlot, codepoint });
			index.set(key, defs.length - 1);
			return defs.length - 1;
		},
		size: () => defs.length,
		entries: () => defs,
	};
};

/**
 * CP437 identity table: glyphId i = font glyph i for i in 0-255, so
 * classic docs round-trip byte-identically (PLAN §3.2); codepoints
 * carry the unicode mapping for the UTF-8 exporter.
 */
export const createCP437GlyphTable = (fontSlot = 0): GlyphTable => {
	const seed: GlyphDef[] = [];
	for (let i = 0; i < 256; i++) {
		seed.push({ fontSlot, codepoint: cp437ToUnicode(i) });
	}
	return createGlyphTable(seed);
};

// ------------------------------------------------------------- doc + frames

export type DocMode = 'classic16' | 'xbin16' | 'xterm256' | 'free';

export interface Frame {
	glyph: Uint32Array;
	fg: Uint32Array;
	bg: Uint32Array;
	/** Per-frame override of the doc's global delay. */
	delayMs?: number;
}

export interface Cell {
	glyph: number;
	fg: number;
	bg: number;
}

/**
 * O13 placeholder: frames × cells budget guarded at addFrame. Final
 * value is the owner's call; 16M cell-frames = ~192MB of planes
 * (12B/cell/frame), far above any typical ansimation (80×25×50 = 100k).
 */
export const DEFAULT_FRAME_CELL_BUDGET = 16_000_000;

export interface DocV3 {
	readonly mode: DocMode;
	getColumns: () => number;
	getRows: () => number;
	getIceColors: () => boolean;
	setIceColors: (ice: boolean) => void;
	getLetterSpacing: () => boolean;
	setLetterSpacing: (spacing: boolean) => void;
	palette: Uint32Array;
	glyphTable: GlyphTable;
	frames: Frame[];
	getGlobalDelayMs: () => number;
	setGlobalDelayMs: (ms: number) => void;
	getCell: (frame: number, x: number, y: number) => Cell;
	setCell: (frame: number, x: number, y: number, cell: Cell) => void;
	getArea: (
		frame: number,
		x: number,
		y: number,
		width: number,
		height: number,
	) => { width: number; height: number; glyph: Uint32Array; fg: Uint32Array; bg: Uint32Array };
	setArea: (
		frame: number,
		x: number,
		y: number,
		area: { width: number; height: number; glyph: Uint32Array; fg: Uint32Array; bg: Uint32Array },
	) => void;
	/** Budget check without mutating (O13 UI guard hook). */
	canAddFrame: () => boolean;
	addFrame: (options?: { copyFrom?: number; force?: boolean }) => number;
	removeFrame: (index: number) => void;
	resize: (columns: number, rows: number) => void;
}

export interface DocV3Options {
	columns: number;
	rows: number;
	mode?: DocMode;
	palette?: Uint32Array;
	glyphTable?: GlyphTable;
	iceColors?: boolean;
	letterSpacing?: boolean;
	globalDelayMs?: number;
	frameCellBudget?: number;
}

const createBlankPlanes = (cells: number): Frame => {
	const frame: Frame = {
		glyph: new Uint32Array(cells),
		fg: new Uint32Array(cells),
		bg: new Uint32Array(cells),
	};
	// Blank = glyph 0, palette fg/bg 0: converting a zero-filled v2 doc
	// yields exactly these words, so "new doc" is identical in both models
	frame.fg.fill(paletteColor(0));
	frame.bg.fill(paletteColor(0));
	return frame;
};

export const createDocV3 = (options: DocV3Options): DocV3 => {
	const mode: DocMode = options.mode ?? 'classic16';
	let columns = options.columns;
	let rows = options.rows;
	let iceColors = options.iceColors ?? false;
	let letterSpacing = options.letterSpacing ?? false;
	let globalDelayMs = options.globalDelayMs ?? 100;
	const frameCellBudget =
		options.frameCellBudget ?? DEFAULT_FRAME_CELL_BUDGET;
	const palette = options.palette ?? createDefaultPaletteRGB();
	const glyphTable = options.glyphTable ?? createCP437GlyphTable();
	const frames: Frame[] = [createBlankPlanes(columns * rows)];

	const assertInside = (frame: number, x: number, y: number): number => {
		if (frame < 0 || frame >= frames.length) {
			throw new RangeError(`[core/doc] frame ${frame} out of range`);
		}
		if (x < 0 || x >= columns || y < 0 || y >= rows) {
			throw new RangeError(`[core/doc] cell ${x},${y} out of range`);
		}
		return y * columns + x;
	};

	return {
		mode,
		getColumns: () => columns,
		getRows: () => rows,
		getIceColors: () => iceColors,
		setIceColors: ice => {
			iceColors = ice;
		},
		getLetterSpacing: () => letterSpacing,
		setLetterSpacing: spacing => {
			letterSpacing = spacing;
		},
		palette,
		glyphTable,
		frames,
		getGlobalDelayMs: () => globalDelayMs,
		setGlobalDelayMs: ms => {
			globalDelayMs = ms;
		},
		getCell: (frame, x, y) => {
			const i = assertInside(frame, x, y);
			const f = frames[frame];
			return { glyph: f.glyph[i], fg: f.fg[i], bg: f.bg[i] };
		},
		setCell: (frame, x, y, cell) => {
			const i = assertInside(frame, x, y);
			const f = frames[frame];
			f.glyph[i] = cell.glyph;
			f.fg[i] = cell.fg;
			f.bg[i] = cell.bg;
		},
		getArea: (frame, x, y, width, height) => {
			assertInside(frame, x, y);
			assertInside(frame, x + width - 1, y + height - 1);
			const f = frames[frame];
			const glyph = new Uint32Array(width * height);
			const fg = new Uint32Array(width * height);
			const bg = new Uint32Array(width * height);
			for (let row = 0; row < height; row++) {
				const src = (y + row) * columns + x;
				glyph.set(f.glyph.subarray(src, src + width), row * width);
				fg.set(f.fg.subarray(src, src + width), row * width);
				bg.set(f.bg.subarray(src, src + width), row * width);
			}
			return { width, height, glyph, fg, bg };
		},
		setArea: (frame, x, y, area) => {
			assertInside(frame, x, y);
			assertInside(frame, x + area.width - 1, y + area.height - 1);
			const f = frames[frame];
			for (let row = 0; row < area.height; row++) {
				const dst = (y + row) * columns + x;
				const src = row * area.width;
				f.glyph.set(area.glyph.subarray(src, src + area.width), dst);
				f.fg.set(area.fg.subarray(src, src + area.width), dst);
				f.bg.set(area.bg.subarray(src, src + area.width), dst);
			}
		},
		canAddFrame: () =>
			(frames.length + 1) * columns * rows <= frameCellBudget,
		addFrame: addOptions => {
			const { copyFrom, force } = addOptions ?? {};
			if (
				!force &&
				(frames.length + 1) * columns * rows > frameCellBudget
			) {
				throw new Error(
					`[core/doc] frame budget exceeded: ${frames.length + 1} frames x ${columns * rows} cells > ${frameCellBudget} (O13)`,
				);
			}
			const frame = createBlankPlanes(columns * rows);
			if (copyFrom !== undefined) {
				const src = frames[copyFrom];
				if (!src) {
					throw new RangeError(`[core/doc] copyFrom ${copyFrom} out of range`);
				}
				frame.glyph.set(src.glyph);
				frame.fg.set(src.fg);
				frame.bg.set(src.bg);
			}
			frames.push(frame);
			return frames.length - 1;
		},
		removeFrame: index => {
			if (frames.length === 1) {
				throw new Error('[core/doc] cannot remove the last frame');
			}
			if (index < 0 || index >= frames.length) {
				throw new RangeError(`[core/doc] frame ${index} out of range`);
			}
			frames.splice(index, 1);
		},
		resize: (newColumns, newRows) => {
			if (newColumns <= 0 || newRows <= 0) {
				throw new RangeError('[core/doc] resize to non-positive dims');
			}
			const copyCols = Math.min(columns, newColumns);
			const copyRows = Math.min(rows, newRows);
			for (const f of frames) {
				const next = createBlankPlanes(newColumns * newRows);
				for (let row = 0; row < copyRows; row++) {
					const src = row * columns;
					const dst = row * newColumns;
					next.glyph.set(f.glyph.subarray(src, src + copyCols), dst);
					next.fg.set(f.fg.subarray(src, src + copyCols), dst);
					next.bg.set(f.bg.subarray(src, src + copyCols), dst);
				}
				f.glyph = next.glyph;
				f.fg = next.fg;
				f.bg = next.bg;
			}
			columns = newColumns;
			rows = newRows;
		},
	};
};
