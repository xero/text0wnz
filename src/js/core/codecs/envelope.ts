/**
 * The native container (O5, owner-chosen 2026-10-10): a versioned JSON
 * envelope gzipped through the runtime-native CompressionStream. It
 * holds everything the classic formats cannot: unicode glyph tables,
 * raw-RGB colors, frames with delays, doc mode, and metadata. UTF-8
 * ANSI remains the interchange format; a binary container may supersede
 * this later without breaking readers (the format field is the seam).
 *
 * Planes serialize as little-endian u32 base64 regardless of host
 * endianness, so saves are byte-stable across platforms.
 */

import {
	DocMode,
	DocV3,
	GlyphDef,
	createCP437GlyphTable,
	createDocV3,
	createGlyphTable,
} from '../doc.js';
import { cp437ToUnicode } from '../cp437.js';
import { DocMeta } from './bin.js';
import {
	CodecError,
	base64ToBytes,
	bytesToBase64,
	gunzip,
	gzip,
} from './util.js';

export const ENVELOPE_FORMAT = 't0wnz-doc';
export const ENVELOPE_VERSION = 1;

interface EnvelopeFrame {
	delayMs?: number;
	glyph: string;
	fg: string;
	bg: string;
}

interface EnvelopeJson {
	format: typeof ENVELOPE_FORMAT;
	version: number;
	mode: DocMode;
	columns: number;
	rows: number;
	iceColors: boolean;
	letterSpacing: boolean;
	globalDelayMs: number;
	palette: number[];
	/** 'cp437' marks the identity table; otherwise [fontSlot, codepoint][]. */
	glyphTable: 'cp437' | Array<[number, number]>;
	frames: EnvelopeFrame[];
	meta?: DocMeta;
	/** Embedded XB font, when the doc carries one. */
	fontBytes?: string;
	fontHeight?: number;
}

const planeToBase64 = (plane: Uint32Array): string => {
	const bytes = new Uint8Array(plane.length * 4);
	const view = new DataView(bytes.buffer);
	for (let i = 0; i < plane.length; i++) {
		view.setUint32(i * 4, plane[i], true);
	}
	return bytesToBase64(bytes);
};

const base64ToPlane = (text: string, cells: number): Uint32Array => {
	const bytes = base64ToBytes(text);
	if (bytes.length !== cells * 4) {
		throw new CodecError(
			`plane holds ${bytes.length / 4} cells, expected ${cells}`,
		);
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const plane = new Uint32Array(cells);
	for (let i = 0; i < cells; i++) {
		plane[i] = view.getUint32(i * 4, true);
	}
	return plane;
};

const isCP437Identity = (doc: DocV3): boolean => {
	const table = doc.glyphTable;
	if (table.size() !== 256) {
		return false;
	}
	for (let i = 0; i < 256; i++) {
		const def = table.get(i);
		if (!def || def.fontSlot !== 0 || def.codepoint !== cp437ToUnicode(i)) {
			return false;
		}
	}
	return true;
};

export interface EncodeEnvelopeOptions {
	meta?: DocMeta;
	fontBytes?: Uint8Array | null;
	fontHeight?: number;
}

export const encodeEnvelope = async (
	doc: DocV3,
	options: EncodeEnvelopeOptions = {},
): Promise<Uint8Array> => {
	const json: EnvelopeJson = {
		format: ENVELOPE_FORMAT,
		version: ENVELOPE_VERSION,
		mode: doc.mode,
		columns: doc.getColumns(),
		rows: doc.getRows(),
		iceColors: doc.getIceColors(),
		letterSpacing: doc.getLetterSpacing(),
		globalDelayMs: doc.getGlobalDelayMs(),
		palette: Array.from(doc.palette),
		glyphTable: isCP437Identity(doc)
			? 'cp437'
			: doc.glyphTable.entries().map(def => [def.fontSlot, def.codepoint]),
		frames: doc.frames.map(frame => ({
			...(frame.delayMs !== undefined ? { delayMs: frame.delayMs } : {}),
			glyph: planeToBase64(frame.glyph),
			fg: planeToBase64(frame.fg),
			bg: planeToBase64(frame.bg),
		})),
	};
	if (options.meta && Object.keys(options.meta).length > 0) {
		json.meta = options.meta;
	}
	if (options.fontBytes && options.fontBytes.length > 0) {
		json.fontBytes = bytesToBase64(options.fontBytes);
		json.fontHeight = options.fontHeight ?? 16;
	}
	return gzip(new TextEncoder().encode(JSON.stringify(json)));
};

export interface EnvelopeDecodeResult {
	doc: DocV3;
	meta: DocMeta;
	fontBytes: Uint8Array | null;
	fontHeight: number | null;
}

export const isEnvelope = (bytes: Uint8Array): boolean =>
	bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

export const decodeEnvelope = async (
	bytes: Uint8Array,
): Promise<EnvelopeDecodeResult> => {
	if (!isEnvelope(bytes)) {
		throw new CodecError('not a t0wnz-doc envelope (no gzip magic)');
	}
	let json: EnvelopeJson;
	try {
		json = JSON.parse(new TextDecoder().decode(await gunzip(bytes)));
	} catch {
		throw new CodecError('envelope is not valid gzipped JSON');
	}
	if (json.format !== ENVELOPE_FORMAT) {
		throw new CodecError(
			`unknown container format ${JSON.stringify(json.format)}`,
		);
	}
	if (json.version > ENVELOPE_VERSION) {
		throw new CodecError(
			`envelope version ${json.version} is newer than this reader (${ENVELOPE_VERSION})`,
		);
	}
	if (!Array.isArray(json.frames) || json.frames.length === 0) {
		throw new CodecError('envelope holds no frames');
	}

	const glyphTable =
		json.glyphTable === 'cp437'
			? createCP437GlyphTable()
			: createGlyphTable(
					json.glyphTable.map(
						([fontSlot, codepoint]): GlyphDef => ({ fontSlot, codepoint }),
					),
				);
	const doc = createDocV3({
		columns: json.columns,
		rows: json.rows,
		mode: json.mode,
		iceColors: json.iceColors,
		letterSpacing: json.letterSpacing,
		globalDelayMs: json.globalDelayMs,
		glyphTable,
		// Constructor-passed so 256-entry palettes keep their full length
		palette: Uint32Array.from(json.palette),
	});

	const cells = json.columns * json.rows;
	json.frames.forEach((frame, index) => {
		if (index > 0) {
			doc.addFrame({ force: true });
		}
		const target = doc.frames[index];
		target.glyph = base64ToPlane(frame.glyph, cells);
		target.fg = base64ToPlane(frame.fg, cells);
		target.bg = base64ToPlane(frame.bg, cells);
		if (frame.delayMs !== undefined) {
			target.delayMs = frame.delayMs;
		}
	});

	return {
		doc,
		meta: json.meta ?? {},
		fontBytes: json.fontBytes ? base64ToBytes(json.fontBytes) : null,
		fontHeight: json.fontHeight ?? null,
	};
};
