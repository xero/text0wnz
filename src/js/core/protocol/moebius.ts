/**
 * Moebius wire protocol codec: the de facto collab
 * dialect, frozen since ≤2021. Frames are JSON `{type, data}`; the
 * enum below is transcribed from moebiusXBIN `app/document/doc.js:7`
 * (the superset of upstream's server enum, which stops at SET_BG and
 * lacks CHANGE_PALETTE). Pure functions only: no sockets, no DOM, so
 * the browser worker, the Bun server, and the interop tests all share
 * one implementation.
 *
 * Quirks preserved on purpose (bug-compat is the spec):
 * - join-doc RLE runs are `[value, repeat]` with count = repeat + 1,
 *   three independent streams for code/fg/bg (libtextmode.js compress).
 * - palettes carry 6-bit components; expansion replicates the top two
 *   bits ((v << 2) | ((v & 0x30) >> 4), palette.js:308). Receivers
 *   auto-detect 8-bit palettes the way icy_draw does: any component
 *   above 63 means the whole palette is already 8-bit.
 * - `font_bytes` arrives as Node Buffer JSON ({type:'Buffer',
 *   data:[...]}) from the moebiusXBIN fork; receivers choke on it
 *   unless revived defensively.
 * - every client->server frame carries `data.id`; SET_CANVAS_SIZE
 *   broadcasts without it crash vanilla Moebius clients.
 * - icy_draw's Block.code is a u32 unicode codepoint; vanilla Moebius
 *   uses bytes 0-255. The doc conversion accepts both.
 */

import {
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
 * Hardened decode: upstream servers crash on malformed frames;
 * ours must not. Throws ProtocolError with a reason the
 * caller can log and drop.
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

// --------------------------------------------------------- join doc RLE

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

export interface MoebiusJoinDoc {
	columns: number;
	rows: number;
	title?: string;
	author?: string;
	group?: string;
	date?: string;
	palette?: number[][];
	font_bytes?: unknown;
	font_name?: string;
	ice_colors?: boolean;
	use_9px_font?: boolean;
	comments?: string;
	c64_background?: number;
	compressed_data?: MoebiusCompressedData;
	data?: MoebiusBlock[];
}

/** libtextmode compress(), transcribed run-for-run */
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

// absolute decode ceiling when the caller gives no expected length:
// the client-side doc cap (1000 x 10000 cells)
const MAX_RLE_CELLS = 10_000_000;

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

/** libtextmode uncompress(); hardened against torn streams */
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

// --------------------------------------------------------- palettes

// expansion reuses core/doc.ts expand6to8: identical math to
// palette.js convert_6_to_8bits (top-two-bit replication, 63 -> 255)

export const compress8to6 = (v: number): number => (v >> 2) & 0x3f;

/**
 * Join-doc palettes are 6-bit; 8-bit ones saturate vanilla Moebius.
 * Receiving side auto-detects like icy_draw: any
 * component above 63 means the palette is already 8-bit.
 */
export const paletteToRGB8 = (
	palette: number[][],
): [number, number, number][] => {
	const sixBit = palette.every(entry =>
		entry.every(component => component <= 63),
	);
	return palette.map(entry => {
		const [r, g, b] = entry;
		return sixBit
			? [expand6to8(r), expand6to8(g), expand6to8(b)]
			: [r & 0xff, g & 0xff, b & 0xff];
	});
};

export const paletteTo6Bit = (rgb8: [number, number, number][]): number[][] =>
	rgb8.map(([r, g, b]) => [compress8to6(r), compress8to6(g), compress8to6(b)]);

// --------------------------------------------------------- font bytes

/**
 * moebiusXBIN serializes custom font bytes as Node Buffer JSON.
 * Revive every shape defensively; null means "no
 * usable font bytes", never a throw.
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

// --------------------------------------------------------- doc bridge

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
export const joinDocToDoc = (join: MoebiusJoinDoc): JoinDocResult => {
	if (
		!Number.isInteger(join.columns) ||
		!Number.isInteger(join.rows) ||
		join.columns <= 0 ||
		join.rows <= 0
	) {
		throw new ProtocolError(`bad join doc size ${join.columns}x${join.rows}`);
	}
	const cells = join.columns * join.rows;
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
		const rgb8 = paletteToRGB8(join.palette);
		for (let i = 0; i < Math.min(rgb8.length, doc.palette.length); i++) {
			const [r, g, b] = rgb8[i];
			doc.palette[i] = (r << 16) | (g << 8) | b;
		}
	}
	const frame = doc.frames[0];
	for (let i = 0; i < cells; i++) {
		const block = blocks[i];
		const code = Number.isInteger(block.code) ? block.code : 0;
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
 * through the same lossy projection the u16 mirror used, palette in
 * 6-bit components.
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
