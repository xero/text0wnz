import { describe, it, expect } from 'vitest';
import {
	ATTR_BLINK,
	attrsOf,
	createDocV3,
	glyphWord,
	paletteColor,
	rgbColor,
	type DocV3,
} from '../../src/js/core/doc.js';
import { v3ToU16, v3ToU16Lossy } from '../../src/js/core/convert.js';
import { createEditorCore } from '../../src/js/core/editor.js';
import { decodeAns } from '../../src/js/core/codecs/ans.js';
import { decodeBin } from '../../src/js/core/codecs/bin.js';
import { decodeDur } from '../../src/js/core/codecs/dur.js';
import { decodeTundra } from '../../src/js/core/codecs/tundra.js';
import { gzip } from '../../src/js/core/codecs/util.js';
import { makeAnsi } from '../corpus/generators.js';

const packDur = (json: unknown): Promise<Uint8Array> =>
	gzip(new TextEncoder().encode(JSON.stringify(json)));

describe('v3ToU16Lossy', () => {
	it('matches the strict projection on classic docs', () => {
		const { doc } = decodeAns(makeAnsi({ columns: 80, rows: 20, seed: 9 }));
		expect(v3ToU16Lossy(doc)).toEqual(v3ToU16(doc));
	});

	it('quantizes raw RGB to the nearest palette entry', () => {
		const doc = createDocV3({ columns: 3, rows: 1, mode: 'free' });
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(219, 0),
			fg: rgbColor(250, 90, 90), // closest to bright red (255,85,85)
			bg: rgbColor(5, 5, 5), // closest to black
		});
		// bright-ish background in a non-ice doc may only quantize dim
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(32, 0),
			fg: paletteColor(7),
			bg: rgbColor(90, 90, 90), // nearest overall is dark gray (8)...
		});
		const u16 = v3ToU16Lossy(doc);
		expect(u16.imageData[0] & 15).toBe(12);
		expect((u16.imageData[0] >> 4) & 15).toBe(0);
		// ...but the dim half caps it, and there brown (170,85,0) edges
		// out light gray and black by squared distance
		expect((u16.imageData[1] >> 4) & 15).toBe(6);
	});

	it('degrades unicode glyphs to ? and keeps CP437-unicode bytes', () => {
		const doc = createDocV3({ columns: 2, rows: 1, mode: 'free' });
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(doc.glyphTable.idFor(0, 0x2603), 0), // snowman
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(doc.glyphTable.idFor(0, 0x2591), 0), // ░ = 176
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		const u16 = v3ToU16Lossy(doc);
		expect(u16.imageData[0] >> 8).toBe(63);
		expect(u16.imageData[1] >> 8).toBe(176);
	});
});

describe('editor.loadDoc', () => {
	it('adopts a tundra doc: RGB cells intact, doc identity preserved', () => {
		const doc = createDocV3({ columns: 80, rows: 25 });
		const editor = createEditorCore(doc);
		const framesRef = doc.frames;

		const tnd = decodeTundra(
			Uint8Array.from([
				24,
				...'TUNDRA24'.split('').map(ch => ch.charCodeAt(0)),
				// 'X' with raw-RGB fg, palette-blue bg
				6,
				88,
				0,
				250,
				120,
				10,
				0,
				0,
				0,
				170,
			]),
		);
		editor.loadDoc(tnd.doc);
		expect(doc.frames).toBe(framesRef);
		expect(doc.getColumns()).toBe(80);
		expect(doc.getIceColors()).toBe(true);
		expect(doc.getCell(0, 0, 0)).toEqual({
			glyph: glyphWord(88, 0),
			fg: rgbColor(250, 120, 10),
			bg: paletteColor(1),
		});
		// the lossy mirror quantizes the RGB fg for fallback consumers
		const mirror = editor.toU16Lossy();
		expect(mirror.imageData[0] >> 8).toBe(88);
		expect(mirror.imageData[0] & 15).toBe(12); // nearest: bright red
	});

	it('adopts a dur movie: frames, delays, live xterm colors, glyph remap', async () => {
		const movie = {
			DurMovie: {
				formatVersion: 8,
				colorFormat: '256',
				encoding: 'utf-8',
				framerate: 4,
				columns: 3,
				lines: 1,
				frames: [
					{
						frameNumber: 1,
						delay: 0.5,
						contents: ['A☃x'],
						colorMap: [
							[
								[12, 0],
								[196, 3],
								[7, 0],
							],
						],
					},
					{
						frameNumber: 2,
						delay: 0,
						contents: ['   '],
						colorMap: [
							[
								[7, 0],
								[7, 0],
								[7, 0],
							],
						],
					},
				],
			},
		};
		const dur = await decodeDur(await packDur(movie));
		const doc = createDocV3({ columns: 80, rows: 25 });
		const editor = createEditorCore(doc);
		editor.loadDoc(dur.doc);

		expect(doc.frames).toHaveLength(2);
		expect(doc.frames[0].delayMs).toBe(500);
		expect(doc.getGlobalDelayMs()).toBe(250);
		// every palette index stays LIVE: renderers resolve 16-255 through
		// the adopted doc palette / xterm table, never a frozen RGB
		// projection
		expect(doc.getCell(0, 0, 0).fg).toBe(paletteColor(12));
		expect(doc.getCell(0, 1, 0).fg).toBe(paletteColor(196));
		expect(doc.getCell(0, 1, 0).bg).toBe(paletteColor(3));
		expect(doc.palette.length).toBe(256);
		expect(doc.palette[196]).toBe(rgbColor(255, 0, 0));
		// the snowman re-registers in THIS doc's glyph table
		const snowman = doc.getCell(0, 1, 0).glyph & 0xffff;
		expect(doc.glyphTable.get(snowman)).toEqual({
			fontSlot: 0,
			codepoint: 0x2603,
		});
		expect(doc.getIceColors()).toBe(true);
	});

	it('keeps CP437 0 and 255 apart, though both map to NBSP', () => {
		// BIN and ANSI opens reach the canvas through loadDoc, and a
		// font like Topaz draws 255 as a visible glyph
		const source = decodeBin(
			new Uint8Array([0, 0x07, 255, 0x17, 32, 0x07, 255, 0x07]),
		).doc;
		const doc = createDocV3({ columns: 80, rows: 25 });
		createEditorCore(doc).loadDoc(source);
		const chars = Array.from(v3ToU16(doc).imageData.slice(0, 4), w => w >> 8);
		expect(chars).toEqual([0, 255, 32, 255]);
	});

	it('round-trips a classic doc losslessly and clears history', () => {
		const source = decodeAns(makeAnsi({ columns: 40, rows: 10, seed: 4 })).doc;
		const doc = createDocV3({ columns: 80, rows: 25 });
		const editor = createEditorCore(doc);
		editor.startUndo();
		editor.drawBlocks(cb => cb(88, 7, 0, 0, 0));
		editor.loadDoc(source);
		expect(v3ToU16(doc)).toEqual(v3ToU16(source));
		expect(editor.undo()).toBe(false);
	});
});

describe('unicode glyph ids through the editor', () => {
	it('writes the full id to the planes but substitutes on the u16 side', () => {
		const doc = createDocV3({ columns: 4, rows: 1 });
		// unicode entries intern above the CP437 identity seed
		const boxId = doc.glyphTable.idFor(1, 0x2510); // ┐ via hex slot: maps back
		const hanId = doc.glyphTable.idFor(2, 0x4e2d); // 中: outside CP437
		const writes: number[] = [];
		const editor = createEditorCore(doc, {
			onWrite: ({ word }) => writes.push(word),
		});
		editor.drawBlocks(draw => {
			draw(boxId, 7, 0, 0, 0);
			draw(hanId, 7, 0, 1, 0);
		});
		// planes keep the real ids (the GL renderer draws these)
		expect(doc.frames[0].glyph[0] & 0xffff).toBe(boxId);
		expect(doc.frames[0].glyph[1] & 0xffff).toBe(hanId);
		// the mirror/wire words quantize like v3ToU16Lossy: strict reverse
		// for ┐ (CP437 191), '?' for anything CP437 cannot express
		expect(writes[0] >> 8).toBe(191);
		expect(writes[1] >> 8).toBe(63);
		expect(v3ToU16Lossy(doc).imageData[0] >> 8).toBe(191);
		expect(v3ToU16Lossy(doc).imageData[1] >> 8).toBe(63);
		// readCell round-trip: tools reading then re-writing a unicode
		// cell must not corrupt it (the attribute-brush path)
		const block = editor.getBlock(1, 0);
		editor.drawBlocks(draw => {
			draw(block.charCode, 4, 2, 1, 0);
		});
		expect(doc.frames[0].glyph[1] & 0xffff).toBe(hanId);
	});
});

describe('extended colors through the editor', () => {
	it('writes words to the planes and quantizes the u16 side', () => {
		const doc = createDocV3({ columns: 4, rows: 1 });
		const writes: number[] = [];
		const editor = createEditorCore(doc, {
			onWrite: ({ word }) => writes.push(word),
		});
		const red256 = paletteColor(196); // xterm 196 = pure red
		const navy = rgbColor(0, 0, 128);
		editor.drawBlocks(draw => {
			draw(65, red256, navy, 0, 0);
		});
		expect(doc.frames[0].fg[0]).toBe(red256);
		expect(doc.frames[0].bg[0]).toBe(navy);
		// mirror quantizes: xterm red (255,0,0) sits nearer dim red (4)
		// than bright red (255,85,85); navy lands on blue (1)
		expect(writes[0] & 15).toBe(4);
		expect((writes[0] >> 4) & 15).toBe(1);
		// read-then-rewrite round trip preserves the exact words
		const block = editor.getBlock(0, 0);
		expect(block.foregroundColor).toBe(red256);
		expect(block.backgroundColor).toBe(navy);
		editor.drawBlocks(draw => {
			draw(block.charCode, block.foregroundColor, block.backgroundColor, 1, 0);
		});
		expect(doc.frames[0].fg[1]).toBe(red256);
		expect(doc.frames[0].bg[1]).toBe(navy);
		// classic cells stay classic through the same path
		editor.drawBlocks(draw => {
			draw(66, 14, 4, 2, 0);
		});
		expect(doc.frames[0].fg[2]).toBe(paletteColor(14));
		expect(writes[2] & 15).toBe(14);
	});

	it('keeps extended backgrounds out of the blink fold', () => {
		const doc = createDocV3({ columns: 2, rows: 1 });
		const editor = createEditorCore(doc);
		editor.drawBlocks(draw => {
			draw(65, 7, rgbColor(200, 0, 0), 0, 0);
		});
		// no ATTR_BLINK on the glyph word; the bg word is the raw RGB
		expect(doc.frames[0].glyph[0] & 0x10000).toBe(0);
		expect(doc.frames[0].bg[0]).toBe(rgbColor(200, 0, 0));
	});
});

describe('ice toggle with extended colors', () => {
	it('never touches extended backgrounds in either direction', () => {
		const doc = createDocV3({ columns: 4, rows: 1 });
		const editor = createEditorCore(doc);
		const xterm28 = paletteColor(28);
		const rgb = rgbColor(10, 200, 10);
		editor.drawBlocks(draw => {
			draw(65, 7, xterm28, 0, 0);
			draw(66, 7, rgb, 1, 0);
			draw(67, 7, 4, 2, 0); // classic dim bg: still folds normally
		});
		editor.setIceColors(true);
		expect(doc.frames[0].bg[0]).toBe(xterm28);
		expect(doc.frames[0].bg[1]).toBe(rgb);
		editor.setIceColors(false);
		// extended bgs survive the round trip exactly, no spurious blink
		expect(doc.frames[0].bg[0]).toBe(xterm28);
		expect(doc.frames[0].bg[1]).toBe(rgb);
		expect(doc.frames[0].glyph[0] & 0x10000).toBe(0);
		expect(doc.frames[0].glyph[1] & 0x10000).toBe(0);
		// classic cells keep v2 fold semantics
		expect(doc.frames[0].bg[2]).toBe(paletteColor(4));
	});
});

describe('undo across blink folds', () => {
	const wordsAt = (doc: DocV3, i: number) => [
		doc.frames[0].glyph[i],
		doc.frames[0].fg[i],
		doc.frames[0].bg[i],
	];

	it('a stroke undo restores a loaded steady bright bg word for word', () => {
		// a SAUCE-less UTF-8 ANSI paints SGR 101 as a steady bright bg
		// with ice off, a fold no edit under that flag writes
		const { doc: source } = decodeAns(
			new TextEncoder().encode('\x1b[101mA\x1b[0m'),
			{ utf8: true },
		);
		const doc = createDocV3({ columns: 80, rows: 25 });
		const writes: number[] = [];
		const editor = createEditorCore(doc, {
			onWrite: write => writes.push(write.word),
		});
		editor.loadDoc(source);
		expect(doc.getIceColors()).toBe(false);
		const loaded = wordsAt(doc, 0);
		expect(attrsOf(loaded[0]) & ATTR_BLINK).toBe(0);
		expect(loaded[2]).toBe(paletteColor(12));
		const mirrored = v3ToU16Lossy(doc).imageData[0];
		editor.startUndo();
		editor.drawBlocks(draw => draw(66, 7, 0, 0, 0));
		writes.length = 0;
		expect(editor.undo()).toBe(true);
		expect(wordsAt(doc, 0)).toEqual(loaded);
		expect(writes).toEqual([mirrored]);
	});

	it('a step recorded under the other ice flag refolds on undo and redo', () => {
		const doc = createDocV3({ columns: 2, rows: 1 });
		const editor = createEditorCore(doc);
		const steady = [glyphWord(65, 0), paletteColor(7), paletteColor(9)];
		// bright bg 9 without ice stores as blink + bg 1
		editor.startUndo();
		editor.drawBlocks(draw => draw(65, 7, 9, 0, 0));
		editor.startUndo();
		editor.drawBlocks(draw => draw(66, 7, 0, 0, 0));
		editor.setIceColors(true);
		editor.undo();
		expect(wordsAt(doc, 0)).toEqual(steady);
		editor.undo();
		editor.redo();
		expect(wordsAt(doc, 0)).toEqual(steady);
	});

	it('an ice toggle commits the open step so each step restores in its own fold', () => {
		const doc = createDocV3({ columns: 2, rows: 1 });
		const editor = createEditorCore(doc);
		editor.startUndo();
		editor.drawBlocks(draw => draw(65, 7, 9, 0, 0));
		editor.setIceColors(true);
		editor.drawBlocks(draw => draw(66, 7, 9, 1, 0));
		editor.setIceColors(false);
		const first = wordsAt(doc, 0);
		const second = wordsAt(doc, 1);
		expect(editor.undo()).toBe(true);
		expect(wordsAt(doc, 0)).toEqual(first);
		expect(wordsAt(doc, 1)).toEqual([0, paletteColor(0), paletteColor(0)]);
		editor.redo();
		expect(wordsAt(doc, 1)).toEqual(second);
	});

	it('an open step after an ice toggle holds the words on screen', () => {
		// the journal writes an open step's after words as they stand,
		// so none of them may keep a fold the toggle rewrote
		const doc = createDocV3({ columns: 2, rows: 1 });
		const editor = createEditorCore(doc);
		editor.startUndo();
		editor.drawBlocks(draw => draw(65, 7, 9, 0, 0));
		editor.setIceColors(true);
		editor.drawBlocks(draw => draw(66, 7, 9, 1, 0));
		const peek = editor.arena.peekStroke();
		expect(peek).not.toBeNull();
		for (const plane of ['glyph', 'fg', 'bg'] as const) {
			const flat = peek?.patches[plane] ?? new Uint32Array(0);
			for (let i = 0; i < flat.length; i += 3) {
				expect(flat[i + 2]).toBe(doc.frames[0][plane][flat[i]]);
			}
		}
	});
});

describe('loadDoc with short-palette sources', () => {
	it('keeps high palette-index words live instead of freezing to black', () => {
		// exactly what the UTF-8 reader produces: paletteColor(n >= 16)
		// words on a doc whose own palette has only 16 entries. Freezing
		// through source.palette[i] ?? 0 would turn them black.
		const source = createDocV3({ columns: 2, rows: 1 });
		source.setCell(0, 0, 0, {
			glyph: glyphWord(88, 0),
			fg: paletteColor(196),
			bg: paletteColor(232),
		});
		const doc = createDocV3({ columns: 80, rows: 25 });
		const editor = createEditorCore(doc);
		editor.loadDoc(source);
		expect(doc.frames[0].fg[0]).toBe(paletteColor(196));
		expect(doc.frames[0].bg[0]).toBe(paletteColor(232));
	});
});
