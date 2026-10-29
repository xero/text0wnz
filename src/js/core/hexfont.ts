/**
 * GNU Unifont .hex parsing and per-block packing: the all-planes
 * Unifont hex is ~8MB of text, far too big to ship or slice
 * at runtime, so tools/bakeHexFonts.js preprocesses every bundled .hex
 * at BUILD TIME into one small packed binary per 256-codepoint block
 * plus a manifest. The runtime fetches blocks lazily and reads them
 * with the same readBlock() below, so the writer and reader can never
 * drift apart.
 *
 * .hex line format (both Unifont and unscii emit it):
 *   CODEPOINT:GLYPHDATA
 * CODEPOINT is 4-6 uppercase hex digits (unscii pads to 5). GLYPHDATA
 * is 32 hex chars for an 8x16 glyph (one byte per row, MSB = leftmost
 * pixel) or 64 hex chars for a 16x16 glyph (two bytes per row, left
 * byte first). Nothing else is legal; malformed lines fail the parse
 * loudly because a silently skipped glyph becomes an invisible
 * character in someone's artwork months later.
 *
 * Packed block layout (BLOCK_FORMAT_VERSION, which the baked
 * manifest records):
 *   bytes  0-31  presence bitmap, LSB-first: codepoint (base + i) is
 *                present iff (data[i >> 3] >> (i & 7)) & 1
 *   bytes 32-63  width bitmap, same indexing; a set bit means the
 *                glyph is 16px wide (32 bytes), clear means 8px (16)
 *   bytes 64+    glyph bitmaps in ascending codepoint order
 */

export const HEX_CELL_WIDTH = 8;
export const HEX_CELL_HEIGHT = 16;
export const BLOCK_FORMAT_VERSION = 1;

/** bytes in each per-block bitmap (256 codepoints / 8) */
const BITMAP_BYTES = 32;
/** presence bitmap + width bitmap */
export const BLOCK_HEADER_BYTES = BITMAP_BYTES * 2;
const NARROW_GLYPH_BYTES = 16;
const WIDE_GLYPH_BYTES = 32;
const MAX_CODEPOINT = 0x10ffff;

export class HexFontError extends Error {}

export interface HexGlyph {
	codepoint: number;
	/** true = 16px wide (two bytes per row), false = 8px (one byte) */
	wide: boolean;
	/** 16 bytes (narrow) or 32 bytes (wide), row-major, MSB = left */
	bytes: Uint8Array;
}

const HEX_LINE = /^([0-9A-Fa-f]{4,6}):([0-9A-Fa-f]+)$/;

const hexToBytes = (hex: string): Uint8Array => {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
};

/**
 * Parse a whole .hex file. Blank lines and #-comments are skipped;
 * anything else malformed throws with its line number. A codepoint
 * listed twice keeps the LAST definition (pinned by tests) so a
 * concatenated override file behaves the way cat(1) implies.
 */
export const parseHexFont = (text: string): HexGlyph[] => {
	const byCodepoint = new Map<number, HexGlyph>();
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line === '' || line.startsWith('#')) {
			continue;
		}
		const match = HEX_LINE.exec(line);
		if (!match) {
			throw new HexFontError(`line ${i + 1}: not CODEPOINT:HEXDATA`);
		}
		const codepoint = parseInt(match[1], 16);
		if (codepoint > MAX_CODEPOINT) {
			throw new HexFontError(`line ${i + 1}: codepoint beyond U+10FFFF`);
		}
		const data = match[2];
		if (data.length !== 32 && data.length !== 64) {
			throw new HexFontError(
				`line ${i + 1}: glyph data is ${data.length} hex chars, want 32 or 64`,
			);
		}
		byCodepoint.set(codepoint, {
			codepoint,
			wide: data.length === 64,
			bytes: hexToBytes(data),
		});
	}
	return [...byCodepoint.values()].sort((a, b) => a.codepoint - b.codepoint);
};

/**
 * Pack one 256-codepoint block. Glyphs must all live in the block
 * (codepoint >> 8 === blockId); order in the input does not matter,
 * output bytes are deterministic for a given glyph set.
 */
export const packBlock = (blockId: number, glyphs: HexGlyph[]): Uint8Array => {
	const sorted = [...glyphs].sort((a, b) => a.codepoint - b.codepoint);
	let dataBytes = 0;
	for (const glyph of sorted) {
		if (glyph.codepoint >> 8 !== blockId) {
			throw new HexFontError(
				`U+${glyph.codepoint.toString(16)} is not in block ${blockId.toString(16)}`,
			);
		}
		dataBytes += glyph.wide ? WIDE_GLYPH_BYTES : NARROW_GLYPH_BYTES;
	}
	const out = new Uint8Array(BLOCK_HEADER_BYTES + dataBytes);
	let offset = BLOCK_HEADER_BYTES;
	let previous = -1;
	for (const glyph of sorted) {
		if (glyph.codepoint === previous) {
			throw new HexFontError(
				`duplicate glyph U+${glyph.codepoint.toString(16)} in block`,
			);
		}
		previous = glyph.codepoint;
		const index = glyph.codepoint & 0xff;
		out[index >> 3] |= 1 << (index & 7);
		if (glyph.wide) {
			out[BITMAP_BYTES + (index >> 3)] |= 1 << (index & 7);
		}
		out.set(glyph.bytes, offset);
		offset += glyph.bytes.length;
	}
	return out;
};

export interface BlockReader {
	has(codepoint: number): boolean;
	/** false for absent codepoints */
	isWide(codepoint: number): boolean;
	/** null for absent codepoints */
	glyph(codepoint: number): Uint8Array | null;
}

/**
 * Read a packed block. Validates the byte length against the bitmaps
 * before anything indexes into it, because blocks arrive over fetch()
 * and a truncated response must fail here, not render garbage.
 */
export const readBlock = (blockId: number, data: Uint8Array): BlockReader => {
	if (data.length < BLOCK_HEADER_BYTES) {
		throw new HexFontError('block shorter than its header');
	}
	// offsets[i] = start of glyph i's bytes; -1 = absent
	const offsets = new Int32Array(256).fill(-1);
	let offset = BLOCK_HEADER_BYTES;
	for (let i = 0; i < 256; i++) {
		if ((data[i >> 3] >> (i & 7)) & 1) {
			offsets[i] = offset;
			const wide = (data[BITMAP_BYTES + (i >> 3)] >> (i & 7)) & 1;
			offset += wide ? WIDE_GLYPH_BYTES : NARROW_GLYPH_BYTES;
		} else if ((data[BITMAP_BYTES + (i >> 3)] >> (i & 7)) & 1) {
			throw new HexFontError('width bit set for absent glyph');
		}
	}
	if (offset !== data.length) {
		throw new HexFontError(
			`block is ${data.length} bytes, bitmaps say ${offset}`,
		);
	}
	const indexOf = (codepoint: number): number =>
		codepoint >> 8 === blockId ? codepoint & 0xff : -1;
	return {
		has: codepoint => {
			const i = indexOf(codepoint);
			return i >= 0 && offsets[i] >= 0;
		},
		isWide: codepoint => {
			const i = indexOf(codepoint);
			return (
				i >= 0 &&
				offsets[i] >= 0 &&
				((data[BITMAP_BYTES + (i >> 3)] >> (i & 7)) & 1) === 1
			);
		},
		glyph: codepoint => {
			const i = indexOf(codepoint);
			if (i < 0 || offsets[i] < 0) {
				return null;
			}
			const wide = (data[BITMAP_BYTES + (i >> 3)] >> (i & 7)) & 1;
			const size = wide ? WIDE_GLYPH_BYTES : NARROW_GLYPH_BYTES;
			return data.subarray(offsets[i], offsets[i] + size);
		},
	};
};

/** group parsed glyphs into packed per-block binaries, keyed by blockId */
export const buildBlocks = (glyphs: HexGlyph[]): Map<number, Uint8Array> => {
	const byBlock = new Map<number, HexGlyph[]>();
	for (const glyph of glyphs) {
		const blockId = glyph.codepoint >> 8;
		let list = byBlock.get(blockId);
		if (!list) {
			list = [];
			byBlock.set(blockId, list);
		}
		list.push(glyph);
	}
	const packed = new Map<number, Uint8Array>();
	for (const blockId of [...byBlock.keys()].sort((a, b) => a - b)) {
		const list = byBlock.get(blockId);
		if (list) {
			packed.set(blockId, packBlock(blockId, list));
		}
	}
	return packed;
};

/**
 * uns2uni.tr (unscii's legacy-mosaic table) is a tr(1) argument pair
 * concatenated into one line: the first half of the code points are
 * the unscii PUA sources, the second half the Unicode 13+ targets at
 * the same index. Returns source -> target.
 */
export const parseUns2Uni = (text: string): Map<number, number> => {
	const codepoints: number[] = [];
	for (const char of text.replace(/\s/g, '')) {
		codepoints.push(char.codePointAt(0) ?? 0);
	}
	if (codepoints.length === 0 || codepoints.length % 2 !== 0) {
		throw new HexFontError(
			`uns2uni table has ${codepoints.length} code points, want an even count`,
		);
	}
	const half = codepoints.length / 2;
	const map = new Map<number, number>();
	for (let i = 0; i < half; i++) {
		map.set(codepoints[i], codepoints[half + i]);
	}
	return map;
};
