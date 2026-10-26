import { describe, it, expect, vi } from 'vitest';
import { segmentGraphemes } from '../../src/js/core/width';

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

describe('segmentGraphemes fallback', () => {
	// the module captures Segmenter at load, so the fallback needs a
	// fresh import with the global gone
	const loadWithoutSegmenter = async () => {
		vi.resetModules();
		const original = Intl.Segmenter;
		// @ts-expect-error force the per codepoint fallback
		delete Intl.Segmenter;
		try {
			return await import('../../src/js/core/width');
		} finally {
			(Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter = original;
		}
	};

	it('keeps CRLF one cluster without Intl.Segmenter', async () => {
		const { segmentGraphemes: fallback } = await loadWithoutSegmenter();
		expect(fallback('a\r\nb')).toEqual(['a', '\r\n', 'b']);
		expect(fallback('x\rY\n')).toEqual(['x', '\r', 'Y', '\n']);
	});

	it('keeps surrogate pairs whole in the fallback', async () => {
		const { segmentGraphemes: fallback } = await loadWithoutSegmenter();
		expect(fallback('𐌰\r\n')).toEqual(['𐌰', '\r\n']);
	});
});
