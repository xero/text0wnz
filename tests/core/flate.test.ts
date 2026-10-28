/**
 * The plain-TS deflate pair. Hand-built streams pin zlib's verdict on
 * the corners random data rarely reaches; round trips through the
 * runtime's native streams pin interop in both directions.
 */
import { describe, it, expect } from 'vitest';
import {
	deflateRawSync,
	gunzipSync,
	gzipSync,
	inflateRawSync,
} from '../../src/js/core/codecs/flate.js';
import {
	CodecError,
	concatBytes,
	crc32,
} from '../../src/js/core/codecs/util.js';

/** deflate bit writer: header fields LSB-first, Huffman codes MSB-first */
class Bits {
	private bits: number[] = [];

	put(value: number, count: number): this {
		for (let i = 0; i < count; i++) {
			this.bits.push((value >> i) & 1);
		}
		return this;
	}

	code(code: number, length: number): this {
		for (let i = length - 1; i >= 0; i--) {
			this.bits.push((code >> i) & 1);
		}
		return this;
	}

	bytes(...raw: number[]): this {
		while (this.bits.length % 8) {
			this.bits.push(0);
		}
		raw.forEach(byte => this.put(byte, 8));
		return this;
	}

	done(): Uint8Array {
		const out = new Uint8Array(Math.ceil(this.bits.length / 8));
		this.bits.forEach((bit, i) => {
			out[i >> 3] |= bit << (i & 7);
		});
		return out;
	}
}

/** a block header: BFINAL then BTYPE */
const block = (final: number, type: number): Bits =>
	new Bits().put(final, 1).put(type, 2);

/** fixed-code literal for ASCII (codes 0x30 + byte, 8 bits) */
const LIT = (ch: string): [number, number] => [0x30 + ch.charCodeAt(0), 8];
const EOB: [number, number] = [0, 7];

/** canonical MSB-first codes from lengths, -1 for unused symbols */
const codesOf = (lens: number[]): number[] => {
	const count = new Array(16).fill(0);
	lens.forEach(len => len && count[len]++);
	const next = new Array(16).fill(0);
	for (let len = 1, code = 0; len < 16; len++) {
		code = (code + count[len - 1]) << 1;
		next[len] = code;
	}
	return lens.map(len => (len ? next[len]++ : -1));
};

const CL_ORDER = [
	16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
];

/** a complete code length code covering 0-8 and the three repeats */
const CL_BASIC = (() => {
	const lens = new Array(19).fill(0);
	[1, 2, 3, 4, 5, 6, 7, 16].forEach(sym => (lens[sym] = 4));
	[0, 8, 17, 18].forEach(sym => (lens[sym] = 3));
	return lens;
})();

type ClSym = [number, number?];

/** dynamic header with a raw code length symbol stream, legal or not */
const dynamic = (
	nlen: number,
	ndist: number,
	clLens: number[],
	seq: ClSym[],
): Bits => {
	let ncode = 19;
	while (ncode > 4 && !clLens[CL_ORDER[ncode - 1]]) {
		ncode--;
	}
	const w = block(1, 2)
		.put(nlen - 257, 5)
		.put(ndist - 1, 5)
		.put(ncode - 4, 4);
	for (let i = 0; i < ncode; i++) {
		w.put(clLens[CL_ORDER[i]], 3);
	}
	const cl = codesOf(clLens);
	for (const [sym, extra = 0] of seq) {
		w.code(cl[sym], clLens[sym]);
		if (sym === 16) {
			w.put(extra, 2);
		} else if (sym === 17) {
			w.put(extra, 3);
		} else if (sym === 18) {
			w.put(extra, 7);
		}
	}
	return w;
};

/** lengths as a symbol stream, zero runs folded into 17/18 */
const plain = (lens: number[]): ClSym[] => {
	const seq: ClSym[] = [];
	for (let i = 0; i < lens.length; ) {
		let run = 0;
		while (lens[i + run] === 0 && run < 138 && i + run < lens.length) {
			run++;
		}
		if (run >= 11) {
			seq.push([18, run - 11]);
			i += run;
		} else if (run >= 3) {
			seq.push([17, run - 3]);
			i += run;
		} else {
			seq.push([lens[i++]]);
		}
	}
	return seq;
};

const lengths = (n: number, set: Record<number, number>): number[] => {
	const lens = new Array(n).fill(0);
	Object.entries(set).forEach(([sym, len]) => (lens[Number(sym)] = len));
	return lens;
};

// literals A and B, end-of-block, and length symbol 257: a complete code
const AB = lengths(258, { 65: 2, 66: 2, 256: 2, 257: 2 });
const AB_CODES = codesOf(AB);

const text = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

// TextEncoder hands back another realm's Uint8Array under jsdom, which
// toEqual refuses to match against ours
const utf8 = (value: string): Uint8Array =>
	new Uint8Array(new TextEncoder().encode(value));

const rejects = (bytes: Uint8Array): void => {
	expect(() => inflateRawSync(bytes)).toThrow(CodecError);
};

describe('inflateRawSync accepts what zlib accepts', () => {
	it('decodes empty fixed and stored blocks', () => {
		expect(
			inflateRawSync(
				block(1, 1)
					.code(...EOB)
					.done(),
			),
		).toEqual(new Uint8Array(0));
		expect(inflateRawSync(block(1, 0).bytes(0, 0, 0xff, 0xff).done())).toEqual(
			new Uint8Array(0),
		);
	});

	it('chains a stored block into a fixed block', () => {
		const bytes = block(0, 0)
			.bytes(2, 0, 0xfd, 0xff, 0x41, 0x42)
			.put(1, 1)
			.put(1, 2)
			.code(...LIT('C'))
			.code(...EOB)
			.done();
		expect(text(inflateRawSync(bytes))).toBe('ABC');
	});

	it('spells a run as an overlapping copy at distance 1', () => {
		const bytes = block(1, 1)
			.code(...LIT('A'))
			.code(0b11000101, 8) // length symbol 285: 258
			.code(0, 5) // distance 1
			.code(...EOB)
			.done();
		expect(text(inflateRawSync(bytes))).toBe('A'.repeat(259));
	});

	it('reads length symbol 284 with every extra bit set as 258', () => {
		const bytes = block(1, 1)
			.code(...LIT('A'))
			.code(0b11000100, 8)
			.put(31, 5)
			.code(0, 5)
			.code(...EOB)
			.done();
		expect(inflateRawSync(bytes).length).toBe(259);
	});

	it('reaches back exactly 32768 bytes, and not one byte early', () => {
		const prefix = (count: number): Bits => {
			const w = block(0, 0).bytes(
				count & 0xff,
				count >> 8,
				~count & 0xff,
				(~count >> 8) & 0xff,
			);
			for (let i = 0; i < count; i++) {
				w.put(i & 0xff, 8);
			}
			return w;
		};
		// length 258 at distance 24577 + 8191 = 32768
		const far = (w: Bits): Uint8Array =>
			w
				.put(1, 1)
				.put(1, 2)
				.code(0b11000101, 8)
				.code(29, 5)
				.put(8191, 13)
				.code(...EOB)
				.done();
		const out = inflateRawSync(far(prefix(32768)));
		expect(out.length).toBe(32768 + 258);
		expect([...out.subarray(32768, 32772)]).toEqual([0, 1, 2, 3]);
		rejects(far(prefix(32767)));
	});

	it('takes a lone 1-bit distance code (incomplete, but legal)', () => {
		const w = dynamic(258, 1, CL_BASIC, plain([...AB, 1]));
		w.code(AB_CODES[65], 2).code(AB_CODES[66], 2);
		w.code(AB_CODES[257], 2).code(0, 1).code(AB_CODES[256], 2);
		expect(text(inflateRawSync(w.done()))).toBe('ABBBB');
	});

	it('takes a block with no distance codes while it only holds literals', () => {
		const w = dynamic(258, 1, CL_BASIC, plain([...AB, 0]));
		w.code(AB_CODES[65], 2).code(AB_CODES[66], 2).code(AB_CODES[256], 2);
		expect(text(inflateRawSync(w.done()))).toBe('AB');
	});

	it('takes a lone 1-bit end-of-block code', () => {
		const eob = lengths(257, { 256: 1 });
		const w = dynamic(257, 1, CL_BASIC, plain([...eob, 0]));
		expect(inflateRawSync(w.code(0, 1).done())).toEqual(new Uint8Array(0));
	});

	it('takes the full 286 literal/length symbols', () => {
		const lens = lengths(286, { 65: 2, 66: 2, 256: 2, 285: 2 });
		const codes = codesOf(lens);
		const w = dynamic(286, 1, CL_BASIC, plain([...lens, 1]));
		w.code(codes[65], 2).code(codes[285], 2).code(0, 1).code(codes[256], 2);
		expect(text(inflateRawSync(w.done()))).toBe('A'.repeat(259));
	});
});

describe('inflateRawSync refuses what zlib refuses', () => {
	it('rejects corrupt stored lengths and the reserved block type', () => {
		rejects(block(1, 0).bytes(5, 0, 0, 0).done());
		rejects(block(1, 3).put(0, 16).done());
	});

	it('rejects the fixed codes that mean nothing', () => {
		rejects(
			block(1, 1)
				.code(0b11000110, 8)
				.code(...EOB)
				.done(),
		); // 286
		rejects(
			block(1, 1)
				.code(...LIT('A'))
				.code(0b0000001, 7)
				.code(30, 5) // distance 30
				.code(...EOB)
				.done(),
		);
	});

	it('rejects a distance that reaches before the output', () => {
		rejects(
			block(1, 1)
				.code(0b0000001, 7)
				.code(0, 5)
				.code(...EOB)
				.done(),
		);
	});

	it('rejects truncation and bytes after the final block', () => {
		rejects(
			block(1, 1)
				.code(...LIT('A'))
				.done()
				.subarray(0, 1),
		);
		rejects(new Uint8Array(0));
		const ok = block(1, 1)
			.code(...LIT('A'))
			.code(...EOB)
			.done();
		rejects(concatBytes([ok, Uint8Array.of(0)]));
	});

	it('rejects matches against missing or unassigned distance codes', () => {
		const lone = dynamic(258, 1, CL_BASIC, plain([...AB, 1]));
		lone.code(AB_CODES[65], 2).code(AB_CODES[257], 2).code(1, 1);
		rejects(lone.code(AB_CODES[256], 2).done());
		const none = dynamic(258, 1, CL_BASIC, plain([...AB, 0]));
		none.code(AB_CODES[65], 2).code(AB_CODES[257], 2).code(0, 1);
		rejects(none.code(AB_CODES[256], 2).done());
	});

	it('rejects bad literal/length codes', () => {
		const incomplete = lengths(257, { 65: 2, 256: 2 });
		rejects(
			dynamic(257, 1, CL_BASIC, plain([...incomplete, 0]))
				.code(0, 2)
				.done(),
		);
		const oversubscribed = lengths(257, { 65: 1, 66: 1, 256: 1 });
		rejects(
			dynamic(257, 1, CL_BASIC, plain([...oversubscribed, 0]))
				.code(0, 1)
				.done(),
		);
		const noEnd = lengths(257, { 65: 1, 66: 1 });
		rejects(
			dynamic(257, 1, CL_BASIC, plain([...noEnd, 0]))
				.code(0, 1)
				.done(),
		);
	});

	it('rejects bad code length codes and repeats', () => {
		rejects(
			dynamic(258, 1, CL_BASIC, [
				[16, 0],
				...plain([...AB, 1]).slice(1),
			]).done(),
		);
		rejects(dynamic(258, 1, CL_BASIC, [...plain(AB), [18, 127]]).done());
		const cl = (set: Record<number, number>): number[] => lengths(19, set);
		rejects(dynamic(258, 1, cl({ 0: 1, 2: 2 }), []).done()); // incomplete
		rejects(dynamic(258, 1, cl({ 2: 1 }), []).done()); // lone 1-bit
		rejects(dynamic(258, 1, cl({ 0: 1, 2: 1, 3: 1 }), []).done());
	});

	it('rejects more than 286 literal/length or 30 distance symbols', () => {
		const header = (nlen: number, ndist: number): Uint8Array => {
			const w = block(1, 2)
				.put(nlen - 257, 5)
				.put(ndist - 1, 5)
				.put(15, 4);
			for (let i = 0; i < 19; i++) {
				w.put(0, 3);
			}
			return w.done();
		};
		rejects(header(287, 1));
		rejects(header(257, 31));
	});
});

describe('output caps', () => {
	it('passes at the exact size and dies one byte short', async () => {
		const data = utf8('teXt0wnz '.repeat(500));
		const packed = await native(data, new CompressionStream('deflate-raw'));
		expect(inflateRawSync(packed, data.length)).toEqual(data);
		expect(() => inflateRawSync(packed, data.length - 1)).toThrow(/exceeds/);
	});

	it('stops a gzip bomb while it decodes', () => {
		const bomb = gzipSync(new Uint8Array(1024 * 1024));
		expect(() => gunzipSync(bomb, 1000)).toThrow(/exceeds/);
	});
});

describe('gzip framing', () => {
	const body = utf8('hello ansi world');
	const member = gzipSync(body);
	const patched = (at: number, xor: number): Uint8Array => {
		const out = member.slice();
		out[at] ^= xor;
		return out;
	};

	it('skips optional header fields and checks the header CRC', () => {
		const named = concatBytes([
			Uint8Array.of(0x1f, 0x8b, 8, 0x04 | 0x08 | 0x10, 0, 0, 0, 0, 0, 3),
			Uint8Array.of(3, 0, 1, 2, 3),
			utf8('piece.ans\0a comment\0'),
			member.subarray(10),
		]);
		expect(gunzipSync(named)).toEqual(body);
		const head = Uint8Array.of(0x1f, 0x8b, 8, 0x02, 0, 0, 0, 0, 0, 3);
		const hcrc = crc32(head) & 0xffff;
		const withCrc = (lo: number): Uint8Array =>
			concatBytes([head, Uint8Array.of(lo, hcrc >> 8), member.subarray(10)]);
		expect(gunzipSync(withCrc(hcrc & 0xff))).toEqual(body);
		expect(() => gunzipSync(withCrc((hcrc & 0xff) ^ 1))).toThrow(CodecError);
	});

	it('rejects foreign headers and broken trailers', () => {
		expect(() => gunzipSync(patched(3, 0x20))).toThrow(CodecError);
		expect(() => gunzipSync(patched(2, 0x0f))).toThrow(CodecError);
		expect(() => gunzipSync(patched(member.length - 8, 1))).toThrow(/CRC-32/);
		expect(() => gunzipSync(patched(member.length - 4, 1))).toThrow(/length/);
		expect(() => gunzipSync(member.subarray(0, member.length - 3))).toThrow(
			CodecError,
		);
	});

	it('refuses junk and a second member the way every engine does', () => {
		expect(() => gunzipSync(concatBytes([member, Uint8Array.of(0)]))).toThrow(
			/after its end/,
		);
		expect(() => gunzipSync(concatBytes([member, member]))).toThrow(
			/after its end/,
		);
	});

	it('treats a forged ISIZE as a hint, not an allocation', () => {
		const forged = member.slice();
		forged.set([0xff, 0xff, 0xff, 0xff], forged.length - 4);
		expect(() => gunzipSync(forged)).toThrow(/length/);
	});
});

// seeded so a failure names the payload that broke it
const rng = (seed: number): (() => number) => {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), s | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const payloads = (): Array<[string, Uint8Array]> => {
	const rand = rng(0x0dd5eed);
	const bytes = (n: number, f: (i: number) => number): Uint8Array =>
		Uint8Array.from({ length: n }, (_, i) => f(i));
	const pattern = bytes(37, () => Math.floor(rand() * 256));
	const noise = bytes(33000, () => Math.floor(rand() * 256));
	return [
		['empty', new Uint8Array(0)],
		['one byte', Uint8Array.of(7)],
		['random', bytes(70000, () => Math.floor(rand() * 256))],
		['runs', bytes(100000, i => (i >> 9) & 0xff)],
		['periodic', bytes(90000, i => (rand() < 0.01 ? 0 : pattern[i % 37]))],
		['text', utf8('\u001b[1;31mxero ░▒▓█ '.repeat(4000))],
		// repeats 32760 back, near the edge of the window
		['far matches', concatBytes([noise, noise.subarray(240)])],
	];
};

/** pump bytes through a native CompressionStream or DecompressionStream */
const native = async (
	bytes: Uint8Array,
	stream: {
		readable: ReadableStream<Uint8Array>;
		writable: WritableStream<BufferSource>;
	},
): Promise<Uint8Array> => {
	const writer = stream.writable.getWriter();
	void writer
		.write(new Uint8Array(bytes))
		.then(() => writer.close())
		.catch(() => undefined);
	const chunks: Uint8Array[] = [];
	const reader = stream.readable.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			return concatBytes(chunks);
		}
		chunks.push(value);
	}
};

describe('deflateRawSync and gzipSync', () => {
	it.each(payloads())(
		'round trips %s through native and our inflaters',
		async (_, data) => {
			const packed = deflateRawSync(data);
			expect(inflateRawSync(packed)).toEqual(data);
			expect(
				await native(packed, new DecompressionStream('deflate-raw')),
			).toEqual(data);
			const member = gzipSync(data);
			expect(await native(member, new DecompressionStream('gzip'))).toEqual(
				data,
			);
			expect(gunzipSync(member)).toEqual(data);
			const theirs = await native(data, new CompressionStream('gzip'));
			expect(gunzipSync(theirs)).toEqual(data);
		},
	);

	it('falls back to stored blocks when input refuses to shrink', () => {
		const [, random] = payloads()[2];
		const packed = deflateRawSync(random);
		expect(packed.length).toBeLessThanOrEqual(random.length + 2 * 5);
		expect(inflateRawSync(packed)).toEqual(random);
	});

	it('saves the same doc to the same bytes', () => {
		const data = utf8('{"format":"t0wnz-doc"}'.repeat(300));
		expect(gzipSync(data)).toEqual(gzipSync(data));
	});
});
