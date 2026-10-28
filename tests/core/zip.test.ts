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
	salvageZipEntry,
} from '../../src/js/core/codecs/zip.js';
import { CodecError } from '../../src/js/core/codecs/util.js';
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

	describe('salvage', () => {
		const ascii = (text: string): Uint8Array =>
			Uint8Array.from(text, c => c.charCodeAt(0));
		// a stored deflate block: header byte, LEN, NLEN, then the bytes
		const stored = (final: boolean, text: string): number[] => [
			final ? 1 : 0,
			text.length & 0xff,
			text.length >> 8,
			~text.length & 0xff,
			(~text.length >> 8) & 0xff,
			...ascii(text),
		];
		const only = async (file: {
			name: string;
			data: Uint8Array;
			packed?: Uint8Array;
		}) => {
			const zip = await buildZip([file]);
			return { zip, entry: readZipEntries(zip)[0] };
		};

		it('opens a clean entry without a note', async () => {
			const data = ascii('clean piece '.repeat(40));
			const { zip, entry } = await only({ name: 'OK.ANS', data });
			const piece = await salvageZipEntry(zip, entry);
			expect(piece.damage).toBeNull();
			expect([...piece.bytes]).toEqual([...data]);
		});

		it('keeps what decoded before the stream breaks', async () => {
			// a good stored block, then the reserved block type
			const { zip, entry } = await only({
				name: 'ROT.ANS',
				data: ascii('GOOD PART, then the rot'),
				packed: Uint8Array.from([...stored(false, 'GOOD PART'), 0xff, 0xff]),
			});
			await expect(extractZipEntry(zip, entry)).rejects.toThrow(CodecError);
			const piece = await salvageZipEntry(zip, entry);
			expect(String.fromCharCode(...piece.bytes)).toBe('GOOD PART');
			expect(piece.damage).toBe(
				'ROT.ANS is damaged: showing the first 9 of 23 bytes',
			);
		});

		it('opens junk after a whole stream as clean', async () => {
			const { zip, entry } = await only({
				name: 'JUNK.ANS',
				data: ascii('WHOLE'),
				packed: Uint8Array.from([...stored(true, 'WHOLE'), 9, 9, 9]),
			});
			// whether the strict path refuses the junk depends on the native
			// stream (node 22 ignores it, current browsers refuse it); salvage
			// opens it clean either way
			const piece = await salvageZipEntry(zip, entry);
			expect(piece.damage).toBeNull();
			expect(String.fromCharCode(...piece.bytes)).toBe('WHOLE');
		});

		it('warns when the content is whole but its checksum disagrees', async () => {
			const { zip, entry } = await only({
				name: 'CRC.ANS',
				data: ascii('ABCD'),
				packed: Uint8Array.from(stored(true, 'ABCE')),
			});
			const piece = await salvageZipEntry(zip, entry);
			expect(String.fromCharCode(...piece.bytes)).toBe('ABCE');
			expect(piece.damage).toBe(
				'CRC.ANS failed its checksum and may show damage',
			);
		});

		it('refuses when nothing decodes at all', async () => {
			const { zip, entry } = await only({
				name: 'GONE.ANS',
				data: ascii('lost'),
				packed: Uint8Array.of(0xff),
			});
			await expect(salvageZipEntry(zip, entry)).rejects.toThrow(
				/beyond recovery/,
			);
		});
	});
});
