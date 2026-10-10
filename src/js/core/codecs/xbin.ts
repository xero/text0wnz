/**
 * XBin codec (docs/xb-format.md is normative): header, optional 48-byte
 * 6-bit palette, optional font (256 or 512 glyphs x fontHeight bytes,
 * 8px wide), raw or RLE cell data. Ports the v2 loader/saver semantics
 * byte-for-byte, including the save fixes P1 landed (512-glyph flag bit
 * 4, unscaled font height, RLE only when it is actually smaller).
 */

import { DocV3, expand6to8, rgbColor } from '../doc.js';
import { u16ToV3, v3ToU16 } from '../convert.js';
import { SauceRecord, buildSauce, parseSauce } from './sauce.js';
import {
	CodecError,
	bytesToString,
	bytesToU16Cells,
	concatBytes,
	u16CellsToBytes,
} from './util.js';
import { DocMeta } from './bin.js';

export interface XBinDecodeResult {
	doc: DocV3;
	meta: DocMeta;
	sauce: SauceRecord | null;
	/** Raw embedded 6-bit palette (48 bytes) for byte-identical resaves. */
	palette6: Uint8Array | null;
	/** Embedded font bytes (8px wide), 256 or 512 glyphs. */
	fontBytes: Uint8Array | null;
	fontHeight: number;
	font512: boolean;
}

/** v2 uncompress port: RLE counter = (runType << 6) | (runLength - 1). */
const uncompress = (
	bytes: Uint8Array,
	dataIndex: number,
	end: number,
	columns: number,
	rows: number,
): Uint16Array => {
	const data = new Uint16Array(columns * rows);
	let i = dataIndex;
	let j = 0;
	while (i < end && j < data.length) {
		const value = bytes[i++];
		const count = value & 0x3f;
		switch (value >> 6) {
			case 1: {
				const char = bytes[i++];
				for (let k = 0; k <= count && j < data.length; k++) {
					data[j++] = (char << 8) + bytes[i++];
				}
				break;
			}
			case 2: {
				const attribute = bytes[i++];
				for (let k = 0; k <= count && j < data.length; k++) {
					data[j++] = (bytes[i++] << 8) + attribute;
				}
				break;
			}
			case 3: {
				const char = bytes[i++];
				const attribute = bytes[i++];
				for (let k = 0; k <= count && j < data.length; k++) {
					data[j++] = (char << 8) + attribute;
				}
				break;
			}
			default:
				for (let k = 0; k <= count && j < data.length; k++) {
					data[j++] = (bytes[i++] << 8) + bytes[i++];
				}
		}
	}
	return data;
};

/** v2 compressXBin port; runs never cross row boundaries, max run 64. */
export const compressXBin = (
	imageData: Uint16Array,
	columns: number,
	rows: number,
): Uint8Array => {
	const output: number[] = [];
	for (let row = 0; row < rows; row++) {
		const rowStart = row * columns;
		const rowEnd = rowStart + columns;
		let i = rowStart;
		while (i < rowEnd) {
			const cell = imageData[i];
			const char = cell >> 8;
			const attr = cell & 255;
			let runBoth = 1;
			while (
				i + runBoth < rowEnd &&
				runBoth < 64 &&
				imageData[i + runBoth] === cell
			) {
				runBoth++;
			}
			let runChar = 1;
			while (
				i + runChar < rowEnd &&
				runChar < 64 &&
				imageData[i + runChar] >> 8 === char
			) {
				runChar++;
			}
			let runAttr = 1;
			while (
				i + runAttr < rowEnd &&
				runAttr < 64 &&
				(imageData[i + runAttr] & 255) === attr
			) {
				runAttr++;
			}
			if (runBoth > 1 && runBoth >= runChar && runBoth >= runAttr) {
				output.push(0xc0 | (runBoth - 1), char, attr);
				i += runBoth;
			} else if (runChar > 1 && runChar >= runAttr) {
				output.push(0x40 | (runChar - 1), char);
				for (let k = 0; k < runChar; k++) {
					output.push(imageData[i + k] & 255);
				}
				i += runChar;
			} else if (runAttr > 1) {
				output.push(0x80 | (runAttr - 1), attr);
				for (let k = 0; k < runAttr; k++) {
					output.push(imageData[i + k] >> 8);
				}
				i += runAttr;
			} else {
				// Collect literal cells until the next run of two or more
				let literal = 1;
				while (i + literal + 1 < rowEnd && literal < 64) {
					const next = imageData[i + literal];
					const after = imageData[i + literal + 1];
					if (
						next === after ||
						next >> 8 === after >> 8 ||
						(next & 255) === (after & 255)
					) {
						break;
					}
					literal++;
				}
				if (i + literal === rowEnd - 1 && literal < 64) {
					literal++;
				}
				output.push(literal - 1);
				for (let k = 0; k < literal; k++) {
					output.push(imageData[i + k] >> 8, imageData[i + k] & 255);
				}
				i += literal;
			}
		}
	}
	return new Uint8Array(output);
};

export const decodeXBin = (bytes: Uint8Array): XBinDecodeResult => {
	if (bytesToString(bytes, 0, 4) !== 'XBIN' || bytes[4] !== 0x1a) {
		throw new CodecError('not an XBin file (bad magic)');
	}
	const sauce = parseSauce(bytes);
	const columns = (bytes[6] << 8) + bytes[5];
	const rows = (bytes[8] << 8) + bytes[7];
	const fontHeight = bytes[9];
	const flags = bytes[10];
	const paletteFlag = (flags & 0x01) === 1;
	const fontFlag = ((flags >> 1) & 0x01) === 1;
	const compressFlag = ((flags >> 2) & 0x01) === 1;
	const iceColors = ((flags >> 3) & 0x01) === 1;
	const font512 = ((flags >> 4) & 0x01) === 1;
	let dataIndex = 11;

	let palette6: Uint8Array | null = null;
	if (paletteFlag) {
		palette6 = bytes.slice(dataIndex, dataIndex + 48);
		dataIndex += 48;
	}

	let fontBytes: Uint8Array | null = null;
	if (fontFlag) {
		const fontDataSize = (font512 ? 512 : 256) * fontHeight;
		fontBytes = bytes.slice(dataIndex, dataIndex + fontDataSize);
		dataIndex += fontDataSize;
	}

	const imageData = compressFlag
		? uncompress(
				bytes,
				dataIndex,
				sauce ? sauce.payloadSize : bytes.length,
				columns,
				rows,
			)
		: bytesToU16Cells(bytes, dataIndex, columns * rows * 2);

	const doc = u16ToV3({ imageData, columns, rows, iceColors });
	if (palette6) {
		for (let i = 0; i < 16; i++) {
			doc.palette[i] = rgbColor(
				expand6to8(palette6[i * 3]),
				expand6to8(palette6[i * 3 + 1]),
				expand6to8(palette6[i * 3 + 2]),
			);
		}
	}
	return {
		doc,
		meta: sauce
			? {
					title: sauce.title,
					author: sauce.author,
					group: sauce.group,
					comments: sauce.comments.join('\n'),
					fontName: 'XBIN',
				}
			: { fontName: 'XBIN' },
		sauce,
		palette6,
		fontBytes,
		fontHeight,
		font512,
	};
};

export interface EncodeXBinOptions {
	/** 48-byte 6-bit palette; derived from doc.palette when omitted. */
	palette6?: Uint8Array | null;
	/** Embedded font (8px wide); omit to write a font-less XBin. */
	fontBytes?: Uint8Array | null;
	fontHeight?: number;
	/** RLE-compress when it wins (default true, the v2 behavior). */
	compress?: boolean;
	meta?: DocMeta;
	date?: Date;
}

/** 8-bit doc palette to the XBin 6-bit space (v2 rgbaToXbin: >> 2). */
export const palette6FromDoc = (doc: DocV3): Uint8Array => {
	const palette6 = new Uint8Array(48);
	for (let i = 0; i < 16; i++) {
		const word = doc.palette[i] ?? 0;
		palette6[i * 3] = Math.min((word >>> 16) & 0xff, 255) >> 2;
		palette6[i * 3 + 1] = Math.min((word >>> 8) & 0xff, 255) >> 2;
		palette6[i * 3 + 2] = Math.min(word & 0xff, 255) >> 2;
	}
	return palette6;
};

export const encodeXBin = (
	doc: DocV3,
	options: EncodeXBinOptions = {},
): Uint8Array => {
	const { imageData, columns, rows, iceColors } = v3ToU16(doc);
	const palette6 = options.palette6 ?? palette6FromDoc(doc);
	const fontBytes = options.fontBytes ?? null;
	const fontHeight = options.fontHeight ?? 16;
	const compress = options.compress ?? true;

	let flags = 0x01; // palette always embedded (v2 behavior)
	if (fontBytes) {
		flags |= 1 << 1;
		if (fontBytes.length === fontHeight * 512) {
			flags |= 1 << 4;
		}
	}
	if (iceColors) {
		flags |= 1 << 3;
	}

	const rawBytes = u16CellsToBytes(imageData);
	let imageBytes = rawBytes;
	if (compress) {
		const compressed = compressXBin(imageData, columns, rows);
		if (compressed.length < rawBytes.length) {
			imageBytes = compressed;
			flags |= 1 << 2;
		}
	}

	const header = Uint8Array.of(
		0x58, // X
		0x42, // B
		0x49, // I
		0x4e, // N
		0x1a,
		columns & 0xff,
		columns >> 8,
		rows & 0xff,
		rows >> 8,
		fontHeight,
		flags,
	);
	const parts = [header, palette6];
	if (fontBytes) {
		parts.push(fontBytes);
	}
	parts.push(imageBytes);
	const payload = concatBytes(parts);

	const meta = options.meta ?? {};
	const sauce = buildSauce({
		dataType: 6,
		fileSize: payload.length,
		columns,
		rows,
		title: meta.title,
		author: meta.author,
		group: meta.group,
		comments: meta.comments,
		flagsAndTInfo: false,
		date: options.date,
	});
	return concatBytes([payload, Uint8Array.of(0x1a), sauce]);
};
