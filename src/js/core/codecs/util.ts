/**
 * Shared byte helpers for the 0wnzlib codecs (PLAN.md §3.3). Pure TS,
 * no DOM.
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
