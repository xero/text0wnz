/**
 * File > Open for the classic formats: .ans, .diz, .nfo, .txt, and .bin
 * decode through the core codecs, and the open callback, the SAUCE
 * dialog, and font selection see exactly what the decoder read. Runs
 * under real jsdom File and FileReader.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	concatBytes,
	makeSauce,
	textToBytes,
} from '../corpus/generators.js';

const ui = vi.hoisted(() => new Map());

vi.mock('../../src/js/client/state.js', () => ({ default: { textArtCanvas: { clearXBData: cb => cb() } } }));
vi.mock('../../src/js/client/ui.js', () => ({
	$: id => {
		if (!ui.has(id)) {
			ui.set(id, { value: '' });
		}
		return ui.get(id);
	},
	enforceMaxBytes: () => {},
}));

import { Load } from '../../src/js/client/file.js';

/** resolves with the open callback's arguments */
const open = (name, bytes, opts = {}) =>
	new Promise((resolve, reject) => {
		Load.file(new File([bytes], name), (...args) => resolve(args), {
			...opts,
			onError: reject,
		});
	});

const withSauce = (body, sauce) =>
	concatBytes([body, Uint8Array.of(0x1a), makeSauce(sauce)]);

const glyphs = cells => Array.from(cells, cell => cell >> 8);

beforeEach(() => {
	ui.clear();
});

describe('fontForFile', () => {
	it('lets a SAUCE font record outrank the scene default and an archive hint', () => {
		expect(Load.fontForFile('release.nfo', 'IBM VGA', undefined)).toBe('CP437 8x16');
		expect(Load.fontForFile('file_id.diz', 'IBM VGA', 'Topaz+ 1200')).toBe('CP437 8x16');
	});

	it('falls back to Topaz-437 for an NFO or DIZ without a font in its SAUCE', () => {
		expect(Load.fontForFile('release.nfo', undefined, undefined)).toBe('Topaz-437 8x16');
		expect(Load.fontForFile('FILE_ID.DIZ', '', undefined)).toBe('Topaz-437 8x16');
		expect(Load.fontForFile('release.nfo', 'No Such Font', undefined)).toBe('Topaz-437 8x16');
	});

	it('lets an archive hint beat the scene default but not SAUCE', () => {
		expect(Load.fontForFile('file_id.diz', undefined, 'Topaz+ 1200')).toBe('Topaz+ 1200');
		expect(Load.fontForFile('art.ans', undefined, 'Topaz+ 1200')).toBe('Topaz+ 1200');
	});

	it('keeps the current font for plain files and leaves XB fonts alone', () => {
		expect(Load.fontForFile('art.ans', undefined, undefined)).toBeNull();
		expect(Load.fontForFile('art.ans', 'No Such Font', undefined)).toBeNull();
		expect(Load.fontForFile('art.xb', 'IBM VGA', 'Topaz+ 1200')).toBeNull();
	});
});

describe('ANSI opens', () => {
	it('resets attributes on ESC[m after bold', async () => {
		// ECMA-48 §8.3.117: an empty SGR parameter is 0, not bold
		const [, , cells] = await open('reset.ans', textToBytes('\x1b[1;31mA\x1b[mB'));
		expect(cells[0] & 0xff).toBe(0x0c);
		expect(cells[1] & 0xff).toBe(0x07);
	});

	it('lands SGR colors in BIN color order', async () => {
		const [, , cells] = await open(
			'order.ans',
			textToBytes('\x1b[31mR\x1b[34mB\x1b[36mC\x1b[33mY'),
		);
		expect(Array.from(cells.subarray(0, 4), cell => cell & 0x0f)).toEqual([4, 1, 3, 6]);
	});

	it('keeps COMNT text out of the art when SAUCE FileSize is 0', async () => {
		const [columns, rows, cells] = await open(
			'nosize.ans',
			withSauce(textToBytes('HELLO'), {
				fileSize: 0,
				comments: ['secret comment line'],
			}),
		);
		expect(columns).toBe(80);
		expect(rows).toBe(1);
		expect(glyphs(cells.subarray(0, 5))).toEqual([...'HELLO'].map(c => c.charCodeAt(0)));
		expect(glyphs(cells.subarray(5)).every(glyph => glyph === 0)).toBe(true);
		expect(ui.get('sauceComments').value).toBe('secret comment line');
	});

	it('reads SAUCE text as CP437 into the dialog', async () => {
		await open(
			'cafe.ans',
			withSauce(textToBytes('HI'), {
				fileSize: 2,
				title: 'caf\x82 \x9c5',
				author: '\x8eL',
				group: 'gr\x81n',
				comments: ['na\x8bve r\x82sum\x82'],
			}),
		);
		expect(ui.get('sauceTitle').value).toBe('café £5');
		expect(ui.get('sauceAuthor').value).toBe('ÄL');
		expect(ui.get('sauceGroup').value).toBe('grün');
		expect(ui.get('sauceComments').value).toBe('naïve résumé');
	});

	it('stops a SAUCE field at its NUL terminator', async () => {
		const [, , , , , fontName] = await open(
			'nul.ans',
			withSauce(textToBytes('HI'), {
				fileSize: 2,
				title: 'Title\0garbage!',
				fontName: 'IBM VGA\0junk',
			}),
		);
		expect(ui.get('sauceTitle').value).toBe('Title');
		expect(fontName).toBe('IBM VGA');
	});

	it('hands an NFO SAUCE font to font selection', async () => {
		const [, , , , , fontName] = await open(
			'release.nfo',
			withSauce(textToBytes('HI'), { fileSize: 2, fontName: 'Amiga Topaz 2+' }),
		);
		expect(Load.fontForFile('release.nfo', fontName)).toBe('Topaz+ 1200 8x16');
	});

	it('reads nothing but the payload fence from an unknown SAUCE version', async () => {
		// pre-standard writers leave stale file bytes in TFlags (here ice
		// and 9px) and TInfoS
		const record = makeSauce({
			fileSize: 2,
			tinfo1: 40,
			title: 'Fatal Error',
			flags: 0b101,
			fontName: 'IBM VGA50',
		});
		record[5] = 0x20;
		record[6] = 0x20;
		const [columns, rows, , iceColors, letterSpacing, fontName] = await open(
			'old.ans',
			concatBytes([textToBytes('HI'), Uint8Array.of(0x1a), record]),
		);
		expect([columns, rows, iceColors, letterSpacing, fontName]).toEqual([
			80,
			1,
			false,
			undefined,
			undefined,
		]);
		expect(ui.get('sauceTitle').value).toBe('');
	});
});

describe('BIN opens', () => {
	const binSauce = sauce => ({ datatype: 5, filetype: 80, ...sauce });

	it('pads a trailing partial row', async () => {
		const [columns, rows, cells] = await open(
			'partial.bin',
			withSauce(new Uint8Array(650).fill(0x41), binSauce({ fileSize: 650 })),
		);
		expect(columns).toBe(160);
		expect(rows).toBe(3);
		expect(cells[324]).toBe(0x4141);
		expect(cells[325]).toBe(0);
	});

	it('keeps the SAUCE trailer out of the cells when FileSize is 0', async () => {
		const [, rows, cells] = await open(
			'nosize.bin',
			withSauce(
				new Uint8Array(640).fill(0x42),
				binSauce({ fileSize: 0, comments: ['one', 'two', 'three']}),
			),
		);
		expect(rows).toBe(2);
		expect(cells.every(cell => cell === 0x4242)).toBe(true);
		expect(ui.get('sauceComments').value).toBe('one\ntwo\nthree');
	});

	it('reads a FileType 1 record as the 160-column default', async () => {
		// wild BINs stamp the ANSi FileType; width 2 is never real art
		const [columns, rows] = await open(
			'stamped.bin',
			withSauce(new Uint8Array(960), binSauce({ filetype: 1, tinfo1: 80, fileSize: 960 })),
		);
		expect([columns, rows]).toEqual([160, 3]);
	});

	it('ignores the TInfo1 width of a Character record', async () => {
		// generic SAUCE adders stamp 80x25 on 160-column BINs
		const [columns, rows] = await open(
			'charrec.bin',
			withSauce(new Uint8Array(640), {
				datatype: 1,
				filetype: 1,
				tinfo1: 80,
				fileSize: 640,
			}),
		);
		expect([columns, rows]).toEqual([160, 2]);
	});

	it('hands its SAUCE font, flags, and text to the open', async () => {
		const [, , , iceColors, letterSpacing, fontName] = await open(
			'font.bin',
			withSauce(
				new Uint8Array(320),
				binSauce({ fileSize: 320, fontName: 'IBM VGA50', flags: 0b101, title: 'bin' }),
			),
		);
		expect([iceColors, letterSpacing, fontName]).toEqual([true, true, 'IBM VGA50']);
		expect(ui.get('sauceTitle').value).toBe('bin');
	});
});
