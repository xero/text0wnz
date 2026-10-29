/**
 * System-clipboard paste tokenizer. Clipboard text is unicode, never
 * raw CP437 bytes, so every grapheme cluster routes through the CP437
 * reverse map or gets flagged for the doc glyph table; nothing writes
 * raw UTF-16 code units as glyph ids.
 *
 * Blank rules: NBSP reverse maps to CP437 0 (the NUL/NBSP duality in
 * cp437.ts), which would turn pasted terminal output into cells that
 * LOOK blank but hold char 0. So every unicode blank becomes a plain
 * space (32), zero-width characters make no cell at all, and controls
 * flatten to space: what looks blank in the clipboard IS a space in
 * the doc.
 *
 * Token stream semantics (pinned by tests):
 *   PASTE_NEWLINE (-1)  line break (CRLF, LF, CR, NEL, LS, PS: one each)
 *   0..255              CP437 charCode, ready to draw
 *   other negatives     ~codepoint - outside CP437, resolve through
 *                       the glyph table (or substitute on failure)
 * Multi-codepoint clusters and resolution failures substitute
 * PASTE_SUBSTITUTE ('?') under the v1 single-width policy.
 */

import { unicodeToCp437 } from './cp437.js';
import { segmentGraphemes } from './width.js';

export const PASTE_NEWLINE = -1;
export const PASTE_SUBSTITUTE = 63; // '?'

/** zero-width codepoints: never a cell */
const INVISIBLES = new Set([
	0x00ad, // soft hyphen
	0x200b, // zero width space
	0x200c, // zero width non-joiner
	0x200d, // zero width joiner (lone; ZWJ sequences stay one cluster)
	0x2060, // word joiner
	0xfeff, // BOM / zero width no-break space
]);

/** every unicode blank pastes as a plain space (32), never NUL */
const BLANKS = new Set([
	0x00a0, // no-break space (the NUL-duality landmine)
	0x1680, // ogham space mark
	0x2000,
	0x2001,
	0x2002,
	0x2003,
	0x2004,
	0x2005,
	0x2006,
	0x2007,
	0x2008,
	0x2009,
	0x200a, // en/em/three-per-em/.../hair spaces
	0x202f, // narrow no-break space
	0x205f, // medium mathematical space
	0x3000, // ideographic space (wide, but a blank is a blank)
]);

const NEWLINES = new Set(['\r\n', '\n', '\r', '\u0085', '\u2028', '\u2029']);

export interface PasteTokens {
	tokens: number[];
	/** codepoints flagged ~cp in tokens, for glyph-table resolution */
	unmapped: Set<number>;
}

export const tokenizePasteText = (text: string): PasteTokens => {
	const tokens: number[] = [];
	const unmapped = new Set<number>();
	for (const cluster of segmentGraphemes(text.normalize('NFC'))) {
		if (NEWLINES.has(cluster)) {
			tokens.push(PASTE_NEWLINE);
			continue;
		}
		const codepoint = cluster.codePointAt(0) ?? 0;
		if (cluster.length > String.fromCodePoint(codepoint).length) {
			// multi-codepoint grapheme (ZWJ emoji, combining stack):
			// one substitute cell under v1 single-width
			tokens.push(PASTE_SUBSTITUTE);
			continue;
		}
		if (INVISIBLES.has(codepoint)) {
			continue;
		}
		if (
			codepoint === 9 ||
			codepoint < 32 ||
			codepoint === 127 ||
			// C1 controls have no glyph and flatten like C0 (NEL already
			// broke the line above)
			(codepoint >= 0x80 && codepoint <= 0x9f) ||
			BLANKS.has(codepoint)
		) {
			tokens.push(32);
			continue;
		}
		const mapped = unicodeToCp437(codepoint);
		if (mapped !== undefined) {
			tokens.push(mapped);
			continue;
		}
		tokens.push(~codepoint);
		unmapped.add(codepoint);
	}
	return { tokens, unmapped };
};
