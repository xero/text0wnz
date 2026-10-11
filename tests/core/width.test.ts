import { describe, it, expect } from 'vitest';
import { EAW_VERSION, WIDE_RANGES } from '../../src/js/core/eawData.js';
import {
	WIDTH_TABLE_VERSION,
	classifyCluster,
	isSingleWidth,
	isWideCodepoint,
	segmentGraphemes,
} from '../../src/js/core/width.js';

const mulberry32 = (seed: number) => () => {
	seed |= 0;
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('eawData', () => {
	it('is the pinned Unicode version with sane, sorted ranges', () => {
		expect(EAW_VERSION).toBe('18.0.0');
		expect(WIDTH_TABLE_VERSION).toBe(EAW_VERSION);
		expect(WIDE_RANGES.length % 2).toBe(0);
		for (let i = 0; i < WIDE_RANGES.length; i += 2) {
			expect(WIDE_RANGES[i]).toBeLessThanOrEqual(WIDE_RANGES[i + 1]);
			if (i > 0) {
				// strictly increasing with gaps (adjacent ranges were merged)
				expect(WIDE_RANGES[i]).toBeGreaterThan(WIDE_RANGES[i - 1] + 1);
			}
		}
	});
});

describe('isWideCodepoint', () => {
	it('matches pinned W/F and narrow samples', () => {
		expect(isWideCodepoint(0x41)).toBe(false); // A
		expect(isWideCodepoint(0x2592)).toBe(false); // ▒ shade (ambiguous)
		expect(isWideCodepoint(0x1fb00)).toBe(false); // legacy sextant
		expect(isWideCodepoint(0x4e2d)).toBe(true); // 中
		expect(isWideCodepoint(0x3000)).toBe(true); // ideographic space (F)
		expect(isWideCodepoint(0xff21)).toBe(true); // Ａ fullwidth
		expect(isWideCodepoint(0x1f44d)).toBe(true); // 👍
		expect(isWideCodepoint(0x10ffff)).toBe(false);
	});

	it('binary search agrees with a linear scan on seeded probes', () => {
		const rand = mulberry32(0xea);
		const linear = (cp: number) => {
			for (let i = 0; i < WIDE_RANGES.length; i += 2) {
				if (cp >= WIDE_RANGES[i] && cp <= WIDE_RANGES[i + 1]) {
					return true;
				}
			}
			return false;
		};
		for (let i = 0; i < 2000; i++) {
			const cp = Math.floor(rand() * 0x110000);
			expect(isWideCodepoint(cp)).toBe(linear(cp));
		}
		// every range boundary and its neighbors
		for (let i = 0; i < WIDE_RANGES.length; i++) {
			for (const cp of [
				WIDE_RANGES[i] - 1,
				WIDE_RANGES[i],
				WIDE_RANGES[i] + 1,
			]) {
				expect(isWideCodepoint(cp)).toBe(linear(cp));
			}
		}
	});
});

describe('classifyCluster', () => {
	it('applies the v1 single-width policy', () => {
		expect(classifyCluster('A')).toBe('single');
		expect(classifyCluster('░')).toBe('single');
		expect(classifyCluster('é')).toBe('single'); // NFC, one codepoint
		expect(classifyCluster('𐌰')).toBe('single'); // plane 1, narrow
		expect(classifyCluster('中')).toBe('wide');
		expect(classifyCluster('👍')).toBe('wide');
		expect(classifyCluster('é')).toBe('multi'); // combining acute
		expect(classifyCluster('👨‍👩‍👧')).toBe('multi'); // ZWJ family
		expect(classifyCluster('́')).toBe('mark'); // lone combining
		expect(isSingleWidth('A')).toBe(true);
		expect(isSingleWidth('中')).toBe(false);
	});
});

describe('segmentGraphemes', () => {
	it('keeps ZWJ sequences and combining stacks together', () => {
		const clusters = segmentGraphemes('Aé中👨‍👩‍👧!');
		expect(clusters).toEqual(['A', 'é', '中', '👨‍👩‍👧', '!']);
	});

	it('round-trips: joining clusters restores the input', () => {
		const text = 'héllo ▒▓ 中文 👍🏽 x';
		expect(segmentGraphemes(text).join('')).toBe(text);
	});
});
