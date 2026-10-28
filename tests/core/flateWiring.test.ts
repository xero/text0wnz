/**
 * Which path the async wrappers take: native streams where the engine
 * has them and they behave, the plain TS codec everywhere else. Each
 * engine shape the editor supports is faked with vi.stubGlobal, and the
 * codecs that ride the wrappers must round trip under every one.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
	deflateRawSync,
	gunzip,
	gzip,
	gzipSync,
	inflateRaw,
	inflateRawNative,
} from '../../src/js/core/codecs/flate.js';
import { CodecError } from '../../src/js/core/codecs/util.js';
import {
	decodeEnvelope,
	encodeEnvelope,
} from '../../src/js/core/codecs/envelope.js';
import { decodeDur, encodeDur } from '../../src/js/core/codecs/dur.js';
import {
	extractZipEntry,
	readZipEntries,
} from '../../src/js/core/codecs/zip.js';
import { createJournal, replayJournal } from '../../src/js/core/journal.js';
import { createDocV3, glyphWord, paletteColor } from '../../src/js/core/doc.js';
import { buildZip } from '../corpus/zipFixture.js';

const RealCompression = globalThis.CompressionStream;
const RealDecompression = globalThis.DecompressionStream;

afterEach(() => {
	vi.unstubAllGlobals();
});

const sample = (): Uint8Array =>
	new Uint8Array(new TextEncoder().encode('teXt0wnz ░▒▓ '.repeat(800)));

const art = () => {
	const doc = createDocV3({ columns: 12, rows: 3 });
	doc.setCell(0, 4, 1, {
		glyph: glyphWord(219, 0),
		fg: paletteColor(12),
		bg: paletteColor(1),
	});
	return doc;
};

type Transform = {
	readable: ReadableStream<Uint8Array>;
	writable: WritableStream<BufferSource>;
};

/** a native stream class whose output passes through `shape` first */
const reshaped = (
	Real: new (format: CompressionFormat) => Transform,
	shape: () => Transformer<Uint8Array, Uint8Array>,
) =>
	class {
		readable: ReadableStream<Uint8Array>;
		writable: WritableStream<BufferSource>;
		constructor(format: CompressionFormat) {
			const inner = new Real(format);
			this.readable = inner.readable.pipeThrough(new TransformStream(shape()));
			this.writable = inner.writable;
		}
	};

describe('an engine without compression streams', () => {
	it('round trips every codec on the plain path', async () => {
		const piece = sample();
		const zip = await buildZip([{ name: 'piece.ans', data: piece }]);
		vi.stubGlobal('CompressionStream', undefined);
		vi.stubGlobal('DecompressionStream', undefined);

		const data = sample();
		expect(await gzip(data)).toEqual(gzipSync(data));
		expect(await gunzip(await gzip(data))).toEqual(data);

		const doc = art();
		const envelope = await decodeEnvelope(await encodeEnvelope(doc));
		expect(envelope.doc.frames[0].glyph).toEqual(doc.frames[0].glyph);
		const dur = await decodeDur(await encodeDur(doc));
		expect(dur.doc.getColumns()).toBe(12);
		const journal = await replayJournal(await createJournal(doc));
		expect(journal.doc.frames[0].fg).toEqual(doc.frames[0].fg);

		const [entry] = readZipEntries(zip);
		expect([...(await extractZipEntry(zip, entry))]).toEqual([...piece]);
	});

	it('still stops a bomb while it decodes', async () => {
		vi.stubGlobal('DecompressionStream', undefined);
		const bomb = gzipSync(new Uint8Array(1024 * 1024));
		await expect(gunzip(bomb, 1000)).rejects.toThrow(/exceeds/);
	});
});

describe('a Chromium 80-102 engine', () => {
	it('keeps native gzip and inflates zips on the plain path', async () => {
		const piece = sample();
		const zip = await buildZip([{ name: 'piece.ans', data: piece }]);
		const formats: string[] = [];
		vi.stubGlobal(
			'DecompressionStream',
			class extends RealDecompression {
				constructor(format: CompressionFormat) {
					if (format === 'deflate-raw') {
						throw new TypeError(`Unsupported compression format: '${format}'`);
					}
					super(format);
					formats.push(format);
				}
			},
		);
		const [entry] = readZipEntries(zip);
		expect([...(await extractZipEntry(zip, entry))]).toEqual([...piece]);
		const data = sample();
		expect(await gunzip(await gzip(data))).toEqual(data);
		// native gzip both ways (the save check decodes too), never deflate-raw
		expect(new Set(formats)).toEqual(new Set(['gzip']));
	});
});

describe('a misbehaving native stream', () => {
	it('never ships a CompressionStream that truncates (Safari 16.4)', async () => {
		vi.stubGlobal(
			'CompressionStream',
			reshaped(RealCompression, () => {
				let first = true;
				return {
					transform(chunk, controller) {
						if (first) {
							controller.enqueue(chunk.subarray(0, chunk.length >> 1));
							first = false;
						}
					},
				};
			}),
		);
		const data = sample();
		const out = await gzip(data);
		expect(out).toEqual(gzipSync(data));
		expect(await gunzip(out)).toEqual(data);
	});

	it('gets a second opinion when a native decoder throws', async () => {
		const data = sample();
		const zip = await buildZip([{ name: 'a.ans', data }]);
		vi.stubGlobal(
			'DecompressionStream',
			reshaped(RealDecompression, () => ({
				transform(_chunk, controller) {
					controller.error(new TypeError('engine bug'));
				},
			})),
		);
		expect(await gunzip(gzipSync(data))).toEqual(data);
		const [entry] = readZipEntries(zip);
		expect([...(await extractZipEntry(zip, entry))]).toEqual([...data]);
	});

	it('catches a native gunzip that drops output without an error', async () => {
		vi.stubGlobal(
			'DecompressionStream',
			reshaped(RealDecompression, () => ({
				transform(chunk, controller) {
					controller.enqueue(chunk.subarray(1));
				},
			})),
		);
		const data = sample();
		expect(await gunzip(gzipSync(data))).toEqual(data);
	});
});

describe('one error contract', () => {
	it('throws CodecError for corrupt input on the native path too', async () => {
		const member = gzipSync(sample());
		member[20] ^= 0xff;
		await expect(gunzip(member)).rejects.toBeInstanceOf(CodecError);
		await expect(
			inflateRaw(Uint8Array.of(0xff, 0xff, 0xff)),
		).rejects.toBeInstanceOf(CodecError);
	});
});

describe('inflateRawNative, for callers with their own fallback', () => {
	it('answers null where the engine has no stream or refuses the data', async () => {
		const data = sample();
		expect(await inflateRawNative(deflateRawSync(data))).toEqual(data);
		expect(await inflateRawNative(Uint8Array.of(0xff, 0xff, 0xff))).toBeNull();
		vi.stubGlobal('DecompressionStream', undefined);
		expect(await inflateRawNative(deflateRawSync(data))).toBeNull();
	});
});
