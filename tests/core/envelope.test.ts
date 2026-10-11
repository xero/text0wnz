import { describe, it, expect } from 'vitest';
import {
	createDocV3,
	glyphWord,
	paletteColor,
	rgbColor,
} from '../../src/js/core/doc.js';
import {
	decodeEnvelope,
	encodeEnvelope,
	isEnvelope,
} from '../../src/js/core/codecs/envelope.js';
import { CodecError, gzip } from '../../src/js/core/codecs/util.js';
import { decodeAns } from '../../src/js/core/codecs/ans.js';
import { v3ToU16 } from '../../src/js/core/convert.js';
import { makeAnsi } from '../corpus/generators.js';

const expectSamePlanes = (
	a: ReturnType<typeof createDocV3>,
	b: ReturnType<typeof createDocV3>,
) => {
	expect(b.frames.length).toBe(a.frames.length);
	a.frames.forEach((frame, i) => {
		expect(b.frames[i].glyph).toEqual(frame.glyph);
		expect(b.frames[i].fg).toEqual(frame.fg);
		expect(b.frames[i].bg).toEqual(frame.bg);
		expect(b.frames[i].delayMs).toBe(frame.delayMs);
	});
};

describe('envelope container (O5)', () => {
	it('round-trips a doc that no classic format can hold', async () => {
		const doc = createDocV3({ columns: 10, rows: 4, mode: 'free' });
		// Unicode glyph, truecolor fg, bright-bg + blink mix, three frames
		const snowman = doc.glyphTable.idFor(1, 0x2603);
		doc.setCell(0, 2, 1, {
			glyph: glyphWord(snowman, 0),
			fg: rgbColor(255, 128, 0),
			bg: paletteColor(3),
		});
		doc.addFrame({ copyFrom: 0 });
		doc.frames[1].delayMs = 250;
		doc.setCell(1, 3, 2, {
			glyph: glyphWord(219, 1),
			fg: paletteColor(15),
			bg: rgbColor(1, 2, 3),
		});
		doc.addFrame();
		doc.setGlobalDelayMs(80);
		doc.setIceColors(true);

		const meta = { title: 'anim', author: 'xero', group: 'impure' };
		const bytes = await encodeEnvelope(doc, { meta });
		expect(isEnvelope(bytes)).toBe(true);

		const back = await decodeEnvelope(bytes);
		expect(back.doc.mode).toBe('free');
		expect(back.doc.getColumns()).toBe(10);
		expect(back.doc.getRows()).toBe(4);
		expect(back.doc.getIceColors()).toBe(true);
		expect(back.doc.getGlobalDelayMs()).toBe(80);
		expect(back.meta).toEqual(meta);
		expect(back.doc.glyphTable.size()).toBe(doc.glyphTable.size());
		expect(back.doc.glyphTable.get(snowman)).toEqual({
			fontSlot: 1,
			codepoint: 0x2603,
		});
		expect(Array.from(back.doc.palette)).toEqual(Array.from(doc.palette));
		expectSamePlanes(doc, back.doc);
	});

	it('marks CP437-identity tables compactly and restores them', async () => {
		const source = decodeAns(makeAnsi({ columns: 80, rows: 10, seed: 3 }));
		const bytes = await encodeEnvelope(source.doc, { meta: source.meta });
		const back = await decodeEnvelope(bytes);
		expect(back.doc.glyphTable.size()).toBe(256);
		expect(v3ToU16(back.doc).imageData).toEqual(v3ToU16(source.doc).imageData);
	});

	it('carries embedded fonts', async () => {
		const doc = createDocV3({ columns: 2, rows: 2 });
		const font = new Uint8Array(512 * 16).map((_, i) => i & 0xff);
		const bytes = await encodeEnvelope(doc, {
			fontBytes: font,
			fontHeight: 16,
		});
		const back = await decodeEnvelope(bytes);
		expect(back.fontBytes).toEqual(font);
		expect(back.fontHeight).toBe(16);
	});

	it('encoding is deterministic', async () => {
		const doc = createDocV3({ columns: 40, rows: 20 });
		doc.setCell(0, 5, 5, {
			glyph: glyphWord(177, 0),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		expect(await encodeEnvelope(doc)).toEqual(await encodeEnvelope(doc));
	});

	it('rejects non-envelopes, foreign formats, and newer versions', async () => {
		await expect(decodeEnvelope(new Uint8Array(16))).rejects.toThrow(
			/gzip magic/,
		);
		const foreign = await gzip(
			new TextEncoder().encode(JSON.stringify({ format: 'other' })),
		);
		await expect(decodeEnvelope(foreign)).rejects.toThrow(
			/unknown container format/,
		);
		const future = await gzip(
			new TextEncoder().encode(
				JSON.stringify({ format: 't0wnz-doc', version: 99 }),
			),
		);
		await expect(decodeEnvelope(future)).rejects.toThrow(/newer than/);
		const garbage = new Uint8Array(16);
		garbage[0] = 0x1f;
		garbage[1] = 0x8b;
		await expect(decodeEnvelope(garbage)).rejects.toThrow(CodecError);
	});

	it('rejects truncated planes', async () => {
		const doc = createDocV3({ columns: 4, rows: 4 });
		const bytes = await encodeEnvelope(doc);
		const json = JSON.parse(
			new TextDecoder().decode(
				await (await import('../../src/js/core/codecs/util.js')).gunzip(bytes),
			),
		);
		json.rows = 8; // planes no longer match the claimed dims
		const tampered = await gzip(new TextEncoder().encode(JSON.stringify(json)));
		await expect(decodeEnvelope(tampered)).rejects.toThrow(/expected/);
	});
});
