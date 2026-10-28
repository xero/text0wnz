/**
 * Minimal ZIP reader for the 16colo.rs in-app browser: enough to open
 * one piece out of a scene pack zip fetched from the archive mirror.
 * Central-directory driven, store (0) and deflate (8) methods only,
 * inflated through the runtime-native
 * DecompressionStream('deflate-raw') like the other codecs; no
 * dependency, no zip64, no encryption (scene packs are small flat
 * archives; anything else throws a CodecError).
 */

import { CodecError, crc32, inflateRaw } from './util.js';

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
	/** general purpose flag bit 0: contents are ciphertext */
	encrypted: boolean;
	/** central directory CRC-32, verified after extraction */
	crc32: number;
}

const decodeName = (bytes: Uint8Array, flags: number): string =>
	// bit 11 = UTF-8 name; everything else in old packs is cp437-ish,
	// where latin1 keeps the bytes readable enough for matching.
	// DOS-era packers wrote backslash separators, which defeated
	// basename matching (lha.ts converts them; PabloDraw trims both)
	new TextDecoder(flags & 0x800 ? 'utf-8' : 'latin1')
		.decode(bytes)
		.replaceAll('\\', '/');

/** parse the central directory into an entry list */
export const readZipEntries = (bytes: Uint8Array): ZipEntry[] => {
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
			),
			method,
			compressedSize,
			size,
			headerOffset: headerOffset + displacement,
			encrypted: (flags & 0x01) !== 0,
			crc32: checksum,
		});
		offset += 46 + nameLength + extraLength + commentLength;
	}
	return entries;
};

/** extract one entry's bytes (store or deflate) */
export const extractZipEntry = async (
	bytes: Uint8Array,
	entry: ZipEntry,
): Promise<Uint8Array> => {
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
	const at = entry.headerOffset;
	if (at + 30 > bytes.length || view.getUint32(at, true) !== LOCAL_SIG) {
		throw new CodecError(`zip local header missing for ${entry.name}`);
	}
	// local name/extra lengths can differ from the central ones
	const nameLength = view.getUint16(at + 26, true);
	const extraLength = view.getUint16(at + 28, true);
	const start = at + 30 + nameLength + extraLength;
	const end = start + entry.compressedSize;
	if (end > bytes.length) {
		throw new CodecError(`zip data truncated for ${entry.name}`);
	}
	const data = bytes.subarray(start, end);
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
	if (entry.method !== 8) {
		throw new CodecError(
			`zip method ${entry.method} unsupported for ${entry.name}`,
		);
	}
	const inflated = await inflateRaw(data, entry.size);
	if (inflated.length !== entry.size) {
		throw new CodecError(
			`zip entry ${entry.name} inflated to ${inflated.length}, expected ${entry.size}`,
		);
	}
	return verified(inflated);
};

/** find an entry by exact name, then by basename (packs may nest) */
export const findZipEntry = (
	entries: ZipEntry[],
	name: string,
): ZipEntry | null => {
	const lower = name.toLowerCase();
	return (
		entries.find(entry => entry.name.toLowerCase() === lower) ??
		entries.find(entry => entry.name.toLowerCase().endsWith(`/${lower}`)) ??
		null
	);
};
