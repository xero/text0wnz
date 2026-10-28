/**
 * Minimal ZIP reader for the 16colo.rs in-app browser: enough to open
 * one piece out of a scene pack zip fetched from the archive mirror.
 * Central-directory driven: store (0), deflate (8) through flate.ts,
 * and the PKZIP 1.x shrink (1) and implode (6) older packs carry; no
 * dependency, no zip64, no encryption (scene packs are small flat
 * archives; anything else throws a CodecError).
 */

import { cp437ToUnicode } from '../cp437.js';
import {
	CodecError,
	Salvaged,
	bytesToString,
	crc32,
	salvaged,
} from './util.js';
import { inflateRaw, inflateRawSalvage } from './flate.js';
import { explode, unshrink } from './pkzip1.js';

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/**
 * Per-entry extraction cap: scene pieces are kilobytes; anything close
 * to this is a decompression bomb, and the size check must run BEFORE
 * inflation (an after-the-fact length compare lets a 4MB stream expand
 * to 4GB first).
 */
export const MAX_ZIP_ENTRY_BYTES = 32 * 1024 * 1024;

export interface ZipEntry {
	name: string;
	method: number;
	compressedSize: number;
	size: number;
	headerOffset: number;
	/** general purpose flags; implode reads its window and trees here */
	flags: number;
	/** general purpose flag bit 0: contents are ciphertext */
	encrypted: boolean;
	/** central directory CRC-32, verified after extraction */
	crc32: number;
}

/**
 * How names without the UTF-8 flag (bit 11) decode: DOS packers wrote
 * cp437, amiga ones latin-1.
 */
export type ZipNameCharset = 'cp437' | 'latin1';

const decodeName = (
	bytes: Uint8Array,
	flags: number,
	charset: ZipNameCharset,
): string => {
	let name = '';
	if (flags & 0x800) {
		name = new TextDecoder('utf-8').decode(bytes);
	} else if (charset === 'latin1') {
		// true ISO-8859-1; TextDecoder('latin1') means windows-1252
		name = bytesToString(bytes, 0, bytes.length);
	} else {
		for (const byte of bytes) {
			name += String.fromCodePoint(cp437ToUnicode(byte));
		}
	}
	// DOS-era packers wrote backslash separators, which defeated
	// basename matching (lha.ts converts them; PabloDraw trims both)
	return name.replaceAll('\\', '/');
};

/** parse the central directory into an entry list */
export const readZipEntries = (
	bytes: Uint8Array,
	charset: ZipNameCharset = 'cp437',
): ZipEntry[] => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	// EOCD: scan backward over the (max 64KB) trailing comment
	const floor = Math.max(0, bytes.length - 65557);
	let eocd = -1;
	for (let i = bytes.length - 22; i >= floor; i--) {
		if (view.getUint32(i, true) === EOCD_SIG) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) {
		throw new CodecError('not a zip (no end-of-central-directory)');
	}
	const count = view.getUint16(eocd + 10, true);
	const cdSize = view.getUint32(eocd + 12, true);
	let offset = view.getUint32(eocd + 16, true);
	// saturated EOCD fields mean zip64; reading them as real values
	// silently truncated the listing to 65535 entries
	if (count === 0xffff || offset === 0xffffffff || cdSize === 0xffffffff) {
		throw new CodecError('zip64 archives are not supported');
	}
	// prepended data (SFX stubs, resume artifacts) shifts every stored
	// offset; Info-ZIP and PabloDraw's SharpCompress both correct the
	// displacement from where the directory actually sits
	const actualCd = eocd - cdSize;
	const displacement = actualCd - offset;
	if (displacement < 0) {
		throw new CodecError('zip central directory is torn');
	}
	offset = actualCd;
	const entries: ZipEntry[] = [];
	for (let i = 0; i < count; i++) {
		if (
			offset + 46 > bytes.length ||
			view.getUint32(offset, true) !== CENTRAL_SIG
		) {
			throw new CodecError('zip central directory is torn');
		}
		const flags = view.getUint16(offset + 8, true);
		const method = view.getUint16(offset + 10, true);
		const checksum = view.getUint32(offset + 16, true);
		const compressedSize = view.getUint32(offset + 20, true);
		const size = view.getUint32(offset + 24, true);
		const nameLength = view.getUint16(offset + 28, true);
		const extraLength = view.getUint16(offset + 30, true);
		const commentLength = view.getUint16(offset + 32, true);
		const headerOffset = view.getUint32(offset + 42, true);
		if (
			compressedSize === 0xffffffff ||
			size === 0xffffffff ||
			headerOffset === 0xffffffff
		) {
			throw new CodecError('zip64 archives are not supported');
		}
		entries.push({
			name: decodeName(
				bytes.subarray(offset + 46, offset + 46 + nameLength),
				flags,
				charset,
			),
			method,
			compressedSize,
			size,
			headerOffset: headerOffset + displacement,
			flags,
			encrypted: (flags & 0x01) !== 0,
			crc32: checksum,
		});
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
};

/**
 * An entry's compressed bytes. `short` marks an archive that ends
 * before the entry does; the strict reader refuses it, salvage reads
 * what is there.
 */
const locate = (
	bytes: Uint8Array,
	entry: ZipEntry,
): { data: Uint8Array; short: boolean } => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (entry.encrypted) {
		// flag bit 0 was read but never tested: stored entries returned
		// ciphertext as content and deflated ones died as a raw stream
		// TypeError against the module's own throw-CodecError contract
		throw new CodecError(`zip entry ${entry.name} is encrypted`);
	}
	if (
		entry.size > MAX_ZIP_ENTRY_BYTES ||
		entry.compressedSize > MAX_ZIP_ENTRY_BYTES
	) {
		throw new CodecError(
			`zip entry ${entry.name} exceeds ${MAX_ZIP_ENTRY_BYTES} bytes`,
		);
	}
	if (![0, 1, 6, 8].includes(entry.method)) {
		throw new CodecError(
			`zip method ${entry.method} unsupported for ${entry.name}`,
		);
	}
	const at = entry.headerOffset;
	if (at + 30 > bytes.length || view.getUint32(at, true) !== LOCAL_SIG) {
		throw new CodecError(`zip local header missing for ${entry.name}`);
	}
	// local name/extra lengths can differ from the central ones
	const nameLength = view.getUint16(at + 26, true);
	const extraLength = view.getUint16(at + 28, true);
	const start = at + 30 + nameLength + extraLength;
	const end = start + entry.compressedSize;
	return {
		data: bytes.subarray(start, Math.min(end, bytes.length)),
		short: end > bytes.length,
	};
};

/** extract one entry's bytes (store or deflate) */
export const extractZipEntry = async (
	bytes: Uint8Array,
	entry: ZipEntry,
): Promise<Uint8Array> => {
	const { data, short } = locate(bytes, entry);
	if (short) {
		throw new CodecError(`zip data truncated for ${entry.name}`);
	}
	// bit-rotted packs fail loud instead of opening as mojibake
	const verified = (out: Uint8Array): Uint8Array => {
		if (crc32(out) !== entry.crc32) {
			throw new CodecError(`zip entry ${entry.name} failed its CRC-32`);
		}
		return out;
	};
	if (entry.method === 0) {
		return verified(data.slice());
	}
	if (entry.method === 1) {
		return verified(unshrink(data, entry.size).out);
	}
	if (entry.method === 6) {
		return verified(explode(data, entry.size, entry.flags).out);
	}
	const inflated = await inflateRaw(data, entry.size);
	if (inflated.length !== entry.size) {
		throw new CodecError(
			`zip entry ${entry.name} inflated to ${inflated.length}, expected ${entry.size}`,
		);
	}
	return verified(inflated);
};

/**
 * Open an entry in spite of damage, for the archive browsers: decades
 * of copying have left bit rot in scene packs. The strict path answers
 * first; when it refuses, the plain inflater decodes as far as the
 * stream allows and the checksum decides how much to trust it.
 * Encryption, oversize entries, and a missing local header still
 * refuse, since there is nothing honest to show.
 */
export const salvageZipEntry = async (
	bytes: Uint8Array,
	entry: ZipEntry,
): Promise<Salvaged> => {
	const { data, short } = locate(bytes, entry);
	if (!short) {
		try {
			return { bytes: await extractZipEntry(bytes, entry), damage: null };
		} catch {
			// the slow road below says what is wrong
		}
	}
	const out =
		entry.method === 0
			? data.slice()
			: entry.method === 1
				? unshrink(data, entry.size, true).out
				: entry.method === 6
					? explode(data, entry.size, entry.flags, true).out
					: inflateRawSalvage(data, entry.size).bytes;
	return salvaged(entry.name, out, entry.size, crc32(out) === entry.crc32);
};

// every non-ASCII character becomes one wildcard slot
const skeleton = (name: string): string =>
	name.replace(/[^\x00-\x7f]/gu, '\u0000').toLowerCase();

/** the whole name first, then the basename, as two separate passes */
const PASSES = [
	(entryName: string, wanted: string): boolean => entryName === wanted,
	(entryName: string, wanted: string): boolean =>
		entryName.endsWith(`/${wanted}`),
];

/**
 * Find an entry by exact name, then by basename (packs may nest); an
 * exact match beats an earlier nested one. A listing can spell high
 * bytes in another codepage than the pack (the 16colo.rs API decodes
 * them as CP866), so last passes let non-ASCII characters stand in for
 * each other, and take only a unique fit.
 */
export const findZipEntry = (
	entries: ZipEntry[],
	name: string,
): ZipEntry | null => {
	const lower = name.toLowerCase();
	for (const pass of PASSES) {
		const hit = entries.find(entry => pass(entry.name.toLowerCase(), lower));
		if (hit) {
			return hit;
		}
	}
	const wanted = skeleton(name);
	for (const pass of PASSES) {
		const fits = entries.filter(entry => pass(skeleton(entry.name), wanted));
		if (fits.length) {
			return fits.length === 1 ? fits[0] : null;
		}
	}
	return null;
};
