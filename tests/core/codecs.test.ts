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
import { v3ToU16, v3ToU16Lossy } from '../../src/js/core/convert.js';
import {
	FONT_SLOT_UNSCII,
	createDocV3,
	glyphWord,
	paletteColor,
	rgbColor,
} from '../../src/js/core/doc.js';
import {
	concatBytes,
	makeAnsi,
	makeBin,
	makeSauce,
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

	it('reads Character fields as CP437 so a rebuild writes the same bytes', () => {
		const options = {
			dataType: 1,
			fileType: 1,
			fileSize: 10,
			columns: 80,
			rows: 25,
			title: 'café £5 ☺',
			author: 'ÄL',
			group: 'grün',
			comments: 'naïve résumé\n│ box │',
			date: FIXED_DATE,
		};
		const bytes = buildSauce(options);
		const record = parseSauce(bytes);
		expect(record?.title).toBe('café £5 ☺');
		expect(record?.author).toBe('ÄL');
		expect(record?.group).toBe('grün');
		expect(record?.comments).toEqual(['naïve résumé', '│ box │']);
		expect(
			buildSauce({
				...options,
				title: record?.title,
				author: record?.author,
				group: record?.group,
				comments: record?.comments.join('\n'),
			}),
		).toEqual(bytes);
	});

	it('keeps a trailing CP437 0xA0 that a whitespace trim would eat', () => {
		// CP437 0xA0 is á; read as latin-1 it is NBSP, which \s matches
		const record = parseSauce(
			buildSauce({
				dataType: 1,
				fileSize: 10,
				columns: 80,
				rows: 25,
				title: 'olá',
				date: FIXED_DATE,
			}),
		);
		expect(record?.title).toBe('olá');
	});

	it('ends Character and ZString fields at the first NUL', () => {
		// SAUCE §Layout note 3: some writers terminate with NUL and leave
		// garbage behind it
		const bytes = makeSauce({
			title: 'Title\0garbage!',
			author: 'xero\0zzzz',
			fontName: '\0\0SAUCE-ADDER V1.3',
			comments: ['kept\0dropped'],
		});
		const record = parseSauce(concatBytes([Uint8Array.of(0x41, 0x1a), bytes]));
		expect(record?.title).toBe('Title');
		expect(record?.author).toBe('xero');
		expect(record?.fontName).toBe('');
		expect(record?.comments).toEqual(['kept']);
	});

	it('reads only the payload fence from an unknown version', () => {
		// SAUCE §Layout note 6; pre-standard writers leave stale file
		// bytes where TFlags and TInfoS sit
		const record = makeSauce({
			fileSize: 3,
			tinfo1: 40,
			title: 'Fatal Error',
			flags: 0x6c,
			fontName: 'IBM VGA50',
		});
		record[5] = 0x20;
		record[6] = 0x20;
		const parsed = parseSauce(
			concatBytes([Uint8Array.of(0x41, 0x42, 0x43, 0x1a), record]),
		);
		expect(parsed?.payloadSize).toBe(3);
		expect(parsed?.title).toBe('');
		expect(parsed?.tInfo1).toBe(0);
		expect(parsed?.flags).toBe(0);
		expect(parsed?.iceColors).toBe(false);
		expect(parsed?.fontName).toBe('');
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

	it('pads a trailing partial row instead of throwing', () => {
		// 160 default columns, 1.5 rows of payload: the tail row pads
		const d = decodeBin(new Uint8Array(480).fill(0x41));
		expect(d.doc.getColumns()).toBe(160);
		expect(d.doc.getRows()).toBe(2);
		const u16 = v3ToU16(d.doc).imageData;
		expect(u16[239]).toBe(0x4141);
		expect(u16[240]).toBe(0);
		expect(u16[319]).toBe(0);
	});

	it('drops a lone trailing byte rather than pairing it with the trailer', () => {
		const d = decodeBin(new Uint8Array(481).fill(0x41));
		expect(d.doc.getRows()).toBe(2);
		const u16 = v3ToU16(d.doc).imageData;
		expect(u16[239]).toBe(0x4141);
		expect(u16[240]).toBe(0);
	});

	it('opens no blank row for a lone byte past a whole row', () => {
		expect(decodeBin(new Uint8Array(641)).doc.getRows()).toBe(2);
	});

	it('reads a FileType 1 record as the 160-column default', () => {
		// PabloDraw Binary.cs, GetWidth: wild BINs stamp the ANSi FileType
		const bytes = makeBin({
			columns: 160,
			rows: 3,
			seed: 2,
			sauce: { filetype: 1 },
		});
		const d = decodeBin(bytes);
		expect(d.doc.getColumns()).toBe(160);
		expect(d.doc.getRows()).toBe(3);
	});

	it('ignores the TInfo1 width of a non-BinaryText record', () => {
		// SAUCE adders stamp 80x25 Character records on 160-column BINs
		const bytes = makeBin({
			columns: 160,
			rows: 2,
			seed: 4,
			sauce: { datatype: 1, filetype: 1, tinfo1: 80, tinfo2: 25 },
		});
		expect(decodeBin(bytes).doc.getColumns()).toBe(160);
	});

	it('pads partial rows under a SAUCE record without reading the trailer', () => {
		const payload = new Uint8Array(480).fill(0x41);
		const sauce = buildSauce({
			dataType: 5,
			fileSize: 480,
			columns: 160,
			rows: 2,
			date: FIXED_DATE,
		});
		const file = new Uint8Array(payload.length + 1 + sauce.length);
		file.set(payload, 0);
		file[payload.length] = 0x1a;
		file.set(sauce, payload.length + 1);
		const d = decodeBin(file);
		expect(d.doc.getRows()).toBe(2);
		const u16 = v3ToU16(d.doc).imageData;
		expect(u16[240]).toBe(0);
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
		// lossy: the upper page is non-identity glyph defs by design
		expect(v3ToU16Lossy(d2.doc).imageData).toEqual(
			v3ToU16Lossy(d1.doc).imageData,
		);
		expect(d2.doc.glyphTable.size()).toBe(d1.doc.glyphTable.size());
	});

	it('compression engages only when it wins', () => {
		// uniform cells compress; XBin §Flags, Compress is bit 2 of header
		// byte 10
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

	it('reads oversize font heights raw like PabloDraw and round-trips them', () => {
		// the height sizes the font block, so a clamp would misread the
		// image offset; 33-255, past XBin §Font's 32 max, stays raw on
		// purpose
		const font = makeXBinFont(256, 200);
		const bytes = makeXBin({
			columns: 4,
			rows: 1,
			rawCells: Uint16Array.from([(65 << 8) | 7, 32 << 8, 32 << 8, 32 << 8]),
			font,
			fontHeight: 200,
			sauce: {},
		});
		const d1 = decodeXBin(bytes);
		expect(d1.fontHeight).toBe(200);
		expect(d1.fontBytes?.length).toBe(256 * 200);
		// image offset math holds through the big font block
		expect(d1.doc.getCell(0, 0, 0).glyph & 0xffff).toBe(65);
		const encoded = encodeXBin(d1.doc, {
			fontBytes: d1.fontBytes,
			fontHeight: d1.fontHeight,
			date: FIXED_DATE,
		});
		const d2 = decodeXBin(encoded);
		expect(d2.fontHeight).toBe(200);
		expect(d2.doc.getCell(0, 0, 0).glyph & 0xffff).toBe(65);
	});

	it('encode refuses font heights the header byte cannot hold', () => {
		const d = decodeXBin(
			makeXBin({
				columns: 2,
				rows: 1,
				rawCells: Uint16Array.from([(65 << 8) | 7, 32 << 8]),
				sauce: {},
			}),
		);
		const font = makeXBinFont(256, 16);
		// 300 would wrap the header byte to 44 and corrupt every reader
		expect(() =>
			encodeXBin(d.doc, { fontBytes: font, fontHeight: 300 }),
		).toThrow(/font height/);
		expect(() => encodeXBin(d.doc, { fontBytes: font, fontHeight: 0 })).toThrow(
			/font height/,
		);
		expect(() =>
			encodeXBin(d.doc, { fontBytes: font, fontHeight: 1.5 }),
		).toThrow(/font height/);
	});

	it('defaults a zero font height to 16', () => {
		const bytes = makeXBin({
			columns: 2,
			rows: 1,
			rawCells: Uint16Array.from([(66 << 8) | 7, 32 << 8]),
			font: makeXBinFont(256, 16),
			fontHeight: 0,
			sauce: {},
		});
		expect(decodeXBin(bytes).fontHeight).toBe(16);
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

	// v2 files hold full-width lines plus LF; honoring both the wrap and
	// the LF doubles rows with blanks. The v3 reader swallows one LF
	// after an auto-wrap (terminal deferred-wrap semantics), so those
	// files reimport clean and the v3 writer's full-width-plus-LF output
	// is lossless.
	it('lenient UTF-8 fixture decodes and round-trips the v3 writer', () => {
		const bytes = makeUtf8Ansi({ columns: 40, rows: 10, seed: 7 });
		const d1 = decodeAns(bytes, { utf8: true });
		// No SAUCE record: the width defaults to 80, exactly like v2
		expect(d1.doc.getColumns()).toBe(80);
		const e1 = encodeUtf8(d1.doc, { date: FIXED_DATE });
		const d2 = decodeAns(e1, { utf8: true });
		// the writer's SAUCE pins the real width
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

	it('full-width UTF-8 rows plus LF read as one row each', () => {
		// Fixture mimics the v2 writer: full-width UTF-8 rows each followed
		// by ESC[0m + LF, no SAUCE. Only glyphs compare: the v2 encoder
		// resets the stream per row but not its diff trackers, so old
		// files carry baked-in color loss.
		const d1 = decodeAns(makeAnsi({ columns: 80, rows: 25, seed: 55 }));
		const legacy = encodeAns(d1.doc, { utf8: true });
		const d2 = decodeAns(legacy, { utf8: true });
		expect(d2.doc.getRows()).toBe(d1.doc.getRows());
		const chars = (u16: Uint16Array) => Array.from(u16, word => word >> 8);
		expect(chars(v3ToU16(d2.doc).imageData)).toEqual(
			chars(v3ToU16(d1.doc).imageData),
		);
	});

	it('UTF-8 blink mode round-trips blink cells exactly', () => {
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

	it('CP437 writer swaps stream controls for lookalike glyphs', () => {
		const doc = createDocV3({ columns: 4, rows: 1 });
		[10, 13, 26, 27].forEach((code, x) => {
			doc.setCell(0, x, 0, {
				glyph: glyphWord(code, 0),
				fg: paletteColor(7),
				bg: paletteColor(0),
			});
		});
		const back = decodeAns(encodeAns(doc, { date: FIXED_DATE }));
		expect(
			Array.from(v3ToU16(back.doc).imageData.subarray(0, 4), w => w >> 8),
		).toEqual([9, 14, 16, 17]);
	});

	it('decodes an empty stream to one blank row', () => {
		const { doc } = decodeAns(new Uint8Array(0));
		expect([doc.getColumns(), doc.getRows()]).toEqual([80, 1]);
		expect(v3ToU16(doc).imageData.every(word => word === 0)).toBe(true);
		const utf8 = decodeAns(new Uint8Array(0), { utf8: true }).doc;
		expect([utf8.getColumns(), utf8.getRows()]).toEqual([80, 1]);
	});

	it('reads a BinaryText FileType 1 record on an ANSI as 80 columns', () => {
		const body = Uint8Array.of(0x41);
		const record = makeSauce({ datatype: 5, filetype: 1, fileSize: 1 });
		const d = decodeAns(concatBytes([body, Uint8Array.of(0x1a), record]));
		expect(d.doc.getColumns()).toBe(80);
	});
});

describe('ansimation export', () => {
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
