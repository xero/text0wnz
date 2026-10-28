/**
 * Minimal LHA/LZH reader for the asciiarena.se in-app browser: enough
 * to open one piece out of an amiga ascii colly. Walks header levels
 * 0, 1, and 2 and decodes -lh0- (stored) and -lh5- (static huffman
 * over an 8KB LZSS window), which covers every entry in the arena's
 * archives (4,190 of them verified against this decoder). Every
 * extraction checks the header's CRC-16: the strict path refuses a
 * rotten scene file, and salvage opens what decoded with a note naming
 * the damage, so garbage never renders without a word.
 */

import { CodecError, Salvaged, salvaged } from './util.js';

/**
 * Per-entry extraction cap, mirroring the zip reader: scene pieces are
 * kilobytes, and the size check must run BEFORE decoding so a forged
 * header cannot balloon the output buffer.
 */
export const MAX_LHA_ENTRY_BYTES = 32 * 1024 * 1024;

export interface LhaEntry {
	name: string;
	method: string;
	compressedSize: number;
	size: number;
	dataOffset: number;
	crc: number;
}

/** literal/length alphabet: 256 literals + match lengths 3..258 */
const NC = 510;
/** code-length (temp) alphabet size */
const NT = 19;
/** position alphabet size for the 13-bit lh5 window */
const NP = 14;
const THRESHOLD = 3;
const MAX_CODE_LENGTH = 16;

const METHOD = /^-l[a-z0-9]{2}-$/;

// true ISO-8859-1, byte to codepoint: TextDecoder('latin1') means
// windows-1252 and would mangle amiga names using 0x80-0x9F
const latin1 = (raw: Uint8Array): string => {
	let out = '';
	for (const byte of raw) {
		out += String.fromCharCode(byte);
	}
	return out;
};

// generic LHA may carry DOS paths; one separator keeps basename logic
// in the callers honest
const cleanName = (raw: Uint8Array): string =>
	latin1(raw).replaceAll('\\', '/');

let CRC_TABLE: Uint16Array | null = null;

/** CRC-16/ARC, the checksum LHA stores per entry */
export const crc16 = (data: Uint8Array): number => {
	if (!CRC_TABLE) {
		CRC_TABLE = new Uint16Array(256);
		for (let i = 0; i < 256; i++) {
			let c = i;
			for (let k = 0; k < 8; k++) {
				c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1;
			}
			CRC_TABLE[i] = c;
		}
	}
	let crc = 0;
	for (const byte of data) {
		crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
	}
	return crc;
};

/** parse the header chain into an entry list */
export const readLhaEntries = (bytes: Uint8Array): LhaEntry[] => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const entries: LhaEntry[] = [];
	let pos = 0;
	while (pos + 21 <= bytes.length) {
		const method = latin1(bytes.subarray(pos + 2, pos + 7));
		if (!METHOD.test(method)) {
			// the zero terminator only ends the chain where no header
			// starts: a level 2 header sized to a multiple of 256 also
			// opens with a zero byte and must still parse
			if (bytes[pos] === 0) {
				break;
			}
			throw new CodecError(
				entries.length ? `lha header torn at ${pos}` : 'not an lha archive',
			);
		}
		const level = bytes[pos + 20];
		let compressedSize = view.getUint32(pos + 7, true);
		const size = view.getUint32(pos + 11, true);
		let name = '';
		let crc = 0;
		let dataOffset = 0;
		let next = 0;
		if (level === 0 || level === 1) {
			const headerEnd = pos + 2 + bytes[pos];
			// the loop guard stops at pos + 21, one short of the name
			// length byte: reading past the end made nameLength NaN, and
			// NaN comparisons waved the torn-header guard through into a
			// phantom entry
			if (pos + 22 > bytes.length) {
				throw new CodecError(`lha header torn at ${pos}`);
			}
			const nameLength = bytes[pos + 21];
			if (
				pos + 22 + nameLength + 2 > bytes.length ||
				headerEnd > bytes.length
			) {
				throw new CodecError(`lha header torn at ${pos}`);
			}
			name = cleanName(bytes.subarray(pos + 22, pos + 22 + nameLength));
			crc = view.getUint16(pos + 22 + nameLength, true);
			if (level === 0) {
				dataOffset = headerEnd;
				next = headerEnd + compressedSize;
			} else {
				// level 1 counts its extended headers inside the size
				// field; the chain's sizes ride each block's last 2 bytes
				let ext = view.getUint16(headerEnd - 2, true);
				let extTotal = 0;
				let at = headerEnd;
				while (ext) {
					extTotal += ext;
					at += ext;
					// at only grows from headerEnd (>= 22), so at - 2 < 0 can
					// never fire; the real tear check is the upper bound
					if (at > bytes.length) {
						throw new CodecError(`lha header torn at ${pos}`);
					}
					ext = view.getUint16(at - 2, true);
				}
				dataOffset = headerEnd + extTotal;
				next = headerEnd + compressedSize;
				compressedSize -= extTotal;
			}
		} else if (level === 2) {
			const headerEnd = pos + view.getUint16(pos, true);
			if (headerEnd > bytes.length || pos + 26 > bytes.length) {
				throw new CodecError(`lha header torn at ${pos}`);
			}
			crc = view.getUint16(pos + 21, true);
			// the filename lives in extended headers: 0x01 name, 0x02
			// directory prefix with 0xff separators
			let dir = '';
			let at = pos + 24;
			let ext = view.getUint16(at, true);
			at += 2;
			while (ext) {
				if (at + ext > bytes.length || ext < 3) {
					throw new CodecError(`lha header torn at ${pos}`);
				}
				const type = bytes[at];
				const body = bytes.subarray(at + 1, at + ext - 2);
				if (type === 0x01) {
					name = cleanName(body);
				} else if (type === 0x02) {
					dir = latin1(body).replaceAll('ÿ', '/');
				}
				const chained = view.getUint16(at + ext - 2, true);
				at += ext;
				ext = chained;
			}
			name = dir + name;
			dataOffset = headerEnd;
			next = headerEnd + compressedSize;
		} else {
			throw new CodecError(`lha header level ${level} unsupported`);
		}
		if (next <= pos || next > bytes.length) {
			throw new CodecError(`lha data truncated for ${name || 'entry'}`);
		}
		entries.push({ name, method, compressedSize, size, dataOffset, crc });
		pos = next;
	}
	if (!entries.length) {
		throw new CodecError('not an lha archive');
	}
	return entries;
};

/** MSB-first bit reader over one entry's compressed bytes */
class BitReader {
	private buf = 0;

	private have = 0;

	private pos: number;

	constructor(
		private bytes: Uint8Array,
		start: number,
		private end: number,
	) {
		this.pos = start;
	}

	/** set once a read reaches past the entry's data */
	padded = false;

	/** reads past the end pad with zeros; the CRC check catches it */
	read(n: number): number {
		while (this.have < n) {
			let byte = 0;
			if (this.pos < this.end) {
				byte = this.bytes[this.pos++];
			} else {
				this.padded = true;
			}
			this.buf = (this.buf << 8) | byte;
			this.have += 8;
		}
		this.have -= n;
		return (this.buf >>> this.have) & ((1 << n) - 1);
	}
}

/** canonical huffman decode tables; single-symbol tables read no bits */
interface Huffman {
	single?: number;
	count?: Uint16Array;
	first?: Uint32Array;
	offset?: Uint16Array;
	syms?: Uint16Array;
}

const buildHuffman = (lens: Uint8Array): Huffman => {
	const count = new Uint16Array(MAX_CODE_LENGTH + 1);
	let total = 0;
	for (const len of lens) {
		if (len > MAX_CODE_LENGTH) {
			throw new CodecError('lha huffman table torn');
		}
		if (len) {
			count[len]++;
			total++;
		}
	}
	if (!total) {
		throw new CodecError('lha huffman table torn');
	}
	const first = new Uint32Array(MAX_CODE_LENGTH + 2);
	const offset = new Uint16Array(MAX_CODE_LENGTH + 1);
	let at = 0;
	for (let len = 1; len <= MAX_CODE_LENGTH; len++) {
		first[len + 1] = (first[len] + count[len]) << 1;
		offset[len] = at;
		at += count[len];
	}
	const syms = new Uint16Array(total);
	const fill = offset.slice();
	for (let sym = 0; sym < lens.length; sym++) {
		if (lens[sym]) {
			syms[fill[lens[sym]]++] = sym;
		}
	}
	return { count, first, offset, syms };
};

const decodeSym = (br: BitReader, table: Huffman): number => {
	if (table.single !== undefined) {
		return table.single;
	}
	let code = 0;
	for (let len = 1; len <= MAX_CODE_LENGTH; len++) {
		code = (code << 1) | br.read(1);
		const slot = code - (table.first as Uint32Array)[len];
		if (slot >= 0 && slot < (table.count as Uint16Array)[len]) {
			return (table.syms as Uint16Array)[
				(table.offset as Uint16Array)[len] + slot
			];
		}
	}
	throw new CodecError('lha stream torn');
};

/** the temp and position tables share a 3-bit + extension encoding */
const readLengths = (
	br: BitReader,
	size: number,
	nbit: number,
	special: number,
): Huffman => {
	const n = br.read(nbit);
	if (n === 0) {
		return { single: br.read(nbit) };
	}
	// clamping an oversized count would leave codes unread and silently
	// desync the stream; a torn table must fail here, not at the crc
	if (n > size) {
		throw new CodecError('lha huffman table torn');
	}
	const lens = new Uint8Array(size);
	let i = 0;
	while (i < n) {
		let len = br.read(3);
		if (len === 7) {
			while (br.read(1)) {
				len++;
				if (len > MAX_CODE_LENGTH) {
					throw new CodecError('lha huffman table torn');
				}
			}
		}
		lens[i++] = len;
		if (i === special) {
			i += br.read(2);
		}
	}
	return buildHuffman(lens);
};

/** the literal table's lengths come encoded with the temp table */
const readLiteralLengths = (br: BitReader, temp: Huffman): Huffman => {
	const n = br.read(9);
	if (n === 0) {
		return { single: br.read(9) };
	}
	if (n > NC) {
		throw new CodecError('lha huffman table torn');
	}
	const lens = new Uint8Array(NC);
	let i = 0;
	while (i < n) {
		const c = decodeSym(br, temp);
		if (c === 0) {
			i++;
		} else if (c === 1) {
			i += br.read(4) + 3;
		} else if (c === 2) {
			i += br.read(9) + 20;
		} else {
			lens[i++] = c - 2;
		}
	}
	return buildHuffman(lens);
};

const decodeLh5 = (
	bytes: Uint8Array,
	entry: LhaEntry,
	salvage = false,
): Uint8Array => {
	const br = new BitReader(
		bytes,
		entry.dataOffset,
		entry.dataOffset + entry.compressedSize,
	);
	const out = new Uint8Array(entry.size);
	let o = 0;
	let block = 0;
	let literals: Huffman | null = null;
	let positions: Huffman | null = null;
	// a valid stream never reads past its data, so a salvage that does
	// is decoding invented zeros and stops before writing them
	const overrun = (): void => {
		if (salvage && br.padded) {
			throw new CodecError(`lha stream runs past its data in ${entry.name}`);
		}
	};
	try {
		while (o < out.length) {
			if (block === 0) {
				block = br.read(16);
				if (block === 0) {
					throw new CodecError(`lha stream torn in ${entry.name}`);
				}
				const temp = readLengths(br, NT, 5, 3);
				literals = readLiteralLengths(br, temp);
				positions = readLengths(br, NP, 4, -1);
				overrun();
			}
			block--;
			const c = decodeSym(br, literals as Huffman);
			overrun();
			if (c < 256) {
				out[o++] = c;
			} else {
				const length = c - 256 + THRESHOLD;
				let p = decodeSym(br, positions as Huffman);
				if (p !== 0) {
					p = (1 << (p - 1)) + br.read(p - 1);
				}
				overrun();
				let from = o - p - 1;
				if (from < 0) {
					throw new CodecError(`lha stream torn in ${entry.name}`);
				}
				for (let k = 0; k < length && o < out.length; k++) {
					out[o++] = out[from++];
				}
			}
		}
	} catch (error) {
		// salvage keeps what decoded before the tear
		if (salvage && error instanceof CodecError) {
			return out.slice(0, o);
		}
		throw error;
	}
	return out;
};

/** the guards strict and salvage share: past these there is nothing honest to show */
const checkLhaEntry = (bytes: Uint8Array, entry: LhaEntry): void => {
	if (
		entry.size > MAX_LHA_ENTRY_BYTES ||
		entry.compressedSize > MAX_LHA_ENTRY_BYTES
	) {
		throw new CodecError(
			`lha entry ${entry.name} exceeds ${MAX_LHA_ENTRY_BYTES} bytes`,
		);
	}
	// a truncated archive refuses even for salvage: the bit reader would
	// pad the gap with invented bytes
	if (entry.dataOffset + entry.compressedSize > bytes.length) {
		throw new CodecError(`lha data truncated for ${entry.name}`);
	}
	if (entry.method !== '-lh0-' && entry.method !== '-lh5-') {
		throw new CodecError(
			`lha method ${entry.method} unsupported for ${entry.name}`,
		);
	}
};

/** stored bytes stop at the declared size; anything past it is not content */
const decodeLha = (
	bytes: Uint8Array,
	entry: LhaEntry,
	salvage: boolean,
): Uint8Array =>
	entry.method === '-lh0-'
		? bytes.slice(
				entry.dataOffset,
				entry.dataOffset + Math.min(entry.compressedSize, entry.size),
			)
		: decodeLh5(bytes, entry, salvage);

/** extract one entry's bytes (lh0 or lh5), CRC-verified */
export const extractLhaEntry = (
	bytes: Uint8Array,
	entry: LhaEntry,
): Uint8Array => {
	checkLhaEntry(bytes, entry);
	const out = decodeLha(bytes, entry, false);
	if (out.length !== entry.size || crc16(out) !== entry.crc) {
		throw new CodecError(`lha entry ${entry.name} is corrupt (crc mismatch)`);
	}
	return out;
};

/**
 * Open an entry in spite of damage, for the arena browser: torn lh5
 * streams open as far as they decode, and a CRC-16 mismatch opens with
 * a warning.
 */
export const salvageLhaEntry = (
	bytes: Uint8Array,
	entry: LhaEntry,
): Salvaged => {
	checkLhaEntry(bytes, entry);
	const out = decodeLha(bytes, entry, true);
	return salvaged(entry.name, out, entry.size, crc16(out) === entry.crc);
};
