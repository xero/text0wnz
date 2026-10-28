/**
 * PKZIP 1.x shrink and implode. Round trips through the test-side
 * encoders cover every implode flag combination and every shrink
 * escape; hand-built streams pin APPNOTE's corners; damage salvages.
 */
import { describe, it, expect } from 'vitest';
import { explode, unshrink } from '../../src/js/core/codecs/pkzip1.js';
import { CodecError } from '../../src/js/core/codecs/util.js';
import {
	extractZipEntry,
	readZipEntries,
	salvageZipEntry,
} from '../../src/js/core/codecs/zip.js';
import { bitWriter, implode, shrink } from '../corpus/pkzip1Fixture.js';
import { buildZip } from '../corpus/zipFixture.js';

const rng = (seed: number): (() => number) => {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), s | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

/** scene-shaped bytes: escape codes, shade runs, and some noise */
const art = (n: number, seed: number): Uint8Array => {
	const rand = rng(seed);
	const parts = ['\u001b[1;31m', '\u001b[0m', '░▒▓█', '▄▀', 'xero ', '\r\n'];
	const out: number[] = [];
	while (out.length < n) {
		if (rand() < 0.15) {
			out.push(32 + Math.floor(rand() * 95));
		} else if (rand() < 0.1) {
			out.push(...new Array(5 + Math.floor(rand() * 120)).fill(0xdb));
		} else {
			const part = parts[Math.floor(rand() * parts.length)];
			out.push(...Array.from(part, c => c.charCodeAt(0) & 0xff));
		}
	}
	return Uint8Array.from(out.slice(0, n));
};

/** random bytes over a small alphabet: short LZW strings, many codes */
const noisy = (n: number, seed: number): Uint8Array => {
	const rand = rng(seed);
	return Uint8Array.from({ length: n }, () => 65 + Math.floor(rand() * 16));
};

describe('unshrink', () => {
	it('round trips through every code width up to 13 bits', () => {
		const data = noisy(16000, 7);
		const { bytes, width } = shrink(data);
		expect(width).toBe(13);
		const { out, damage } = unshrink(bytes, data.length);
		expect(damage).toBeNull();
		expect([...out]).toEqual([...data]);
	});

	it('refills its table after partial clears', () => {
		const data = art(20000, 3);
		const { bytes, clears } = shrink(data, { clearEvery: 300 });
		expect(clears).toBeGreaterThan(3);
		expect([...unshrink(bytes, data.length).out]).toEqual([...data]);
	});

	it('takes a lone literal and an empty entry', () => {
		expect([...unshrink(shrink(Uint8Array.of(42)).bytes, 1).out]).toEqual([42]);
		expect(unshrink(new Uint8Array(0), 0).out.length).toBe(0);
	});

	it('refuses a cut stream and salvages the front of it', () => {
		const data = art(6000, 11);
		const { bytes } = shrink(data);
		const cut = bytes.subarray(0, bytes.length >> 1);
		expect(() => unshrink(cut, data.length)).toThrow(CodecError);
		const { out, damage } = unshrink(cut, data.length, true);
		expect(damage).toMatch(/truncated/);
		expect(out.length).toBeGreaterThan(0);
		expect([...out]).toEqual([...data.subarray(0, out.length)]);
	});
});

describe('explode', () => {
	it.each([
		[0, '4KB window, raw literals'],
		[2, '8KB window, raw literals'],
		[4, '4KB window, literal tree'],
		[6, '8KB window, literal tree'],
	])('round trips flags %i (%s)', flags => {
		// far repeats reach past 4KB, long runs pass 63 + the minimum match
		const head = art(5000, flags + 1);
		const data = Uint8Array.from([...head, ...head.subarray(0, 3000)]);
		const { out, damage } = explode(implode(data, flags), data.length, flags);
		expect(damage).toBeNull();
		expect([...out]).toEqual([...data]);
	});

	it('reads bytes before the start of the output as zeros', () => {
		// uniform trees (64 symbols of 6 bits): symbol s is code 63 - s
		const w = bitWriter();
		w.put(0, 1); // match
		w.put(9, 6); // low distance bits: distance 10
		w.code(63 - 0, 6); // high distance bits 0
		w.code(63 - 2, 6); // length 2 + minimum 2
		w.put(1, 1); // literal
		w.put(65, 8);
		const head = [3, 0xf5, 0xf5, 0xf5, 0xf5, 3, 0xf5, 0xf5, 0xf5, 0xf5];
		const stream = Uint8Array.from([...head, ...w.done()]);
		expect([...explode(stream, 5, 0).out]).toEqual([0, 0, 0, 0, 65]);
	});

	it('refuses a tree that does not cover its symbols', () => {
		expect(() => explode(Uint8Array.of(0, 0x00), 10, 0)).toThrow(
			/short of symbols/,
		);
	});

	it('refuses a cut stream and salvages the front of it', () => {
		const data = art(6000, 5);
		const packed = implode(data, 4);
		const cut = packed.subarray(0, packed.length >> 1);
		expect(() => explode(cut, data.length, 4)).toThrow(CodecError);
		const { out, damage } = explode(cut, data.length, 4, true);
		expect(damage).toMatch(/truncated/);
		expect([...out]).toEqual([...data.subarray(0, out.length)]);
	});
});

describe('zip methods 1 and 6', () => {
	it('extracts shrunk and imploded entries, CRC checked', async () => {
		const piece = art(4000, 9);
		const zip = await buildZip([
			{
				name: 'SHRUNK.ANS',
				data: piece,
				method: 1,
				packed: shrink(piece).bytes,
			},
			{
				name: 'IMPLODE.ANS',
				data: piece,
				method: 6,
				flags: 6,
				packed: implode(piece, 6),
			},
		]);
		const [shrunk, imploded] = readZipEntries(zip);
		expect([...(await extractZipEntry(zip, shrunk))]).toEqual([...piece]);
		expect([...(await extractZipEntry(zip, imploded))]).toEqual([...piece]);
	});

	it('salvages a damaged imploded entry', async () => {
		const piece = art(4000, 13);
		const packed = implode(piece, 0);
		const zip = await buildZip([
			{
				name: 'TORN.ANS',
				data: piece,
				method: 6,
				packed: packed.subarray(0, packed.length >> 1),
			},
		]);
		const [entry] = readZipEntries(zip);
		await expect(extractZipEntry(zip, entry)).rejects.toThrow(CodecError);
		const { bytes, damage } = await salvageZipEntry(zip, entry);
		expect(damage).toMatch(/^TORN\.ANS is damaged: showing the first/);
		expect([...bytes]).toEqual([...piece.subarray(0, bytes.length)]);
	});
});
