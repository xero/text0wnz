/**
 * ANSI and SAUCE spec compliance against PabloDraw, moebiusXBIN, and
 * the written specs. Each case names the reference behavior it pins.
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
		// an empty param read as 1 (bold on) leaves B bright; ANSI.SYS,
		// PabloDraw, and moebiusXBIN all reset to plain gray
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

describe('CUP past the scroll window', () => {
	it('ESC[26;1H scrolls the 25-row window and keeps row 25', () => {
		// CUP-per-line art (TO-DIN.ICE) lands row 26 below row 25 like
		// moebiusXBIN, not on top of it
		const { doc } = decodeAns(bytes('\x1b[24;1HA\x1b[25;1HB\x1b[26;1HC'));
		expect(cellAt(doc, 0, 23).glyph & 0xffff).toBe(65);
		expect(cellAt(doc, 0, 24).glyph & 0xffff).toBe(66);
		expect(cellAt(doc, 0, 25).glyph & 0xffff).toBe(67);
		expect(doc.getRows()).toBe(26);
	});

	it('the cursor stays inside the window after the scroll', () => {
		// CUD cannot snap up over painted rows, and CUU moves within
		// the scrolled window (the cursor sits one column right of X)
		const { doc } = decodeAns(bytes('\x1b[26;1HX\x1b[1BY\x1b[1AZ'));
		expect(cellAt(doc, 0, 25).glyph & 0xffff).toBe(88);
		expect(cellAt(doc, 1, 25).glyph & 0xffff).toBe(89);
		expect(cellAt(doc, 2, 24).glyph & 0xffff).toBe(90);
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
		// the following classic cell gets an explicit SGR, not stale RGB
		expect(isPaletteColor(cellAt(back.doc, 1, 0).fg)).toBe(true);
	});
});

describe('EL erase and the RGB overlay', () => {
	it('ESC[K clears RGB overlay entries on erased cells', () => {
		const { doc } = decodeAns(bytes('\x1b[0;255;0;0tA\x1b[1;1H\x1b[0m\x1b[K'));
		const cell = cellAt(doc, 0, 0);
		expect(cell.bg).toBe(paletteColor(0));
		expect(cell.glyph).toBe(0);
	});

	it('ESC[K erases from the cursor and keeps RGB left of it', () => {
		const { doc } = decodeAns(bytes('\x1b[0;255;0;0tAB\x1b[1;2H\x1b[0m\x1b[K'));
		expect(cellAt(doc, 0, 0).bg).toBe(rgbColor(255, 0, 0));
		expect(cellAt(doc, 1, 0).bg).toBe(paletteColor(0));
	});

	it('ESC[1K and ESC[2K keep the erase-to-EOL shape', () => {
		// param-blind EL is the v2 lineage; this pin makes a future real
		// EL 1/2 a conscious change instead of a silent one
		const twoK = decodeAns(bytes('\x1b[0;255;0;0tAB\x1b[1;1H\x1b[0m\x1b[2K'));
		expect(cellAt(twoK.doc, 0, 0).glyph).toBe(0);
		expect(cellAt(twoK.doc, 1, 0).glyph).toBe(0);
		expect(cellAt(twoK.doc, 0, 0).bg).toBe(paletteColor(0));
		expect(cellAt(twoK.doc, 1, 0).bg).toBe(paletteColor(0));
		const oneK = decodeAns(bytes('\x1b[0;255;0;0tAB\x1b[1;1H\x1b[0m\x1b[1K'));
		expect(cellAt(oneK.doc, 0, 0).glyph).toBe(0);
		expect(cellAt(oneK.doc, 1, 0).glyph).toBe(0);
		expect(cellAt(oneK.doc, 1, 0).bg).toBe(paletteColor(0));
	});
});

describe('UTF-8 deferred wrap', () => {
	// a 4-column SAUCE width, so ABCD fills row 1 and wraps
	const open = (between: string, before = '') => {
		const body = new TextEncoder().encode(`${before}ABCD${between}\nE`);
		const sauce = buildSauce({
			dataType: 1,
			fileType: 1,
			fileSize: body.length,
			columns: 4,
			rows: 2,
		});
		const file = new Uint8Array(body.length + 1 + sauce.length);
		file.set(body, 0);
		file[body.length] = 0x1a;
		file.set(sauce, body.length + 1);
		return decodeAns(file, { utf8: true }).doc;
	};

	it.each([
		['nothing', ''],
		['SGR', '\x1b[31m'],
		['PabloDraw t', '\x1b[1;255;0;0t'],
		['ESC[s', '\x1b[s'],
		['ESC[?33h', '\x1b[?33h'],
		['ESC[?7h', '\x1b[?7h'],
		['ESC[?7l', '\x1b[?7l'],
		['EL', '\x1b[K'],
		['ESC[s ESC[u', '\x1b[s\x1b[u'],
	])('%s between a full row and its LF leaves one row', (_label, between) => {
		// durdraw wraps at the next glyph, so none of these ends the
		// pending wrap
		const doc = open(between);
		expect(doc.getRows()).toBe(2);
		expect(cellAt(doc, 0, 1).glyph & 0xffff).toBe(69);
	});

	it('a cursor move between a full row and its LF ends the wrap', () => {
		const doc = open('\x1b[C');
		expect(doc.getRows()).toBe(3);
		expect(cellAt(doc, 0, 2).glyph & 0xffff).toBe(69);
	});

	it('ESC[u restores the wrap state ESC[s saved with the cursor', () => {
		// saved before the wrap: the restore leaves nothing pending, so
		// the LF moves down instead of E overwriting A
		const doc = open('\x1b[u', '\x1b[s');
		expect(cellAt(doc, 0, 0).glyph & 0xffff).toBe(65);
		expect(cellAt(doc, 0, 1).glyph & 0xffff).toBe(69);
	});
});

describe('UTF-8 control-byte lookalikes', () => {
	it('glyphs living on cp437 control bytes stay cells', () => {
		// U+25D9 is cp437 0x0A: dispatching on the reverse-mapped byte
		// turns it into a line feed and corrupts moebiusXBIN's own UTF-8
		// exports
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
		// SAUCE §Layout: Character fields are CP437, so e-acute is 0x82,
		// never UTF-8's C3 A9
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

describe('XBin 512-glyph mode', () => {
	it('fg intensity selects the upper page and round-trips', async () => {
		const { makeXBin, makeXBinFont, makeXBinPalette } =
			await import('../corpus/generators.js');
		const { decodeXBin, encodeXBin } =
			await import('../../src/js/core/codecs/xbin.js');
		const columns = 4;
		const rows = 1;
		// cell 0: char 65 with BRIGHT fg 12 = upper glyph 65, dim fg 4;
		// cell 1: char 65 with dim fg 4 = classic glyph, untouched
		const cells = Uint16Array.from([
			(65 << 8) | 12,
			(65 << 8) | 4,
			32 << 8,
			32 << 8,
		]);
		const font = makeXBinFont(512, 16);
		const fileBytes = makeXBin({
			columns,
			rows,
			palette: makeXBinPalette(),
			font,
			font512: true,
			rawCells: cells,
			sauce: {},
		});
		const result = decodeXBin(fileBytes);
		expect(result.font512).toBe(true);
		const upper = result.doc.getCell(0, 0, 0);
		const classic = result.doc.getCell(0, 1, 0);
		const upperDef = result.doc.glyphTable.get(upper.glyph & 0xffff);
		expect(upperDef?.fontSlot).toBe(3);
		expect(upperDef?.codepoint).toBe(0xe000 + 65);
		expect(upper.fg).toBe(paletteColor(4));
		expect(classic.glyph & 0xffff).toBe(65);
		expect(classic.fg).toBe(paletteColor(4));

		const reencoded = encodeXBin(result.doc, {
			palette6: result.palette6,
			fontBytes: result.fontBytes,
			fontHeight: result.fontHeight,
			compress: false,
		});
		const second = decodeXBin(reencoded);
		const roundTripped = second.doc.getCell(0, 0, 0);
		const rtDef = second.doc.glyphTable.get(roundTripped.glyph & 0xffff);
		expect(rtDef?.codepoint).toBe(0xe000 + 65);
		expect(roundTripped.fg).toBe(paletteColor(4));
	});
});
