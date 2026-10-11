/**
 * SAUCE record parse/build (docs/sauce-format.md is normative; semantics
 * ported byte-for-byte from the v2 client in file.js, including its
 * leniencies: TInfo 0 and BinaryText FileType 0 read as "unspecified",
 * trailing whitespace trims, comment chunks of 64).
 */

import {
	readLE16,
	readLE32,
	stringField,
	writeLE16,
	writeLE32,
	writeText,
} from './util.js';

export interface SauceRecord {
	version: string;
	title: string;
	author: string;
	group: string;
	date: string;
	fileSize: number;
	dataType: number;
	fileType: number;
	tInfo1: number;
	tInfo2: number;
	tInfo3: number;
	tInfo4: number;
	flags: number;
	/** TInfoS field: SAUCE font name (raw; app mapping stays client-side). */
	fontName: string;
	comments: string[];
	iceColors: boolean;
	letterSpacing: boolean;
	/**
	 * Payload length the record implies: fileSize when sane, else
	 * total length minus the 128-byte record (v2 File.size semantics,
	 * comment block deliberately NOT subtracted, quirk and all).
	 */
	payloadSize: number;
}

export const parseSauce = (bytes: Uint8Array): SauceRecord | null => {
	if (bytes.length < 128) {
		return null;
	}
	const at = bytes.length - 128;
	if (stringField(bytes, at, 5) !== 'SAUCE') {
		return null;
	}
	const record: SauceRecord = {
		version: stringField(bytes, at + 5, 2),
		title: stringField(bytes, at + 7, 35),
		author: stringField(bytes, at + 42, 20),
		group: stringField(bytes, at + 62, 20),
		date: stringField(bytes, at + 82, 8),
		fileSize: readLE32(bytes, at + 90),
		dataType: bytes[at + 94],
		fileType: bytes[at + 95],
		tInfo1: readLE16(bytes, at + 96),
		tInfo2: readLE16(bytes, at + 98),
		tInfo3: readLE16(bytes, at + 100),
		tInfo4: readLE16(bytes, at + 102),
		flags: bytes[at + 105],
		fontName: stringField(bytes, at + 106, 22),
		comments: [],
		iceColors: (bytes[at + 105] & 0x01) === 1,
		letterSpacing: ((bytes[at + 105] >> 1) & 0x03) === 2,
		payloadSize: 0,
	};
	const commentsCount = bytes[at + 104];
	if (commentsCount > 0) {
		const blockStart = bytes.length - 128 - commentsCount * 64 - 5;
		if (blockStart >= 0 && stringField(bytes, blockStart, 5) === 'COMNT') {
			for (let i = 0; i < commentsCount; i++) {
				record.comments.push(stringField(bytes, blockStart + 5 + i * 64, 64));
			}
		}
	}
	record.payloadSize =
		record.fileSize > 0 && record.fileSize < bytes.length
			? record.fileSize
			: bytes.length - 128;
	return record;
};

export interface BuildSauceOptions {
	dataType: number;
	fileType?: number;
	fileSize: number;
	columns: number;
	rows: number;
	title?: string;
	author?: string;
	group?: string;
	/** Newline-separated comment text, chunked to 64 like the v2 modal. */
	comments?: string;
	iceColors?: boolean;
	letterSpacing?: boolean;
	/** SAUCE font name (TInfoS); written only with flags. */
	fontName?: string;
	/** XBin passes false: no flags byte, no font name (v2 createSauce). */
	flagsAndTInfo?: boolean;
	/** Defaults to now; injectable for byte-stable tests. */
	date?: Date;
}

/** COMNT block (when comments exist) + the 128-byte record. */
export const buildSauce = (options: BuildSauceOptions): Uint8Array => {
	const {
		dataType,
		fileType = 0,
		fileSize,
		columns,
		rows,
		title = '',
		author = '',
		group = '',
		comments = '',
		iceColors = false,
		letterSpacing = false,
		fontName = '',
		flagsAndTInfo = true,
	} = options;

	// Chunk comment lines to 64 chars, trimming each chunk and stopping a
	// line at the first empty chunk (v2 createSauce semantics)
	const commentLines = comments.trim() ? comments.trim().split('\n') : [];
	let processed = '';
	let commentsCount = 0;
	for (const line of commentLines) {
		let pos = 0;
		while (pos < line.length) {
			const chunk = line.substring(pos, pos + 64).trim();
			if (chunk.length === 0) {
				break;
			}
			commentsCount++;
			processed += chunk.padEnd(64, ' ');
			pos += 64;
		}
	}

	const record = new Uint8Array(128);
	writeText(record, 0, 7, 'SAUCE00');
	record.fill(0x20, 7, 82);
	// v2 writes these fields as UTF-8 bytes sliced to field width
	const encoder = new TextEncoder();
	record.set(encoder.encode(title).slice(0, 35), 7);
	record.set(encoder.encode(author).slice(0, 20), 42);
	record.set(encoder.encode(group).slice(0, 20), 62);

	const date = options.date ?? new Date();
	const stamp =
		`${date.getFullYear()}` +
		`${(date.getMonth() + 1).toString(10).padStart(2, '0')}` +
		`${date.getDate().toString(10).padStart(2, '0')}`;
	writeText(record, 82, 8, stamp);

	writeLE32(record, 90, fileSize);
	record[94] = dataType;

	if (dataType === 5) {
		// BinaryText: FileType holds width/2, no TInfo dims
		record[95] = (columns / 2) & 0xff;
	} else {
		record[95] = fileType;
		writeLE16(record, 96, columns);
		writeLE16(record, 98, rows);
	}

	record[104] = commentsCount;

	if (dataType !== 6 && flagsAndTInfo) {
		let flags = 1 << 4; // aspect ratio flag, always set by v2
		if (iceColors) {
			flags |= 1;
		}
		flags |= letterSpacing ? 1 << 2 : 1 << 1;
		record[105] = flags;
		if (fontName) {
			writeText(record, 106, 22, fontName);
		}
	}

	if (commentsCount === 0) {
		return record;
	}
	const block = new Uint8Array(5 + commentsCount * 64 + 128);
	writeText(block, 0, 5, 'COMNT');
	block.set(encoder.encode(processed).slice(0, commentsCount * 64), 5);
	block.set(record, 5 + commentsCount * 64);
	return block;
};
