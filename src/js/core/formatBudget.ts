/**
 * Format-budget linter (PLAN §3.2): before a doc leaves through a
 * lossy format, say exactly what that format cannot hold. The export
 * UI shows the counts and lets the artist decide; nothing here blocks
 * anything. utf8 and the native .0wnz envelope hold everything, so
 * they never report issues; plain .txt drops color by definition, so
 * color never counts against it.
 */

import { ATTR_BLINK, DocV3, glyphIdOf, isPaletteColor } from './doc.js';
import { cp437ToUnicode } from './cp437.js';
import { paletteIndexOf } from './doc.js';

export type ExportFormat =
	| 'ans'
	| 'bin'
	| 'xbin'
	| 'tnd'
	| 'utf8'
	| 'txt'
	| 'ownz';

export interface BudgetIssue {
	kind: /** glyph outside CP437: becomes '?' in this format */
		| 'unicode-glyph'
		/** palette index above 15 or frozen RGB: quantizes to 16 colors */
		| 'color-beyond-16'
		/** tundra blanks chars 1-6 (PabloDraw lineage) */
		| 'tnd-control-glyph'
		/** tundra has no blink; these cells refuse to encode */
		| 'tnd-blink';
	count: number;
	/** first offending cell, for a future jump-to-cell affordance */
	firstIndex: number;
}

export interface BudgetReport {
	format: ExportFormat;
	ok: boolean;
	issues: BudgetIssue[];
}

const LOSSLESS: ReadonlySet<ExportFormat> = new Set(['utf8', 'ownz']);

export const lintDocForFormat = (
	doc: DocV3,
	format: ExportFormat,
): BudgetReport => {
	if (LOSSLESS.has(format)) {
		return { format, ok: true, issues: [] };
	}
	const frame = doc.frames[0];
	const table = doc.glyphTable;
	const checkColors = format !== 'txt' && format !== 'tnd';
	const counts = new Map<BudgetIssue['kind'], BudgetIssue>();
	const hit = (kind: BudgetIssue['kind'], index: number) => {
		const existing = counts.get(kind);
		if (existing) {
			existing.count += 1;
		} else {
			counts.set(kind, { kind, count: 1, firstIndex: index });
		}
	};
	for (let i = 0; i < frame.glyph.length; i++) {
		const glyphId = glyphIdOf(frame.glyph[i]);
		const def = table.get(glyphId);
		const classic =
			glyphId <= 0xff &&
			def !== undefined &&
			def.fontSlot === 0 &&
			def.codepoint === cp437ToUnicode(glyphId);
		if (!classic) {
			hit('unicode-glyph', i);
		} else if (format === 'tnd' && glyphId >= 1 && glyphId <= 6) {
			hit('tnd-control-glyph', i);
		}
		if (format === 'tnd' && (frame.glyph[i] & (ATTR_BLINK << 16)) !== 0) {
			hit('tnd-blink', i);
		}
		if (checkColors) {
			if (!isPaletteColor(frame.fg[i]) || paletteIndexOf(frame.fg[i]) > 15) {
				hit('color-beyond-16', i);
			} else if (
				!isPaletteColor(frame.bg[i]) ||
				paletteIndexOf(frame.bg[i]) > 15
			) {
				hit('color-beyond-16', i);
			}
		}
	}
	const issues = [...counts.values()];
	return { format, ok: issues.length === 0, issues };
};

/** short human line per issue kind, for the export confirm modal */
export const describeIssue = (issue: BudgetIssue): string => {
	switch (issue.kind) {
		case 'unicode-glyph':
			return `${issue.count} unicode cell${issue.count === 1 ? '' : 's'} become '?'`;
		case 'color-beyond-16':
			return `${issue.count} cell${issue.count === 1 ? '' : 's'} quantize to 16 colors`;
		case 'tnd-control-glyph':
			return `${issue.count} control-character cell${issue.count === 1 ? '' : 's'} (☺☻♥♦♣♠) become blank`;
		case 'tnd-blink':
			return `${issue.count} blinking cell${issue.count === 1 ? '' : 's'}: TundraDraw has no blink`;
	}
};
