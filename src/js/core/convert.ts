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
	createDocV3,
	glyphIdOf,
	glyphWord,
	isPaletteColor,
	paletteColor,
	paletteIndexOf,
} from './doc.js';
import { cp437ToUnicode } from './cp437.js';

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
