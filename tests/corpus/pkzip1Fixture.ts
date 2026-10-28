/**
 * Test-side encoders for the PKZIP 1.x methods: nothing in the tree
 * writes shrink or implode, and the fixture rules keep third-party
 * packs out, so the decoders' CI coverage comes from these inverses.
 * The decoders themselves are proven against every shrunk and imploded
 * entry in the 16colo.rs mirror; these pin the corners it lacks.
 */

/** LSB-first writer: header fields as numbers, codes MSB-first */
class BitWriter {
	private bytes: number[] = [];

	private buf = 0;

	private have = 0;

	put(value: number, count: number): void {
		for (let i = 0; i < count; i++) {
			this.bit((value >> i) & 1);
		}
	}

	code(value: number, length: number): void {
		for (let i = length - 1; i >= 0; i--) {
			this.bit((value >> i) & 1);
		}
	}

	private bit(b: number): void {
		this.buf |= b << this.have;
		if (++this.have === 8) {
			this.bytes.push(this.buf);
			this.buf = 0;
			this.have = 0;
		}
	}

	done(): Uint8Array {
		return Uint8Array.from(this.have ? [...this.bytes, this.buf] : this.bytes);
	}
}

const CODES = 8192;
const ESCAPE = 256;

/**
 * Shrink. Entries are added when the decoder adds them, one code late,
 * so both tables stay identical through a partial clear; clears only
 * land right after a literal code, whose slot a clear never frees.
 */
export const shrink = (
	data: Uint8Array,
	options: { clearEvery?: number } = {},
): { bytes: Uint8Array; width: number; clears: number } => {
	const w = new BitWriter();
	const parent = new Int32Array(CODES).fill(-1);
	const suffix = new Uint8Array(CODES);
	// one-code-late adds can repeat a string, so the lookup keeps one code
	// per string while parent[] knows every code in use
	let index = new Map<number, number>();
	let width = 9;
	let lowestFree = ESCAPE + 1;
	const emit = (code: number) => {
		while (code >= 1 << width) {
			w.put(ESCAPE, width);
			w.put(1, width);
			width++;
		}
		w.put(code, width);
	};
	const add = (prefix: number, byte: number) => {
		let code = lowestFree;
		while (code < CODES && parent[code] !== -1) {
			code++;
		}
		// a full table stops growing, as the decoder's does
		if (code >= CODES) {
			return;
		}
		parent[code] = prefix;
		suffix[code] = byte;
		index.set(prefix * 256 + byte, code);
		lowestFree = code + 1;
	};
	const clear = () => {
		const hasChild = new Uint8Array(CODES);
		for (let c = ESCAPE + 1; c < CODES; c++) {
			if (parent[c] > ESCAPE) {
				hasChild[parent[c]] = 1;
			}
		}
		index = new Map();
		for (let c = ESCAPE + 1; c < CODES; c++) {
			if (parent[c] === -1) {
				continue;
			}
			if (hasChild[c]) {
				index.set(parent[c] * 256 + suffix[c], c);
			} else {
				parent[c] = -1;
			}
		}
		lowestFree = ESCAPE + 1;
	};
	let prev = -1;
	let clears = 0;
	let sinceClear = 0;
	for (let i = 0; i < data.length; ) {
		// clear before the match search, so the code about to go out was
		// looked up in the table the decoder will hold
		if (
			options.clearEvery &&
			sinceClear >= options.clearEvery &&
			prev >= 0 &&
			prev < 256
		) {
			w.put(ESCAPE, width);
			w.put(2, width);
			clear();
			clears++;
			sinceClear = 0;
		}
		let code = data[i];
		let j = i + 1;
		for (; j < data.length; j++) {
			const next = index.get(code * 256 + data[j]);
			if (next === undefined) {
				break;
			}
			code = next;
		}
		emit(code);
		if (prev >= 0) {
			add(prev, data[i]);
		}
		prev = code;
		i = j;
		sinceClear++;
	}
	return { bytes: w.done(), width, clears };
};

/** a bare writer for hand-built streams */
export const bitWriter = (): BitWriter => new BitWriter();

/**
 * Implode with uniform trees (every literal 8 bits, every length and
 * distance symbol 6), where APPNOTE's code assignment works out to
 * N-1-symbol: an independent derivation of what the decoder computes.
 */
export const implode = (data: Uint8Array, flags: number): Uint8Array => {
	const bigWindow = (flags & 0x02) !== 0;
	const literalTree = (flags & 0x04) !== 0;
	const lowBits = bigWindow ? 7 : 6;
	const minMatch = literalTree ? 3 : 2;
	const window = 64 << lowBits;
	const maxMatch = 63 + minMatch + 255;
	const head: number[] = [];
	if (literalTree) {
		head.push(15, ...new Array(16).fill(0xf7));
	}
	head.push(3, ...new Array(4).fill(0xf5), 3, ...new Array(4).fill(0xf5));
	const w = new BitWriter();
	const symbol = (value: number, length: number, count: number) =>
		w.code(count - 1 - value, length);
	for (let i = 0; i < data.length; ) {
		let bestLen = 0;
		let bestDist = 0;
		for (let from = Math.max(0, i - window); from < i; from++) {
			let len = 0;
			while (
				len < maxMatch &&
				i + len < data.length &&
				data[from + len] === data[i + len]
			) {
				len++;
			}
			if (len >= bestLen) {
				bestLen = len;
				bestDist = i - from;
			}
		}
		if (bestLen >= minMatch) {
			const d = bestDist - 1;
			w.put(0, 1);
			w.put(d & ((1 << lowBits) - 1), lowBits);
			symbol(d >> lowBits, 6, 64);
			const extra = bestLen - minMatch;
			if (extra >= 63) {
				symbol(63, 6, 64);
				w.put(extra - 63, 8);
			} else {
				symbol(extra, 6, 64);
			}
			i += bestLen;
		} else {
			w.put(1, 1);
			if (literalTree) {
				symbol(data[i], 8, 256);
			} else {
				w.put(data[i], 8);
			}
			i++;
		}
	}
	return Uint8Array.from([...head, ...w.done()]);
};
