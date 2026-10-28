/**
 * DEFLATE (RFC 1951) and gzip (RFC 1952) for the codecs. The async
 * gzip / gunzip / inflateRaw prefer the engine's native streams and
 * fall back to the plain TS codec below wherever those are missing,
 * lack a format, or misbehave, so callers see one contract.
 *
 * The inflater accepts what zlib accepts, since zlib sits behind every
 * native implementation, and refuses what every engine refuses:
 * truncation, bytes after the end, a second gzip member. Its output
 * cap holds while it decodes, so a bomb dies early.
 *
 * The deflater is LZ77 over a 32KB window coded with the fixed Huffman
 * tables: about 15% larger than zlib level 6 on envelope and durdraw
 * JSON, for a fraction of the code dynamic trees would cost.
 */

import { CodecError, concatBytes, crc32, readLE32, writeLE32 } from './util.js';

// ------------------------------------------------------------------ tables

/** length symbols 257-285 */
const LEN_BASE = Uint16Array.from([
	3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
	83, 99, 115, 131, 163, 195, 227, 258,
]);
const LEN_EXTRA = Uint8Array.from([
	0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
	5, 5, 0,
]);
/** distance symbols 0-29 */
const DIST_BASE = Uint16Array.from([
	1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
	1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
]);
const DIST_EXTRA = Uint8Array.from([
	0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
	11, 12, 12, 13, 13,
]);
/** the order code length code lengths arrive in */
const CL_ORDER = Uint8Array.from([
	16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
]);

const MAX_BITS = 15;

/** deflate's ceiling: a 258-byte match can cost as little as 2 bits */
const MAX_RATIO = 1032;

/**
 * Canonical codes from code lengths, bit-reversed: Huffman codes pack
 * MSB-first into an LSB-first stream.
 */
const reversedCodes = (lens: Uint8Array): Uint16Array => {
	const count = new Uint16Array(MAX_BITS + 1);
	for (const len of lens) {
		count[len]++;
	}
	count[0] = 0;
	const next = new Uint16Array(MAX_BITS + 1);
	for (let len = 1, code = 0; len <= MAX_BITS; len++) {
		code = (code + count[len - 1]) << 1;
		next[len] = code;
	}
	const codes = new Uint16Array(lens.length);
	for (let sym = 0; sym < lens.length; sym++) {
		const len = lens[sym];
		if (len) {
			let code = next[len]++;
			let rev = 0;
			for (let i = 0; i < len; i++) {
				rev = (rev << 1) | (code & 1);
				code >>= 1;
			}
			codes[sym] = rev;
		}
	}
	return codes;
};

/** decode table: entry = symbol << 4 | code length; 0 = no such code */
interface Table {
	map: Uint16Array;
	mask: number;
}

type CodeKind = 'code length' | 'literal/length' | 'distance';

/**
 * zlib's rules: an over-subscribed set is always corrupt, and an
 * incomplete one passes only as a lone 1-bit literal/length or
 * distance code. A distance set with no codes at all is legal until a
 * match tries to use it.
 */
const buildTable = (lens: Uint8Array, kind: CodeKind): Table => {
	const count = new Uint16Array(MAX_BITS + 1);
	let max = 0;
	for (const len of lens) {
		count[len]++;
		max = len > max ? len : max;
	}
	if (max === 0) {
		if (kind !== 'distance') {
			throw new CodecError(`deflate ${kind} code is empty`);
		}
		return { map: new Uint16Array(1), mask: 0 };
	}
	let left = 1;
	for (let len = 1; len <= MAX_BITS; len++) {
		left = (left << 1) - count[len];
		if (left < 0) {
			throw new CodecError(`deflate ${kind} code is over-subscribed`);
		}
	}
	if (left > 0 && (kind === 'code length' || max !== 1)) {
		throw new CodecError(`deflate ${kind} code is incomplete`);
	}
	const codes = reversedCodes(lens);
	const map = new Uint16Array(1 << max);
	for (let sym = 0; sym < lens.length; sym++) {
		const len = lens[sym];
		if (len) {
			const entry = (sym << 4) | len;
			for (let k = codes[sym]; k < map.length; k += 1 << len) {
				map[k] = entry;
			}
		}
	}
	return { map, mask: map.length - 1 };
};

const FIXED_LIT_LENS = (() => {
	const lens = new Uint8Array(288);
	lens.fill(8, 0, 144).fill(9, 144, 256).fill(7, 256, 280).fill(8, 280);
	return lens;
})();
// symbols 286/287 and distances 30/31 own fixed codes but mean nothing;
// the decoder rejects them by range, as zlib does
const FIXED_DIST_LENS = new Uint8Array(32).fill(5);

let FIXED: { lit: Table; dist: Table } | null = null;

const fixedTables = (): { lit: Table; dist: Table } => {
	FIXED ??= {
		lit: buildTable(FIXED_LIT_LENS, 'literal/length'),
		dist: buildTable(FIXED_DIST_LENS, 'distance'),
	};
	return FIXED;
};

// ----------------------------------------------------------------- inflate

// LSB-first reads at a bit offset. Past the end the bytes read as
// undefined, which coerces to zero bits; callers compare the offset to
// the stream's bit length before trusting a decode.
const bits9 = (src: Uint8Array, pos: number, mask: number): number =>
	((src[pos >> 3] | (src[(pos >> 3) + 1] << 8)) >> (pos & 7)) & mask;

const bits17 = (src: Uint8Array, pos: number): number =>
	(src[pos >> 3] | (src[(pos >> 3) + 1] << 8) | (src[(pos >> 3) + 2] << 16)) >>
	(pos & 7);

const truncated = (): CodecError =>
	new CodecError('deflate stream is truncated');

const grow = (
	out: Uint8Array,
	used: number,
	need: number,
	maxBytes: number,
): Uint8Array => {
	if (need > maxBytes) {
		throw new CodecError(`decompressed stream exceeds ${maxBytes} bytes`);
	}
	const next = new Uint8Array(
		Math.min(maxBytes, Math.max(need, out.length * 2)),
	);
	next.set(out.subarray(0, used));
	return next;
};

/** dynamic block header: the two code tables and where symbols start */
const readDynamic = (
	src: Uint8Array,
	start: number,
	end: number,
): { lit: Table; dist: Table; pos: number } => {
	let pos = start;
	if (pos + 14 > end) {
		throw truncated();
	}
	const nlen = bits9(src, pos, 31) + 257;
	const ndist = bits9(src, pos + 5, 31) + 1;
	const ncode = bits9(src, pos + 10, 15) + 4;
	pos += 14;
	if (nlen > 286 || ndist > 30) {
		throw new CodecError('deflate block declares too many symbols');
	}
	const clLens = new Uint8Array(19);
	for (let i = 0; i < ncode; i++, pos += 3) {
		clLens[CL_ORDER[i]] = bits9(src, pos, 7);
	}
	if (pos > end) {
		throw truncated();
	}
	const cl = buildTable(clLens, 'code length');
	// one run of lengths: a repeat may cross from literals into distances
	const lens = new Uint8Array(nlen + ndist);
	for (let i = 0; i < lens.length; ) {
		const entry = cl.map[bits17(src, pos) & cl.mask];
		pos += entry & 15;
		const sym = entry >> 4;
		if (sym < 16) {
			lens[i++] = sym;
		} else {
			let fill = 0;
			let copy: number;
			if (sym === 16) {
				if (i === 0) {
					throw new CodecError('deflate length repeat has nothing to repeat');
				}
				fill = lens[i - 1];
				copy = 3 + bits9(src, pos, 3);
				pos += 2;
			} else if (sym === 17) {
				copy = 3 + bits9(src, pos, 7);
				pos += 3;
			} else {
				copy = 11 + bits9(src, pos, 127);
				pos += 7;
			}
			if (i + copy > lens.length) {
				throw new CodecError('deflate length repeat overruns the table');
			}
			lens.fill(fill, i, i + copy);
			i += copy;
		}
		if (pos > end) {
			throw truncated();
		}
	}
	if (lens[256] === 0) {
		throw new CodecError('deflate block has no end-of-block code');
	}
	return {
		lit: buildTable(lens.subarray(0, nlen), 'literal/length'),
		dist: buildTable(lens.subarray(nlen), 'distance'),
		pos,
	};
};

/**
 * Raw inflate from byte offset `start`. Returns the output and the byte
 * offset just past the final block, where a gzip trailer begins.
 */
const inflateAt = (
	src: Uint8Array,
	start: number,
	maxBytes: number,
	sizeHint: number,
	salvage = false,
): { out: Uint8Array; end: number; damage: string | null } => {
	const end = src.length * 8;
	let pos = start * 8;
	let out: Uint8Array = new Uint8Array(
		Math.min(
			maxBytes,
			sizeHint > 0 ? sizeHint : Math.max(1024, src.length * 4),
		),
	);
	let o = 0;
	let final = 0;
	try {
		while (!final) {
			if (pos + 3 > end) {
				throw truncated();
			}
			final = bits9(src, pos, 1);
			const type = bits9(src, pos + 1, 3);
			pos += 3;
			if (type === 0) {
				let at = (pos + 7) >> 3;
				if (at + 4 > src.length) {
					throw truncated();
				}
				const len = src[at] | (src[at + 1] << 8);
				if (len !== (~(src[at + 2] | (src[at + 3] << 8)) & 0xffff)) {
					throw new CodecError('deflate stored block length is corrupt');
				}
				at += 4;
				if (at + len > src.length) {
					throw truncated();
				}
				if (o + len > out.length) {
					out = grow(out, o, o + len, maxBytes);
				}
				out.set(src.subarray(at, at + len), o);
				o += len;
				pos = (at + len) * 8;
				continue;
			}
			let lit: Table;
			let dist: Table;
			if (type === 1) {
				({ lit, dist } = fixedTables());
			} else if (type === 2) {
				({ lit, dist, pos } = readDynamic(src, pos, end));
			} else {
				throw new CodecError('deflate block type 3 is reserved');
			}
			const lmap = lit.map;
			const lmask = lit.mask;
			const dmap = dist.map;
			const dmask = dist.mask;
			for (;;) {
				const entry = lmap[bits17(src, pos) & lmask];
				if (!entry) {
					throw new CodecError('deflate literal/length code is invalid');
				}
				pos += entry & 15;
				const sym = entry >> 4;
				if (sym < 256) {
					if (pos > end) {
						throw truncated();
					}
					if (o === out.length) {
						out = grow(out, o, o + 1, maxBytes);
					}
					out[o++] = sym;
					continue;
				}
				if (sym === 256) {
					if (pos > end) {
						throw truncated();
					}
					break;
				}
				const li = sym - 257;
				if (li > 28) {
					throw new CodecError('deflate literal/length code is invalid');
				}
				let length = LEN_BASE[li];
				if (LEN_EXTRA[li]) {
					length += bits9(src, pos, (1 << LEN_EXTRA[li]) - 1);
					pos += LEN_EXTRA[li];
				}
				const dentry = dmap[bits17(src, pos) & dmask];
				const dsym = dentry >> 4;
				if (!dentry || dsym > 29) {
					throw new CodecError('deflate distance code is invalid');
				}
				pos += dentry & 15;
				let distance = DIST_BASE[dsym];
				if (DIST_EXTRA[dsym]) {
					distance += bits17(src, pos) & ((1 << DIST_EXTRA[dsym]) - 1);
					pos += DIST_EXTRA[dsym];
				}
				if (pos > end) {
					throw truncated();
				}
				if (distance > o) {
					throw new CodecError('deflate distance reaches before the output');
				}
				if (o + length > out.length) {
					out = grow(out, o, o + length, maxBytes);
				}
				// bytewise on purpose: an overlapping copy is how deflate
				// spells a run
				for (let from = o - distance, stop = o + length; o < stop; ) {
					out[o++] = out[from++];
				}
			}
		}
	} catch (error) {
		// salvage keeps what decoded before the fault; strict callers
		// hear about it
		if (!salvage || !(error instanceof CodecError)) {
			throw error;
		}
		return { out: out.slice(0, o), end: src.length, damage: error.message };
	}
	return {
		out: o === out.length ? out : out.slice(0, o),
		end: (pos + 7) >> 3,
		damage: null,
	};
};

const trailing = (what: string): CodecError =>
	new CodecError(`${what} has bytes after its end`);

export const inflateRawSync = (
	bytes: Uint8Array,
	maxBytes = Infinity,
): Uint8Array => {
	const { out, end } = inflateAt(
		bytes,
		0,
		maxBytes,
		// a finite cap (the zip entry size) is the exact output size
		Number.isFinite(maxBytes)
			? Math.min(maxBytes, bytes.length * MAX_RATIO)
			: 0,
	);
	if (end !== bytes.length) {
		throw trailing('deflate stream');
	}
	return out;
};

/**
 * Inflate for damaged archives: whatever decoded before the first
 * fault, and the fault. Bytes after the final block are no fault here;
 * the archive's own checksum decides whether the content is whole.
 */
export const inflateRawSalvage = (
	bytes: Uint8Array,
	maxBytes: number,
): { bytes: Uint8Array; damage: string | null } => {
	const { out, damage } = inflateAt(
		bytes,
		0,
		maxBytes,
		Math.min(maxBytes, bytes.length * MAX_RATIO),
		true,
	);
	return { bytes: out, damage };
};

// -------------------------------------------------------------------- gzip

const GZIP_HEADER_SIZE = 10;
const GZIP_TRAILER_SIZE = 8;

/** byte offset where the member's deflate data starts */
const gzipBodyAt = (bytes: Uint8Array): number => {
	if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
		throw new CodecError('not a gzip stream');
	}
	if (bytes[2] !== 8) {
		throw new CodecError('gzip method is not deflate');
	}
	const flags = bytes[3];
	if (flags & 0xe0) {
		throw new CodecError('gzip header sets reserved flags');
	}
	let pos = GZIP_HEADER_SIZE;
	if (flags & 0x04) {
		pos += 2 + (bytes[pos] | (bytes[pos + 1] << 8));
	}
	// FNAME then FCOMMENT, each zero-terminated
	for (const flag of [0x08, 0x10]) {
		if (flags & flag) {
			while (pos < bytes.length && bytes[pos] !== 0) {
				pos++;
			}
			pos++;
		}
	}
	if (flags & 0x02) {
		if (pos + 2 > bytes.length) {
			throw truncated();
		}
		const stored = bytes[pos] | (bytes[pos + 1] << 8);
		if (stored !== (crc32(bytes.subarray(0, pos)) & 0xffff)) {
			throw new CodecError('gzip header failed its CRC-16');
		}
		pos += 2;
	}
	if (pos >= bytes.length) {
		throw truncated();
	}
	return pos;
};

export const gunzipSync = (
	bytes: Uint8Array,
	maxBytes = Infinity,
): Uint8Array => {
	const body = gzipBodyAt(bytes);
	// ISIZE is attacker-chosen: a sizing hint, bounded by what the input
	// could legally expand to, never trusted as a limit
	const hint = Math.min(
		maxBytes,
		readLE32(bytes, bytes.length - 4),
		bytes.length * MAX_RATIO,
	);
	const { out, end } = inflateAt(bytes, body, maxBytes, hint);
	if (end + GZIP_TRAILER_SIZE > bytes.length) {
		throw truncated();
	}
	if (readLE32(bytes, end) !== crc32(out)) {
		throw new CodecError('gzip stream failed its CRC-32');
	}
	if (readLE32(bytes, end + 4) !== out.length >>> 0) {
		throw new CodecError('gzip stream failed its length check');
	}
	// a second member counts too: no engine decodes past the first
	if (end + GZIP_TRAILER_SIZE !== bytes.length) {
		throw trailing('gzip stream');
	}
	return out;
};

// ----------------------------------------------------------------- deflate

const WINDOW = 32768;
const WINDOW_MASK = WINDOW - 1;
const MIN_MATCH = 3;
const MAX_MATCH = 258;
/** zlib's TOO_FAR: a 3-byte match this far back costs more than literals */
const TOO_FAR = 4096;
const HASH_BITS = 15;
const MAX_CHAIN = 128;

const FIXED_LIT_CODES = reversedCodes(FIXED_LIT_LENS);
const FIXED_DIST_CODES = reversedCodes(FIXED_DIST_LENS);

/** match length -> length symbol index (0-28) */
const LEN_SYM = (() => {
	const table = new Uint8Array(MAX_MATCH + 1);
	for (let li = 0; li < 28; li++) {
		table.fill(li, LEN_BASE[li], LEN_BASE[li + 1]);
	}
	// 258 has its own symbol; 227 plus 31 extra would also reach it
	table[MAX_MATCH] = 28;
	return table;
})();

const distSym = (distance: number): number => {
	let ds = 29;
	while (DIST_BASE[ds] > distance) {
		ds--;
	}
	return ds;
};

const storedBlocks = (src: Uint8Array): Uint8Array => {
	const blocks = Math.max(1, Math.ceil(src.length / 0xffff));
	const out = new Uint8Array(src.length + blocks * 5);
	for (let b = 0, at = 0, o = 0; b < blocks; b++) {
		const len = Math.min(0xffff, src.length - at);
		out[o] = b === blocks - 1 ? 1 : 0;
		out[o + 1] = len & 0xff;
		out[o + 2] = len >> 8;
		out[o + 3] = ~len & 0xff;
		out[o + 4] = (~len >> 8) & 0xff;
		out.set(src.subarray(at, at + len), o + 5);
		o += 5 + len;
		at += len;
	}
	return out;
};

export const deflateRawSync = (src: Uint8Array): Uint8Array => {
	const n = src.length;
	// fixed codes spend at most 9 bits per input byte
	const out = new Uint8Array(Math.ceil((n * 9) / 8) + 8);
	let o = 0;
	let buf = 0;
	let have = 0;
	const put = (value: number, count: number): void => {
		buf |= value << have;
		have += count;
		while (have >= 8) {
			out[o++] = buf & 0xff;
			buf >>>= 8;
			have -= 8;
		}
	};
	const head = new Int32Array(1 << HASH_BITS).fill(-1);
	const prev = new Int32Array(WINDOW);
	const hash = (i: number): number =>
		Math.imul((src[i] << 16) | (src[i + 1] << 8) | src[i + 2], 0x9e3779b1) >>>
		(32 - HASH_BITS);
	// BFINAL + fixed Huffman: one block of any length
	put(0b011, 3);
	let i = 0;
	while (i < n) {
		let bestLen = 0;
		let bestDist = 0;
		if (i + MIN_MATCH <= n) {
			const h = hash(i);
			let cand = head[h];
			prev[i & WINDOW_MASK] = cand;
			head[h] = i;
			const limit = Math.min(MAX_MATCH, n - i);
			// a slot a full window back shares this position's prev entry,
			// so the chain stops one short of the window
			for (
				let chain = MAX_CHAIN;
				cand >= 0 && i - cand < WINDOW && chain > 0;
				chain--
			) {
				if (src[cand + bestLen] === src[i + bestLen]) {
					let len = 0;
					while (len < limit && src[cand + len] === src[i + len]) {
						len++;
					}
					if (len > bestLen) {
						bestLen = len;
						bestDist = i - cand;
						if (len === limit) {
							break;
						}
					}
				}
				cand = prev[cand & WINDOW_MASK];
			}
		}
		if (bestLen >= MIN_MATCH && (bestLen > MIN_MATCH || bestDist <= TOO_FAR)) {
			const li = LEN_SYM[bestLen];
			put(FIXED_LIT_CODES[257 + li], FIXED_LIT_LENS[257 + li]);
			if (LEN_EXTRA[li]) {
				put(bestLen - LEN_BASE[li], LEN_EXTRA[li]);
			}
			const ds = distSym(bestDist);
			put(FIXED_DIST_CODES[ds], 5);
			if (DIST_EXTRA[ds]) {
				put(bestDist - DIST_BASE[ds], DIST_EXTRA[ds]);
			}
			// index the covered positions so later matches can land inside
			const stop = Math.min(i + bestLen, n - MIN_MATCH + 1);
			for (let k = i + 1; k < stop; k++) {
				const hk = hash(k);
				prev[k & WINDOW_MASK] = head[hk];
				head[hk] = k;
			}
			i += bestLen;
		} else {
			put(FIXED_LIT_CODES[src[i]], FIXED_LIT_LENS[src[i]]);
			i++;
		}
	}
	put(FIXED_LIT_CODES[256], 7);
	if (have > 0) {
		out[o++] = buf & 0xff;
	}
	// incompressible input: stored blocks cap the growth at 5 bytes per
	// 64KB
	const stored = n + Math.max(1, Math.ceil(n / 0xffff)) * 5;
	return o <= stored ? out.slice(0, o) : storedBlocks(src);
};

export const gzipSync = (bytes: Uint8Array): Uint8Array => {
	const body = deflateRawSync(bytes);
	const out = new Uint8Array(
		GZIP_HEADER_SIZE + body.length + GZIP_TRAILER_SIZE,
	);
	// no name, no mtime: the same doc always saves to the same bytes
	out.set([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0xff]);
	out.set(body, GZIP_HEADER_SIZE);
	writeLE32(out, GZIP_HEADER_SIZE + body.length, crc32(bytes));
	writeLE32(out, GZIP_HEADER_SIZE + body.length + 4, bytes.length);
	return out;
};

// ------------------------------------------------------------------ native

/**
 * Default gunzip ceiling: comfortably above the largest legal doc
 * (10M cells x 12 plane bytes) and far below what a 50KB gzip bomb
 * expands to.
 */
export const MAX_GUNZIP_BYTES = 256 * 1024 * 1024;

interface Transform {
	readable: ReadableStream<Uint8Array>;
	writable: WritableStream<BufferSource>;
}

type TransformCtor = new (format: CompressionFormat) => Transform;

// Each call asks for the one format it needs: Chromium 80-102 builds
// gzip streams but throws on deflate-raw.
const nativeStream = (
	ctor: TransformCtor | undefined,
	format: CompressionFormat,
): Transform | null => {
	if (typeof ctor !== 'function') {
		return null;
	}
	try {
		return new ctor(format);
	} catch {
		return null;
	}
};

// Built on bare ReadableStream (no Blob/Response: jsdom's Blob lacks
// .stream() and the fewer globals the codec touches, the more hosts it
// runs in).
const pumpThrough = async (
	bytes: Uint8Array,
	transform: Transform,
	maxBytes = Infinity,
): Promise<Uint8Array> => {
	const writer = transform.writable.getWriter();
	// Copy guarantees ArrayBuffer backing for the BufferSource write
	// (callers may hand views over any buffer type)
	const chunk = new Uint8Array(bytes);
	// Errors surface through the read side; the write promise is observed
	// in finally so a transform failure never leaves a dangling rejection
	const writing = writer
		.write(chunk)
		.then(() => writer.close())
		.catch(() => undefined);
	const reader = transform.readable.getReader();
	const chunks: Uint8Array[] = [];
	try {
		let total = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			total += value.length;
			if (total > maxBytes) {
				// a decompression bomb must die DURING the read, not after
				// it has been buffered
				await reader.cancel();
				throw new CodecError(`decompressed stream exceeds ${maxBytes} bytes`);
			}
			chunks.push(value);
		}
	} finally {
		await writing;
	}
	return concatBytes(chunks);
};

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
};

export const gzip = async (bytes: Uint8Array): Promise<Uint8Array> => {
	const stream = nativeStream(globalThis.CompressionStream, 'gzip');
	if (stream) {
		try {
			const out = await pumpThrough(bytes, stream);
			// Safari 16.4 shipped a CompressionStream that cut large output
			// short without an error, so native bytes ship only once they
			// decode back to the input
			if (sameBytes(gunzipSync(out, bytes.length), bytes)) {
				return out;
			}
		} catch {
			// the plain deflater below has the last word
		}
	}
	return gzipSync(bytes);
};

export const gunzip = async (
	bytes: Uint8Array,
	maxBytes: number = MAX_GUNZIP_BYTES,
): Promise<Uint8Array> => {
	const stream = nativeStream(globalThis.DecompressionStream, 'gzip');
	if (stream) {
		try {
			const out = await pumpThrough(bytes, stream, maxBytes);
			// engines check the trailer themselves; this catches one that
			// drops output on the way out instead
			if (
				bytes.length >= GZIP_HEADER_SIZE + GZIP_TRAILER_SIZE &&
				readLE32(bytes, bytes.length - 4) === out.length >>> 0 &&
				readLE32(bytes, bytes.length - 8) === crc32(out)
			) {
				return out;
			}
		} catch (error) {
			// the cap is a verdict; an engine failure gets a second opinion
			if (error instanceof CodecError) {
				throw error;
			}
		}
	}
	return gunzipSync(bytes, maxBytes);
};

export const inflateRaw = async (
	bytes: Uint8Array,
	maxBytes = Infinity,
): Promise<Uint8Array> => {
	const stream = nativeStream(globalThis.DecompressionStream, 'deflate-raw');
	if (stream) {
		try {
			return await pumpThrough(bytes, stream, maxBytes);
		} catch (error) {
			if (error instanceof CodecError) {
				throw error;
			}
		}
	}
	return inflateRawSync(bytes, maxBytes);
};
