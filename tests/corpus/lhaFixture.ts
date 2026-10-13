/**
 * LHA fixtures: a real amiga colly for the lh5 path (scene releases
 * are made for spreading, and nothing synthesizes lh5 in-repo), plus
 * builders that hand-craft stored (-lh0-) archives at each header
 * level so the header walker is tested byte by byte.
 */

import { crc16 } from '../../src/js/core/codecs/lha.js';

/**
 * iFd-Colly3.lha from asciiarena.se (iNFERNO d-LIGHT, "wre"): four
 * level-0 -lh5- entries, 1,608 bytes. Fetched 2026-10-13 from
 * https://asciiarena.se/collections/iFd-Colly3/iFd-Colly3.lha
 */
const REAL_COLLY_B64 =
	'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';

export const realColly = (): Uint8Array =>
	Uint8Array.from(atob(REAL_COLLY_B64), c => c.charCodeAt(0));

const latin1Bytes = (text: string): Uint8Array =>
	Uint8Array.from(text, c => c.charCodeAt(0) & 0xff);

const le16 = (v: number): number[] => [v & 0xff, (v >> 8) & 0xff];
const le32 = (v: number): number[] => [
	v & 0xff,
	(v >> 8) & 0xff,
	(v >> 16) & 0xff,
	(v >>> 24) & 0xff,
];

const baseFields = (method: string, csize: number, osize: number): number[] => [
	...latin1Bytes(method),
	...le32(csize),
	...le32(osize),
	...le32(0),
];

/** one stored entry with a level 0 header */
export const lha0Entry = (
	name: string,
	data: Uint8Array,
	method = '-lh0-',
): number[] => {
	const nameBytes = latin1Bytes(name);
	const body = [
		...baseFields(method, data.length, data.length),
		0x20,
		0,
		nameBytes.length,
		...nameBytes,
		...le16(crc16(data)),
	];
	return [body.length, 0, ...body, ...data];
};

/** one stored entry with a level 1 header and one dummy ext header */
export const lha1Entry = (name: string, data: Uint8Array): number[] => {
	const nameBytes = latin1Bytes(name);
	// ext block: type + 2 body bytes + next size; level 1 counts it
	// inside the size field at offset 7
	const ext = [0x3f, 0x68, 0x69, ...le16(0)];
	const body = [
		...baseFields('-lh0-', data.length + ext.length, data.length),
		0x20,
		1,
		nameBytes.length,
		...nameBytes,
		...le16(crc16(data)),
		0x41,
		...le16(ext.length),
	];
	return [body.length, 0, ...body, ...ext, ...data];
};

/** one stored entry with a level 2 header, name and dir in ext blocks */
export const lha2Entry = (
	name: string,
	dir: string,
	data: Uint8Array,
): number[] => {
	const nameBytes = latin1Bytes(name);
	// dir segments separate on 0xff in the wire format
	const dirBytes = latin1Bytes(dir.replaceAll('/', 'ÿ'));
	const nameExt = [0x01, ...nameBytes, ...le16(dirBytes.length + 3)];
	const dirExt = [0x02, ...dirBytes, ...le16(0)];
	const headerSize = 26 + nameExt.length + dirExt.length;
	return [
		...le16(headerSize),
		...baseFields('-lh0-', data.length, data.length),
		0x20,
		2,
		...le16(crc16(data)),
		0x41,
		...le16(nameExt.length),
		...nameExt,
		...dirExt,
		...data,
	];
};

/** join entry blocks into an archive with its zero terminator */
export const buildLha = (...entries: number[][]): Uint8Array =>
	Uint8Array.from([...entries.flat(), 0]);
