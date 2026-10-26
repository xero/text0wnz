/**
 * Format-budget linter: before a doc leaves through a lossy format,
 * say exactly what that format cannot hold. The export
 * UI shows the counts and lets the artist decide; nothing here blocks
 * anything. Only the native .0wnz envelope holds everything: utf8
 * still substitutes lookalikes for the four control positions its
 * writer cannot emit, and plain .txt drops color by definition (but
 * keeps real unicode codepoints), so neither counts those. utf8's one
 * other loss, blink over an extended background under its default ice
 * presentation, is flagged as utf8-ext-blink.
 */

import {
	ATTR_BLINK,
	DocV3,
	FONT_SLOT_XB,
	glyphIdOf,
	isPaletteColor,
} from './doc.js';
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
		/** CP437 10/13/26/27 break terminals; writers voice lookalikes */
		| 'control-lookalike'
		/** tundra blanks chars 0-6 (PabloDraw lineage; 0 loses its bg) */
		| 'tnd-control-glyph'
		/** tundra has no blink (ice always on); the attr drops */
		| 'tnd-blink'
		/** blink attrs inside an ice doc fold away in 16c exports */
		| 'ice-blink'
		/** steady bright bg without ice folds to dim (blink owns the nibble) */
		| 'bright-bg-folds'
		/** utf8's ice presentation cannot brighten an extended bg; blink drops */
		| 'utf8-ext-blink';
	count: number;
	/** first offending cell, for a future jump-to-cell affordance */
	firstIndex: number;
}

export interface BudgetReport {
	format: ExportFormat;
	ok: boolean;
	issues: BudgetIssue[];
}

/** CP437 positions the character writers swap for lookalikes (LF, CR,
 * SUB, ESC break terminal output; ans.ts maps them to 9/14/16/17) */
const LOOKALIKE_SUBSTITUTED = new Set([10, 13, 26, 27]);
const LOOKALIKE_FORMATS: ReadonlySet<ExportFormat> = new Set([
	'utf8',
	'ans',
	'txt',
]);

export const lintDocForFormat = (
	doc: DocV3,
	format: ExportFormat,
): BudgetReport => {
	const table = doc.glyphTable;
	// utf8 holds everything EXCEPT the four control positions its writer
	// substitutes and blink over extended backgrounds (flagged below);
	// ownz alone is fully lossless
	const lossless = format === 'ownz' || format === 'utf8';
	// the plain-text writer emits real codepoints, so unicode cells are
	// NOT lost there (flagging them was a false positive on every export)
	const checkUnicode = !lossless && format !== 'txt';
	const checkColors = !lossless && format !== 'txt' && format !== 'tnd';
	const counts = new Map<BudgetIssue['kind'], BudgetIssue>();
	const hit = (kind: BudgetIssue['kind'], index: number) => {
		const existing = counts.get(kind);
		if (existing) {
			existing.count += 1;
		} else {
			counts.set(kind, { kind, count: 1, firstIndex: index });
		}
	};
	// every frame: ansimation and movie exports degrade later frames
	// exactly like frame 0, and only frames[0] used to be read
	for (const frame of format === 'ownz' ? [] : doc.frames) {
		for (let i = 0; i < frame.glyph.length; i++) {
			const glyphId = glyphIdOf(frame.glyph[i]);
			const def = table.get(glyphId);
			const classic =
				glyphId <= 0xff &&
				def !== undefined &&
				def.fontSlot === 0 &&
				def.codepoint === cp437ToUnicode(glyphId);
			// the xbin writer reverses FONT_SLOT_XB defs into char plus
			// intensity bit when the embedded 512 font rides the save, so
			// upper-page cells survive an xbin export instead of becoming '?'
			const xbHeld =
				format === 'xbin' && def !== undefined && def.fontSlot === FONT_SLOT_XB;
			if (!classic) {
				if (checkUnicode && !xbHeld) {
					hit('unicode-glyph', i);
				}
			} else if (
				LOOKALIKE_FORMATS.has(format) &&
				LOOKALIKE_SUBSTITUTED.has(glyphId)
			) {
				hit('control-lookalike', i);
			} else if (format === 'tnd' && glyphId <= 6) {
				// 1-6 always blank; glyph 0 only matters when it carries a
				// visible background to lose, or every fresh doc lints dirty
				if (
					glyphId !== 0 ||
					!isPaletteColor(frame.bg[i]) ||
					paletteIndexOf(frame.bg[i]) !== 0
				) {
					hit('tnd-control-glyph', i);
				}
			}
			const blinkAttr = (frame.glyph[i] & (ATTR_BLINK << 16)) !== 0;
			// encodeUtf8's default ice presentation cannot brighten an
			// extended background, so the attr silently drops there; the one
			// exception to utf8 losslessness besides the control lookalikes
			if (
				format === 'utf8' &&
				blinkAttr &&
				(!isPaletteColor(frame.bg[i]) || paletteIndexOf(frame.bg[i]) > 15)
			) {
				hit('utf8-ext-blink', i);
			}
			if (lossless) {
				continue;
			}
			if (format === 'tnd' && blinkAttr) {
				hit('tnd-blink', i);
			}
			// a blink attr in an ICE doc cannot survive the u16 projection
			// (the fold only exists for non-ice docs): ans/bin/xbin drop it
			if (blinkAttr && doc.getIceColors() && format !== 'tnd') {
				hit('ice-blink', i);
			}
			if (checkColors) {
				if (!isPaletteColor(frame.fg[i]) || paletteIndexOf(frame.fg[i]) > 15) {
					hit('color-beyond-16', i);
				} else if (
					!isPaletteColor(frame.bg[i]) ||
					paletteIndexOf(frame.bg[i]) > 15
				) {
					hit('color-beyond-16', i);
				} else if (
					!doc.getIceColors() &&
					!blinkAttr &&
					paletteIndexOf(frame.bg[i]) > 7
				) {
					// without ice the bright bg nibble MEANS blink, so the u16
					// projection folds a steady bright bg to its dim neighbor;
					// the artist can turn on ice colors instead of losing it
					hit('bright-bg-folds', i);
				}
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
		case 'control-lookalike':
			return `${issue.count} control cell${issue.count === 1 ? '' : 's'} (LF/CR/SUB/ESC) become lookalike glyphs`;
		case 'tnd-control-glyph':
			return `${issue.count} control-character cell${issue.count === 1 ? '' : 's'} (☺☻♥♦♣♠ and their backgrounds) become blank`;
		case 'tnd-blink':
			return `${issue.count} blinking cell${issue.count === 1 ? '' : 's'} stop blinking: TundraDraw has no blink`;
		case 'ice-blink':
			return `${issue.count} blinking cell${issue.count === 1 ? '' : 's'} fold away (ice is on)`;
		case 'bright-bg-folds':
			return `${issue.count} bright background${issue.count === 1 ? '' : 's'} dim without ice colors`;
		case 'utf8-ext-blink':
			return `${issue.count} blinking cell${issue.count === 1 ? '' : 's'} stop blinking: utf8 ice mode cannot brighten extended backgrounds`;
	}
};
