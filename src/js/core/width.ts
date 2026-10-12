/**
 * Width policy v1: the cell grid is single-width only. Text arriving
 * by paste or import is split into grapheme clusters, and every
 * cluster that cannot occupy exactly one cell (wide/fullwidth East
 * Asian codepoints, multi-codepoint clusters like ZWJ emoji and
 * combining sequences, or lone combining marks) is substituted by
 * the caller. The wide-continuation attr bit (doc.ts, bit 1) stays
 * reserved until double-width ships in v1.5.
 *
 * Wideness comes from the VENDORED East Asian Width table (eawData.ts,
 * version pinned and recorded in saved docs) so a doc renders the same
 * after every browser update. The mark/pictographic checks lean on the
 * engine's own \p{...} data instead: they only pick which clusters get
 * substituted, so engine drift cannot change how a saved cell looks.
 *
 * Intl.Segmenter is Baseline 2024 (the support floor in the README),
 * but a per-codepoint fallback keeps old jsdom and exotic embedders
 * from crashing: clusters then split at combining marks, which the
 * policy substitutes anyway.
 */

import { EAW_VERSION, WIDE_RANGES } from './eawData.js';

/** recorded in every saved doc so width semantics stay reproducible */
export const WIDTH_TABLE_VERSION = EAW_VERSION;

/** true when the codepoint's East Asian Width is Wide or Fullwidth */
export const isWideCodepoint = (codepoint: number): boolean => {
	let low = 0;
	let high = WIDE_RANGES.length / 2 - 1;
	while (low <= high) {
		const mid = (low + high) >> 1;
		if (codepoint < WIDE_RANGES[mid * 2]) {
			high = mid - 1;
		} else if (codepoint > WIDE_RANGES[mid * 2 + 1]) {
			low = mid + 1;
		} else {
			return true;
		}
	}
	return false;
};

const MARK = /\p{M}/u;

export type ClusterClass =
	/** exactly one cell: single codepoint, narrow, not a lone mark */
	| 'single'
	/** East Asian Wide/Fullwidth codepoint */
	| 'wide'
	/** multi-codepoint grapheme: ZWJ sequence, combining stack, flag */
	| 'multi'
	/** a combining mark with nothing to combine with */
	| 'mark';

/** classify one grapheme cluster under the v1 single-width policy */
export const classifyCluster = (cluster: string): ClusterClass => {
	const first = cluster.codePointAt(0) ?? 0;
	if (cluster.length > String.fromCodePoint(first).length) {
		return 'multi';
	}
	if (isWideCodepoint(first)) {
		return 'wide';
	}
	if (MARK.test(cluster)) {
		return 'mark';
	}
	return 'single';
};

/** the cluster fits the grid as-is */
export const isSingleWidth = (cluster: string): boolean =>
	classifyCluster(cluster) === 'single';

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
