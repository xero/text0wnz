// Unicode glyph page manager: lazy manifest/block fetches, the
// sync-tri-state glyphBits contract the GL repaint path relies on, and
// slot picking for import/paste. Blocks are built with the SAME core
// packer the bake tool uses, so these bytes match production assets.
import { describe, it, expect, vi } from 'vitest';
import { createHexFontPages } from '../../src/js/client/hexFontPages.js';
import { packBlock } from '../../src/js/core/hexfont.js';
import {
	FONT_SLOT_CLASSIC,
	FONT_SLOT_UNIFONT,
	FONT_SLOT_UNSCII,
} from '../../src/js/core/doc.js';

// □-ish 8x16 test glyph: full first row, MSB column set elsewhere
const narrowGlyph = codepoint => ({
	codepoint,
	wide: false,
	bytes: new Uint8Array([0xff, ...Array(15).fill(0x80)]),
});
const wideGlyph = codepoint => ({
	codepoint,
	wide: true,
	bytes: new Uint8Array(32).fill(0xaa),
});

/** fetch stub serving a manifest + packed blocks, counting requests */
const makeFetch = ({ fonts, blocks, failBlocks = []}) => {
	const requests = [];
	const fetchFn = vi.fn(async url => {
		requests.push(url);
		if (url.endsWith('/manifest.json')) {
			return {
				ok: true,
				json: async () => ({ formatVersion: 1, fonts }),
			};
		}
		const match = (/\/([a-z0-9]+)\/([0-9a-f]+)\.bin$/).exec(url);
		const key = `${match[1]}/${match[2]}`;
		if (failBlocks.includes(key)) {
			return { ok: false, status: 404 };
		}
		const packed = blocks[key];
		return {
			ok: true,
			arrayBuffer: async () =>
				packed.buffer.slice(
					packed.byteOffset,
					packed.byteOffset + packed.byteLength,
				),
		};
	});
	return { fetchFn, requests };
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const UNSCII_FONTS = {
	unscii16: { blocks: ['0', '25']},
	unifont: { blocks: ['0', '25', '4e']},
};
const BLOCKS = {
	'unscii16/0': packBlock(0, [narrowGlyph(0x41)]),
	'unscii16/25': packBlock(0x25, [narrowGlyph(0x2592)]),
	'unifont/0': packBlock(0, [narrowGlyph(0x41)]),
	'unifont/25': packBlock(0x25, [narrowGlyph(0x2592)]),
	'unifont/4e': packBlock(0x4e, [wideGlyph(0x4e2d), narrowGlyph(0x4e00)]),
};

describe('glyphBits', () => {
	it('answers undefined while loading, bits after, null for misses', async () => {
		const { fetchFn } = makeFetch({ fonts: UNSCII_FONTS, blocks: BLOCKS });
		const ready = vi.fn();
		const pages = createHexFontPages({
			baseUrl: 'u',
			fetchFn,
			onBlocksLoaded: ready,
		});
		// pending manifest
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16)).toBeUndefined();
		await flush();
		// manifest in, block pending
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16)).toBeUndefined();
		await flush();
		const bits = pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16);
		expect(bits).toBeInstanceOf(Uint8Array);
		expect(bits).toHaveLength(8 * 16);
		// first row of the test glyph is solid
		expect([...bits.slice(0, 8)]).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
		expect(ready).toHaveBeenCalled();
		// absent codepoint in a present block
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x2593, 8, 16)).toBeNull();
		// block the font does not list: no fetch, definitive null
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x4e2d, 8, 16)).toBeNull();
		// unknown slot (classic font never routes here)
		expect(pages.glyphBits(FONT_SLOT_CLASSIC, 0x41, 8, 16)).toBeNull();
		expect(pages.glyphBits(99, 0x41, 8, 16)).toBeNull();
	});

	it('scales nearest-neighbor to the font metrics and memoizes', async () => {
		const { fetchFn } = makeFetch({ fonts: UNSCII_FONTS, blocks: BLOCKS });
		const pages = createHexFontPages({ baseUrl: 'u', fetchFn });
		// repaint flow: ask (manifest), ask again (block), ask (bits)
		pages.glyphBits(FONT_SLOT_UNSCII, 0x41, 8, 16);
		await flush();
		pages.glyphBits(FONT_SLOT_UNSCII, 0x41, 8, 16);
		await flush();
		const at8x8 = pages.glyphBits(FONT_SLOT_UNSCII, 0x41, 8, 8);
		expect(at8x8).toHaveLength(64);
		// solid top row survives any vertical scale
		expect([...at8x8.slice(0, 8)]).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
		// MSB column survives horizontal identity
		expect(at8x8[8]).toBe(1);
		expect(at8x8[9]).toBe(0);
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x41, 8, 8)).toBe(at8x8);
		expect(pages.stats().scaled).toBe(1);
	});

	it('treats wide glyphs as substitutes under the v1 policy', async () => {
		const { fetchFn } = makeFetch({ fonts: UNSCII_FONTS, blocks: BLOCKS });
		const pages = createHexFontPages({ baseUrl: 'u', fetchFn });
		pages.glyphBits(FONT_SLOT_UNIFONT, 0x4e2d, 8, 16);
		await flush();
		pages.glyphBits(FONT_SLOT_UNIFONT, 0x4e2d, 8, 16);
		await flush();
		expect(pages.glyphBits(FONT_SLOT_UNIFONT, 0x4e2d, 8, 16)).toBeNull();
		// its narrow neighbor in the same block renders
		expect(
			pages.glyphBits(FONT_SLOT_UNIFONT, 0x4e00, 8, 16),
		).toBeInstanceOf(Uint8Array);
	});

	it('never retry-storms a failed block and dedupes in-flight fetches', async () => {
		const { fetchFn, requests } = makeFetch({
			fonts: UNSCII_FONTS,
			blocks: BLOCKS,
			failBlocks: ['unscii16/25'],
		});
		const pages = createHexFontPages({ baseUrl: 'u', fetchFn });
		pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16);
		await flush();
		pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16);
		pages.glyphBits(FONT_SLOT_UNSCII, 0x2593, 8, 16);
		await flush();
		// failed: definitive null, and no further requests on re-ask
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16)).toBeNull();
		const count = requests.length;
		pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16);
		await flush();
		expect(requests.length).toBe(count);
	});

	it('survives a failed manifest as all-null', async () => {
		const fetchFn = vi.fn(async () => ({ ok: false, status: 500 }));
		const pages = createHexFontPages({ baseUrl: 'u', fetchFn });
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x41, 8, 16)).toBeUndefined();
		await flush();
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x41, 8, 16)).toBeNull();
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});
});

describe('pickSlot', () => {
	it('prefers unscii, falls back to unifont coverage, else null', async () => {
		const { fetchFn } = makeFetch({ fonts: UNSCII_FONTS, blocks: BLOCKS });
		const pages = createHexFontPages({ baseUrl: 'u', fetchFn });
		expect(await pages.pickSlot(0x2592)).toBe(FONT_SLOT_UNSCII);
		// narrow unifont-only glyph
		expect(await pages.pickSlot(0x4e00)).toBe(FONT_SLOT_UNIFONT);
		// wide everywhere -> substitute
		expect(await pages.pickSlot(0x4e2d)).toBeNull();
		// covered by neither
		expect(await pages.pickSlot(0x1fb00)).toBeNull();
	});
});

describe('preload', () => {
	it('fetches every listed block a glyph table needs, once', async () => {
		const { fetchFn, requests } = makeFetch({
			fonts: UNSCII_FONTS,
			blocks: BLOCKS,
		});
		const pages = createHexFontPages({ baseUrl: 'u', fetchFn });
		await pages.preload([
			{ fontSlot: FONT_SLOT_CLASSIC, codepoint: 0x41 },
			{ fontSlot: FONT_SLOT_UNSCII, codepoint: 0x2592 },
			{ fontSlot: FONT_SLOT_UNSCII, codepoint: 0x2593 },
			{ fontSlot: FONT_SLOT_UNIFONT, codepoint: 0x4e00 },
		]);
		const blockRequests = requests.filter(u => u.endsWith('.bin'));
		expect(blockRequests.sort()).toEqual([
			'u/unifont/4e.bin',
			'u/unscii16/25.bin',
		]);
		expect(
			pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16),
		).toBeInstanceOf(Uint8Array);
	});
});
