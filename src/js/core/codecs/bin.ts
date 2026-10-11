/**
 * BIN (raw binary text) codec. Headerless char/attr pairs at a known
 * width: SAUCE BinaryText FileType (width/2) when set, the 160-column
 * default otherwise. Rows always derive from payload size and width;
 * binary data has no newlines to count (the v2 fix this ports).
 */

import { DocV3 } from '../doc.js';
import { u16ToV3, v3ToU16 } from '../convert.js';
import { SauceRecord, buildSauce, parseSauce } from './sauce.js';
import {
	CodecError,
	bytesToU16Cells,
	concatBytes,
	u16CellsToBytes,
} from './util.js';

export interface DocMeta {
	title?: string;
	author?: string;
	group?: string;
	comments?: string;
	/** SAUCE font name (TInfoS), raw. */
	fontName?: string;
}

export interface DecodeResult {
	doc: DocV3;
	meta: DocMeta;
	sauce: SauceRecord | null;
}

export const DEFAULT_BIN_COLUMNS = 160;

export const decodeBin = (bytes: Uint8Array): DecodeResult => {
	const sauce = parseSauce(bytes);
	const columns =
		sauce && sauce.dataType === 5 && sauce.fileType > 0
			? sauce.fileType * 2
			: DEFAULT_BIN_COLUMNS;
	const payloadSize = sauce
		? sauce.fileSize > 0
			? sauce.fileSize
			: bytes.length
		: bytes.length;
	const rows = Math.floor(payloadSize / columns / 2);
	const imageData = bytesToU16Cells(bytes, 0, columns * rows * 2);
	const doc = u16ToV3({
		imageData,
		columns,
		rows,
		iceColors: sauce?.iceColors ?? false,
		letterSpacing: sauce?.letterSpacing ?? false,
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

export interface EncodeBinOptions {
	meta?: DocMeta;
	date?: Date;
}

/** Payload + 0x1a + SAUCE, the v2 saveFile layout. */
export const encodeBin = (
	doc: DocV3,
	options: EncodeBinOptions = {},
): Uint8Array => {
	const { imageData, columns, rows, iceColors } = v3ToU16(doc);
	if (columns % 2 !== 0) {
		throw new CodecError(`BIN needs an even column count, got ${columns}`);
	}
	const payload = u16CellsToBytes(imageData);
	const meta = options.meta ?? {};
	const sauce = buildSauce({
		dataType: 5,
		fileSize: payload.length,
		columns,
		rows,
		iceColors,
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
