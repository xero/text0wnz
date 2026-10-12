/**
 * TundraDraw .tnd codec: 24-bit cell colors ride the tag-bit planes.
 * PabloDraw's Tundra.cs is the de facto spec and this port mirrors it,
 * quirks included.
 *
 * Layout: one version byte (24), ASCII "TUNDRA24", then a command
 * stream over the payload (SAUCE record excluded):
 * - 0x01: cursor jump; int32 BE row, int32 BE column.
 * - 0x02-0x06: a char byte follows; bit 1 set reads a foreground, bit 2
 *   a background, each as 4 bytes (unused alpha byte, r, g, b). Colors
 *   persist as stream state across cells and cursor jumps.
 * - any other byte: literal char drawn with the current colors.
 *
 * Writer quirks mirrored from PabloDraw: chars 0-6 cannot be encoded
 * (they collide with commands), so those cells are skipped and the next
 * printable cell re-anchors with a cursor jump; a space never carries a
 * foreground write, so on re-read a space's fg is whatever the stream
 * state held. Columns ride SAUCE tInfo1 (default 80). The doc ends
 * where the cursor ends (final row + 1), and ice colors are always on.
 */

import {
	ATTR_BLINK,
	DocV3,
	attrsOf,
	createDefaultPaletteRGB,
	createDocV3,
	glyphIdOf,
	glyphWord,
	isPaletteColor,
	paletteColor,
	paletteIndexOf,
	rgbColor,
} from '../doc.js';
import { cp437ToUnicode } from '../cp437.js';
import { DecodeResult, DocMeta } from './bin.js';
import { buildSauce, parseSauce } from './sauce.js';
import { CodecError, bytesToString, concatBytes } from './util.js';

export const TUNDRA_ID = 'TUNDRA24';
export const TUNDRA_VERSION = 24;
export const DEFAULT_TUNDRA_COLUMNS = 80;
/** Rows stop here: SAUCE tInfo2 is a u16, wilder jumps are garbage. */
export const MAX_TUNDRA_ROWS = 0xffff;

const HEADER_SIZE = 1 + TUNDRA_ID.length;

const readBE32 = (bytes: Uint8Array, offset: number): number =>
	bytes[offset] * 0x1000000 +
	((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);

export const isTundra = (bytes: Uint8Array): boolean =>
	bytes.length >= HEADER_SIZE && bytesToString(bytes, 1, 8) === TUNDRA_ID;

/** RGB word -> default palette index, so classic-colored art stays indexed. */
const defaultPaletteLookup = (() => {
	const map = new Map<number, number>();
	createDefaultPaletteRGB().forEach((rgb, i) => {
		if (!map.has(rgb)) {
			map.set(rgb, i);
		}
	});
	return map;
})();

const colorWordFor = (r: number, g: number, b: number): number => {
	const rgb = rgbColor(r, g, b);
	const index = defaultPaletteLookup.get(rgb);
	return index === undefined ? rgb : paletteColor(index);
};

export const decodeTundra = (bytes: Uint8Array): DecodeResult => {
	const sauce = parseSauce(bytes);
	if (!isTundra(bytes)) {
		throw new CodecError('not a TUNDRA24 file (bad signature)');
	}
	const columns =
		sauce && sauce.tInfo1 > 0 ? sauce.tInfo1 : DEFAULT_TUNDRA_COLUMNS;
	const size = sauce ? Math.min(sauce.payloadSize, bytes.length) : bytes.length;

	// Pass 1 parses the stream; pass 2 replays it into the planes once
	// the final cursor row has fixed the height (PabloDraw sizes the
	// canvas to cursorY + 1, trailing jumps included).
	const parse = (
		place?: (index: number, glyph: number, fg: number, bg: number) => void,
	): number => {
		let pos = HEADER_SIZE;
		let x = 0;
		let y = 0;
		let fg = paletteColor(0);
		let bg = paletteColor(0);
		const insert = (char: number): void => {
			if (x >= columns) {
				x = 0;
				y++;
			}
			if (y < MAX_TUNDRA_ROWS && place) {
				place(y * columns + x, glyphWord(char, 0), fg, bg);
			}
			x++;
		};
		while (pos < size) {
			const command = bytes[pos++];
			if (command === 1) {
				if (pos + 8 > size) {
					break; // truncated mid-command: stop cleanly, like Pablo's EOF catch
				}
				y = readBE32(bytes, pos);
				x = readBE32(bytes, pos + 4);
				pos += 8;
			} else if (command > 1 && command <= 6) {
				const needed = 1 + (command & 2 ? 4 : 0) + (command & 4 ? 4 : 0);
				if (pos + needed > size) {
					break;
				}
				const char = bytes[pos++];
				if (command & 2) {
					fg = colorWordFor(bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
					pos += 4;
				}
				if (command & 4) {
					bg = colorWordFor(bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
					pos += 4;
				}
				insert(char);
			} else {
				insert(command);
			}
			if (y >= MAX_TUNDRA_ROWS) {
				break;
			}
		}
		return y;
	};

	const finalY = parse();
	const rows = Math.max(1, Math.min(finalY, MAX_TUNDRA_ROWS - 1) + 1);
	const doc = createDocV3({
		columns,
		rows,
		mode: 'free',
		iceColors: true,
		letterSpacing: sauce?.letterSpacing ?? false,
	});
	const frame = doc.frames[0];
	parse((index, glyph, fg, bg) => {
		if (index < frame.glyph.length) {
			frame.glyph[index] = glyph;
			frame.fg[index] = fg;
			frame.bg[index] = bg;
		}
	});

	return {
		doc,
		meta: sauce
			? {
					title: sauce.title,
					author: sauce.author,
					group: sauce.group,
					comments: sauce.comments.join('\n'),
					fontName: sauce.fontName,
				}
			: {},
		sauce,
	};
};

export interface EncodeTundraOptions {
	meta?: DocMeta;
	date?: Date;
}

const writeBE32 = (out: number[], value: number): void => {
	out.push((value >>> 24) & 0xff, (value >>> 16) & 0xff);
	out.push((value >>> 8) & 0xff, value & 0xff);
};

/** Payload + 0x1a + SAUCE (Character/TundraDraw, ice always on). */
export const encodeTundra = (
	doc: DocV3,
	options: EncodeTundraOptions = {},
): Uint8Array => {
	const columns = doc.getColumns();
	const rows = doc.getRows();
	const frame = doc.frames[0];
	const table = doc.glyphTable;

	const resolveRGB = (word: number, index: number): number => {
		if (!isPaletteColor(word)) {
			return word;
		}
		const slot = paletteIndexOf(word);
		if (slot >= doc.palette.length) {
			throw new CodecError(
				`cell ${index}: palette index ${slot} outside the doc palette`,
			);
		}
		return doc.palette[slot];
	};

	const out: number[] = [TUNDRA_VERSION];
	for (let i = 0; i < TUNDRA_ID.length; i++) {
		out.push(TUNDRA_ID.charCodeAt(i));
	}

	// Last row holding an encodable char bounds the stream (FindEndY)
	let endY = -1;
	for (let i = frame.glyph.length - 1; i >= 0; i--) {
		if (glyphIdOf(frame.glyph[i]) > 6) {
			endY = Math.floor(i / columns);
			break;
		}
	}

	let currentFg = doc.palette[0];
	let currentBg = doc.palette[0];
	let blank = true;
	for (let y = 0; y <= endY && y < rows; y++) {
		for (let x = 0; x < columns; x++) {
			const index = y * columns + x;
			const word = frame.glyph[index];
			const char = glyphIdOf(word);
			if (char <= 6) {
				blank = true; // unencodable as a literal: skip, re-anchor later
				continue;
			}
			const def = table.get(char);
			if (
				char > 255 ||
				!def ||
				def.fontSlot !== 0 ||
				def.codepoint !== cp437ToUnicode(char)
			) {
				throw new CodecError(
					`cell ${index}: glyph ${char} is not CP437, tundra cannot hold it`,
				);
			}
			if (attrsOf(word) & ATTR_BLINK) {
				throw new CodecError(
					`cell ${index}: tundra has no blink (ice colors are always on)`,
				);
			}
			if (blank) {
				out.push(1);
				writeBE32(out, y);
				writeBE32(out, x);
				blank = false;
			}
			const fg = resolveRGB(frame.fg[index], index);
			const bg = resolveRGB(frame.bg[index], index);
			let notice = 0;
			// A space never carries a foreground (PabloDraw quirk: its fg
			// is invisible, so the stream state is left untouched)
			if (char !== 32 && fg !== currentFg) {
				notice |= 2;
				currentFg = fg;
			}
			if (bg !== currentBg) {
				notice |= 4;
				currentBg = bg;
			}
			if (notice !== 0) {
				out.push(notice);
			}
			out.push(char);
			if (notice & 2) {
				// TundraDraw requires 0 in the unused alpha byte, not 255
				out.push(0, (currentFg >>> 16) & 0xff);
				out.push((currentFg >>> 8) & 0xff, currentFg & 0xff);
			}
			if (notice & 4) {
				out.push(0, (currentBg >>> 16) & 0xff);
				out.push((currentBg >>> 8) & 0xff, currentBg & 0xff);
			}
		}
	}

	const payload = Uint8Array.from(out);
	const meta = options.meta ?? {};
	const sauce = buildSauce({
		dataType: 1,
		fileType: 8, // SAUCE Character/TundraDraw
		fileSize: payload.length,
		columns,
		rows: Math.min(rows, 0xffff),
		iceColors: true,
		letterSpacing: doc.getLetterSpacing(),
		title: meta.title,
		author: meta.author,
		group: meta.group,
		comments: meta.comments,
		fontName: meta.fontName,
		date: options.date,
	});
	return concatBytes([payload, Uint8Array.of(0x1a), sauce]);
};
