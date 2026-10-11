import { describe, it, expect } from 'vitest';
import {
	CharsetError,
	pageFromString,
	pagesForRange,
	parseCharset,
	parseCharsetIni,
	parseCharsetJson,
	tokenForChar,
} from '../../src/js/core/charsets.js';

// the vendored durdraw example, verbatim shape
const DURDRAW_INI = `; Custom character set
[Character Set]
name: Cool Characters
encoding: utf-8

[block 1]
f1: 🭨
f2: 🭩
f10: 🮛

[block 2]
f1: 🮜
f5: ◤
`;

describe('tokenForChar', () => {
	it('maps CP437-expressible chars to charCodes, others to ~cp', () => {
		expect(tokenForChar('A')).toBe(65);
		expect(tokenForChar('░')).toBe(176);
		expect(tokenForChar('┐')).toBe(191);
		expect(tokenForChar('🭨')).toBe(~0x1fb68);
		expect(tokenForChar('中')).toBe(~0x4e2d);
	});
});

describe('parseCharsetIni', () => {
	it('parses the durdraw example format into 12-slot pages', () => {
		const pages = parseCharsetIni(DURDRAW_INI);
		expect(pages).toHaveLength(2);
		expect(pages[0].label).toBe('Cool Characters 1');
		expect(pages[0].chars).toHaveLength(12);
		expect(pages[0].chars[0]).toBe(~0x1fb68);
		expect(pages[0].chars[1]).toBe(~0x1fb69);
		expect(pages[0].chars[2]).toBe(32); // missing f3 pads to space
		expect(pages[0].chars[9]).toBe(~0x1fb9b);
		expect(pages[1].chars[0]).toBe(~0x1fb9c);
		expect(pages[1].chars[4]).toBe(~0x25e4);
	});

	it('accepts = separators and block numbering order', () => {
		const pages = parseCharsetIni(
			'[Character Set]\nname=X\n[block 2]\nf1=B\n[block 1]\nf1=A\n',
		);
		expect(pages[0].chars[0]).toBe(65);
		expect(pages[1].chars[0]).toBe(66);
	});

	it('throws on content without blocks', () => {
		expect(() => parseCharsetIni('[Character Set]\nname: X\n')).toThrow(
			CharsetError,
		);
	});
});

describe('parseCharsetJson', () => {
	it('parses pages of literal characters', () => {
		const pages = parseCharsetJson(
			JSON.stringify({ name: 'mine', pages: [['░', '🭨', 'A']] }),
		);
		expect(pages).toHaveLength(1);
		expect(pages[0].label).toBe('mine');
		expect(pages[0].chars.slice(0, 3)).toEqual([176, ~0x1fb68, 65]);
		expect(pages[0].chars[11]).toBe(32);
	});

	it('throws on junk', () => {
		expect(() => parseCharsetJson('nope')).toThrow(CharsetError);
		expect(() => parseCharsetJson('{"name":"x"}')).toThrow(CharsetError);
	});
});

describe('parseCharset sniffing', () => {
	it('routes JSON and INI by content', () => {
		expect(parseCharset('{"pages": [["A"]]}')[0].chars[0]).toBe(65);
		expect(parseCharset(DURDRAW_INI)).toHaveLength(2);
	});
});

describe('page builders', () => {
	it('pageFromString maps and pads', () => {
		const page = pageFromString('corners', '╭╮╰╯');
		expect(page.chars[0]).toBe(~0x256d);
		expect(page.chars[4]).toBe(32);
		expect(page.chars).toHaveLength(12);
	});

	it('pagesForRange chunks a block into numbered pages', () => {
		const pages = pagesForRange('Sextants', 0x1fb00, 0x1fb1a);
		expect(pages).toHaveLength(3);
		expect(pages[0].label).toBe('Sextants 1');
		expect(pages[0].chars[0]).toBe(~0x1fb00);
		expect(pages[2].chars[2]).toBe(~0x1fb1a);
		expect(pages[2].chars[3]).toBe(32);
	});
});
