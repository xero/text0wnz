/**
 * Width policy v1: the cell grid is single-width only. Text arriving
 * by paste or import is split into grapheme clusters, and wideness
 * is decided by the hex font's own byte width (hexFontPages): a
 * glyph wider than one cell substitutes. The wide-continuation attr
 * bit (doc.ts, bit 1) stays reserved until double-width ships.
 *
 * Intl.Segmenter reached Firefox only in 125, above the README's 93+
 * floor, so a per-codepoint fallback keeps Firefox 93-124, old jsdom,
 * and exotic embedders from crashing: clusters then split at combining
 * marks, which the policy substitutes anyway.
 */

type SegmenterLike = {
	segment(text: string): Iterable<{ segment: string }>;
};

const segmenter: SegmenterLike | null =
	typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
		: null;

export const segmentGraphemes = (text: string): string[] => {
	if (segmenter) {
		const out: string[] = [];
		for (const { segment } of segmenter.segment(text)) {
			out.push(segment);
		}
		return out;
	}
	// CRLF must stay one cluster (GB3) or paste doubles its newlines;
	// the u flag keeps surrogate pairs whole
	return text.match(/\r\n|./gsu) ?? [];
};
