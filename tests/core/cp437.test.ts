import { describe, it, expect } from 'vitest';
import { cp437ToUnicode, unicodeToCp437 } from '../../src/js/core/cp437.js';
import { getUnicode } from '../../src/js/client/palette.js';

describe('core cp437 mapping', () => {
	it('matches the client table for every byte until the client migrates', () => {
		for (let byte = 0; byte < 256; byte++) {
			expect(cp437ToUnicode(byte)).toBe(getUnicode(byte));
		}
	});

	it('round-trips every byte through unicode except the NBSP collision', () => {
		// Bytes 0 (NUL) and 255 both map to NBSP 0x00a0 (both are blank
		// cells); the reverse map gives 255, matching v2's last-wins
		// getUnicodeReverseMap. An NBSP must NEVER reverse to NUL: that
		// made cells that looked blank but held char 0 (the owner's
		// hidden-glyph bug). Doc round-trips are unaffected: u16<->v3
		// goes through glyphId identity, never through unicode.
		for (let byte = 0; byte < 256; byte++) {
			expect(unicodeToCp437(cp437ToUnicode(byte))).toBe(
				byte === 0 ? 255 : byte,
			);
		}
		expect(cp437ToUnicode(0)).toBe(0x00a0);
		expect(cp437ToUnicode(255)).toBe(0x00a0);
	});

	it('identity holds for printable ASCII', () => {
		for (let byte = 0x20; byte < 0x7f; byte++) {
			expect(cp437ToUnicode(byte)).toBe(byte);
		}
	});

	it('rejects codepoints outside CP437', () => {
		expect(unicodeToCp437(0x3042)).toBeUndefined(); // あ
		// ä is CP437 132; the raw byte value 0xe4 maps to Σ, so 0xe4 as a
		// CODEPOINT must resolve to 132, never identity
		expect(unicodeToCp437(0x00e4)).toBe(132);
	});
});
