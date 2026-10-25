/**
 * Width policy v1: the cell grid is single-width only. Text arriving
 * by paste or import is split into grapheme clusters, and wideness
 * is decided by the hex font's own byte width (hexFontPages): a
 * glyph wider than one cell substitutes. The wide-continuation attr
 * bit (doc.ts, bit 1) stays reserved until double-width ships.
 *
 * Intl.Segmenter is Baseline 2024 (the support floor in the README),
 * but a per-codepoint fallback keeps old jsdom and exotic embedders
 * from crashing: clusters then split at combining marks, which the
 * policy substitutes anyway.
 */

type SegmenterLike = {
	segment(text: string): Iterable<{ segment: string }>;
};

const segmenter: SegmenterLike | null =
	typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
		: null;

/** split text into grapheme clusters (per-codepoint without Segmenter) */
export const segmentGraphemes = (text: string): string[] => {
	if (segmenter) {
		const out: string[] = [];
		for (const { segment } of segmenter.segment(text)) {
			out.push(segment);
		}
		return out;
	}
	return [...text];
};
