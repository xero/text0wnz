/**
 * Lossless converters between the v2 flat-Uint16Array doc
 * (`charCode<<8 | bg<<4 | fg`) and the v3 three-plane model
 * (PLAN.md §4 P2: "u16<->v3 lossless converters").
 *
 * Blink is the one semantic fold: in v2 a bright background (bg 8-15)
 * MEANS blink when the doc's ice flag is off. v3 stores that
 * interpretation explicitly (attr bit 0 + dim bg index), so conversion
 * is only defined per-document with its ice flag, and the round-trip
 * law holds for both flag values:
 *   v3ToU16(u16ToV3(data, ice)) === { data, ice }
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
	rgbOf,
} from './doc.js';
import { cp437ToUnicode, unicodeToCp437Strict } from './cp437.js';
import { xterm256RGB } from './codecs/dur.js';

export class ConvertError extends Error {
	readonly cellIndex: number;
	constructor(message: string, cellIndex: number) {
		super(`[core/convert] ${message} (cell ${cellIndex})`);
		this.cellIndex = cellIndex;
	}
}

export interface U16Doc {
	imageData: Uint16Array;
	columns: number;
	rows: number;
	iceColors: boolean;
	letterSpacing?: boolean;
}

export const u16ToV3 = (source: U16Doc): DocV3 => {
	const { imageData, columns, rows, iceColors } = source;
	if (imageData.length !== columns * rows) {
		throw new ConvertError(
			`imageData length ${imageData.length} != ${columns}x${rows}`,
			-1,
		);
	}
	const doc = createDocV3({
		columns,
		rows,
		mode: 'classic16',
		iceColors,
		letterSpacing: source.letterSpacing ?? false,
	});
	const { glyph, fg, bg } = doc.frames[0];
	for (let i = 0; i < imageData.length; i++) {
		const word = imageData[i];
		const charCode = word >> 8;
		const fgIndex = word & 0x0f;
		const bgNibble = (word >> 4) & 0x0f;
		// ice on: bg 8-15 is a real bright background; ice off: the high
		// bit means blink and the visible background is the dim half
		const blink = !iceColors && bgNibble > 7;
		const bgIndex = blink ? bgNibble & 7 : bgNibble;
		glyph[i] = glyphWord(charCode, blink ? ATTR_BLINK : 0);
		fg[i] = paletteColor(fgIndex);
		bg[i] = paletteColor(bgIndex);
	}
	return doc;
};

/**
 * Strict inverse: throws ConvertError on any cell the u16 model cannot
 * express (non-CP437-identity glyph, raw-RGB or out-of-range palette
 * color, blink in an ice doc). The P2 format-budget linter grows from
 * these checks.
 */
export const v3ToU16 = (doc: DocV3, frameIndex = 0): U16Doc => {
	const frame = doc.frames[frameIndex];
	if (!frame) {
		throw new ConvertError(`frame ${frameIndex} out of range`, -1);
	}
	const columns = doc.getColumns();
	const rows = doc.getRows();
	const iceColors = doc.getIceColors();
	const imageData = new Uint16Array(columns * rows);
	for (let i = 0; i < imageData.length; i++) {
		const glyphId = glyphIdOf(frame.glyph[i]);
		const attrs = attrsOf(frame.glyph[i]);
		const def = doc.glyphTable.get(glyphId);
		if (
			glyphId > 0xff ||
			!def ||
			def.fontSlot !== 0 ||
			def.codepoint !== cp437ToUnicode(glyphId)
		) {
			throw new ConvertError(`glyph ${glyphId} is not CP437-identity`, i);
		}
		if (attrs & ~ATTR_BLINK) {
			throw new ConvertError(
				`attrs 0x${attrs.toString(16)} unsupported in u16`,
				i,
			);
		}
		const blink = (attrs & ATTR_BLINK) !== 0;
		if (!isPaletteColor(frame.fg[i]) || !isPaletteColor(frame.bg[i])) {
			throw new ConvertError('raw RGB color has no u16 form', i);
		}
		const fgIndex = paletteIndexOf(frame.fg[i]);
		const bgIndex = paletteIndexOf(frame.bg[i]);
		if (fgIndex > 15) {
			throw new ConvertError(`fg palette index ${fgIndex} > 15`, i);
		}
		if (blink) {
			if (iceColors) {
				throw new ConvertError('blink cell in an ice doc has no u16 form', i);
			}
			if (bgIndex > 7) {
				throw new ConvertError(
					`blink with bright bg ${bgIndex} has no u16 form`,
					i,
				);
			}
		} else if (bgIndex > (iceColors ? 15 : 7)) {
			throw new ConvertError(`bg palette index ${bgIndex} needs ice colors`, i);
		}
		const bgNibble = blink ? bgIndex | 8 : bgIndex;
		imageData[i] = (glyphId << 8) | (bgNibble << 4) | fgIndex;
	}
	return {
		imageData,
		columns,
		rows,
		iceColors,
		letterSpacing: doc.getLetterSpacing(),
	};
};

/**
 * Lossy projection for docs the u16 model cannot express: the chunk
 * fallback renderer, the collab protocol (u16 until P4), and the tools'
 * classic16 view all read this after a tnd/dur/envelope import. Raw-RGB
 * and high palette colors quantize to the nearest default-palette entry
 * (foregrounds over 16, backgrounds over the blink-legal range), and
 * non-CP437 glyphs degrade to '?' exactly like v2's lenient UTF-8
 * reader. Never use this where v3ToU16's strictness is the point.
 */
/**
 * Quantize any color word to a classic palette index below `limit`:
 * in-range indexes pass through, everything else (raw RGB, indexes
 * beyond the limit) lands on the nearest default-palette entry. The
 * single source of truth for every lossy 16-color projection (the u16
 * mirror, the vanilla collab wire, exports). Takes anything carrying a
 * doc-shaped palette so the server's room (no DocV3) can use it too.
 */
export const quantizeColorWord = (
	word: number,
	doc: { palette: Uint32Array },
	limit = 16,
): number => {
	if (isPaletteColor(word)) {
		const index = paletteIndexOf(word);
		if (index < limit) {
			return index;
		}
	}
	// indexes beyond the doc palette resolve through the canonical xterm
	// table, exactly like the GL renderer's palette texture
	const index = isPaletteColor(word) ? paletteIndexOf(word) : -1;
	const rgbWord =
		index >= 0
			? (doc.palette[index] ?? xterm256RGB(index & 0xff))
			: word & 0x00ffffff;
	const defaults = createDefaultPaletteRGB();
	const { r, g, b } = rgbOf(rgbWord);
	let best = 0;
	let bestDistance = Infinity;
	for (let i = 0; i < limit; i++) {
		const entry = rgbOf(defaults[i]);
		const distance =
			(entry.r - r) * (entry.r - r) +
			(entry.g - g) * (entry.g - g) +
			(entry.b - b) * (entry.b - b);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = i;
		}
	}
	return best;
};

export const v3ToU16Lossy = (doc: DocV3, frameIndex = 0): U16Doc => {
	const frame = doc.frames[frameIndex];
	if (!frame) {
		throw new ConvertError(`frame ${frameIndex} out of range`, -1);
	}
	const columns = doc.getColumns();
	const rows = doc.getRows();
	const iceColors = doc.getIceColors();
	const imageData = new Uint16Array(columns * rows);

	const toIndex = (word: number, limit: number): number =>
		quantizeColorWord(word, doc, limit);

	for (let i = 0; i < imageData.length; i++) {
		const glyphId = glyphIdOf(frame.glyph[i]);
		const blink = (attrsOf(frame.glyph[i]) & ATTR_BLINK) !== 0 && !iceColors;
		const def = doc.glyphTable.get(glyphId);
		let charCode: number;
		if (
			glyphId <= 0xff &&
			def &&
			def.fontSlot === 0 &&
			def.codepoint === cp437ToUnicode(glyphId)
		) {
			charCode = glyphId;
		} else {
			charCode = (def && unicodeToCp437Strict(def.codepoint)) ?? 63; // '?'
		}
		const fgIndex = toIndex(frame.fg[i], 16);
		// without ice a bright background nibble MEANS blink, so non-blink
		// cells may only quantize into the dim half
		const bgLimit = iceColors ? 16 : 8;
		const bgIndex = toIndex(frame.bg[i], bgLimit) & (blink ? 7 : 15);
		const bgNibble = blink ? bgIndex | 8 : bgIndex;
		imageData[i] = (charCode << 8) | (bgNibble << 4) | (fgIndex & 15);
	}
	return {
		imageData,
		columns,
		rows,
		iceColors,
		letterSpacing: doc.getLetterSpacing(),
	};
};
