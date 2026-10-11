/**
 * Charset tables (PLAN §3.4, durdraw model): pages of 12 characters
 * that ride the F-key bar and cycle with ctrl+[/]. A page entry is a
 * TOKEN sharing paste.ts semantics: 0-255 is a CP437 charCode drawn
 * from the active classic font, a negative value is ~codepoint and
 * renders/draws through the hex fonts and the doc glyph table.
 *
 * Imports accepted:
 * - durdraw .ini (example-charset.ini lineage): a [Character Set]
 *   section with name:, then [block N] sections with f1:..f12:
 *   holding literal UTF-8 characters (durdraw itself stops at f10).
 * - teXt0wnz .json: { "name": "...", "pages": [["░","▒",...], ...] }
 *   with up to 12 literal characters per page.
 *
 * Characters that CP437 can express become plain charCodes (so they
 * ride the artist's chosen font); everything else stays a codepoint
 * token. Blank/missing slots are spaces.
 */

import { unicodeToCp437 } from './cp437.js';

export const CHARSET_PAGE_SIZE = 12;

export interface CharsetPage {
	label: string;
	/** exactly 12 tokens: 0-255 CP437, negative = ~codepoint */
	chars: number[];
}

export class CharsetError extends Error {}

/** first codepoint of a literal character -> token */
export const tokenForChar = (char: string): number => {
	const codepoint = char.codePointAt(0);
	if (codepoint === undefined) {
		return 32;
	}
	const mapped = unicodeToCp437(codepoint);
	return mapped !== undefined ? mapped : ~codepoint;
};

const padPage = (tokens: number[]): number[] => {
	const page = tokens.slice(0, CHARSET_PAGE_SIZE);
	while (page.length < CHARSET_PAGE_SIZE) {
		page.push(32);
	}
	return page;
};

/** build one labeled page from a literal string of characters */
export const pageFromString = (label: string, chars: string): CharsetPage => {
	const tokens: number[] = [];
	for (const char of chars) {
		tokens.push(tokenForChar(char));
	}
	return { label, chars: padPage(tokens) };
};

/** chunk a codepoint range (e.g. a Unicode block) into labeled pages */
export const pagesForRange = (
	label: string,
	first: number,
	last: number,
): CharsetPage[] => {
	const pages: CharsetPage[] = [];
	let tokens: number[] = [];
	for (let codepoint = first; codepoint <= last; codepoint++) {
		tokens.push(tokenForChar(String.fromCodePoint(codepoint)));
		if (tokens.length === CHARSET_PAGE_SIZE) {
			pages.push({ label: `${label} ${pages.length + 1}`, chars: tokens });
			tokens = [];
		}
	}
	if (tokens.length > 0) {
		pages.push({
			label: `${label} ${pages.length + 1}`,
			chars: padPage(tokens),
		});
	}
	return pages;
};

/** durdraw-lineage .ini: [Character Set] name + [block N] f1..f12 */
export const parseCharsetIni = (text: string): CharsetPage[] => {
	let name = 'Custom';
	/** section -> fkey slot -> char */
	const blocks = new Map<string, string[]>();
	let section = '';
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === '' || line.startsWith(';') || line.startsWith('#')) {
			continue;
		}
		const sectionMatch = /^\[(.+)\]$/.exec(line);
		if (sectionMatch) {
			section = sectionMatch[1].trim().toLowerCase();
			continue;
		}
		const pair = /^([^:=]+)[:=](.*)$/.exec(line);
		if (!pair) {
			continue;
		}
		const key = pair[1].trim().toLowerCase();
		const value = pair[2].trim();
		if (section === 'character set') {
			if (key === 'name' && value) {
				name = value;
			}
			continue;
		}
		const blockMatch = /^block\s+(\d+)$/.exec(section);
		const fkeyMatch = /^f(\d+)$/.exec(key);
		if (blockMatch && fkeyMatch) {
			const slot = parseInt(fkeyMatch[1], 10);
			if (slot >= 1 && slot <= CHARSET_PAGE_SIZE) {
				let chars = blocks.get(section);
				if (!chars) {
					chars = [];
					blocks.set(section, chars);
				}
				chars[slot - 1] = value;
			}
		}
	}
	if (blocks.size === 0) {
		throw new CharsetError('no [block N] sections with f-keys found');
	}
	const pages: CharsetPage[] = [];
	const ordered = [...blocks.keys()].sort((a, b) => {
		const an = parseInt(a.slice(6), 10);
		const bn = parseInt(b.slice(6), 10);
		return an - bn;
	});
	for (const key of ordered) {
		const chars = blocks.get(key) ?? [];
		const tokens: number[] = [];
		for (let i = 0; i < CHARSET_PAGE_SIZE; i++) {
			tokens.push(chars[i] ? tokenForChar(chars[i]) : 32);
		}
		pages.push({
			label: blocks.size > 1 ? `${name} ${pages.length + 1}` : name,
			chars: tokens,
		});
	}
	return pages;
};

/** teXt0wnz charset JSON: { name, pages: [["░", ...], ...] } */
export const parseCharsetJson = (text: string): CharsetPage[] => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new CharsetError('not valid JSON');
	}
	const object = parsed as { name?: unknown; pages?: unknown };
	const name = typeof object.name === 'string' ? object.name : 'Custom';
	if (!Array.isArray(object.pages) || object.pages.length === 0) {
		throw new CharsetError('missing pages[]');
	}
	return object.pages.map((page, index) => {
		if (!Array.isArray(page)) {
			throw new CharsetError(`pages[${index}] is not an array`);
		}
		const tokens = page.map(char =>
			typeof char === 'string' && char.length > 0 ? tokenForChar(char) : 32,
		);
		return {
			label:
				object.pages && (object.pages as unknown[]).length > 1
					? `${name} ${index + 1}`
					: name,
			chars: padPage(tokens),
		};
	});
};

/** sniff .ini vs .json by content and parse accordingly */
export const parseCharset = (text: string): CharsetPage[] => {
	const trimmed = text.trimStart();
	return trimmed.startsWith('{')
		? parseCharsetJson(text)
		: parseCharsetIni(text);
};
