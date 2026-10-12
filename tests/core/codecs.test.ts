import { describe, it, expect } from 'vitest';
import { buildSauce, parseSauce } from '../../src/js/core/codecs/sauce.js';
import { decodeBin, encodeBin } from '../../src/js/core/codecs/bin.js';
import {
	compressXBin,
	decodeXBin,
	encodeXBin,
} from '../../src/js/core/codecs/xbin.js';
import {
	decodeAns,
	encodeAns,
	encodeAnsimation,
	encodeUtf8,
} from '../../src/js/core/codecs/ans.js';
import { parseSauce as readSauce } from '../../src/js/core/codecs/sauce.js';
import { v3ToU16 } from '../../src/js/core/convert.js';
import {
	FONT_SLOT_UNSCII,
	createDocV3,
	glyphWord,
	paletteColor,
	rgbColor,
} from '../../src/js/core/doc.js';
import {
	makeAnsi,
	makeBin,
	makeUtf8Ansi,
	makeXBin,
	makeXBinFont,
	makeXBinPalette,
	makeXBinRleRuns,
	makeCells,
} from '../corpus/generators.js';

const FIXED_DATE = new Date(2026, 9, 10);

describe('sauce codec', () => {
	it('parse(build(x)) returns the fields', () => {
		const bytes = buildSauce({
			dataType: 1,
			fileType: 1,
			fileSize: 4000,
			columns: 80,
			rows: 25,
			title: 'golden testcard',
			author: 'xero',
			group: 'impure',
			comments: 'line one\nline two',
			iceColors: true,
			letterSpacing: true,
			fontName: 'IBM VGA',
			date: FIXED_DATE,
		});
		const record = parseSauce(bytes);
		expect(record).not.toBeNull();
		expect(record?.title).toBe('golden testcard');
		expect(record?.author).toBe('xero');
		expect(record?.group).toBe('impure');
		expect(record?.comments).toEqual(['line one', 'line two']);
		expect(record?.fileSize).toBe(4000);
		expect(record?.dataType).toBe(1);
		expect(record?.tInfo1).toBe(80);
		expect(record?.tInfo2).toBe(25);
		expect(record?.iceColors).toBe(true);
		expect(record?.letterSpacing).toBe(true);
		expect(record?.fontName).toBe('IBM VGA');
		expect(record?.date).toBe('20261010');
	});

	it('BinaryText records store width/2 in FileType and skip TInfo', () => {
		const record = parseSauce(
			buildSauce({
				dataType: 5,
				fileSize: 8000,
				columns: 160,
				rows: 25,
				date: FIXED_DATE,
			}),
		);
		expect(record?.fileType).toBe(80);
		expect(record?.tInfo1).toBe(0);
		expect(record?.tInfo2).toBe(0);
	});

	it('XBin records carry no flags or font name', () => {
		const record = parseSauce(
			buildSauce({
				dataType: 6,
				fileSize: 100,
				columns: 80,
				rows: 25,
				iceColors: true,
				fontName: 'IBM VGA',
				flagsAndTInfo: false,
				date: FIXED_DATE,
			}),
		);
		expect(record?.flags).toBe(0);
		expect(record?.fontName).toBe('');
	});
});

describe('bin codec', () => {
	it('decode -> encode -> decode is cell-identical', () => {
		const bytes = makeBin({
			columns: 160,
			rows: 50,
			seed: 21,
			sauce: { title: 'bin fixture' },
		});
		const d1 = decodeBin(bytes);
		expect(d1.doc.getColumns()).toBe(160);
		expect(d1.doc.getRows()).toBe(50);
		expect(d1.meta.title).toBe('bin fixture');
		const encoded = encodeBin(d1.doc, { meta: d1.meta, date: FIXED_DATE });
		const d2 = decodeBin(encoded);
		expect(v3ToU16(d2.doc)).toEqual(v3ToU16(d1.doc));
		// Image region is byte-identical to the source
		const imageLen = 160 * 50 * 2;
		expect(Array.from(encoded.subarray(0, imageLen))).toEqual(
			Array.from(bytes.subarray(0, imageLen)),
		);
	});

	it('FileType 0 and headerless BINs derive rows from size', () => {
		const image = makeBin({ columns: 160, rows: 40, seed: 23 });
		const ft0 = makeBin({
			columns: 160,
			rows: 40,
			seed: 23,
			sauce: { filetype: 0 },
		});
		expect(decodeBin(ft0).doc.getRows()).toBe(40);
		expect(decodeBin(image).doc.getRows()).toBe(40);
		expect(v3ToU16(decodeBin(ft0).doc).imageData).toEqual(
			v3ToU16(decodeBin(image).doc).imageData,
		);
	});

	it('rejects odd column counts', () => {
		const d1 = decodeBin(makeBin({ columns: 160, rows: 2, seed: 1 }));
		d1.doc.resize(159, 2);
		expect(() => encodeBin(d1.doc)).toThrow(/even column/);
	});
});

describe('xbin codec', () => {
	it('RLE fixture decodes to the expected cells and round-trips', () => {
		const columns = 16;
		const { cells, rle } = makeXBinRleRuns(columns);
		const rows = cells.length / columns;
		const bytes = makeXBin({
			columns,
			rows,
			compressed: rle,
			sauce: {},
		});
		const d1 = decodeXBin(bytes);
		expect(Array.from(v3ToU16(d1.doc).imageData)).toEqual(Array.from(cells));
		const encoded = encodeXBin(d1.doc, {
			palette6: d1.palette6,
			fontBytes: d1.fontBytes,
			fontHeight: d1.fontHeight,
			date: FIXED_DATE,
		});
		const d2 = decodeXBin(encoded);
		expect(v3ToU16(d2.doc).imageData).toEqual(v3ToU16(d1.doc).imageData);
	});

	it('512-glyph fonts and custom palettes survive the round-trip', () => {
		const font = makeXBinFont(512, 16, 9);
		const palette = makeXBinPalette(5);
		const bytes = makeXBin({
			columns: 32,
			rows: 8,
			rawCells: makeCells(32, 8, 13),
			font,
			font512: true,
			fontHeight: 16,
			palette,
			iceColors: true,
			sauce: { title: 'xb 512' },
		});
		const d1 = decodeXBin(bytes);
		expect(d1.font512).toBe(true);
		expect(d1.fontBytes).toEqual(font);
		expect(d1.palette6).toEqual(palette);
		expect(d1.doc.getIceColors()).toBe(true);

		const encoded = encodeXBin(d1.doc, {
			palette6: d1.palette6,
			fontBytes: d1.fontBytes,
			fontHeight: d1.fontHeight,
			meta: d1.meta,
			date: FIXED_DATE,
		});
		const d2 = decodeXBin(encoded);
		expect(d2.font512).toBe(true);
		expect(d2.fontBytes).toEqual(font);
		expect(d2.palette6).toEqual(palette);
		expect(v3ToU16(d2.doc).imageData).toEqual(v3ToU16(d1.doc).imageData);
	});

	it('compression engages only when it wins', () => {
		// Highly regular data compresses; the encoder sets flag bit 2
		const uniform = decodeBin(makeBin({ columns: 160, rows: 4, seed: 2 }));
		uniform.doc.frames[0].glyph.fill(0x20);
		uniform.doc.frames[0].fg.fill(uniform.doc.getCell(0, 0, 0).fg);
		const encoded = encodeXBin(uniform.doc, { date: FIXED_DATE });
		expect(encoded[10] & 0x04).toBe(0x04);
		const rle = compressXBin(
			v3ToU16(uniform.doc).imageData,
			uniform.doc.getColumns(),
			uniform.doc.getRows(),
		);
		expect(rle.length).toBeLessThan(160 * 4 * 2);
	});

	it('rejects bad magic', () => {
		expect(() => decodeXBin(new Uint8Array(32))).toThrow(/magic/);
	});
});

describe('ans codec', () => {
	it('CP437 fixture round-trips cell-identically with a fixed-point encoder', () => {
		const bytes = makeAnsi({ columns: 80, rows: 50, seed: 42 });
		const d1 = decodeAns(bytes);
		expect(d1.doc.getColumns()).toBe(80);
		const e1 = encodeAns(d1.doc, { meta: d1.meta, date: FIXED_DATE });
		const d2 = decodeAns(e1);
		expect(v3ToU16(d2.doc).imageData).toEqual(v3ToU16(d1.doc).imageData);
		const e2 = encodeAns(d2.doc, { meta: d2.meta, date: FIXED_DATE });
		expect(e2).toEqual(e1);
	});

	// Historical v2 defect, FIXED by the P5 reader+writer pair (D9): the
	// v2 writer emitted full-width lines plus LF and its reader honored
	// both the wrap AND the LF, doubling rows with blanks. The v3 reader
	// swallows one LF after an auto-wrap (terminal deferred-wrap
	// semantics), so old files reimport clean and the v3 writer's
	// full-width-plus-LF output is lossless.
	it('lenient UTF-8 fixture decodes and round-trips the v3 writer', () => {
		const bytes = makeUtf8Ansi({ columns: 40, rows: 10, seed: 7 });
		const d1 = decodeAns(bytes, { utf8: true });
		// No SAUCE record: the width defaults to 80, exactly like v2
		expect(d1.doc.getColumns()).toBe(80);
		const e1 = encodeUtf8(d1.doc, { date: FIXED_DATE });
		const d2 = decodeAns(e1, { utf8: true });
		// the writer's SAUCE pins the real width now
		expect(d2.doc.getColumns()).toBe(80);
		expect(d2.doc.getRows()).toBe(d1.doc.getRows());
		// NUL and 255 both write NBSP and read back as 255 (v2's exact
		// collapse; both render blank), so compare modulo that fold
		const canon = (u16: Uint16Array) =>
			Array.from(
				u16,
				word => (word >> 8 === 0 ? 255 << 8 : word & 0xff00) | (word & 0xff),
			);
		expect(canon(v3ToU16(d2.doc).imageData)).toEqual(
			canon(v3ToU16(d1.doc).imageData),
		);
		// fixed point: a second generation is byte-identical
		expect(encodeUtf8(d2.doc, { date: FIXED_DATE })).toEqual(e1);
	});

	it('v2-style full-width-plus-LF files no longer double their rows', () => {
		// simulate the OLD writer: an 80-col doc written as full-width
		// UTF-8 rows each followed by ESC[0m + LF (no SAUCE). Glyphs must
		// land on the original grid with no doubled blank rows. (Colors
		// CAN'T fully survive: the v2 encoder reset the stream per row
		// but not its diff trackers, a lossy bug baked into old files.)
		const d1 = decodeAns(makeAnsi({ columns: 80, rows: 25, seed: 55 }));
		const legacy = encodeAns(d1.doc, { utf8: true });
		const d2 = decodeAns(legacy, { utf8: true });
		expect(d2.doc.getRows()).toBe(d1.doc.getRows());
		const chars = (u16: Uint16Array) => Array.from(u16, word => word >> 8);
		expect(chars(v3ToU16(d2.doc).imageData)).toEqual(
			chars(v3ToU16(d1.doc).imageData),
		);
	});

	it('UTF-8 blink mode (D8) round-trips blink cells exactly', () => {
		const d1 = decodeAns(makeAnsi({ columns: 20, rows: 4, seed: 3 }));
		const e1 = encodeUtf8(d1.doc, { blinkMode: 'blink', date: FIXED_DATE });
		const d2 = decodeAns(e1, { utf8: true });
		expect(v3ToU16(d2.doc).imageData).toEqual(v3ToU16(d1.doc).imageData);
		expect(d2.doc.getIceColors()).toBe(d1.doc.getIceColors());
	});

	it('UTF-8 writer carries unicode glyphs and extended colors', () => {
		const doc = createDocV3({ columns: 3, rows: 1 });
		const han = doc.glyphTable.idFor(FONT_SLOT_UNSCII, 0x4e2d);
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(han, 0),
			fg: rgbColor(250, 90, 10),
			bg: paletteColor(0),
		});
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(176, 0),
			fg: paletteColor(12),
			bg: rgbColor(1, 2, 3),
		});
		const e1 = encodeUtf8(doc, { date: FIXED_DATE });
		const text = new TextDecoder().decode(e1);
		expect(text).toContain('中');
		expect(text).toContain('38;2;250;90;10m');
		expect(text).toContain('48;2;1;2;3m');
		const d2 = decodeAns(e1, { utf8: true });
		const back = d2.doc.frames[0];
		const def = d2.doc.glyphTable.get(back.glyph[0] & 0xffff);
		expect(def?.codepoint).toBe(0x4e2d);
		expect(back.fg[0]).toBe(rgbColor(250, 90, 10));
		expect(back.fg[1]).toBe(paletteColor(12));
		expect(back.bg[1]).toBe(rgbColor(1, 2, 3));
		expect(encodeUtf8(d2.doc, { date: FIXED_DATE })).toEqual(e1);
	});

	it('UTF-8 reader keeps xterm-256 indexes as palette words', () => {
		const bytes = new TextEncoder().encode('\u001b[38;5;196m\u001b[48;5;232mX');
		const { doc } = decodeAns(bytes, { utf8: true });
		expect(doc.frames[0].fg[0]).toBe(paletteColor(196));
		expect(doc.frames[0].bg[0]).toBe(paletteColor(232));
		// ...and they round-trip losslessly through the writer
		const again = decodeAns(encodeUtf8(doc), { utf8: true });
		expect(again.doc.frames[0].fg[0]).toBe(paletteColor(196));
		expect(again.doc.frames[0].bg[0]).toBe(paletteColor(232));
	});

	it('UTF-8 reader substitutes smuggled surrogates and stays in the payload', () => {
		// 0xED 0xA0 0x80 encodes lone surrogate U+D800
		const surrogate = decodeAns(new Uint8Array([0xed, 0xa0, 0x80]), {
			utf8: true,
		});
		expect(surrogate.doc.frames[0].glyph[0] & 0xffff).toBe(63);
		// a multibyte lead as the LAST payload byte must not consume
		// bytes beyond the payload end
		expect(() =>
			decodeAns(new Uint8Array([0x41, 0xe2]), { utf8: true }),
		).toThrow();
	});

	it('plain-text export strips escape codes', () => {
		const d1 = decodeAns(makeAnsi({ columns: 20, rows: 3, seed: 5 }));
		const text = encodeAns(d1.doc, { utf8: true, stripEscapeCodes: true });
		expect(Array.from(text)).not.toContain(27);
	});
});

describe('ansimation export (P6)', () => {
	it('homes between frames, plays back to the last frame, marks SAUCE ANSiMation', () => {
		const doc = createDocV3({ columns: 4, rows: 2 });
		doc.frames[0].glyph[0] = glyphWord(65, 0); // 'A'
		doc.frames[0].fg[0] = paletteColor(7);
		doc.addFrame({ copyFrom: 0 });
		doc.frames[1].glyph[0] = glyphWord(66, 0); // 'B' overwrites
		const bytes = encodeAnsimation(doc, {
			meta: { title: 'anim' },
			date: FIXED_DATE,
		});
		const text = new TextDecoder('latin1').decode(bytes);
		expect(text.startsWith('\u001b[2J')).toBe(true);
		expect(text.split('\u001b[H').length - 1).toBe(2);
		// a terminal (and our reader) ends on the LAST frame
		const played = decodeAns(bytes);
		expect(played.doc.getCell(0, 0, 0).glyph & 0xffff).toBe(66);
		const sauce = readSauce(bytes);
		expect(sauce?.dataType).toBe(1);
		expect(sauce?.fileType).toBe(2);
		expect(sauce?.title).toBe('anim');
	});

	it('lossy per frame: extended colors do not throw', () => {
		const doc = createDocV3({ columns: 2, rows: 1, mode: 'xterm256' });
		doc.frames[0].fg[0] = 0xff8800; // raw RGB word
		doc.frames[0].bg[1] = paletteColor(200);
		expect(() => encodeAnsimation(doc)).not.toThrow();
	});
});
