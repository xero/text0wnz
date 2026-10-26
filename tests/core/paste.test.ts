import { describe, it, expect, vi } from 'vitest';
import {
	PASTE_NEWLINE,
	PASTE_SUBSTITUTE,
	tokenizePasteText,
} from '../../src/js/core/paste.js';

describe('tokenizePasteText', () => {
	it('maps box and shade characters to their CP437 codes', () => {
		const { tokens, unmapped } = tokenizePasteText('░▒▓┐█▀▄');
		expect(tokens).toEqual([176, 177, 178, 191, 219, 223, 220]);
		expect(unmapped.size).toBe(0);
	});

	it('pastes every unicode blank as a plain space, never NUL', () => {
		// NBSP is the landmine: its CP437 reverse mapping is 0
		const blanks = '      　 ';
		const { tokens } = tokenizePasteText(blanks);
		expect(tokens).toEqual(Array(8).fill(32));
	});

	it('drops zero-width characters without making a cell', () => {
		const { tokens } = tokenizePasteText('A​B﻿C­D⁠E');
		expect(tokens).toEqual([65, 66, 67, 68, 69]);
	});

	it('flattens tabs, controls, and DEL to spaces', () => {
		const { tokens } = tokenizePasteText('A\tB\u0007C\u007fD');
		expect(tokens).toEqual([65, 32, 66, 32, 67, 32, 68]);
	});

	it('emits one newline token per CRLF, LF, or CR', () => {
		const { tokens } = tokenizePasteText('A\r\nB\nC\rD');
		expect(tokens).toEqual([
			65,
			PASTE_NEWLINE,
			66,
			PASTE_NEWLINE,
			67,
			PASTE_NEWLINE,
			68,
		]);
	});

	it('NFC-normalizes so decomposed accents hit CP437', () => {
		// e + combining acute composes to é = CP437 130
		const { tokens, unmapped } = tokenizePasteText('é');
		expect(tokens).toEqual([130]);
		expect(unmapped.size).toBe(0);
	});

	it('flags codepoints outside CP437 as ~cp for the glyph table', () => {
		const { tokens, unmapped } = tokenizePasteText('A中𐌰');
		expect(tokens).toEqual([65, ~0x4e2d, ~0x10330]);
		expect([...unmapped]).toEqual([0x4e2d, 0x10330]);
	});

	it('substitutes multi-codepoint graphemes under v1 single-width', () => {
		const family = '👨‍👩‍👧';
		const { tokens, unmapped } = tokenizePasteText(`A${family}B`);
		expect(tokens).toEqual([65, PASTE_SUBSTITUTE, 66]);
		expect(unmapped.size).toBe(0);
	});

	it('routes latin-1 chars outside CP437 to the glyph table', () => {
		// © U+00A9 is not in CP437 (byte 0xA9 renders ⌐ there), so it
		// must NOT pass through as a raw byte
		const { tokens, unmapped } = tokenizePasteText('©');
		expect(tokens).toEqual([~0xa9]);
		expect([...unmapped]).toEqual([0xa9]);
	});

	it('breaks lines on NEL and the unicode line separators', () => {
		const LS = String.fromCharCode(0x2028);
		const PS = String.fromCharCode(0x2029);
		const { tokens, unmapped } = tokenizePasteText(`A\u0085B${LS}C${PS}D`);
		expect(tokens).toEqual([
			65,
			PASTE_NEWLINE,
			66,
			PASTE_NEWLINE,
			67,
			PASTE_NEWLINE,
			68,
		]);
		expect(unmapped.size).toBe(0);
	});

	it('flattens C1 controls to spaces instead of glyph requests', () => {
		const { tokens, unmapped } = tokenizePasteText('A\u0080B\u009cC');
		expect(tokens).toEqual([65, 32, 66, 32, 67]);
		expect(unmapped.size).toBe(0);
	});

	it('emits one newline per CRLF in the no-Segmenter fallback', async () => {
		vi.resetModules();
		const original = Intl.Segmenter;
		// @ts-expect-error force the per codepoint fallback
		delete Intl.Segmenter;
		try {
			const fresh = await import('../../src/js/core/paste.js');
			expect(fresh.tokenizePasteText('a\r\nb').tokens).toEqual([
				97,
				fresh.PASTE_NEWLINE,
				98,
			]);
		} finally {
			(Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter = original;
			vi.resetModules();
		}
	});
});
