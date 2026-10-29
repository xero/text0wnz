/**
 * Moebius wire protocol codec: the de facto collab dialect, frozen
 * since ≤2021. Frames are JSON `{type, data}`; the enum below is
 * transcribed from moebiusXBIN `app/document/doc.js:7`, a superset of
 * the `action` enum in Moebius server.js (which stops at SET_BG and
 * lacks CHANGE_PALETTE). Pure functions only: no sockets, no DOM, so
 * the browser worker, the Bun server, and the interop tests all share
 * one implementation.
 *
 * Quirks preserved on purpose (bug-compat is the spec):
 * - join-doc RLE runs are `[value, repeat]` with count = repeat + 1,
 *   three independent streams for code/fg/bg (Moebius libtextmode.js,
 *   compress()).
 * - vanilla palettes carry 6-bit components expanded by top-two-bit
 *   replication (palette.js:308); moebiusXBIN sends 8-bit, so depth is
 *   auto-detected (paletteToRGB8).
 * - `font_bytes` arrives as Node Buffer JSON ({type:'Buffer',
 *   data:[...]}) from the moebiusXBIN fork (moebiusXBIN
 *   libtextmode.js, compress()); receivers choke on it unless revived
 *   defensively.
 * - every client->server frame carries `data.id`: Moebius server.js
 *   indexes data_store by it (the CHAT and STATUS handlers), and
 *   SET_CANVAS_SIZE broadcasts without it crash vanilla clients.
 * - icy_draw's Block.code is a u32 unicode codepoint; vanilla Moebius
 *   uses bytes 0-255. The doc conversion accepts both.
 */

import { isValidCodepoint } from './extensions.js';
import {
	MAX_DOC_CELLS,
	createDocV3,
	expand6to8,
	glyphWord,
	paletteColor,
	type DocV3,
} from '../doc.js';
import { v3ToU16Lossy } from '../convert.js';

export const MoebiusAction = Object.freeze({
	CONNECTED: 0,
	REFUSED: 1,
	JOIN: 2,
	LEAVE: 3,
	CURSOR: 4,
	SELECTION: 5,
	RESIZE_SELECTION: 6,
	OPERATION: 7,
	HIDE_CURSOR: 8,
	DRAW: 9,
	CHAT: 10,
	STATUS: 11,
	SAUCE: 12,
	ICE_COLORS: 13,
	USE_9PX_FONT: 14,
	CHANGE_FONT: 15,
	SET_CANVAS_SIZE: 16,
	PASTE_AS_SELECTION: 17,
	ROTATE: 18,
	FLIP_X: 19,
	FLIP_Y: 20,
	SET_BG: 21,
	CHANGE_PALETTE: 22,
});

/** extension ids live above the frozen dialect (caps-gated) */
export const MOEBIUS_EXTENSION_BASE = 23;

export const MoebiusStatus = Object.freeze({
	ACTIVE: 0,
	IDLE: 1,
	AWAY: 2,
	WEB: 3,
});

export class ProtocolError extends Error {}

export interface MoebiusFrame {
	type: number;
	data: Record<string, unknown>;
}

export const encodeFrame = (
	type: number,
	data: Record<string, unknown> = {},
): string => JSON.stringify({ type, data });

/**
 * Hardened decode: upstream servers crash on malformed frames
 * (Moebius server.js, connection(): an unguarded JSON.parse); ours
 * must not. Throws ProtocolError with a reason the caller can log and
 * drop.
 */
export const decodeFrame = (raw: unknown): MoebiusFrame => {
	let parsed: unknown = raw;
	if (typeof raw === 'string') {
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new ProtocolError('frame is not JSON');
		}
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new ProtocolError('frame is not an object');
	}
	const frame = parsed as { type?: unknown; data?: unknown };
	if (!Number.isInteger(frame.type) || (frame.type as number) < 0) {
		throw new ProtocolError(`bad frame type ${String(frame.type)}`);
	}
	const data =
		typeof frame.data === 'object' &&
		frame.data !== null &&
		!Array.isArray(frame.data)
			? (frame.data as Record<string, unknown>)
			: {};
	return { type: frame.type as number, data };
};

export interface MoebiusBlock {
	code: number;
	fg: number;
	bg: number;
}

/** [value, repeat] where the run length is repeat + 1 */
export type RleRun = [number, number];

export interface MoebiusCompressedData {
	code: RleRun[];
	fg: RleRun[];
	bg: RleRun[];
}

/**
 * Moebius and moebiusXBIN serialize join palettes as {r,g,b} objects
 * (6-bit and 8-bit components respectively); old sidecars and some
 * forks use number triples. Both shapes are live on real servers, so
 * both parse, and depth is detected per palette, never per shape.
 */
export type MoebiusPaletteEntry =
	| number[]
	| { r: number; g: number; b: number };

export interface MoebiusJoinDoc {
	columns: number;
	rows: number;
	title?: string;
	author?: string;
	group?: string;
	date?: string;
	palette?: MoebiusPaletteEntry[];
	font_bytes?: unknown;
	font_name?: string;
	ice_colors?: boolean;
	use_9px_font?: boolean;
	comments?: string;
	c64_background?: number;
	compressed_data?: MoebiusCompressedData;
	data?: MoebiusBlock[];
}

/** Moebius libtextmode.js compress(), transcribed run-for-run */
export const compressBlocks = (
	blocks: MoebiusBlock[],
): MoebiusCompressedData => {
	const out: MoebiusCompressedData = { code: [], fg: [], bg: [] };
	for (
		let i = 0, codeRepeat = 0, fgRepeat = 0, bgRepeat = 0;
		i < blocks.length;
		i++
	) {
		const block = blocks[i];
		if (i + 1 === blocks.length) {
			out.code.push([block.code, codeRepeat]);
			out.fg.push([block.fg, fgRepeat]);
			out.bg.push([block.bg, bgRepeat]);
		} else {
			const next = blocks[i + 1];
			if (block.code !== next.code) {
				out.code.push([block.code, codeRepeat]);
				codeRepeat = 0;
			} else {
				codeRepeat += 1;
			}
			if (block.fg !== next.fg) {
				out.fg.push([block.fg, fgRepeat]);
				fgRepeat = 0;
			} else {
				fgRepeat += 1;
			}
			if (block.bg !== next.bg) {
				out.bg.push([block.bg, bgRepeat]);
				bgRepeat = 0;
			} else {
				bgRepeat += 1;
			}
		}
	}
	return out;
};

// decode ceiling when the caller gives no expected length
const MAX_RLE_CELLS = MAX_DOC_CELLS;

const expandRuns = (
	runs: RleRun[],
	label: string,
	maxLength: number,
): number[] => {
	const out: number[] = [];
	for (const run of runs) {
		if (
			!Array.isArray(run) ||
			!Number.isInteger(run[0]) ||
			!Number.isInteger(run[1]) ||
			run[0] < 0 ||
			run[1] < 0
		) {
			throw new ProtocolError(`bad ${label} run ${JSON.stringify(run)}`);
		}
		// the bound applies BEFORE expansion: a hostile run like
		// [32, 1e9] must never allocate first
		if (out.length + run[1] + 1 > maxLength) {
			throw new ProtocolError(`${label} stream exceeds ${maxLength} cells`);
		}
		for (let i = 0; i <= run[1]; i++) {
			out.push(run[0]);
		}
	}
	return out;
};

/** Moebius libtextmode.js uncompress(), hardened against torn streams */
export const uncompressBlocks = (
	compressed: MoebiusCompressedData,
	expectedLength?: number,
): MoebiusBlock[] => {
	const limit = expectedLength ?? MAX_RLE_CELLS;
	const codes = expandRuns(compressed.code ?? [], 'code', limit);
	const fgs = expandRuns(compressed.fg ?? [], 'fg', limit);
	const bgs = expandRuns(compressed.bg ?? [], 'bg', limit);
	if (codes.length !== fgs.length || codes.length !== bgs.length) {
		throw new ProtocolError(
			`stream lengths disagree: ${codes.length}/${fgs.length}/${bgs.length}`,
		);
	}
	if (expectedLength !== undefined && codes.length !== expectedLength) {
		throw new ProtocolError(
			`expected ${expectedLength} cells, decoded ${codes.length}`,
		);
	}
	const blocks: MoebiusBlock[] = new Array(codes.length);
	for (let i = 0; i < codes.length; i++) {
		blocks[i] = { code: codes[i], fg: fgs[i], bg: bgs[i] };
	}
	return blocks;
};

// expansion reuses core/doc.ts expand6to8: identical math to
// palette.js convert_6_to_8bits (top-two-bit replication, 63 -> 255)

export const compress8to6 = (v: number): number => (v >> 2) & 0x3f;

/**
 * Join-doc palettes come in two depths under ONE shape: vanilla
 * Moebius sends 6-bit {r,g,b} objects (palette.js `ega`), moebiusXBIN
 * sends 8-bit ones (palette_4bit, raw). Without a depth, auto-detect
 * like icy_draw: any component above 63 means the palette is already
 * 8-bit. A caller reading a palette it wrote itself (our server, its
 * sidecars) passes the depth, since a dark 8-bit palette would
 * otherwise read as 6-bit and come back four times brighter.
 */
export const paletteToRGB8 = (
	palette: MoebiusPaletteEntry[],
	depth?: 6 | 8,
): [number, number, number][] => {
	const triple = (entry: MoebiusPaletteEntry): [number, number, number] =>
		Array.isArray(entry)
			? [entry[0], entry[1], entry[2]]
			: [entry.r, entry.g, entry.b];
	const sixBit =
		depth === undefined
			? palette.every(entry =>
					triple(entry).every(component => component <= 63),
				)
			: depth === 6;
	return palette.map(entry => {
		const [r, g, b] = triple(entry);
		return sixBit
			? [expand6to8(r), expand6to8(g), expand6to8(b)]
			: [r & 0xff, g & 0xff, b & 0xff];
	});
};

export const paletteTo6Bit = (rgb8: [number, number, number][]): number[][] =>
	rgb8.map(([r, g, b]) => [compress8to6(r), compress8to6(g), compress8to6(b)]);

/**
 * moebiusXBIN serializes custom font bytes as Node Buffer JSON.
 * Revive every shape defensively; null means "no usable font bytes",
 * never a throw.
 */
export const reviveFontBytes = (value: unknown): Uint8Array | null => {
	if (value instanceof Uint8Array) {
		return value;
	}
	if (Array.isArray(value) && value.every(n => Number.isInteger(n))) {
		return Uint8Array.from(value as number[]);
	}
	if (typeof value === 'object' && value !== null) {
		const buf = value as { type?: unknown; data?: unknown };
		if (buf.type === 'Buffer' && Array.isArray(buf.data)) {
			return Uint8Array.from(buf.data as number[]);
		}
	}
	return null;
};

export interface JoinDocResult {
	doc: DocV3;
	fontName: string | null;
	fontBytes: Uint8Array | null;
	use9px: boolean;
	title: string;
	author: string;
	group: string;
	comments: string;
}

/**
 * Join doc -> v3 doc. Vanilla codes (0-255) map through the CP437
 * identity ids; icy's u32 unicode codepoints go through the glyph
 * table. fg/bg are palette indices and stay live (tag-bit) so a later
 * CHANGE_PALETTE recolors the doc.
 */
export const joinDocToDoc = (
	join: MoebiusJoinDoc,
	options: { paletteDepth?: 6 | 8 } = {},
): JoinDocResult => {
	if (
		!Number.isInteger(join.columns) ||
		!Number.isInteger(join.rows) ||
		join.columns <= 0 ||
		join.rows <= 0
	) {
		throw new ProtocolError(`bad join doc size ${join.columns}x${join.rows}`);
	}
	const cells = join.columns * join.rows;
	if (cells > MAX_DOC_CELLS) {
		// the RLE expander's only other limit is the frame's OWN
		// expectedLength, which a hostile ?server= join controls
		throw new ProtocolError(
			`join doc ${join.columns}x${join.rows} exceeds the cell ceiling`,
		);
	}
	const blocks =
		join.data ??
		uncompressBlocks(
			join.compressed_data ?? { code: [], fg: [], bg: [] },
			cells,
		);
	if (blocks.length !== cells) {
		throw new ProtocolError(
			`join doc holds ${blocks.length} cells, expected ${cells}`,
		);
	}
	const doc = createDocV3({
		columns: join.columns,
		rows: join.rows,
		mode: 'free',
	});
	doc.setIceColors(join.ice_colors === true);
	doc.setLetterSpacing(join.use_9px_font === true);
	if (join.palette) {
		const rgb8 = paletteToRGB8(join.palette, options.paletteDepth);
		for (let i = 0; i < Math.min(rgb8.length, doc.palette.length); i++) {
			const [r, g, b] = rgb8[i];
			doc.palette[i] = (r << 16) | (g << 8) | b;
		}
	}
	const frame = doc.frames[0];
	for (let i = 0; i < cells; i++) {
		const block = blocks[i];
		// a lone surrogate or negative interned here is the poison the
		// DRAW intake and blockToExtCell both reject; bad codes
		// normalize to '?' at the border like blockToExtCell
		const code = isValidCodepoint(block.code) ? block.code : 63;
		const glyphId = code <= 0xff ? code : doc.glyphTable.idFor(0, code);
		frame.glyph[i] = glyphWord(glyphId, 0);
		frame.fg[i] = paletteColor((block.fg ?? 7) & 0xff);
		frame.bg[i] = paletteColor((block.bg ?? 0) & 0xff);
	}
	return {
		doc,
		fontName: typeof join.font_name === 'string' ? join.font_name : null,
		fontBytes: reviveFontBytes(join.font_bytes),
		use9px: join.use_9px_font === true,
		title: typeof join.title === 'string' ? join.title : '',
		author: typeof join.author === 'string' ? join.author : '',
		group: typeof join.group === 'string' ? join.group : '',
		comments: typeof join.comments === 'string' ? join.comments : '',
	};
};

/**
 * v3 doc -> join doc for vanilla consumers: quantized to 16 colors
 * through the same lossy projection as the u16 mirror. No palette
 * rides along; receivers fall back to the classic defaults.
 */
export const docToJoinDoc = (
	doc: DocV3,
	meta: {
		title?: string;
		author?: string;
		group?: string;
		comments?: string;
	} = {},
): MoebiusJoinDoc => {
	const { imageData, columns, rows, iceColors } = v3ToU16Lossy(doc);
	const blocks: MoebiusBlock[] = new Array(imageData.length);
	for (let i = 0; i < imageData.length; i++) {
		const word = imageData[i];
		blocks[i] = {
			code: word >> 8,
			fg: word & 15,
			bg: (word >> 4) & 15,
		};
	}
	return {
		columns,
		rows,
		title: meta.title ?? '',
		author: meta.author ?? '',
		group: meta.group ?? '',
		comments: meta.comments ?? '',
		ice_colors: iceColors,
		compressed_data: compressBlocks(blocks),
	};
};
