/**
 * SAUCE record parse/build. docs/sauce-format.md is normative; its
 * teXt0wnz Implementation Notes record every choice the spec leaves
 * open and every reader leniency.
 */

import { cp437ToUnicode, unicodeToCp437 } from '../cp437.js';
import {
	readLE16,
	readLE32,
	stringField,
	writeLE16,
	writeLE32,
	writeText,
} from './util.js';

/**
 * SAUCE §Layout Character and ZString text: CP437 up to the first NUL,
 * since some writers terminate there and leave garbage behind (note 3).
 * The trim runs on bytes, before the map: CP437 0xA0 is á, and a
 * Unicode whitespace trim would eat it. Decoding through the map is
 * what lets buildSauce write the same bytes back.
 */
const textField = (bytes: Uint8Array, offset: number, size: number): string => {
	let end = offset;
	while (end < offset + size && bytes[end] !== 0) {
		end++;
	}
	while (
		end > offset &&
		(bytes[end - 1] === 0x20 ||
			(bytes[end - 1] >= 0x09 && bytes[end - 1] <= 0x0d))
	) {
		end--;
	}
	let text = '';
	for (let i = offset; i < end; i++) {
		text += String.fromCodePoint(cp437ToUnicode(bytes[i]));
	}
	return text;
};

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
	/** SAUCE §FontName (TInfoS), raw; the app mapping stays client-side. */
	fontName: string;
	comments: string[];
	iceColors: boolean;
	letterSpacing: boolean;
	/**
	 * Payload length the record implies: fileSize when sane, else
	 * everything before the COMNT block (when present) and the EOF
	 * byte, like PabloDraw; keeping the block would decode comment
	 * text as art rows.
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
		title: textField(bytes, at + 7, 35),
		author: textField(bytes, at + 42, 20),
		group: textField(bytes, at + 62, 20),
		date: stringField(bytes, at + 82, 8),
		fileSize: readLE32(bytes, at + 90),
		dataType: bytes[at + 94],
		fileType: bytes[at + 95],
		tInfo1: readLE16(bytes, at + 96),
		tInfo2: readLE16(bytes, at + 98),
		tInfo3: readLE16(bytes, at + 100),
		tInfo4: readLE16(bytes, at + 102),
		flags: bytes[at + 105],
		fontName: textField(bytes, at + 106, 22),
		comments: [],
		iceColors: (bytes[at + 105] & 0x01) === 1,
		letterSpacing: ((bytes[at + 105] >> 1) & 0x03) === 2,
		payloadSize: 0,
	};
	const commentsCount = bytes[at + 104];
	let payloadEnd = at;
	if (commentsCount > 0) {
		const blockStart = bytes.length - 128 - commentsCount * 64 - 5;
		if (blockStart >= 0 && stringField(bytes, blockStart, 5) === 'COMNT') {
			for (let i = 0; i < commentsCount; i++) {
				record.comments.push(textField(bytes, blockStart + 5 + i * 64, 64));
			}
			payloadEnd = blockStart;
		}
	}
	if (payloadEnd > 0 && bytes[payloadEnd - 1] === 0x1a) {
		payloadEnd -= 1;
	}
	record.payloadSize =
		record.fileSize > 0 && record.fileSize < bytes.length
			? record.fileSize
			: payloadEnd;
	if (record.version !== '00') {
		// SAUCE §Layout note 6: an unknown version is not the 00 layout.
		// Pre-standard writers leave TFlags and TInfoS as stale file
		// bytes that would force ice and spacing, so the record only
		// fences the payload
		return {
			...record,
			title: '',
			author: '',
			group: '',
			date: '',
			dataType: 0,
			fileType: 0,
			tInfo1: 0,
			tInfo2: 0,
			tInfo3: 0,
			tInfo4: 0,
			flags: 0,
			fontName: '',
			comments: [],
			iceColors: false,
			letterSpacing: false,
		};
	}
	return record;
};

/**
 * Comment text cut to the 255 COMNT slots the count byte can hold
 * (SAUCE §Layout), and the slots it fills. The cap matches moebius-web,
 * since a count that wraps mod 256 orphans the block. Each code point
 * writes one CP437 byte and each line takes at least one 64-byte slot,
 * so the Sauce Editor counter and buildSauce agree on what a save keeps.
 */
export const fitComments = (text: string): [string, number] => {
	const kept: string[] = [];
	let slots = 0;
	for (const line of text ? text.split('\n') : []) {
		const room = 255 - slots;
		if (!room) {
			break;
		}
		const chars = [...line];
		const need = Math.max(1, Math.ceil(chars.length / 64));
		kept.push(need > room ? chars.slice(0, room * 64).join('') : line);
		slots += Math.min(need, room);
	}
	return [kept.join('\n'), slots];
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
	/** Newline-separated; lines chunk into 64-byte comment lines. */
	comments?: string;
	iceColors?: boolean;
	letterSpacing?: boolean;
	/** SAUCE §FontName (TInfoS); written only with the flags byte. */
	fontName?: string;
	/** XBin passes false: SAUCE §FileType gives XBin no Flags or TInfoS. */
	flagsAndTInfo?: boolean;
	/**
	 * Raw SAUCE §ANSiFlags AR bits ((flags >> 3) & 3) carried from an
	 * opened file so a resave round-trips the author's intent verbatim;
	 * new docs write 0 (no preference) like moebiusXBIN.
	 */
	aspect?: number;
	/**
	 * Raw SAUCE §ANSiFlags LS bits; 0 means "no preference" and survives
	 * a resave when the artist never touched letter spacing. Defaults to
	 * the explicit 1/2 encoding of the letterSpacing boolean.
	 */
	letterSpacingMode?: number;
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

	// SAUCE §Layout: Character fields are CP437 bytes; UTF-8 here would
	// mangle non-ASCII metadata for every reader, our own reopen too
	const cp437Bytes = (text: string): number[] => {
		const out: number[] = [];
		for (const ch of text) {
			out.push(unicodeToCp437(ch.codePointAt(0) ?? 63) ?? 63);
		}
		return out;
	};

	// PabloDraw SauceInfo.cs, SauceComment.Save: a blank line writes a
	// slot of spaces and leading spaces stay; the reader trims only the
	// trailing padding, so indented and spaced out comments survive a
	// resave. Chunk the encoded bytes, not UTF-16 chars, so every 64-byte
	// slot stays aligned for every reader
	const [fitted, commentsCount] = fitComments(comments);
	const commentBytes: number[] = [];
	for (const line of commentsCount ? fitted.split('\n') : []) {
		const lineBytes = cp437Bytes(line);
		for (let pos = 0; pos === 0 || pos < lineBytes.length; pos += 64) {
			commentBytes.push(
				...Array.from({ length: 64 }, (_, i) => lineBytes[pos + i] ?? 0x20),
			);
		}
	}

	const record = new Uint8Array(128);
	writeText(record, 0, 7, 'SAUCE00');
	record.fill(0x20, 7, 82);
	record.set(cp437Bytes(title).slice(0, 35), 7);
	record.set(cp437Bytes(author).slice(0, 20), 42);
	record.set(cp437Bytes(group).slice(0, 20), 62);

	const date = options.date ?? new Date();
	const stamp =
		`${date.getFullYear()}` +
		`${(date.getMonth() + 1).toString(10).padStart(2, '0')}` +
		`${date.getDate().toString(10).padStart(2, '0')}`;
	writeText(record, 82, 8, stamp);

	writeLE32(record, 90, fileSize);
	record[94] = dataType;

	if (dataType === 5) {
		// SAUCE §FileType, BinaryText: FileType holds width/2, no TInfo dims
		record[95] = (columns / 2) & 0xff;
	} else {
		record[95] = fileType;
		writeLE16(record, 96, columns);
		writeLE16(record, 98, rows);
	}

	record[104] = commentsCount;

	if (dataType !== 6 && flagsAndTInfo) {
		let flags = (options.aspect ?? 0) << 3;
		if (iceColors) {
			flags |= 1;
		}
		const lsMode = options.letterSpacingMode ?? (letterSpacing ? 2 : 1);
		flags |= (lsMode & 0x03) << 1;
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
	block.set(commentBytes, 5);
	block.set(record, 5 + commentsCount * 64);
	return block;
};
