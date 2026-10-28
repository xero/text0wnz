/**
 * Untrusted-size gates from the 2026-10 audit: every decoder and
 * protocol path that allocates from attacker-controlled numbers dies
 * at a ceiling instead of in the allocator.
 */
import { describe, it, expect } from 'vitest';
import { CodecError } from '../../src/js/core/codecs/util.js';
import { gzip, gunzip } from '../../src/js/core/codecs/flate.js';
import { decodeBin } from '../../src/js/core/codecs/bin.js';
import { decodeXBin } from '../../src/js/core/codecs/xbin.js';
import { decodeAns } from '../../src/js/core/codecs/ans.js';
import { buildSauce } from '../../src/js/core/codecs/sauce.js';
import { joinDocToDoc } from '../../src/js/core/protocol/moebius.js';

describe('gunzip ceiling', () => {
	it('kills a decompression bomb during the read', async () => {
		const bomb = await gzip(new Uint8Array(1024 * 1024));
		await expect(gunzip(bomb, 1000)).rejects.toThrow(/exceeds/);
	});

	it('passes normal streams untouched', async () => {
		const data = Uint8Array.from([1, 2, 3, 4, 5]);
		expect(await gunzip(await gzip(data))).toEqual(data);
	});
});

describe('decoder cell ceilings', () => {
	it('rejects a crafted XBin header before allocating', () => {
		const bytes = new Uint8Array(32);
		bytes.set([88, 66, 73, 78, 0x1a], 0); // XBIN magic
		bytes[5] = 0xff;
		bytes[6] = 0xff; // columns 65535
		bytes[7] = 0xff;
		bytes[8] = 0xff; // rows 65535
		bytes[9] = 16;
		expect(() => decodeXBin(bytes)).toThrow(CodecError);
	});

	it('rejects a headerless BIN that implies too many rows', () => {
		// 160 default columns: 21MB of payload implies ~10.5M cells
		const file = new Uint8Array(21 * 1024 * 1024);
		expect(() => decodeBin(file)).toThrow(CodecError);
	});

	it('stops hostile ANSI row growth at the ceiling', () => {
		// newline spam scrolls topOfScreen without bound: 130k rows at
		// the default 80 columns crosses the 10M cell line
		const bytes = new Uint8Array(130_000 + 1);
		bytes.fill(10);
		bytes[130_000] = 88;
		expect(() => decodeAns(bytes)).toThrow(/cell ceiling/);
	});

	// one glyph + LF per row at SAUCE-declared 65535 columns: wide
	// enough that the old allocation gate refused legal content
	const tallWide = (rows: number) => {
		const payload = new Uint8Array(rows * 2);
		for (let i = 0; i < rows; i++) {
			payload[i * 2] = 88;
			payload[i * 2 + 1] = 10;
		}
		const sauce = buildSauce({
			dataType: 1,
			fileType: 1,
			fileSize: payload.length,
			columns: 65535,
			rows,
		});
		const file = new Uint8Array(payload.length + 1 + sauce.length);
		file.set(payload, 0);
		file[payload.length] = 0x1a;
		file.set(sauce, payload.length + 1);
		return file;
	};

	it('decodes tall wide ANSIs the allocation gate refused', () => {
		// 65535 x 101 = 6.6M content cells, well under the 10M ceiling
		const file = tallWide(101);
		const classic = decodeAns(file);
		expect(classic.doc.getColumns()).toBe(65535);
		expect(classic.doc.getRows()).toBe(101);
		const v3 = decodeAns(file, { utf8: true });
		expect(v3.doc.getColumns()).toBe(65535);
		expect(v3.doc.getRows()).toBe(101);
	});

	it('still refuses content past the ceiling in both readers', () => {
		// 65535 x 153 = 10,026,855 cells, just over the line
		const file = tallWide(153);
		expect(() => decodeAns(file)).toThrow(/cell ceiling/);
		expect(() => decodeAns(file, { utf8: true })).toThrow(/cell ceiling/);
	});
});

describe('join doc gates', () => {
	it('rejects join docs past the cell ceiling before expanding RLE', () => {
		expect(() =>
			joinDocToDoc({
				columns: 65535,
				rows: 65535,
				compressed_data: { code: [], fg: [], bg: [] },
			}),
		).toThrow(/ceiling/);
	});

	it('replaces lone surrogate cell codes with a question mark', () => {
		const result = joinDocToDoc({
			columns: 1,
			rows: 1,
			data: [{ code: 0xd800, fg: 7, bg: 0 }],
		});
		expect(result.doc.getCell(0, 0, 0).glyph & 0xffff).toBe(63);
	});

	it('normalizes negative and non-integer cell codes to a question mark', () => {
		const result = joinDocToDoc({
			columns: 2,
			rows: 1,
			data: [
				{ code: -27, fg: 7, bg: 0 },
				{ code: 1.5, fg: 7, bg: 0 },
			],
		});
		expect(result.doc.getCell(0, 0, 0).glyph & 0xffff).toBe(63);
		expect(result.doc.getCell(0, 1, 0).glyph & 0xffff).toBe(63);
	});
});
