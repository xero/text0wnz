/**
 * Minimal ZIP reader (P6): store + deflate entries, basename lookup,
 * and hardened failure modes. Fixtures are built in-test with the same
 * CompressionStream the extractor inverts.
 */
import { describe, it, expect } from 'vitest';
import {
	extractZipEntry,
	findZipEntry,
	readZipEntries,
} from '../../src/js/core/codecs/zip.js';
import { buildZip } from '../corpus/zipFixture.js';

describe('zip reader', () => {
	it('lists and extracts store + deflate entries', async () => {
		const art = new TextEncoder().encode('\u001b[1;31mhello ansi'.repeat(40));
		const diz = new TextEncoder().encode('pack info');
		const zip = await buildZip([
			{ name: 'piece.ans', data: art },
			{ name: 'FILE_ID.DIZ', data: diz, store: true },
		]);
		const entries = readZipEntries(zip);
		expect(entries.map(entry => entry.name)).toEqual([
			'piece.ans',
			'FILE_ID.DIZ',
		]);
		// spread first: vitest compares typed-array wrapper internals too
		expect([...(await extractZipEntry(zip, entries[0]))]).toEqual([...art]);
		expect([...(await extractZipEntry(zip, entries[1]))]).toEqual([...diz]);
	});

	it('finds entries by basename inside nested packs', async () => {
		const zip = await buildZip([
			{ name: 'pack/sub/x0-art.ans', data: Uint8Array.of(65), store: true },
		]);
		const entries = readZipEntries(zip);
		expect(findZipEntry(entries, 'X0-ART.ANS')?.name).toBe(
			'pack/sub/x0-art.ans',
		);
		expect(findZipEntry(entries, 'missing.ans')).toBeNull();
	});

	it('throws on junk, torn directories, and truncated data', async () => {
		expect(() => readZipEntries(Uint8Array.of(1, 2, 3))).toThrow(/not a zip/);
		const zip = await buildZip([
			{ name: 'a.ans', data: Uint8Array.of(65, 66, 67), store: true },
		]);
		const entries = readZipEntries(zip);
		await expect(
			extractZipEntry(zip.subarray(0, entries[0].headerOffset + 32), entries[0]),
		).rejects.toThrow(/truncated|missing/);
	});
});
