/**
 * ANSI and SAUCE spec compliance, 2026-10 audit: the places our
 * reader and writer diverged from PabloDraw, moebiusXBIN, and the
 * written specs. Each case names the reference behavior it pins.
 */
import { describe, it, expect } from 'vitest';
import { decodeAns, encodeAns } from '../../src/js/core/codecs/ans.js';
import { buildSauce, parseSauce } from '../../src/js/core/codecs/sauce.js';
import {
	createDocV3,
	glyphWord,
	isPaletteColor,
	paletteColor,
	rgbColor,
} from '../../src/js/core/doc.js';

const bytes = (text: string): Uint8Array =>
	Uint8Array.from([...text].map(c => c.charCodeAt(0)));

const cellAt = (doc: ReturnType<typeof createDocV3>, x: number, y: number) =>
	doc.getCell(0, x, y);

describe('SGR empty parameters', () => {
	it('ESC[m resets attributes like every reference', () => {
		// bold white A, then ESC[m, then B: v2 read the empty param as 1
		// (bold on) so B stayed bright; ANSI.SYS, PabloDraw, and
		// moebiusXBIN all reset to plain gray
		const { doc } = decodeAns(bytes('\x1b[1;37mA\x1b[mB'));
		const a = cellAt(doc, 0, 0);
		const b = cellAt(doc, 1, 0);
		expect(a.fg).toBe(paletteColor(15));
		expect(b.fg).toBe(paletteColor(7));
	});

	it('cursor moves still default to one', () => {
		const { doc } = decodeAns(bytes('A\x1b[B\x1b[DB'));
		expect(cellAt(doc, 0, 1).glyph & 0xffff).toBe(66);
	});
});

describe('HVP', () => {
	it('ESC[row;colf positions like CUP', () => {
		const { doc } = decodeAns(bytes('\x1b[2;5fX'));
		expect(cellAt(doc, 4, 1).glyph & 0xffff).toBe(88);
	});
});

describe('cursor clamp', () => {
	it('ESC[26;1H cannot escape the 25-row scroll window', () => {
		// paint at the clamped bottom, then one CUU must land on row 24
		// (the cursor sits one column right of the X it just painted)
		const { doc } = decodeAns(bytes('\x1b[26;1HX\x1b[1AY'));
		expect(cellAt(doc, 0, 24).glyph & 0xffff).toBe(88);
		expect(cellAt(doc, 1, 23).glyph & 0xffff).toBe(89);
	});
});

describe('private modes', () => {
	it('ESC[?33h turns ice colors on for a SAUCE-less ANSI', () => {
		const { doc } = decodeAns(bytes('\x1b[?33h\x1b[5;41mA'));
		expect(doc.getIceColors()).toBe(true);
	});

	it('ESC[?7l pins the cursor at the right edge', () => {
		const { doc } = decodeAns(bytes('\x1b[?7l\x1b[1;79HABCD'));
		// with wrap off C and D overwrite the last column of row 1 and
		// nothing ever reaches a second row
		expect(cellAt(doc, 79, 0).glyph & 0xffff).toBe(68);
		expect(doc.getRows()).toBe(1);
	});
});

describe('PabloDraw 24-bit t sequences', () => {
	it('reads fg and bg RGB onto the planes', () => {
		const { doc } = decodeAns(bytes('\x1b[1;255;64;32t\x1b[0;8;16;24tA'));
		const cell = cellAt(doc, 0, 0);
		expect(cell.fg).toBe(rgbColor(255, 64, 32));
		expect(cell.bg).toBe(rgbColor(8, 16, 24));
	});

	it('SGR base colors clear the RGB channel', () => {
		const { doc } = decodeAns(bytes('\x1b[1;255;64;32tA\x1b[31mB'));
		expect(cellAt(doc, 1, 0).fg).toBe(paletteColor(4)); // ansi 31 = red
	});

	it('writes RGB plane words as t sequences and round-trips', () => {
		const doc = createDocV3({ columns: 4, rows: 1, mode: 'free' });
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(219, 0),
			fg: rgbColor(250, 90, 90),
			bg: paletteColor(0),
		});
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(65, 0),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		const encoded = encodeAns(doc, { lossy: true });
		const text = String.fromCharCode(...encoded);
		expect(text).toContain('\x1b[1;250;90;90t');
		const back = decodeAns(encoded);
		expect(cellAt(back.doc, 0, 0).fg).toBe(rgbColor(250, 90, 90));
		// the following classic cell got an explicit SGR, not stale RGB
		expect(isPaletteColor(cellAt(back.doc, 1, 0).fg)).toBe(true);
	});
});

describe('UTF-8 control-byte lookalikes', () => {
	it('glyphs living on cp437 control bytes stay cells', () => {
		// U+25D9 is cp437 0x0A: the old reverse-mapped dispatch turned it
		// into a line feed, corrupting moebiusXBIN's own UTF-8 exports
		const encoder = new TextEncoder();
		const { doc } = decodeAns(encoder.encode('◙♪→'), {
			utf8: true,
		});
		expect(
			doc.glyphTable.get(cellAt(doc, 0, 0).glyph & 0xffff)?.codepoint,
		).toBe(0x25d9);
		expect(
			doc.glyphTable.get(cellAt(doc, 1, 0).glyph & 0xffff)?.codepoint,
		).toBe(0x266a);
		expect(
			doc.glyphTable.get(cellAt(doc, 2, 0).glyph & 0xffff)?.codepoint,
		).toBe(0x2192);
	});
});

describe('SAUCE writer compliance', () => {
	const base = {
		dataType: 1,
		fileType: 1,
		fileSize: 10,
		columns: 80,
		rows: 25,
	};

	it('writes text fields as CP437 bytes', () => {
		const record = buildSauce({ ...base, title: 'café' });
		// cp437 0x82 is e-acute; the old UTF-8 encoding wrote C3 A9
		expect(record[7 + 3]).toBe(0x82);
	});

	it('chunks comments in bytes and caps the count at 255', () => {
		const record = buildSauce({
			...base,
			comments: Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n'),
		});
		const count = record[record.length - 128 + 104];
		expect(count).toBe(255);
		expect(record.length).toBe(5 + 255 * 64 + 128);
	});

	it('round-trips aspect bits and LS no-preference verbatim', () => {
		const record = buildSauce({
			...base,
			aspect: 1,
			letterSpacingMode: 0,
			iceColors: true,
		});
		const parsed = parseSauce(record);
		expect(parsed).not.toBeNull();
		expect((parsed!.flags >> 3) & 0x03).toBe(1);
		expect((parsed!.flags >> 1) & 0x03).toBe(0);
		expect(parsed!.iceColors).toBe(true);
	});

	it('new docs write aspect 0 like moebiusXBIN, not the forced 10', () => {
		const parsed = parseSauce(buildSauce(base));
		expect((parsed!.flags >> 3) & 0x03).toBe(0);
	});

	it('fileSize-0 fallback subtracts the COMNT block and EOF', () => {
		const sauce = buildSauce({ ...base, fileSize: 0, comments: 'hi' });
		const payload = bytes('ART');
		const whole = new Uint8Array(payload.length + 1 + sauce.length);
		whole.set(payload, 0);
		whole[payload.length] = 0x1a;
		whole.set(sauce, payload.length + 1);
		const parsed = parseSauce(whole);
		expect(parsed!.payloadSize).toBe(payload.length);
	});
});
