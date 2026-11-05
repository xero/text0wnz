// blocks are built with the SAME core packer the bake tool uses, so
// these bytes match production assets
import { describe, it, expect, vi, afterEach } from 'vitest';
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

/**
 * fetch stub serving a manifest + packed blocks, counting requests; a
 * flaky block fails its first request only, as a dropped connection does
 */
const makeFetch = ({ fonts, blocks, failBlocks = [], flaky = []}) => {
	const requests = [];
	const fetchFn = vi.fn(async url => {
		requests.push(url);
		if (url.endsWith('/manifest.json')) {
			return {
				ok: true,
				json: async () => ({ fonts }),
			};
		}
		const match = (/\/([a-z0-9]+)\/([0-9a-f]+)\.bin$/).exec(url);
		const key = `${match[1]}/${match[2]}`;
		if (failBlocks.includes(key)) {
			return { ok: false, status: 404 };
		}
		if (flaky.includes(key) && requests.filter(u => u === url).length === 1) {
			throw new TypeError('Failed to fetch');
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
		// absent in unscii's block: the unifont fallback kicks in and is
		// pending first, then definitively absent there too
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x2593, 8, 16)).toBeUndefined();
		await flush();
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x2593, 8, 16)).toBeNull();
		// block unscii does not list: falls back to unifont, where 4e2d
		// exists but is WIDE, so the v1 policy substitutes
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x4e2d, 8, 16)).toBeUndefined();
		await flush();
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

	it('a repaint never retries a failed block, and the other font covers', async () => {
		const { fetchFn, requests } = makeFetch({
			fonts: UNSCII_FONTS,
			blocks: BLOCKS,
			failBlocks: ['unscii16/25'],
		});
		const pages = createHexFontPages({ baseUrl: 'u', fetchFn });
		pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16);
		await flush();
		pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16);
		await flush();
		// the unscii fetch failed; this ask starts the unifont fallback
		// fetch, whose copy then renders
		pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16);
		await flush();
		expect(
			pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16),
		).toBeInstanceOf(Uint8Array);
		// and the failed block is never re-fetched
		const count = requests.length;
		pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16);
		pages.glyphBits(FONT_SLOT_UNSCII, 0x2593, 8, 16);
		await flush();
		expect(requests.filter(u => u.includes('unscii16/25')).length).toBe(1);
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

describe('a block whose fetch failed', () => {
	// listed by unscii alone, so no other font covers it
	const ONLY_UNSCII = { unscii16: { blocks: ['25']}, unifont: { blocks: []} };
	const flakyPages = () => {
		const { fetchFn, requests } = makeFetch({
			fonts: ONLY_UNSCII,
			blocks: BLOCKS,
			flaky: ['unscii16/25'],
		});
		return { pages: createHexFontPages({ baseUrl: 'u', fetchFn }), requests };
	};
	// the retry cooldown runs on wall time
	const later = ms => vi.setSystemTime(Date.now() + ms);
	const COOLDOWN = 30000;
	afterEach(() => {
		vi.useRealTimers();
	});

	it('a later pick asks again, and the repaint path renders what lands', async () => {
		const { pages } = flakyPages();
		expect(await pages.pickSlot(0x2592)).toBeNull();
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16)).toBeNull();
		later(COOLDOWN);
		expect(await pages.pickSlot(0x2592)).toBe(FONT_SLOT_UNSCII);
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16)).toBeInstanceOf(Uint8Array);
	});

	it('a retry that fails again repaints into a miss, never another fetch', async () => {
		const { fetchFn, requests } = makeFetch({
			fonts: ONLY_UNSCII,
			blocks: BLOCKS,
			failBlocks: ['unscii16/25'],
		});
		const fetched = () => requests.filter(u => u.endsWith('.bin')).length;
		// the renderer repaints on every arrival, a failed one included;
		// bounded, so a repaint that fetches fails here instead of spinning
		let repaints = 0;
		const pages = createHexFontPages({
			baseUrl: 'u',
			fetchFn,
			onBlocksLoaded: () =>
				++repaints < 50 && pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16),
		});
		await pages.pickSlot(0x2592);
		const before = fetched();
		later(COOLDOWN);
		await pages.pickSlot(0x2592);
		await flush();
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16)).toBeNull();
		expect(fetched()).toBe(before + 1);
	});

	// a peer's glyph frames each pick, so a block that fails for good
	// stalls one frame per cooldown, not every frame
	it('a block that keeps failing answers as failed until its cooldown passes', async () => {
		vi.setSystemTime(Date.now());
		const { fetchFn, requests } = makeFetch({
			fonts: ONLY_UNSCII,
			blocks: BLOCKS,
			failBlocks: ['unscii16/25'],
		});
		const fetched = () => requests.filter(u => u.endsWith('.bin')).length;
		const pages = createHexFontPages({ baseUrl: 'u', fetchFn });
		const defs = [{ fontSlot: FONT_SLOT_UNSCII, codepoint: 0x2592 }];
		expect(await pages.pickSlot(0x2592)).toBeNull();
		expect(fetched()).toBe(1);
		later(COOLDOWN - 1);
		expect(await pages.pickSlot(0x2592)).toBeNull();
		await pages.preload(defs);
		expect(fetched()).toBe(1);
		later(1);
		expect(await pages.pickSlot(0x2592)).toBeNull();
		expect(fetched()).toBe(2);
	});

	it('a doc\'s preload asks again', async () => {
		const { pages, requests } = flakyPages();
		const defs = [{ fontSlot: FONT_SLOT_UNSCII, codepoint: 0x2592 }];
		await pages.preload(defs);
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16)).toBeNull();
		later(COOLDOWN);
		await pages.preload(defs);
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16)).toBeInstanceOf(Uint8Array);
		expect(requests.filter(u => u.endsWith('.bin'))).toEqual([
			'u/unscii16/25.bin',
			'u/unscii16/25.bin',
		]);
	});

	it('reads as loading while a retry is out, so no renderer caches the miss', async () => {
		const { fetchFn } = makeFetch({
			fonts: ONLY_UNSCII,
			blocks: BLOCKS,
			flaky: ['unscii16/25'],
		});
		let release;
		const held = new Promise(resolve => {
			release = resolve;
		});
		let asked = 0;
		const pages = createHexFontPages({
			baseUrl: 'u',
			fetchFn: async url => {
				if (url.endsWith('.bin') && ++asked === 2) {
					await held;
				}
				return fetchFn(url);
			},
		});
		await pages.pickSlot(0x2592);
		later(COOLDOWN);
		const picking = pages.pickSlot(0x2592);
		await flush();
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16)).toBeUndefined();
		release();
		await picking;
		expect(pages.glyphBits(FONT_SLOT_UNSCII, 0x2592, 8, 16)).toBeInstanceOf(Uint8Array);
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
