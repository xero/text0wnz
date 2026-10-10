import { describe, it, expect } from 'vitest';
import { buildSauce, parseSauce } from '../../src/js/core/codecs/sauce.js';
import { decodeBin, encodeBin } from '../../src/js/core/codecs/bin.js';
import {
	compressXBin,
	decodeXBin,
	encodeXBin,
} from '../../src/js/core/codecs/xbin.js';
import { decodeAns, encodeAns } from '../../src/js/core/codecs/ans.js';
import { v3ToU16 } from '../../src/js/core/convert.js';
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

	// KNOWN v2 DEFECT carried over on purpose (bug-compatible port): the
	// writer emits full-width lines plus LF, the reader wraps at width AND
	// honors the LF, doubling rows with blanks. The corpus pins the same
	// failure for v2; D9's v3 UTF-8 writer replaces this path in P5.
	it.fails(
		'lenient UTF-8 fixture decodes and survives the v2-style writer',
		() => {
			const bytes = makeUtf8Ansi({ columns: 40, rows: 10, seed: 7 });
			const d1 = decodeAns(bytes, { utf8: true });
			// No SAUCE record: the width defaults to 80, exactly like v2
			expect(d1.doc.getColumns()).toBe(80);
			const e1 = encodeAns(d1.doc, { utf8: true });
			const d2 = decodeAns(e1, { utf8: true });
			expect(v3ToU16(d2.doc).imageData).toEqual(v3ToU16(d1.doc).imageData);
		},
	);

	it('plain-text export strips escape codes', () => {
		const d1 = decodeAns(makeAnsi({ columns: 20, rows: 3, seed: 5 }));
		const text = encodeAns(d1.doc, { utf8: true, stripEscapeCodes: true });
		expect(Array.from(text)).not.toContain(27);
	});
});
