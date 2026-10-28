/**
 * Differential check of the plain-TS deflate pair against zlib, the
 * library behind every engine's native streams. Seeded payloads go
 * through every zlib level, strategy, window, and memory setting; then
 * damaged streams must get zlib's verdict, with one twist: bytes after
 * the final block are refused, as every browser refuses them, where
 * zlib's sync API quietly ignores them.
 */
import { describe, it, expect } from 'vitest';
import * as zlib from 'node:zlib';
import {
	deflateRawSync,
	gunzipSync,
	gzipSync,
	inflateRawSync,
} from '../../src/js/core/codecs/flate.js';

const ROUNDS = 120;
const MUTATIONS = 12;

const rng = seed => {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), s | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const rand = rng(0x7e47);
const int = n => Math.floor(rand() * n);
const pick = list => list[int(list.length)];

const shapes = {
	random: n => Uint8Array.from({ length: n }, () => int(256)),
	tiny: n => {
		const k = 1 + int(4);
		return Uint8Array.from({ length: n }, () => 65 + int(k));
	},
	runs: n => {
		const out = new Uint8Array(n);
		for (let i = 0; i < n;) {
			const run = 1 + int(600);
			out.fill(int(256), i, Math.min(n, i + run));
			i += run;
		}
		return out;
	},
	periodic: n => {
		const period = 1 + int(300);
		const pattern = Uint8Array.from({ length: period }, () => int(256));
		return Uint8Array.from({ length: n }, (_, i) =>
			rand() < 0.01 ? int(256) : pattern[i % period]);
	},
	planes: n => {
		const cells = new Uint32Array(Math.ceil(n / 4));
		for (let i = 0; i < cells.length; i++) {
			cells[i] = rand() < 0.7 ? 32 : int(256);
		}
		const raw = new Uint8Array(cells.buffer).subarray(0, n);
		return new TextEncoder().encode(Buffer.from(raw).toString('base64'));
	},
};

const sizes = [0, 1, 2, 3, 258, 259, 4096, 32767, 32768, 32769, 65535, 65536, 70000];

const same = (a, b) =>
	a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

const attempt = run => {
	try {
		return run();
	} catch (error) {
		return error;
	}
};

// zlib's sync API finishes on the shortest prefix that holds the final
// block; anything after it is junk to a browser
const zlibEnd = bytes => {
	let lo = 0;
	let hi = bytes.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (attempt(() => zlib.inflateRawSync(bytes.subarray(0, mid))) instanceof Error) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}
	return lo;
};

const mutate = stream => {
	const bad = stream.slice();
	switch (int(5)) {
		case 0:
			bad[int(Math.min(bad.length, rand() < 0.6 ? 40 : bad.length))] ^= 1 << int(8);
			return bad;
		case 1:
			bad[int(bad.length)] = int(256);
			return bad;
		case 2:
			return bad.subarray(0, int(bad.length));
		case 3: {
			const at = int(Math.min(bad.length, 64));
			for (let k = 0; k < 4 && at + k < bad.length; k++) {
				bad[at + k] = int(256);
			}
			return bad;
		}
		default:
			return Uint8Array.from([...bad, ...Array.from({ length: 1 + int(6) }, () => int(256))]);
	}
};

const cases = Array.from({ length: ROUNDS }, (_, round) => {
	const shape = pick(Object.keys(shapes));
	const size = rand() < 0.7 ? pick(sizes) : int(40000);
	return {
		round,
		shape,
		data: shapes[shape](size),
		params: {
			level: int(10),
			strategy: int(5),
			windowBits: 9 + int(7),
			memLevel: 1 + int(9),
		},
	};
});

describe('flate against zlib', () => {
	it('inflates whatever zlib deflates, at every setting', () => {
		for (const { round, shape, data, params } of cases) {
			const packed = zlib.deflateRawSync(data, params);
			const ours = inflateRawSync(packed);
			expect(same(ours, data), `round ${round} ${shape} ${JSON.stringify(params)}`).toBe(true);
		}
	});

	it('deflates and gzips what zlib inflates', () => {
		for (const { round, shape, data } of cases) {
			expect(same(zlib.inflateRawSync(deflateRawSync(data)), data), `round ${round} ${shape}`).toBe(true);
			const member = gzipSync(data);
			expect(same(zlib.gunzipSync(member), data), `round ${round} ${shape}`).toBe(true);
			expect(same(gunzipSync(member), data), `round ${round} ${shape}`).toBe(true);
		}
	});

	it('gives zlib\'s verdict on damaged streams', () => {
		const verdicts = { accepted: 0, rejected: 0, junk: 0 };
		for (const { round, data, params } of cases) {
			const base = round % 2 ? zlib.deflateRawSync(data, params) : deflateRawSync(data);
			for (let m = 0; m < MUTATIONS && base.length > 0; m++) {
				const bad = mutate(base);
				const theirs = attempt(() => zlib.inflateRawSync(bad));
				const ours = attempt(() => inflateRawSync(bad, 64 * 1024 * 1024));
				const label = `round ${round} mutation ${m}`;
				if (!(theirs instanceof Error) && zlibEnd(bad) < bad.length) {
					expect(ours, label).toBeInstanceOf(Error);
					expect(ours.message, label).toMatch(/after its end/);
					verdicts.junk++;
				} else if (theirs instanceof Error) {
					expect(ours, `${label}: zlib said ${theirs.message}`).toBeInstanceOf(Error);
					verdicts.rejected++;
				} else {
					expect(ours, label).not.toBeInstanceOf(Error);
					expect(same(ours, theirs), label).toBe(true);
					verdicts.accepted++;
				}
			}
		}
		// every branch has to see traffic, or the check proves nothing
		expect(verdicts.accepted).toBeGreaterThan(100);
		expect(verdicts.rejected).toBeGreaterThan(100);
		expect(verdicts.junk).toBeGreaterThan(50);
	});
});
