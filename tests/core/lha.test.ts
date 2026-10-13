/**
 * LHA reader: header walking across levels 0/1/2 with hand-crafted
 * stored archives, the lh5 huffman path against a real amiga colly,
 * and the failure modes (crc mismatch, truncation, unsupported
 * methods, size bombs) that must throw instead of handing back junk.
 */
import { describe, it, expect } from 'vitest';
import {
	CodecError,
	MAX_LHA_ENTRY_BYTES,
	extractLhaEntry,
	readLhaEntries,
} from '../../src/js/core/index';
import {
	buildLha,
	lha0Entry,
	lha1Entry,
	lha2Entry,
	realColly,
} from '../corpus/lhaFixture';

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('lha header walking', () => {
	it('reads level 0 stored entries round-trip', () => {
		const data = new TextEncoder().encode('amiga ascii forever');
		const bytes = buildLha(
			lha0Entry('one.txt', data),
			lha0Entry('two.asc', data),
		);
		const entries = readLhaEntries(bytes);
		expect(entries.map(e => e.name)).toEqual(['one.txt', 'two.asc']);
		expect(entries[0].method).toBe('-lh0-');
		expect(text(extractLhaEntry(bytes, entries[1]))).toBe(
			'amiga ascii forever',
		);
	});

	it('walks level 1 extended headers to find the data', () => {
		const data = new TextEncoder().encode('level one payload');
		const bytes = buildLha(lha1Entry('colly.txt', data));
		const [entry] = readLhaEntries(bytes);
		expect(entry.name).toBe('colly.txt');
		// the ext block must not count against the compressed data
		expect(entry.compressedSize).toBe(data.length);
		expect(text(extractLhaEntry(bytes, entry))).toBe('level one payload');
	});

	it('assembles level 2 names from the ext chain, dir included', () => {
		const data = new TextEncoder().encode('level two payload');
		const bytes = buildLha(lha2Entry('deep.txt', 'logos/', data));
		const [entry] = readLhaEntries(bytes);
		expect(entry.name).toBe('logos/deep.txt');
		expect(text(extractLhaEntry(bytes, entry))).toBe('level two payload');
	});

	it('keeps amiga latin-1 filenames intact, 0x80-0x9F included', () => {
		const data = new TextEncoder().encode('x');
		// 0x85 tells iso-8859-1 from windows-1252, which maps it to the
		// ellipsis; amiga names must stay byte-exact
		const bytes = buildLha(lha0Entry('c«w\u0085LIG.txt', data));
		expect(readLhaEntries(bytes)[0].name).toBe('c«w\u0085LIG.txt');
	});

	it('parses a level 2 header sized to a multiple of 256', () => {
		const data = new TextEncoder().encode('after the big header');
		// headerSize = 32 + name + dir; 8 + 216 lands exactly on 256,
		// putting a zero byte where the terminator check looks
		const dir = 'd'.repeat(215) + '/';
		const bytes = buildLha(
			lha0Entry('first.txt', data),
			lha2Entry('deep.txt', dir, data),
		);
		const entries = readLhaEntries(bytes);
		expect(entries).toHaveLength(2);
		expect(entries[1].name).toBe(`${dir}deep.txt`);
		expect(text(extractLhaEntry(bytes, entries[1]))).toBe(
			'after the big header',
		);
	});

	it('rejects bytes that are not an lha archive', () => {
		expect(() =>
			readLhaEntries(new TextEncoder().encode('PK\u0003\u0004nope')),
		).toThrow(CodecError);
	});
});

describe('lh5 decoding', () => {
	it('extracts every entry of a real colly, crc-verified', () => {
		const bytes = realColly();
		const entries = readLhaEntries(bytes);
		expect(entries.map(e => e.name)).toEqual([
			'File_ID.DiZ',
			'iFd-Colly3.readme',
			'iFd-Colly3.txt',
			'iFd-Colly3.txt.info',
		]);
		expect(entries.every(e => e.method === '-lh5-')).toBe(true);
		const colly = extractLhaEntry(bytes, entries[2]);
		expect(colly.length).toBe(3714);
		expect(text(colly)).toContain('iNFERNO d-LIGHT');
		for (const entry of entries) {
			expect(extractLhaEntry(bytes, entry).length).toBe(entry.size);
		}
	});

	it('throws on corrupted compressed data instead of returning junk', () => {
		const bytes = realColly();
		const [diz] = readLhaEntries(bytes);
		const broken = bytes.slice();
		broken[diz.dataOffset + 40] ^= 0xff;
		expect(() => extractLhaEntry(broken, diz)).toThrow(CodecError);
	});

	it('throws on truncated data', () => {
		const bytes = realColly();
		const entries = readLhaEntries(bytes);
		const last = entries[entries.length - 1];
		const cut = bytes.slice(0, last.dataOffset + 10);
		expect(() => extractLhaEntry(cut, last)).toThrow(CodecError);
	});
});

describe('lha guard rails', () => {
	it('refuses methods it cannot decode', () => {
		const data = new TextEncoder().encode('old lharc');
		const bytes = buildLha(lha0Entry('old.txt', data, '-lh1-'));
		const [entry] = readLhaEntries(bytes);
		expect(() => extractLhaEntry(bytes, entry)).toThrow(/lh1/);
	});

	it('refuses a size bomb before decoding anything', () => {
		const data = new TextEncoder().encode('tiny');
		const bytes = buildLha(lha0Entry('bomb.txt', data));
		const [entry] = readLhaEntries(bytes);
		const forged = { ...entry, size: MAX_LHA_ENTRY_BYTES + 1 };
		expect(() => extractLhaEntry(bytes, forged)).toThrow(/exceeds/);
	});

	it('flags a stored entry whose crc does not match', () => {
		const data = new TextEncoder().encode('stored bytes');
		const bytes = buildLha(lha0Entry('s.txt', data));
		const [entry] = readLhaEntries(bytes);
		const broken = bytes.slice();
		broken[entry.dataOffset] ^= 0xff;
		expect(() => extractLhaEntry(broken, entry)).toThrow(/crc mismatch/);
	});
});
