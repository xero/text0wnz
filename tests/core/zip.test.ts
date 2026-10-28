/**
 * Minimal ZIP reader: store + deflate entries, basename lookup,
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
			extractZipEntry(
				zip.subarray(0, entries[0].headerOffset + 32),
				entries[0],
			),
		).rejects.toThrow(/truncated|missing/);
	});

	it('refuses declared bombs and streams-aborts lying ones', async () => {
		const zip = await buildZip([
			{ name: 'big.ans', data: new Uint8Array(4096) },
		]);
		const entries = readZipEntries(zip);
		// declared too large: refused before any inflation
		const declared = { ...entries[0], size: 33 * 1024 * 1024 };
		await expect(extractZipEntry(zip, declared)).rejects.toThrow(/exceeds/);
		// declared SMALLER than the real stream: the inflate aborts
		// mid-read instead of buffering the whole bomb first
		const lying = { ...entries[0], size: 16 };
		await expect(extractZipEntry(zip, lying)).rejects.toThrow(
			/exceeds|inflated/,
		);
	});

	describe('names', () => {
		const raw = (...parts: Array<string | number>): Uint8Array =>
			Uint8Array.from(
				parts.flatMap(part =>
					typeof part === 'number'
						? [part]
						: Array.from(part, c => c.charCodeAt(0)),
				),
			);
		const one = Uint8Array.of(65);

		it('reads DOS names as cp437 and amiga names as latin-1', async () => {
			const zip = await buildZip([
				{ name: '', rawName: raw('X', 0xc5, 'C.NFO'), data: one, store: true },
			]);
			expect(readZipEntries(zip)[0].name).toBe('X┼C.NFO');
			expect(readZipEntries(zip, 'latin1')[0].name).toBe('XÅC.NFO');
		});

		it('matches a listing that spells high bytes in another codepage', async () => {
			// the 16colo.rs API decodes names as CP866: 0xEE reads ю there,
			// ε in cp437
			const zip = await buildZip([
				{ name: '', rawName: raw('I', 0xee, '.TXT'), data: one, store: true },
				{
					name: '',
					rawName: raw('FILE_ID', 0xff, '.DIZ'),
					data: one,
					store: true,
				},
			]);
			const entries = readZipEntries(zip);
			expect(findZipEntry(entries, 'Iю.TXT')?.name).toBe('Iε.TXT');
			expect(findZipEntry(entries, 'FILE_ID\u00a0.DIZ')?.name).toBe(
				'FILE_ID\u00a0.DIZ',
			);
		});

		it('refuses to guess between names that differ only in high bytes', async () => {
			const zip = await buildZip([
				{ name: '', rawName: raw('I', 0xee, '.TXT'), data: one, store: true },
				{ name: '', rawName: raw('I', 0xe0, '.TXT'), data: one, store: true },
			]);
			expect(findZipEntry(readZipEntries(zip), 'Iю.TXT')).toBeNull();
		});
	});
});
