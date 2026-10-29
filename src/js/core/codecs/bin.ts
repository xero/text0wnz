/**
 * BIN (raw binary text) codec. Headerless char/attr pairs at a known
 * width: the SAUCE §FileType BinaryText width/2 when set, the
 * 160-column default otherwise. Rows always derive from payload size
 * and width; binary data has no newlines to count.
 */

import { DocV3 } from '../doc.js';
import { u16ToV3, v3ToU16Lossy } from '../convert.js';
import { MAX_DOC_CELLS } from '../doc.js';
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
	/** SAUCE §FontName (TInfoS), raw. */
	fontName?: string;
	/** Raw SAUCE §ANSiFlags AR bits from an opened file (round trip). */
	aspect?: number;
	/** Raw SAUCE §ANSiFlags LS bits; 0 round-trips "no preference". */
	letterSpacingMode?: number;
}

export interface DecodeResult {
	doc: DocV3;
	meta: DocMeta;
	sauce: SauceRecord | null;
}

export const DEFAULT_BIN_COLUMNS = 160;

export const decodeBin = (bytes: Uint8Array): DecodeResult => {
	const sauce = parseSauce(bytes);
	// FileType 1 reads as unset like PabloDraw (Binary.cs, GetWidth):
	// wild BINs stamp it as the ANSi file type. TInfo1 never counts,
	// since generic SAUCE adders stamp 80 on 160-column BINs
	const columns =
		sauce && sauce.dataType === 5 && sauce.fileType > 1
			? sauce.fileType * 2
			: DEFAULT_BIN_COLUMNS;
	// payloadSize already subtracts the COMNT block and EOF when the
	// record's fileSize is 0; a whole-length fallback would decode the
	// SAUCE trailer as extra canvas rows
	const payloadSize = sauce ? sauce.payloadSize : bytes.length;
	// a trailing partial row pads instead of flooring away: PabloDraw
	// and moebiusXBIN both keep it. Whole cells only: a lone odd byte
	// is no cell and must not open a blank row
	const rows = Math.max(1, Math.ceil(Math.floor(payloadSize / 2) / columns));
	if (columns * rows > MAX_DOC_CELLS) {
		throw new CodecError(`BIN ${columns}x${rows} exceeds the cell ceiling`);
	}
	// allocate whole rows; the copy stops at the payload so the SAUCE
	// trailer never leaks into cells and the tail pads with zeros
	const imageData = new Uint16Array(columns * rows);
	imageData.set(
		bytesToU16Cells(bytes, 0, Math.min(columns * rows * 2, payloadSize)),
	);
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
	/** Frame to export (BIN holds one); defaults to the first. */
	frameIndex?: number;
	meta?: DocMeta;
	date?: Date;
}

/** Payload + 0x1a + SAUCE, the v2 saveFile layout. */
export const encodeBin = (
	doc: DocV3,
	options: EncodeBinOptions = {},
): Uint8Array => {
	// lossy on purpose: the export modal already warned about anything
	// the format cannot hold, so quantize instead of throwing
	const { imageData, columns, rows, iceColors } = v3ToU16Lossy(
		doc,
		options.frameIndex ?? 0,
	);
	if (columns % 2 !== 0) {
		throw new CodecError(`BIN needs an even column count, got ${columns}`);
	}
	if (columns > 510) {
		// SAUCE §FileType: the BinaryText FileType byte holds width/2, so
		// wider would silently wrap mod 256 and reload scrambled
		throw new CodecError(`BIN caps at 510 columns, got ${columns}`);
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
		aspect: meta.aspect,
		letterSpacingMode: meta.letterSpacingMode,
		date: options.date,
	});
	return concatBytes([payload, Uint8Array.of(0x1a), sauce]);
};
