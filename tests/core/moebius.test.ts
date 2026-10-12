/**
 * Moebius wire codec: the enum is pinned value-for-value against
 * moebiusXBIN doc.js:7, the RLE against libtextmode.js
 * compress/uncompress (count = repeat + 1), the palette expansion
 * against palette.js:308, and each protocol trap gets a pin:
 * Buffer-JSON font bytes, 6-vs-8-bit palette auto-detect, hardened
 * frame parsing (upstream servers crash on malformed frames; we drop).
 */
import { describe, it, expect } from 'vitest';
import {
	MoebiusAction,
	MoebiusStatus,
	MOEBIUS_EXTENSION_BASE,
	ProtocolError,
	encodeFrame,
	decodeFrame,
	compressBlocks,
	uncompressBlocks,
	expand6to8,
	compress8to6,
	paletteToRGB8,
	paletteTo6Bit,
	reviveFontBytes,
	joinDocToDoc,
	docToJoinDoc,
	createDocV3,
	glyphWord,
	paletteColor,
	rgbColor,
} from '../../src/js/core/index';

const mulberry32 = (seed: number) => () => {
	seed |= 0;
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe('action enum', () => {
	it('pins every id to the moebiusXBIN dialect', () => {
		expect(MoebiusAction).toEqual({
			CONNECTED: 0,
			REFUSED: 1,
			JOIN: 2,
			LEAVE: 3,
			CURSOR: 4,
			SELECTION: 5,
			RESIZE_SELECTION: 6,
			OPERATION: 7,
			HIDE_CURSOR: 8,
			DRAW: 9,
			CHAT: 10,
			STATUS: 11,
			SAUCE: 12,
			ICE_COLORS: 13,
			USE_9PX_FONT: 14,
			CHANGE_FONT: 15,
			SET_CANVAS_SIZE: 16,
			PASTE_AS_SELECTION: 17,
			ROTATE: 18,
			FLIP_X: 19,
			FLIP_Y: 20,
			SET_BG: 21,
			CHANGE_PALETTE: 22,
		});
		expect(MOEBIUS_EXTENSION_BASE).toBe(23);
		expect(MoebiusStatus.WEB).toBe(3);
	});
});

describe('frames', () => {
	it('round-trips type and data', () => {
		const wire = encodeFrame(MoebiusAction.DRAW, {
			x: 3,
			y: 4,
			block: { code: 65, fg: 7, bg: 0 },
			id: 2,
		});
		const frame = decodeFrame(wire);
		expect(frame.type).toBe(9);
		expect(frame.data.block).toEqual({ code: 65, fg: 7, bg: 0 });
	});

	it('defaults missing data to an empty object (REFUSED has none)', () => {
		expect(decodeFrame('{"type":1}')).toEqual({ type: 1, data: {} });
	});

	it('drops malformed frames with ProtocolError, never a crash', () => {
		for (const bad of [
			'not json',
			'[1,2]',
			'"string"',
			'{"type":-1}',
			'{"type":"DRAW"}',
			'{"data":{}}',
			'{"type":1.5}',
		]) {
			expect(() => decodeFrame(bad)).toThrow(ProtocolError);
		}
	});
});

describe('join doc RLE', () => {
	it('matches libtextmode semantics: count = repeat + 1', () => {
		const blocks = [
			{ code: 32, fg: 7, bg: 0 },
			{ code: 32, fg: 7, bg: 0 },
			{ code: 65, fg: 7, bg: 0 },
			{ code: 65, fg: 14, bg: 1 },
		];
		const compressed = compressBlocks(blocks);
		expect(compressed.code).toEqual([
			[32, 1],
			[65, 1],
		]);
		expect(compressed.fg).toEqual([
			[7, 2],
			[14, 0],
		]);
		expect(compressed.bg).toEqual([
			[0, 2],
			[1, 0],
		]);
		expect(uncompressBlocks(compressed, 4)).toEqual(blocks);
	});

	it('round-trips fuzzed documents exactly', () => {
		const rand = mulberry32(0x40eb);
		for (let run = 0; run < 50; run++) {
			const length = 1 + Math.floor(rand() * 2000);
			const blocks = Array.from({ length }, () => ({
				// clustered values so runs actually form
				code: rand() < 0.7 ? 32 : Math.floor(rand() * 256),
				fg: Math.floor(rand() * 16),
				bg: Math.floor(rand() * 8),
			}));
			const back = uncompressBlocks(compressBlocks(blocks), length);
			expect(back).toEqual(blocks);
		}
	});

	it('rejects torn or inconsistent streams', () => {
		expect(() =>
			uncompressBlocks({ code: [[65, 1]], fg: [[7, 0]], bg: [[0, 1]] }),
		).toThrow(ProtocolError);
		expect(() =>
			uncompressBlocks({ code: [[65, 0]], fg: [[7, 0]], bg: [[0, 0]] }, 999),
		).toThrow(ProtocolError);
		expect(() =>
			uncompressBlocks({
				code: [[65, -1]],
				fg: [[7, -1]],
				bg: [[0, -1]],
			}),
		).toThrow(ProtocolError);
		expect(() =>
			uncompressBlocks({
				// @ts-expect-error torn run shape straight off the wire
				code: [[65]],
				fg: [[7, 0]],
				bg: [[0, 0]],
			}),
		).toThrow(ProtocolError);
	});
});

describe('palettes', () => {
	it('expands 6-bit with top-bit replication (palette.js:308)', () => {
		expect(expand6to8(0)).toBe(0);
		expect(expand6to8(63)).toBe(255);
		expect(expand6to8(0x2a)).toBe((0x2a << 2) | ((0x2a & 0x30) >> 4));
		// 8->6->8 of a replicated value is identity
		for (let v = 0; v < 64; v++) {
			expect(compress8to6(expand6to8(v))).toBe(v);
		}
	});

	it('auto-detects an already-8-bit palette like icy_draw', () => {
		const sixBit = [
			[0, 0, 0],
			[42, 21, 63],
		];
		const eightBit = [
			[0, 0, 0],
			[170, 85, 255],
		];
		expect(paletteToRGB8(sixBit)[1]).toEqual([
			expand6to8(42),
			expand6to8(21),
			255,
		]);
		expect(paletteToRGB8(eightBit)[1]).toEqual([170, 85, 255]);
	});

	it('emits 6-bit components for vanilla consumers', () => {
		expect(paletteTo6Bit([[255, 0, 170]])).toEqual([[63, 0, 42]]);
	});
});

describe('font bytes revival', () => {
	it('revives Buffer-JSON, arrays, and typed arrays', () => {
		const bytes = [1, 2, 3, 4];
		expect(reviveFontBytes({ type: 'Buffer', data: bytes })).toEqual(
			Uint8Array.from(bytes),
		);
		expect(reviveFontBytes(bytes)).toEqual(Uint8Array.from(bytes));
		const typed = Uint8Array.from(bytes);
		expect(reviveFontBytes(typed)).toBe(typed);
	});

	it('returns null for garbage, never throws', () => {
		for (const bad of [
			null,
			undefined,
			'abc',
			42,
			{ type: 'Buffer' },
			[1, 'x'],
		]) {
			expect(reviveFontBytes(bad)).toBeNull();
		}
	});
});

describe('join doc to v3 doc', () => {
	const join = () => ({
		columns: 4,
		rows: 2,
		title: 'piece',
		author: 'xero',
		group: 'impure',
		comments: '',
		ice_colors: true,
		use_9px_font: true,
		font_name: 'IBM VGA',
		palette: Array.from({ length: 16 }, (_, i) => [i * 4, 0, 63 - i * 4]),
		compressed_data: compressBlocks(
			Array.from({ length: 8 }, (_, i) => ({
				code: 64 + i,
				fg: i % 16,
				bg: i % 8,
			})),
		),
	});

	it('decodes cells, flags, palette, and meta', () => {
		const result = joinDocToDoc(join());
		expect(result.doc.getColumns()).toBe(4);
		expect(result.doc.getRows()).toBe(2);
		expect(result.doc.getIceColors()).toBe(true);
		expect(result.doc.getLetterSpacing()).toBe(true);
		expect(result.use9px).toBe(true);
		expect(result.fontName).toBe('IBM VGA');
		expect(result.title).toBe('piece');
		const cell = result.doc.getCell(0, 2, 1);
		expect(cell.glyph).toBe(glyphWord(64 + 6, 0));
		expect(cell.fg).toBe(paletteColor(6));
		// palette entry 1: 6-bit [4, 0, 59] expanded
		expect(result.doc.palette[1]).toBe(
			(expand6to8(4) << 16) | (expand6to8(0) << 8) | expand6to8(59),
		);
	});

	it('routes icy u32 codepoints through the glyph table', () => {
		const j = join();
		const blocks = uncompressBlocks(j.compressed_data, 8);
		blocks[0] = { code: 0x2603, fg: 7, bg: 0 };
		j.compressed_data = compressBlocks(blocks);
		const result = joinDocToDoc(j);
		const cell = result.doc.getCell(0, 0, 0);
		expect(result.doc.glyphTable.get(cell.glyph & 0xffff)).toEqual({
			fontSlot: 0,
			codepoint: 0x2603,
		});
	});

	it('rejects size lies', () => {
		const j = join();
		j.rows = 5; // claims 20 cells, carries 8
		expect(() => joinDocToDoc(j)).toThrow(ProtocolError);
		expect(() => joinDocToDoc({ columns: 0, rows: 5 } as never)).toThrow(
			ProtocolError,
		);
	});
});

describe('v3 doc to join doc', () => {
	it('round-trips classic16 content through the wire shape', () => {
		const doc = createDocV3({ columns: 3, rows: 2 });
		doc.setIceColors(true);
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(219, 0),
			fg: paletteColor(12),
			bg: paletteColor(4),
		});
		const join = docToJoinDoc(doc, { title: 'wire' });
		expect(join.columns).toBe(3);
		expect(join.ice_colors).toBe(true);
		expect(join.title).toBe('wire');
		const back = joinDocToDoc(join);
		const cell = back.doc.getCell(0, 1, 0);
		expect(cell.glyph).toBe(glyphWord(219, 0));
		expect(cell.fg).toBe(paletteColor(12));
		expect(cell.bg).toBe(paletteColor(4));
	});

	it('quantizes truecolor cells for vanilla consumers', () => {
		const doc = createDocV3({ columns: 2, rows: 1, mode: 'free' });
		doc.setIceColors(true);
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(88, 0),
			fg: rgbColor(250, 80, 80),
			bg: paletteColor(0),
		});
		const join = docToJoinDoc(doc);
		const blocks = uncompressBlocks(join.compressed_data!, 2);
		expect(blocks[0].code).toBe(88);
		expect(blocks[0].fg).toBe(12); // nearest default-palette bright red
	});
});

describe('hostile RLE (review pass)', () => {
	it('rejects oversized runs BEFORE allocating', () => {
		const started = performance.now();
		expect(() =>
			uncompressBlocks(
				{
					code: [[32, 1_000_000_000]],
					fg: [[7, 1_000_000_000]],
					bg: [[0, 1_000_000_000]],
				},
				80 * 25,
			),
		).toThrow(ProtocolError);
		// fast-fail, not an 8GB allocation attempt
		expect(performance.now() - started).toBeLessThan(200);
	});
});
