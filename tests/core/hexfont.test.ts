import { describe, it, expect } from 'vitest';
import {
	BLOCK_HEADER_BYTES,
	HexFontError,
	buildBlocks,
	packBlock,
	parseHexFont,
	parseUns2Uni,
	readBlock,
	type HexGlyph,
} from '../../src/js/core/hexfont.js';

// real vectors lifted verbatim from the vendored sources
const UNSCII_A = '00041:0000183C6666667E6666666666000000';
const UNIFONT_WIDE =
	'4E2D:01000100010001003FF8210821082108210821083FF821080100010001000100';
const UNIFONT_PLANE1 = '01FB00:F0F0F0F0F00000000000000000000000';

const mulberry32 = (seed: number) => () => {
	seed |= 0;
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const randomGlyph = (codepoint: number, rand: () => number): HexGlyph => {
	const wide = rand() < 0.3;
	const bytes = new Uint8Array(wide ? 32 : 16);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Math.floor(rand() * 256);
	}
	return { codepoint, wide, bytes };
};

describe('parseHexFont', () => {
	it('parses narrow, wide, and plane-1 lines together', () => {
		const glyphs = parseHexFont(
			[UNIFONT_WIDE, UNSCII_A, UNIFONT_PLANE1].join('\n'),
		);
		expect(glyphs.map(g => g.codepoint)).toEqual([0x41, 0x4e2d, 0x1fb00]);
		expect(glyphs.map(g => g.wide)).toEqual([false, true, false]);
		expect(glyphs[0].bytes).toHaveLength(16);
		expect(glyphs[0].bytes[3]).toBe(0x3c);
		expect(glyphs[1].bytes).toHaveLength(32);
	});

	it('skips blank lines and comments, tolerates CRLF', () => {
		const glyphs = parseHexFont(`# header\r\n\r\n${UNSCII_A}\r\n`);
		expect(glyphs).toHaveLength(1);
	});

	it('keeps the LAST definition of a duplicated codepoint', () => {
		const override = '00041:FFFF183C6666667E6666666666000000';
		const glyphs = parseHexFont(`${UNSCII_A}\n${override}`);
		expect(glyphs).toHaveLength(1);
		expect(glyphs[0].bytes[0]).toBe(0xff);
	});

	it('throws on malformed lines with the line number', () => {
		expect(() => parseHexFont('not a hex line')).toThrow(HexFontError);
		expect(() => parseHexFont(`${UNSCII_A}\nZZ:00`)).toThrow(/line 2/);
		// 36 hex chars: neither 8x16 nor 16x16
		expect(() =>
			parseHexFont('0041:0000183C6666667E66666666660000001234'),
		).toThrow(/36 hex chars/);
		expect(() =>
			parseHexFont('110000:0000183C6666667E6666666666000000'),
		).toThrow(/10FFFF/);
	});
});

describe('packBlock/readBlock round trip', () => {
	it('survives seeded sparse blocks byte-for-byte', () => {
		const rand = mulberry32(0x5e0f);
		for (let run = 0; run < 50; run++) {
			const blockId = Math.floor(rand() * 0x1100);
			const count = 1 + Math.floor(rand() * 255);
			const taken = new Set<number>();
			while (taken.size < count) {
				taken.add((blockId << 8) | Math.floor(rand() * 256));
			}
			const glyphs = [...taken].map(cp => randomGlyph(cp, rand));
			const packed = packBlock(blockId, glyphs);
			const reader = readBlock(blockId, packed);
			for (const glyph of glyphs) {
				expect(reader.has(glyph.codepoint)).toBe(true);
				expect(reader.isWide(glyph.codepoint)).toBe(glyph.wide);
				expect([...(reader.glyph(glyph.codepoint) ?? [])]).toEqual([
					...glyph.bytes,
				]);
			}
			for (let i = 0; i < 256; i++) {
				const cp = (blockId << 8) | i;
				if (!taken.has(cp)) {
					expect(reader.has(cp)).toBe(false);
					expect(reader.glyph(cp)).toBeNull();
				}
			}
		}
	});

	it('is deterministic regardless of input order', () => {
		const rand = mulberry32(0xface);
		const glyphs = [0x41, 0x7f, 0x00, 0xfe].map(cp => randomGlyph(cp, rand));
		const a = packBlock(0, glyphs);
		const b = packBlock(0, [...glyphs].reverse());
		expect([...a]).toEqual([...b]);
	});

	it('rejects foreign and duplicate codepoints', () => {
		const rand = mulberry32(0xdead);
		expect(() => packBlock(1, [randomGlyph(0x41, rand)])).toThrow(
			/not in block/,
		);
		expect(() =>
			packBlock(0, [randomGlyph(0x41, rand), randomGlyph(0x41, rand)]),
		).toThrow(/duplicate/);
	});

	it('readBlock fast-fails corrupt data before use', () => {
		const rand = mulberry32(0xbad);
		const packed = packBlock(0, [randomGlyph(0x41, rand)]);
		expect(() => readBlock(0, packed.subarray(0, 8))).toThrow(/header/);
		expect(() => readBlock(0, packed.subarray(0, packed.length - 1))).toThrow(
			/bitmaps say/,
		);
		const padded = new Uint8Array(packed.length + 4);
		padded.set(packed);
		expect(() => readBlock(0, padded)).toThrow(/bitmaps say/);
		const orphanWidth = new Uint8Array(BLOCK_HEADER_BYTES);
		orphanWidth[32] = 1; // width bit for an absent glyph
		expect(() => readBlock(0, orphanWidth)).toThrow(/absent/);
	});

	it('answers false/null for codepoints outside the block', () => {
		const rand = mulberry32(0xcafe);
		const reader = readBlock(
			0x4e,
			packBlock(0x4e, [randomGlyph(0x4e2d, rand)]),
		);
		expect(reader.has(0x2d)).toBe(false);
		expect(reader.glyph(0x4f2d)).toBeNull();
		expect(reader.isWide(0x2d)).toBe(false);
	});
});

describe('buildBlocks', () => {
	it('groups glyphs by codepoint >> 8 across planes', () => {
		const glyphs = parseHexFont(
			[UNSCII_A, UNIFONT_WIDE, UNIFONT_PLANE1].join('\n'),
		);
		const blocks = buildBlocks(glyphs);
		expect([...blocks.keys()]).toEqual([0x0, 0x4e, 0x1fb]);
		expect(readBlock(0x1fb, blocks.get(0x1fb)!).has(0x1fb00)).toBe(true);
	});
});

describe('parseUns2Uni', () => {
	it('splits the single line into source/target halves', () => {
		// two mappings: E852 -> 1FBC4, E853 -> 1FBF0 (synthetic second pair)
		const table = String.fromCodePoint(0xe852, 0xe853, 0x1fbc4, 0x1fbf0);
		const map = parseUns2Uni(table);
		expect(map.get(0xe852)).toBe(0x1fbc4);
		expect(map.get(0xe853)).toBe(0x1fbf0);
	});

	it('ignores whitespace and throws on odd counts', () => {
		const table = `${String.fromCodePoint(0xe852)}\n${String.fromCodePoint(0x1fbc4)}\n`;
		expect(parseUns2Uni(table).get(0xe852)).toBe(0x1fbc4);
		expect(() => parseUns2Uni(String.fromCodePoint(0xe852))).toThrow(
			HexFontError,
		);
		expect(() => parseUns2Uni('')).toThrow(HexFontError);
	});
});
