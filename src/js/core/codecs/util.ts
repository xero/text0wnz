/**
 * Shared byte helpers for the 0wnzlib codecs. Pure TS, no DOM.
 */

export class CodecError extends Error {
	constructor(message: string) {
		super(`[0wnzlib] ${message}`);
	}
}

export const bytesToString = (
	bytes: Uint8Array,
	offset: number,
	size: number,
): string => {
	let text = '';
	for (let i = 0; i < size; i++) {
		text += String.fromCharCode(bytes[offset + i]);
	}
	return text;
};

/**
 * String field with trailing whitespace AND NUL padding trimmed. SAUCE
 * pads character fields with spaces but TInfoS is zero-filled, and wild
 * writers mix both; v2's \s-only trim leaves NULs behind (its font-name
 * lookups tolerate that downstream, ours should not).
 */
export const stringField = (
	bytes: Uint8Array,
	offset: number,
	size: number,
): string => bytesToString(bytes, offset, size).replace(/[\s\u0000]+$/, '');

export const readLE16 = (bytes: Uint8Array, offset: number): number =>
	bytes[offset] | (bytes[offset + 1] << 8);

export const readLE32 = (bytes: Uint8Array, offset: number): number =>
	(bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)) +
	bytes[offset + 3] * 0x1000000;

export const writeLE16 = (
	bytes: Uint8Array,
	offset: number,
	value: number,
): void => {
	bytes[offset] = value & 0xff;
	bytes[offset + 1] = (value >> 8) & 0xff;
};

export const writeLE32 = (
	bytes: Uint8Array,
	offset: number,
	value: number,
): void => {
	bytes[offset] = value & 0xff;
	bytes[offset + 1] = (value >> 8) & 0xff;
	bytes[offset + 2] = (value >> 16) & 0xff;
	bytes[offset + 3] = (value >>> 24) & 0xff;
};

/** Latin-1-ish text into a field: one byte per charCode, truncated. */
export const writeText = (
	bytes: Uint8Array,
	offset: number,
	size: number,
	text: string,
): void => {
	const limit = Math.min(text.length, size);
	for (let i = 0; i < limit; i++) {
		bytes[offset + i] = text.charCodeAt(i) & 0xff;
	}
};

/** Big-endian u16 cells from byte pairs (v2 doc word layout). */
export const bytesToU16Cells = (
	bytes: Uint8Array,
	offset: number,
	byteLength: number,
): Uint16Array => {
	const cells = new Uint16Array(byteLength >> 1);
	for (let i = 0, j = offset; i < cells.length; i++, j += 2) {
		cells[i] = (bytes[j] << 8) | bytes[j + 1];
	}
	return cells;
};

export const u16CellsToBytes = (cells: Uint16Array): Uint8Array => {
	const bytes = new Uint8Array(cells.length * 2);
	for (let i = 0, j = 0; i < cells.length; i++, j += 2) {
		bytes[j] = cells[i] >> 8;
		bytes[j + 1] = cells[i] & 0xff;
	}
	return bytes;
};

export const concatBytes = (parts: ReadonlyArray<Uint8Array>): Uint8Array => {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
};

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

/** CRC-32 (reflected, poly 0xEDB88320): zip, gzip, and the journal. */
export const crc32 = (bytes: Uint8Array): number => {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
};

/** An archive entry opened in spite of damage, and what to tell the artist. */
export interface Salvaged {
	bytes: Uint8Array;
	/** null when the content is whole and its checksum agrees */
	damage: string | null;
}

/**
 * The verdict on a damaged entry: whole with a good checksum is clean
 * (junk after the stream, or an engine bug, never touched the
 * content), whole with a bad one opens with a warning, a partial one
 * opens as far as it decoded, and nothing at all is a refusal.
 */
export const salvaged = (
	name: string,
	out: Uint8Array,
	size: number,
	checksumOk: boolean,
): Salvaged => {
	const base = name.split('/').pop() || name;
	if (out.length === size && checksumOk) {
		return { bytes: out, damage: null };
	}
	if (out.length === 0) {
		throw new CodecError(`${base} is damaged beyond recovery`);
	}
	const count = (n: number): string => n.toLocaleString('en-US');
	return {
		bytes: out,
		damage:
			out.length === size
				? `${base} failed its checksum and may show damage`
				: `${base} is damaged: showing the first ${count(out.length)} of ${count(size)} bytes`,
	};
};

/** UTF-8 bytes for one codepoint (v2 unicodeToArray port). */
export const utf8Encode = (codepoint: number): number[] => {
	if (codepoint < 0x80) {
		return [codepoint];
	} else if (codepoint < 0x800) {
		return [0xc0 | (codepoint >> 6), 0x80 | (codepoint & 0x3f)];
	} else if (codepoint < 0x10000) {
		return [
			0xe0 | (codepoint >> 12),
			0x80 | ((codepoint >> 6) & 0x3f),
			0x80 | (codepoint & 0x3f),
		];
	}
	return [
		0xf0 | (codepoint >> 18),
		0x80 | ((codepoint >> 12) & 0x3f),
		0x80 | ((codepoint >> 6) & 0x3f),
		0x80 | (codepoint & 0x3f),
	];
};

// ------------------------------------------------------------------ base64
// Zero-dep base64 over Uint8Array: atob/btoa are DOM-ish and Buffer is
// node-only; the envelope codec needs both directions everywhere.

const B64_ALPHABET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const bytesToBase64 = (bytes: Uint8Array): string => {
	let out = '';
	for (let i = 0; i < bytes.length; i += 3) {
		const a = bytes[i];
		const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
		const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
		out += B64_ALPHABET[a >> 2];
		out += B64_ALPHABET[((a & 3) << 4) | (b >> 4)];
		out +=
			i + 1 < bytes.length ? B64_ALPHABET[((b & 15) << 2) | (c >> 6)] : '=';
		out += i + 2 < bytes.length ? B64_ALPHABET[c & 63] : '=';
	}
	return out;
};

const B64_REVERSE = new Map<string, number>(
	Array.from(B64_ALPHABET, (ch, i) => [ch, i] as const),
);

export const base64ToBytes = (text: string): Uint8Array => {
	const clean = text.replace(/=+$/, '');
	const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
	let at = 0;
	let buffer = 0;
	let bits = 0;
	for (const ch of clean) {
		const value = B64_REVERSE.get(ch);
		if (value === undefined) {
			throw new CodecError(`invalid base64 character ${JSON.stringify(ch)}`);
		}
		buffer = (buffer << 6) | value;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			out[at++] = (buffer >> bits) & 0xff;
		}
	}
	return out;
};
