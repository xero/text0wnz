/**
 * teXt0wnz collab extension suite v1 (cap "t0wnz-ext-1"):
 * action ids above the frozen Moebius dialect. Extension frames flow
 * ONLY between caps-aware peers; the server down-converts every
 * mutation for vanilla clients and spectators, so a mixed room stays
 * coherent (vanilla sees the nearest cp437/16-color cell, never a
 * crash, never an unknown shape). Transport-free like moebius.ts: the
 * browser worker, the Bun server, and the tests share this file.
 *
 * Wire shapes (JSON data fields; client->server frames carry data.id
 * per the vanilla convention):
 * - EXT_DRAW 23       {x, y, u, a, fg, bg, id}: one full-fidelity
 *   cell. u = unicode codepoint, a = glyph attr byte (bit 0 blink,
 *   bit 1 reserved), fg/bg = v3 color words (bit 31 set = palette
 *   index, clear = 0x00RRGGBB).
 * - EXT_DRAW_BATCH 24 {cells: [{x,y,u,a,fg,bg}...], id}: one op, one
 *   seq, length-capped at EXT_BATCH_LIMIT. Vanilla peers receive it
 *   as per-cell DRAW frames.
 * - EXT_SYNC 25       client->server {} requests a sync; the server
 *   replies {seq, columns, rows, cells, palette} where cells is
 *   ExtRun[] ([u, a, fg, bg, count] with count >= 1, NOT the vanilla
 *   repeat+1 quirk) and palette is <=256 0x00RRGGBB words. The client
 *   replaces its doc wholesale.
 * - EXT_PALETTE 26    {palette: number[], id}: full-palette swap,
 *   <=256 0x00RRGGBB words. The first 16 entries also update the
 *   vanilla join palette (late vanilla joiners see them; in-session
 *   vanilla peers keep a stale palette, upstream's own precedent).
 * - EXT_ACK 27        server->sender {seq} for every accepted
 *   mutation from a caps client. With exclude-sender echo semantics
 *   the sender never sees its own broadcasts, so acks keep its seq
 *   stream contiguous; any gap means a missed op => request EXT_SYNC.
 *
 * seq is a per-room monotonic counter over accepted doc mutations.
 * Caps clients receive it on every mutation broadcast (an extra field
 * vanilla never sees); contiguity is the divergence detector that the
 * vanilla dialect lacks.
 */

import {
	attrsOf,
	createDefaultPaletteRGB,
	createDocV3,
	glyphIdOf,
	glyphWord,
	isPaletteColor,
	paletteColor,
	paletteIndexOf,
	type DocV3,
} from '../doc.js';
import { quantizeColorWord } from '../convert.js';
import { cp437ToUnicode, unicodeToCp437 } from '../cp437.js';
import { paletteToRGB8, ProtocolError } from './moebius.js';
import type { MoebiusBlock } from './moebius.js';

export const T0wnzAction = Object.freeze({
	EXT_DRAW: 23,
	EXT_DRAW_BATCH: 24,
	EXT_SYNC: 25,
	EXT_PALETTE: 26,
	EXT_ACK: 27,
	/**
	 * client->server {} requests; server->client {columns, rows, cells,
	 * ops, palette}: the baseline snapshot (absorbing ops the bounded
	 * log evicted) plus the op log, the timelapse substrate. The client
	 * replays it into an animation.
	 */
	EXT_TIMELAPSE: 28,
});

/** the whole v1 suite negotiates as one capability string */
export const EXT_SUITE_CAP = 't0wnz-ext-1';

/** max cells per EXT_DRAW_BATCH; bigger fills split client-side */
export const EXT_BATCH_LIMIT = 4096;

export interface ExtCell {
	/** unicode codepoint (cp437 glyphs travel as their codepoints) */
	u: number;
	/** glyph attr byte: bit 0 blink, bit 1 reserved (wide continuation) */
	a: number;
	/** v3 fg color word */
	fg: number;
	/** v3 bg color word */
	bg: number;
}

export interface ExtDraw extends ExtCell {
	x: number;
	y: number;
}

/** [u, a, fg, bg, count] with count >= 1 */
export type ExtRun = [number, number, number, number, number];

const isValidCodepoint = (u: unknown): u is number =>
	Number.isInteger(u) &&
	(u as number) >= 0 &&
	(u as number) <= 0x10ffff &&
	// surrogate halves are not characters; reject at the border like
	// the utf8 codec does
	((u as number) < 0xd800 || (u as number) > 0xdfff);

/**
 * Canonicalize a color word at the trust border: palette-index words
 * keep only the 8-bit index (the palette is 256 entries), RGB words
 * keep only the 24 color bits. Non-numbers come back null.
 */
export const normalizeColorWord = (word: unknown): number | null => {
	if (typeof word !== 'number' || !Number.isFinite(word)) {
		return null;
	}
	const w = word >>> 0;
	return isPaletteColor(w)
		? paletteColor(paletteIndexOf(w) & 0xff)
		: w & 0x00ffffff;
};

/** validate one wire cell; null = drop (server) / skip (client) */
export const sanitizeExtCell = (raw: unknown): ExtCell | null => {
	if (typeof raw !== 'object' || raw === null) {
		return null;
	}
	const cell = raw as Record<string, unknown>;
	const fg = normalizeColorWord(cell.fg);
	const bg = normalizeColorWord(cell.bg);
	if (!isValidCodepoint(cell.u) || fg === null || bg === null) {
		return null;
	}
	const a =
		Number.isInteger(cell.a) && (cell.a as number) >= 0
			? (cell.a as number) & 0xff
			: 0;
	return { u: cell.u, a, fg, bg };
};

/** validate a whole EXT_DRAW payload against current doc bounds */
export const sanitizeExtDraw = (
	raw: Record<string, unknown>,
	columns: number,
	rows: number,
): ExtDraw | null => {
	const cell = sanitizeExtCell(raw);
	const { x, y } = raw;
	if (
		cell === null ||
		!Number.isInteger(x) ||
		!Number.isInteger(y) ||
		(x as number) < 0 ||
		(y as number) < 0 ||
		(x as number) >= columns ||
		(y as number) >= rows
	) {
		return null;
	}
	return { x: x as number, y: y as number, ...cell };
};

/**
 * Join-doc palette (6-bit triples, possibly absent) -> the 16 resolve
 * words quantization matches against. Mirrors joinDocToDoc's palette
 * adoption.
 */
export const paletteWordsFromJoin = (palette?: number[][]): Uint32Array => {
	const words = createDefaultPaletteRGB();
	if (palette && palette.length > 0) {
		const rgb8 = paletteToRGB8(palette);
		for (let i = 0; i < Math.min(rgb8.length, words.length); i++) {
			const [r, g, b] = rgb8[i];
			words[i] = (r << 16) | (g << 8) | b;
		}
	}
	return words;
};

/**
 * Down-convert one full-fidelity cell to the vanilla block a caps-less
 * peer can render. Glyphs reverse-map leniently (same policy as the
 * utf8 reader); colors quantize through the shared projection; blink
 * folds exactly like v3ToU16Lossy (ice docs drop the attr, non-ice
 * docs express it as a bright bg nibble).
 */
export const extCellToBlock = (
	cell: ExtCell,
	iceColors: boolean,
	palette: Uint32Array,
): MoebiusBlock => {
	const code = unicodeToCp437(cell.u) ?? 63; // '?'
	const doc = { palette };
	const blink = (cell.a & 1) !== 0 && !iceColors;
	const fg = quantizeColorWord(cell.fg, doc, 16);
	const bgLimit = iceColors ? 16 : 8;
	const bgIndex = quantizeColorWord(cell.bg, doc, bgLimit) & (blink ? 7 : 15);
	return { code, fg, bg: blink ? bgIndex | 8 : bgIndex };
};

/**
 * The full-fidelity view of a block that may have arrived from a
 * vanilla peer (no ext payload): codes 0-255 are cp437 bytes, bigger
 * codes are icy-style raw codepoints, colors become live palette-index
 * words.
 */
export const blockToExtCell = (
	block: MoebiusBlock & { ext?: ExtCell },
): ExtCell => {
	if (block.ext) {
		return block.ext;
	}
	const raw = block.code <= 0xff ? cp437ToUnicode(block.code) : block.code;
	return {
		// a non-character here (icy-style surrogate smuggled past a lax
		// border) would make every later expandExtCells THROW and leave
		// a room that can never save again
		u: isValidCodepoint(raw) ? raw : 63,
		a: 0,
		fg: paletteColor(block.fg & 0xff),
		bg: paletteColor(block.bg & 0xff),
	};
};

// --------------------------------------------------------- sync RLE

export const compressExtCells = (cells: ExtCell[]): ExtRun[] => {
	const runs: ExtRun[] = [];
	for (const cell of cells) {
		const last = runs[runs.length - 1];
		if (
			last &&
			last[0] === cell.u &&
			last[1] === cell.a &&
			last[2] === cell.fg &&
			last[3] === cell.bg
		) {
			last[4]++;
		} else {
			runs.push([cell.u, cell.a, cell.fg, cell.bg, 1]);
		}
	}
	return runs;
};

/** hardened expansion; bounds apply BEFORE allocation */
export const expandExtCells = (
	runs: unknown,
	expectedLength: number,
): ExtCell[] => {
	if (!Array.isArray(runs)) {
		throw new ProtocolError('ext cells is not an array');
	}
	const out: ExtCell[] = [];
	for (const run of runs) {
		if (!Array.isArray(run) || run.length !== 5) {
			throw new ProtocolError(`bad ext run ${JSON.stringify(run)}`);
		}
		const [u, a, fg, bg, count] = run as unknown[];
		const cell = sanitizeExtCell({ u, a, fg, bg });
		if (cell === null || !Number.isInteger(count) || (count as number) < 1) {
			throw new ProtocolError(`bad ext run ${JSON.stringify(run)}`);
		}
		if (out.length + (count as number) > expectedLength) {
			throw new ProtocolError(`ext cells exceed ${expectedLength}`);
		}
		for (let i = 0; i < (count as number); i++) {
			out.push({ ...cell });
		}
	}
	if (out.length !== expectedLength) {
		throw new ProtocolError(
			`expected ${expectedLength} ext cells, decoded ${out.length}`,
		);
	}
	return out;
};

export const extCellEquals = (a: ExtCell, b: ExtCell): boolean =>
	a.u === b.u && a.a === b.a && a.fg === b.fg && a.bg === b.bg;

// --------------------------------------------------------- doc bridge

/**
 * Write full-fidelity cells into a v3 doc frame (persistence: the
 * room's .0wnz envelope keeps the real art, not the vanilla
 * projection). Glyphs intern through the table; a full table degrades
 * to '?' like the utf8 reader.
 */
export const applyExtCells = (doc: DocV3, cells: ExtCell[]): void => {
	const frame = doc.frames[0];
	const count = Math.min(cells.length, frame.glyph.length);
	for (let i = 0; i < count; i++) {
		const cell = cells[i];
		let glyphId: number;
		try {
			glyphId = doc.glyphTable.idFor(0, cell.u);
		} catch {
			glyphId = 63; // '?'
		}
		frame.glyph[i] = glyphWord(glyphId, cell.a);
		frame.fg[i] = cell.fg >>> 0;
		frame.bg[i] = cell.bg >>> 0;
	}
};

/** the full-fidelity view of a v3 doc frame, for sync and persistence */
export const docToExtCells = (doc: DocV3, frameIndex = 0): ExtCell[] => {
	const frame = doc.frames[frameIndex];
	const out: ExtCell[] = new Array(frame.glyph.length);
	for (let i = 0; i < frame.glyph.length; i++) {
		const glyphId = glyphIdOf(frame.glyph[i]);
		const def = doc.glyphTable.get(glyphId);
		out[i] = {
			u: def?.codepoint ?? (glyphId <= 0xff ? cp437ToUnicode(glyphId) : 63),
			a: attrsOf(frame.glyph[i]),
			fg: normalizeColorWord(frame.fg[i]) ?? 0,
			bg: normalizeColorWord(frame.bg[i]) ?? 0,
		};
	}
	return out;
};

export interface ExtSyncResult {
	doc: DocV3;
	fontName: string | null;
	use9px: boolean;
	title: string;
	author: string;
	group: string;
	comments: string;
}

// same ceiling as the join-doc RLE decode (1000 x 10000 client cap)
const MAX_SYNC_CELLS = 10_000_000;

/**
 * EXT_SYNC payload -> a fresh v3 doc the client adopts wholesale.
 * The ext analogue of joinDocToDoc; throws ProtocolError on anything
 * malformed so the caller can drop the frame.
 */
export const extSyncToDoc = (
	payload: Record<string, unknown>,
): ExtSyncResult => {
	const { columns, rows } = payload;
	if (
		!Number.isInteger(columns) ||
		!Number.isInteger(rows) ||
		(columns as number) <= 0 ||
		(rows as number) <= 0 ||
		(columns as number) * (rows as number) > MAX_SYNC_CELLS
	) {
		throw new ProtocolError(
			`bad sync doc size ${String(columns)}x${String(rows)}`,
		);
	}
	const cells = expandExtCells(
		payload.cells,
		(columns as number) * (rows as number),
	);
	const doc = createDocV3({
		columns: columns as number,
		rows: rows as number,
		mode: 'free',
	});
	doc.setIceColors(payload.ice_colors === true);
	doc.setLetterSpacing(payload.use_9px_font === true);
	const palette = sanitizeExtPalette(payload.palette);
	if (palette) {
		const words = new Uint32Array(Math.max(doc.palette.length, palette.length));
		words.set(
			doc.palette.subarray(0, Math.min(doc.palette.length, words.length)),
		);
		for (let i = 0; i < palette.length; i++) {
			words[i] = palette[i];
		}
		doc.palette = words;
	}
	applyExtCells(doc, cells);
	return {
		doc,
		fontName: typeof payload.font_name === 'string' ? payload.font_name : null,
		use9px: payload.use_9px_font === true,
		title: typeof payload.title === 'string' ? payload.title : '',
		author: typeof payload.author === 'string' ? payload.author : '',
		group: typeof payload.group === 'string' ? payload.group : '',
		comments: typeof payload.comments === 'string' ? payload.comments : '',
	};
};

/** validate an EXT_PALETTE payload: <=256 RGB words, else null */
export const sanitizeExtPalette = (raw: unknown): number[] | null => {
	if (!Array.isArray(raw) || raw.length === 0 || raw.length > 256) {
		return null;
	}
	const out: number[] = [];
	for (const entry of raw) {
		if (typeof entry !== 'number' || !Number.isFinite(entry)) {
			return null;
		}
		out.push((entry >>> 0) & 0x00ffffff);
	}
	return out;
};
