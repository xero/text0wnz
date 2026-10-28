/**
 * The PKZIP 1.x methods older scene packs still carry: Shrink (1) and
 * Implode (6). PKZIP 2.04g brought deflate in 1993; before it, most
 * DOS packs shrank or imploded, and in the 16colo.rs mirror the bulk
 * of 1990-1993 still does. Both decoders follow PKWARE's APPNOTE.TXT
 * and stop at the declared size; the zip reader's CRC-32 is the judge.
 *
 * Like the inflater, each can salvage: on a fault it hands back what
 * decoded so far and names the fault instead of throwing.
 */

import { CodecError } from './util.js';

export interface Decoded {
	out: Uint8Array;
	damage: string | null;
}

/**
 * LSB-first bit reader. A peek may look past the end (the padding
 * reads as zeros, enough to index a code table); a read that needs
 * bits the stream does not have is a fault.
 */
class Bits {
	private buf = 0;

	private have = 0;

	private real = 0;

	private pos = 0;

	constructor(private bytes: Uint8Array) {}

	private fill(n: number): void {
		while (this.have < n) {
			if (this.pos < this.bytes.length) {
				this.buf |= this.bytes[this.pos++] << this.have;
				this.real += 8;
			}
			this.have += 8;
		}
	}

	peek(n: number): number {
		this.fill(n);
		return this.buf & ((1 << n) - 1);
	}

	read(n: number): number {
		this.fill(n);
		if (n > this.real) {
			throw new CodecError('compressed data is truncated');
		}
		const value = this.buf & ((1 << n) - 1);
		this.buf >>>= n;
		this.have -= n;
		this.real -= n;
		return value;
	}
}

const settle = (
	out: Uint8Array,
	o: number,
	error: unknown,
	salvage: boolean,
): Decoded => {
	if (!salvage || !(error instanceof CodecError)) {
		throw error;
	}
	return { out: out.slice(0, o), damage: error.message };
};

// ------------------------------------------------------------------ shrink

const SHRINK_CODES = 8192;
const SHRINK_MAX_BITS = 13;
const ESCAPE = 256;
const FREE = 0xffff;

/**
 * Shrink: LZW whose codes grow from 9 to 13 bits on request (escape,
 * then 1) and whose leaves can be freed for reuse (escape, then 2).
 * New entries take the lowest free code, so after a partial clear the
 * table refills its holes before it grows; a full table simply stops
 * adding until the next clear.
 */
export const unshrink = (
	data: Uint8Array,
	size: number,
	salvage = false,
): Decoded => {
	const out = new Uint8Array(size);
	const parent = new Uint16Array(SHRINK_CODES).fill(FREE);
	const suffix = new Uint8Array(SHRINK_CODES);
	const stack = new Uint8Array(SHRINK_CODES);
	const bits = new Bits(data);
	let o = 0;
	try {
		if (size === 0) {
			return { out, damage: null };
		}
		let width = 9;
		let lastFree = ESCAPE;
		let old = bits.read(width);
		if (old > 255) {
			throw new CodecError('shrink stream opens on a non-literal');
		}
		let first = old;
		out[o++] = old;
		while (o < size) {
			let code = bits.read(width);
			if (code === ESCAPE) {
				const op = bits.read(width);
				if (op === 1) {
					width++;
					if (width > SHRINK_MAX_BITS) {
						throw new CodecError('shrink code width passes 13 bits');
					}
				} else if (op === 2) {
					// free every leaf: mark parents first, then drop the rest
					const hasChild = new Uint8Array(SHRINK_CODES);
					for (let c = ESCAPE + 1; c < SHRINK_CODES; c++) {
						if (parent[c] !== FREE && parent[c] > ESCAPE) {
							hasChild[parent[c]] = 1;
						}
					}
					for (let c = ESCAPE + 1; c < SHRINK_CODES; c++) {
						if (!hasChild[c]) {
							parent[c] = FREE;
						}
					}
					lastFree = ESCAPE;
				} else {
					throw new CodecError(`shrink escape ${op} is unknown`);
				}
				continue;
			}
			const current = code;
			let top = stack.length;
			// the next code the table will make: the only one a stream may
			// name before it exists (the KwKwK case)
			let next = lastFree + 1;
			while (next < SHRINK_CODES && parent[next] !== FREE) {
				next++;
			}
			if (code > ESCAPE && parent[code] === FREE) {
				if (code !== next) {
					throw new CodecError('shrink code is not in the table');
				}
				stack[--top] = first;
				code = old;
			}
			while (code > ESCAPE) {
				if (top === 0 || parent[code] === FREE) {
					throw new CodecError('shrink code chain is broken');
				}
				stack[--top] = suffix[code];
				code = parent[code];
			}
			if (code === ESCAPE) {
				throw new CodecError('shrink code chain is broken');
			}
			first = code;
			stack[--top] = code;
			for (let k = top; k < stack.length && o < size; k++) {
				out[o++] = stack[k];
			}
			// a full table stops growing until the next partial clear
			if (next < SHRINK_CODES) {
				lastFree = next;
				suffix[next] = first;
				parent[next] = old;
			}
			old = current;
		}
	} catch (error) {
		return settle(out, o, error, salvage);
	}
	return { out, damage: null };
};

// ----------------------------------------------------------------- implode

/** Shannon-Fano decode table: entry = symbol << 5 | code length */
interface Tree {
	map: Uint16Array;
	mask: number;
}

/**
 * A tree arrives as run-length pairs (count-1 high nibble, length-1
 * low nibble), and APPNOTE assigns the codes: stable-sort by length,
 * walk from the longest, step by 2^(16-length), bit-reverse.
 */
const readTree = (
	data: Uint8Array,
	at: number,
	n: number,
): { tree: Tree; at: number } => {
	if (at >= data.length) {
		throw new CodecError('implode tree is truncated');
	}
	const pairs = data[at] + 1;
	if (at + 1 + pairs > data.length) {
		throw new CodecError('implode tree is truncated');
	}
	const lens = new Uint8Array(n);
	let k = 0;
	for (let i = 0; i < pairs; i++) {
		const byte = data[at + 1 + i];
		const count = (byte >> 4) + 1;
		if (k + count > n) {
			throw new CodecError('implode tree overruns its symbols');
		}
		lens.fill((byte & 0x0f) + 1, k, k + count);
		k += count;
	}
	if (k !== n) {
		throw new CodecError('implode tree is short of symbols');
	}
	const order = Array.from({ length: n }, (_, sym) => sym).sort(
		(a, b) => lens[a] - lens[b] || a - b,
	);
	const codes = new Uint16Array(n);
	let code = 0;
	let step = 0;
	let last = 0;
	for (let i = n - 1; i >= 0; i--) {
		const sym = order[i];
		code = (code + step) & 0xffff;
		if (lens[sym] !== last) {
			last = lens[sym];
			step = 1 << (16 - last);
		}
		codes[sym] = code;
	}
	let max = 0;
	for (const len of lens) {
		max = len > max ? len : max;
	}
	const map = new Uint16Array(1 << max);
	for (let sym = 0; sym < n; sym++) {
		const len = lens[sym];
		let rev = 0;
		for (let b = 0, c = codes[sym] >> (16 - len); b < len; b++) {
			rev = (rev << 1) | (c & 1);
			c >>= 1;
		}
		for (let slot = rev; slot < map.length; slot += 1 << len) {
			map[slot] = (sym << 5) | len;
		}
	}
	return { tree: { map, mask: map.length - 1 }, at: at + 1 + pairs };
};

/** next symbol through a tree, consuming only its own code's bits */
const decodeTree = (bits: Bits, tree: Tree): number => {
	const entry = tree.map[bits.peek(16) & tree.mask];
	if (!entry) {
		throw new CodecError('implode code is invalid');
	}
	bits.read(entry & 31);
	return entry >> 5;
};

/**
 * Implode: literals (raw bytes, or a 256-symbol tree when flag bit 2
 * is set) and window matches whose distance splits into 6 or 7 raw low
 * bits (4KB or 8KB window, flag bit 1) and 6 coded high bits. Bytes
 * before the start of the output read as zeros.
 */
export const explode = (
	data: Uint8Array,
	size: number,
	flags: number,
	salvage = false,
): Decoded => {
	const out = new Uint8Array(size);
	let o = 0;
	try {
		// an empty entry may carry no trees at all, and needs none
		if (size === 0) {
			return { out, damage: null };
		}
		const bigWindow = (flags & 0x02) !== 0;
		const literalTree = (flags & 0x04) !== 0;
		let at = 0;
		let literals: Tree | null = null;
		if (literalTree) {
			({ tree: literals, at } = readTree(data, at, 256));
		}
		const lengths = readTree(data, at, 64);
		const distances = readTree(data, lengths.at, 64);
		const bits = new Bits(data.subarray(distances.at));
		const lowBits = bigWindow ? 7 : 6;
		const minMatch = literalTree ? 3 : 2;
		while (o < size) {
			if (bits.read(1)) {
				out[o++] = literals ? decodeTree(bits, literals) : bits.read(8);
				continue;
			}
			const low = bits.read(lowBits);
			const distance =
				((decodeTree(bits, distances.tree) << lowBits) | low) + 1;
			let length = decodeTree(bits, lengths.tree) + minMatch;
			if (length === 63 + minMatch) {
				length += bits.read(8);
			}
			for (let k = 0; k < length && o < size; k++, o++) {
				out[o] = o >= distance ? out[o - distance] : 0;
			}
		}
	} catch (error) {
		return settle(out, o, error, salvage);
	}
	return { out, damage: null };
};
