import { describe, it, expect } from 'vitest';
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
