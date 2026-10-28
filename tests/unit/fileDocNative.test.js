/**
 * Doc-native file formats through the Load/Save surface: .tnd and .dur
 * and .0wnz open with a DocV3 payload (the 7th callback arg) plus a
 * lossy u16 projection for legacy bookkeeping; .tnd and .0wnz save
 * straight from the live doc.
 */
import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const ui = {
		sauceTitle: { value: 'fixture' },
		sauceAuthor: { value: 'xero' },
		sauceGroup: { value: 'impure' },
		sauceComments: { value: '' },
	};
	return {
		ui,
		state: {
			title: 'testdoc',
			textArtCanvas: {
				clearXBData: cb => cb && cb(),
				setXBFontData: () => true,
				setFont: (_name, cb) => cb && cb(),
				getDoc: null, // assigned per test
				getXBFontData: () => null,
				getColumns: () => 80,
				getRows: () => 25,
			},
			font: {
				getWidth: () => 8,
				getHeight: () => 16,
				getLetterSpacing: () => false,
			},
		},
	};
});

vi.mock('../../src/js/client/state.js', () => ({ default: mocks.state }));
vi.mock('../../src/js/client/ui.js', () => ({
	$: id => mocks.ui[id] || { value: '' },
	enforceMaxBytes: () => {},
}));

import { Load, Save } from '../../src/js/client/file.js';
import {
	createDocV3,
	decodeEnvelope,
	decodeTundra,
	encodeEnvelope,
	encodeTundra,
	glyphWord,
	gzip,
	paletteColor,
	rgbColor,
} from '../../src/js/core/index';

const openFile = (name, bytes) =>
	new Promise(resolve => {
		Load.file(new File([bytes], name), (...args) => resolve(args));
	});

describe('doc-native file formats', () => {
	it('.tnd opens with truecolor planes and a quantized u16 view', async () => {
		const doc = createDocV3({ columns: 8, rows: 2, mode: 'free' });
		doc.setIceColors(true);
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(219, 0),
			fg: rgbColor(250, 90, 90),
			bg: paletteColor(1),
		});
		// tundra height is content height (PabloDraw's FindEndY), so the
		// last row needs a glyph for the 8x2 shape to survive
		doc.setCell(0, 0, 1, {
			glyph: glyphWord(65, 0),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		const bytes = encodeTundra(doc, { meta: { title: 'tnd fixture' } });

		const [columns, rows, u16, ice, , , docNative] = await openFile(
			'art.tnd',
			bytes,
		);
		expect(columns).toBe(8);
		expect(rows).toBe(2);
		expect(ice).toBe(true);
		expect(docNative).toBeDefined();
		expect(docNative.getCell(0, 1, 0).fg).toBe(rgbColor(250, 90, 90));
		// the u16 view quantizes the RGB fg to bright red
		expect(u16[1] & 15).toBe(12);
		expect(mocks.ui.sauceTitle.value).toBe('tnd fixture');
	});

	it('.dur opens with frames riding the doc', async () => {
		const movie = {
			DurMovie: {
				formatVersion: 8,
				colorFormat: '16',
				framerate: 2,
				columns: 4,
				lines: 1,
				name: 'movie',
				artist: 'xero',
				frames: [
					{
						frameNumber: 1,
						delay: 0,
						contents: ['AB  '],
						colorMap: [
							[
								[8, 0],
								[2, 0],
								[8, 0],
								[8, 0],
							],
						],
					},
					{
						frameNumber: 2,
						delay: 0.1,
						contents: ['  CD'],
						colorMap: [
							[
								[8, 0],
								[8, 0],
								[2, 0],
								[8, 0],
							],
						],
					},
				],
			},
		};
		const bytes = await gzip(
			new TextEncoder().encode(JSON.stringify(movie)),
		);
		const [columns, , u16, , , , docNative] = await openFile(
			'anim.dur',
			bytes,
		);
		expect(columns).toBe(4);
		expect(docNative.frames).toHaveLength(2);
		expect(docNative.frames[1].delayMs).toBe(100);
		expect(u16[0] >> 8).toBe(65); // frame 0 projects
	});

	it('.0wnz round-trips through save and open', async () => {
		const doc = createDocV3({ columns: 5, rows: 3, mode: 'free' });
		doc.setCell(0, 2, 1, {
			glyph: glyphWord(doc.glyphTable.idFor(0, 0x2603), 0),
			fg: rgbColor(1, 2, 3),
			bg: paletteColor(4),
		});
		mocks.state.textArtCanvas.getDoc = () => doc;

		// capture what Save.ownz would write (no picker in jsdom: it
		// falls to the download path; intercept via encode round-trip)
		const bytes = await encodeEnvelope(doc, { meta: { title: 'native' } });
		const [columns, rows, , , , , docNative] = await openFile(
			'art.0wnz',
			bytes,
		);
		expect(columns).toBe(5);
		expect(rows).toBe(3);
		const cell = docNative.getCell(0, 2, 1);
		expect(docNative.glyphTable.get(cell.glyph & 0xffff)).toEqual({
			fontSlot: 0,
			codepoint: 0x2603,
		});
		expect(cell.fg).toBe(rgbColor(1, 2, 3));
	});

	it('.tnd save encodes the live doc and decodes back', () => {
		const doc = createDocV3({ columns: 4, rows: 1, mode: 'free' });
		doc.setIceColors(true);
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(88, 0),
			fg: rgbColor(9, 8, 7),
			bg: paletteColor(0),
		});
		const bytes = encodeTundra(doc, { meta: { title: 'roundtrip' } });
		const back = decodeTundra(bytes);
		expect(back.meta.title).toBe('roundtrip');
		expect(back.doc.getCell(0, 0, 0).fg).toBe(rgbColor(9, 8, 7));
	});

	it('a damaged archive entry speaks after its load completes', async () => {
		const events = [];
		mocks.state.modal = { error: message => events.push(`notice: ${message}`) };
		try {
			const doc = createDocV3({ columns: 3, rows: 1 });
			const bytes = await encodeEnvelope(doc);
			await new Promise(resolve => {
				Load.file(
					new File([bytes], 'piece.0wnz'),
					async () => {
						events.push('loaded');
						resolve();
					},
					{ notice: 'PIECE<1>.ANS is damaged' },
				);
			});
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(events).toEqual(['loaded', 'notice: PIECE&lt;1&gt;.ANS is damaged']);
		} finally {
			delete mocks.state.modal;
		}
	});

	it('a failing .0wnz or .dur save tells the artist', async () => {
		// the menu drops the save promise, so an uncaught throw here
		// used to vanish without a word
		mocks.state.textArtCanvas.getDoc = () => {
			throw new Error('doc gone');
		};
		const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(Save.ownz()).resolves.toBeUndefined();
		await expect(Save.dur()).resolves.toBeUndefined();
		const messages = alert.mock.calls.map(([message]) => message);
		expect(messages[0]).toMatch(/^\.0wnz save failed: /);
		expect(messages[1]).toBe('durdraw export failed: doc gone');
		alert.mockRestore();
		quiet.mockRestore();
	});

	it('exposes tnd and ownz on the Save surface', () => {
		expect(typeof Save.tnd).toBe('function');
		expect(typeof Save.ownz).toBe('function');
	});

	it('envelope decode tolerates its own saved meta', async () => {
		const doc = createDocV3({ columns: 2, rows: 2 });
		const bytes = await encodeEnvelope(doc, { meta: { title: 'fixture', author: 'xero', group: 'impure' } });
		const back = await decodeEnvelope(bytes);
		expect(back.meta.title).toBe('fixture');
	});
});
