import { describe, it, expect } from 'vitest';
import { glyphWord, paletteColor, rgbColor } from '../../src/js/core/doc.js';
import {
	createXterm256Palette,
	decodeDur,
	encodeDur,
} from '../../src/js/core/codecs/dur.js';
import { createDocV3 } from '../../src/js/core/doc.js';
import { gzip } from '../../src/js/core/codecs/flate.js';
import { v3ToU16 } from '../../src/js/core/convert.js';

const pack = (json: unknown): Promise<Uint8Array> =>
	gzip(new TextEncoder().encode(JSON.stringify(json)));

/** 2x4 two-frame 256-color movie in v8 shape. */
const v8Movie = () => ({
	DurMovie: {
		formatVersion: 8,
		colorFormat: '256',
		preferredFont: 'fixed',
		encoding: 'utf-8',
		name: 'orbit',
		artist: 'xero',
		framerate: 6.0,
		columns: 4,
		lines: 2,
		extra: null,
		frames: [
			{
				frameNumber: 1,
				delay: 0,
				contents: ['AB☃x', '    '],
				colorMap: [
					[
						[12, 0],
						[7, 0],
						[196, 0],
						[7, 3],
					],
					[
						[7, 0],
						[7, 0],
						[7, 0],
						[7, 0],
					],
				],
			},
			{
				frameNumber: 2,
				delay: 0.25,
				contents: [' A  ', '    '],
				colorMap: [
					[
						[7, 0],
						[12, 0],
						[7, 0],
						[7, 0],
					],
					[
						[7, 0],
						[7, 0],
						[7, 0],
						[7, 0],
					],
				],
			},
		],
	},
});

describe('dur codec (durdraw v7/v8 import)', () => {
	it('imports a v8 256-color movie', async () => {
		const { doc, meta, formatVersion, colorFormat, encoding } = await decodeDur(
			await pack(v8Movie()),
		);
		expect(formatVersion).toBe(8);
		expect(colorFormat).toBe('256');
		expect(encoding).toBe('utf-8');
		expect(meta).toEqual({ title: 'orbit', author: 'xero' });
		expect(doc.mode).toBe('xterm256');
		expect(doc.getIceColors()).toBe(true);
		expect(doc.getColumns()).toBe(4);
		expect(doc.getRows()).toBe(2);
		expect(doc.getGlobalDelayMs()).toBe(167); // round(1000 / 6)
		expect(doc.frames).toHaveLength(2);
		expect(doc.frames[0].delayMs).toBeUndefined();
		expect(doc.frames[1].delayMs).toBe(250);

		// durdraw 256 indices are 0-based BIN order; 16+ is xterm
		expect(doc.getCell(0, 0, 0)).toEqual({
			glyph: glyphWord(65, 0),
			fg: paletteColor(12),
			bg: paletteColor(0),
		});
		expect(doc.getCell(0, 2, 0).fg).toBe(paletteColor(196));
		expect(doc.palette[196]).toBe(rgbColor(255, 0, 0)); // xterm 196
		expect(doc.getCell(0, 3, 0).bg).toBe(paletteColor(3));

		// snowman grows the glyph table past the CP437 identity seed
		const snowman = doc.getCell(0, 2, 0).glyph;
		expect(snowman).toBe(glyphWord(256, 0));
		expect(doc.glyphTable.get(256)).toEqual({
			fontSlot: 0,
			codepoint: 0x2603,
		});
		// plain ASCII keeps its identity id
		expect(doc.getCell(0, 1, 0).glyph).toBe(glyphWord(66, 0));
	});

	it('v7 movies (sizeX/sizeY, transposed colorMap) decode identically', async () => {
		const v8 = v8Movie();
		const m = v8.DurMovie;
		const transpose = (map: number[][][]): number[][][] =>
			Array.from({ length: m.columns }, (_unused, x) =>
				Array.from({ length: m.lines }, (_, y) => map[y][x]),
			);
		const v7 = {
			DurMovie: {
				...m,
				formatVersion: 7,
				sizeX: m.columns,
				sizeY: m.lines,
				columns: undefined,
				lines: undefined,
				frames: m.frames.map(frame => ({
					...frame,
					colorMap: transpose(frame.colorMap),
				})),
			},
		};
		const a = (await decodeDur(await pack(v8Movie()))).doc;
		const b = (await decodeDur(await pack(v7))).doc;
		expect(b.frames).toHaveLength(a.frames.length);
		a.frames.forEach((frame, i) => {
			expect(b.frames[i].glyph).toEqual(frame.glyph);
			expect(b.frames[i].fg).toEqual(frame.fg);
			expect(b.frames[i].bg).toEqual(frame.bg);
		});
	});

	it('16-color movies use 1-based fg and the bg-8 black duplicate', async () => {
		const movie = {
			DurMovie: {
				formatVersion: 8,
				colorFormat: '16',
				encoding: 'cp437',
				name: '',
				artist: '',
				framerate: 2.0,
				columns: 4,
				lines: 1,
				frames: [
					{
						frameNumber: 1,
						delay: 0,
						contents: ['░▒▓█'],
						colorMap: [
							[
								[1, 0],
								[2, 3],
								[16, 8],
								[9, 7],
							],
						],
					},
				],
			},
		};
		const { doc, colorFormat, encoding } = await decodeDur(await pack(movie));
		expect(colorFormat).toBe('16');
		expect(encoding).toBe('cp437');
		expect(doc.mode).toBe('classic16');
		// CP437 shade/block chars dedupe onto the identity table
		expect(doc.glyphTable.size()).toBe(256);
		expect(doc.getCell(0, 0, 0).glyph).toBe(glyphWord(176, 0));
		expect(doc.getCell(0, 3, 0).glyph).toBe(glyphWord(219, 0));
		// fg is 1-based (1 = black .. 16 = bright white)
		expect(doc.getCell(0, 0, 0).fg).toBe(paletteColor(0));
		expect(doc.getCell(0, 1, 0).fg).toBe(paletteColor(1));
		expect(doc.getCell(0, 2, 0).fg).toBe(paletteColor(15));
		expect(doc.getCell(0, 3, 0).fg).toBe(paletteColor(8));
		// bg is 0-based, with 8 as durdraw's second black
		expect(doc.getCell(0, 1, 0).bg).toBe(paletteColor(3));
		expect(doc.getCell(0, 2, 0).bg).toBe(paletteColor(0));
		expect(doc.getCell(0, 3, 0).bg).toBe(paletteColor(7));
		// pure 16-color imports stay u16-convertible (ice is on)
		expect(() => v3ToU16(doc)).not.toThrow();
	});

	it('pads short lines and defaults missing colorMap entries', async () => {
		const movie = {
			DurMovie: {
				formatVersion: 8,
				colorFormat: '16',
				framerate: 1,
				columns: 3,
				lines: 2,
				frames: [{ frameNumber: 1, delay: 0, contents: ['A'], colorMap: [] }],
			},
		};
		const { doc } = await decodeDur(await pack(movie));
		expect(doc.getCell(0, 0, 0).glyph).toBe(glyphWord(65, 0));
		expect(doc.getCell(0, 1, 0).glyph).toBe(glyphWord(32, 0));
		expect(doc.getCell(0, 2, 1).glyph).toBe(glyphWord(32, 0));
		// 16-mode default pair [8, 0] = white on black
		expect(doc.getCell(0, 0, 0).fg).toBe(paletteColor(7));
		expect(doc.getCell(0, 0, 0).bg).toBe(paletteColor(0));
	});

	it('accepts plain (non-gzipped) JSON', async () => {
		const bytes = new TextEncoder().encode(JSON.stringify(v8Movie()));
		const { doc } = await decodeDur(bytes);
		expect(doc.getColumns()).toBe(4);
	});

	it('xterm palette entries follow the cube and gray ramp', () => {
		const palette = createXterm256Palette();
		expect(palette[16]).toBe(rgbColor(0, 0, 0));
		expect(palette[21]).toBe(rgbColor(0, 0, 255));
		expect(palette[231]).toBe(rgbColor(255, 255, 255));
		expect(palette[232]).toBe(rgbColor(8, 8, 8));
		expect(palette[255]).toBe(rgbColor(238, 238, 238));
		// first 16 stay the VGA defaults in durdraw/BIN order
		expect(palette[1]).toBe(rgbColor(0, 0, 170));
	});

	it('rejects pickle-era versions, future versions, and odd color formats', async () => {
		const base = v8Movie();
		await expect(
			decodeDur(
				await pack({ DurMovie: { ...base.DurMovie, formatVersion: 6 } }),
			),
		).rejects.toThrow(/legacy palette/);
		await expect(
			decodeDur(
				await pack({ DurMovie: { ...base.DurMovie, formatVersion: 9 } }),
			),
		).rejects.toThrow(/newer/);
		await expect(
			decodeDur(
				await pack({ DurMovie: { ...base.DurMovie, colorFormat: 'mIRC' } }),
			),
		).rejects.toThrow(/color format/);
		await expect(decodeDur(await pack({ notDur: true }))).rejects.toThrow(
			/no DurMovie/,
		);
		await expect(
			decodeDur(new TextEncoder().encode('definitely not json')),
		).rejects.toThrow(/gzipped JSON/);
		await expect(
			decodeDur(await pack({ DurMovie: { ...base.DurMovie, frames: [] } })),
		).rejects.toThrow(/no frames/);
	});
});

describe('encodeDur round trip', () => {
	it('keeps frames, delays, unicode glyphs, and 256 indexes', async () => {
		const doc = createDocV3({ columns: 3, rows: 2, mode: 'xterm256' });
		const frame0 = doc.frames[0];
		frame0.glyph[0] = glyphWord(doc.glyphTable.idFor(0, 0x2764), 0);
		frame0.fg[0] = paletteColor(208);
		frame0.bg[0] = paletteColor(17);
		doc.addFrame({ copyFrom: 0 });
		doc.frames[1].glyph[1] = glyphWord(65, 0);
		doc.frames[1].delayMs = 250;
		doc.setGlobalDelayMs(50);

		const bytes = await encodeDur(doc, { title: 'loop', author: 'xero' });
		const decoded = await decodeDur(bytes);
		expect(decoded.formatVersion).toBe(8);
		expect(decoded.colorFormat).toBe('256');
		expect(decoded.meta.title).toBe('loop');
		expect(decoded.doc.frames).toHaveLength(2);
		const cell = decoded.doc.getCell(0, 0, 0);
		expect(decoded.doc.glyphTable.get(cell.glyph & 0xffff)?.codepoint).toBe(
			0x2764,
		);
		expect(cell.fg).toBe(paletteColor(208));
		expect(cell.bg).toBe(paletteColor(17));
		expect(decoded.doc.frames[1].delayMs).toBe(250);
		expect(decoded.doc.getGlobalDelayMs()).toBe(50);
	});

	it('quantizes raw RGB words to the nearest xterm entry', async () => {
		const doc = createDocV3({ columns: 1, rows: 1 });
		doc.frames[0].fg[0] = 0xff0000; // raw RGB word, no tag bit
		const decoded = await decodeDur(await encodeDur(doc));
		// xterm 196 is pure red (255,0,0)
		expect(decoded.doc.getCell(0, 0, 0).fg).toBe(paletteColor(196));
	});
});
