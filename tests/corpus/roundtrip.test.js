/**
 * Round-trip corpus harness.
 *
 * Tier (a): every committed artwork in src/ansi must decode, re-encode, and
 * decode again to the identical cell grid, and the encoder must be a fixed
 * point (encode(decode(encode)) is byte-identical).
 *
 * Tier (b): synthetic fixtures from ./generators.js cover edge cases wild
 * files can't guarantee: weird SAUCE records, ice color ANSI, 132-column,
 * XBin RLE with all four run types, 512-glyph XBin fonts, UTF-8 multibyte
 * rows, and large dimensions.
 *
 * Tier (c), bulk conformance against the sixteencolors archive mirror, is
 * NOT run here; see tests/fixtures/README.md.
 *
 * These tests pin v2 behavior as the regression baseline for the v3 codec
 * package. A known v2 defect is marked it.fails with a comment; when a fix
 * lands, the test flips to red and gets promoted to a plain it().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
	decodeAns as coreDecodeAns,
	decodeBin as coreDecodeBin,
	decodeXBin as coreDecodeXBin,
	encodeAns as coreEncodeAns,
	encodeUtf8 as coreEncodeUtf8,
	encodeBin as coreEncodeBin,
	encodeXBin as coreEncodeXBin,
	v3ToU16,
	v3ToU16Lossy,
	u16ToV3,
} from '../../src/js/core/index';
import {
	makeAnsi,
	makeBin,
	makeCells,
	makeSauce,
	makeUtf8Ansi,
	makeXBin,
	makeXBinFont,
	makeXBinPalette,
	makeXBinRleRuns,
	textToBytes,
	concatBytes,
} from './generators.js';
import { parseSauce } from '../../src/js/core/codecs/sauce.js';

// Persistent fake UI elements so SAUCE fields survive load -> save
const mockUIElements = {};
const getElement = id => {
	if (!mockUIElements[id]) {
		mockUIElements[id] = { value: '' };
	}
	return mockUIElements[id];
};

// Default XBin palette in 6-bit space (matches createDefaultPalette)
const DEFAULT_XB_PALETTE = new Uint8Array([
	0, 0, 0, 0, 0, 42, 0, 42, 0, 0, 42, 42,
	42, 0, 0, 42, 0, 42, 42, 21, 0, 42, 42, 42,
	21, 21, 21, 21, 21, 63, 21, 63, 21, 21, 63, 63,
	63, 21, 21, 63, 21, 63, 63, 63, 21, 63, 63, 63,
]);

const mockState = {
	title: 'corpus',
	textArtCanvas: {
		getColumns: vi.fn(() => 80),
		getRows: vi.fn(() => 25),
		getImageData: vi.fn(() => new Uint16Array(80 * 25).fill(0x2007)),
		getIceColors: vi.fn(() => false),
		getCurrentFontName: vi.fn(() => 'CP437 8x16'),
		getXBPaletteData: vi.fn(() => DEFAULT_XB_PALETTE),
		setXBPaletteData: vi.fn(),
		setXBFontData: vi.fn(() => true),
		setFont: vi.fn((name, cb) => cb && cb()),
		// the save paths read the doc now; derive it from the wired u16
		// mocks at call time so wireDoc keeps working untouched
		getDoc: vi.fn(() =>
			u16ToV3({
				imageData: mockState.textArtCanvas.getImageData(),
				columns: mockState.textArtCanvas.getColumns(),
				rows: mockState.textArtCanvas.getRows(),
				iceColors: mockState.textArtCanvas.getIceColors(),
				letterSpacing: mockState.font.getLetterSpacing(),
			})),
		getCurrentFrame: vi.fn(() => 0),
		clearXBData: vi.fn(callback => callback()),
		redrawEntireImage: vi.fn(),
	},
	font: {
		getWidth: vi.fn(() => 8),
		getHeight: vi.fn(() => 16),
		getLetterSpacing: vi.fn(() => false),
		getData: vi.fn(() => null),
	},
};

vi.mock('../../src/js/client/state.js', () => ({ default: mockState }));

vi.mock('../../src/js/client/ui.js', () => ({
	$: vi.fn(id => getElement(id)),
	enforceMaxBytes: vi.fn(),
}));

// NOTE: palette.js is NOT mocked; the UTF-8 round-trips exercise the real
// CP437 <-> unicode maps.

let Load;
let Save;
let savedBytes;

beforeEach(async () => {
	vi.clearAllMocks();
	savedBytes = null;
	Object.keys(mockUIElements).forEach(key => {
		mockUIElements[key].value = '';
	});
	mockState.textArtCanvas.clearXBData.mockImplementation(cb => cb());

	// No showSaveFilePicker -> saveFile takes the Blob download path
	vi.stubGlobal('window', {});
	vi.stubGlobal(
		'Blob',
		vi.fn(function (parts) {
			savedBytes = parts[0];
			return this;
		}),
	);
	const mockURL = vi.fn(function (url) {
		this.href = url;
		return this;
	});
	mockURL.createObjectURL = vi.fn(() => 'blob:mock-url');
	mockURL.revokeObjectURL = vi.fn();
	vi.stubGlobal('URL', mockURL);
	vi.stubGlobal('navigator', { userAgent: 'Chrome/90.0' });
	vi.stubGlobal('document', {
		createElement: vi.fn(() => ({
			href: '',
			download: '',
			click: vi.fn(),
		})),
		dispatchEvent: vi.fn(),
	});

	const fileModule = await import('../../src/js/client/file.js');
	Load = fileModule.Load;
	Save = fileModule.Save;
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

/**
 * Decode bytes through Load.file. Returns the doc the editor would build:
 * {columns, rows, data, iceColors, letterSpacing, fontName} plus, for XBin,
 * {paletteData, fontData}.
 */
const decode = (name, bytes) =>
	new Promise((resolve, reject) => {
		const file = new File([bytes], name);
		const timer = setTimeout(
			() => reject(new Error(`decode timed out for ${name}`)),
			10000,
		);
		// XB palette/font land through canvas calls now that the client
		// rides core decodeXBin; capture them off the mocks
		mockState.textArtCanvas.setXBPaletteData.mockClear();
		mockState.textArtCanvas.setXBFontData.mockClear();
		Load.file(file, (columns, rows, data, iceColors, letterSpacing, fontName) => {
			clearTimeout(timer);
			const pal = mockState.textArtCanvas.setXBPaletteData.mock.calls.at(-1);
			const font = mockState.textArtCanvas.setXBFontData.mock.calls.at(-1);
			resolve({
				columns,
				rows,
				data,
				iceColors,
				letterSpacing,
				fontName: fontName ?? (font ? 'XBIN' : undefined),
				paletteData: pal ? pal[0] : null,
				fontData: font
					? { bytes: font[0], width: font[1], height: font[2] }
					: null,
			});
		});
	});

/** Point the mocked State at a decoded doc so Save.* reads it back out. */
const wireDoc = doc => {
	mockState.textArtCanvas.getColumns.mockReturnValue(doc.columns);
	mockState.textArtCanvas.getRows.mockReturnValue(doc.rows);
	mockState.textArtCanvas.getImageData.mockReturnValue(doc.data);
	mockState.textArtCanvas.getIceColors.mockReturnValue(!!doc.iceColors);
	mockState.textArtCanvas.getCurrentFontName.mockReturnValue(
		Load.sauceToAppFont(doc.fontName || '') || 'CP437 8x16',
	);
	mockState.textArtCanvas.getXBPaletteData.mockReturnValue(
		doc.paletteData || DEFAULT_XB_PALETTE,
	);
	mockState.font.getLetterSpacing.mockReturnValue(!!doc.letterSpacing);
	if (doc.fontData && doc.fontData.bytes) {
		mockState.font.getData.mockReturnValue({ data: doc.fontData.bytes });
		mockState.font.getHeight.mockReturnValue(doc.fontData.height);
	} else {
		mockState.font.getData.mockReturnValue(null);
		mockState.font.getHeight.mockReturnValue(16);
	}
};

/** Run a Save.* export and capture the written bytes. */
const encode = async (kind, ...args) => {
	savedBytes = null;
	await Save[kind](...args);
	expect(savedBytes).not.toBeNull();
	return savedBytes;
};

const expectSameCells = (d2, d1, label) => {
	expect(d2.columns, `${label}: columns`).toBe(d1.columns);
	expect(d2.rows, `${label}: rows`).toBe(d1.rows);
	expect(d2.data, `${label}: cell data`).toEqual(d1.data);
	expect(!!d2.iceColors, `${label}: iceColors`).toBe(!!d1.iceColors);
};

// ---------------------------------------------------------------------------
// Tier (a): committed, owner-cleared artwork
// ---------------------------------------------------------------------------

// vitest runs from the repo root (import.meta.url is virtualized here)
const ansiDir = path.resolve(process.cwd(), 'src/ansi');
const tierAFiles = readdirSync(ansiDir).filter(name => (/\.ans$/i).test(name));

describe('corpus tier (a): committed artwork', () => {
	it('finds the committed corpus', () => {
		expect(tierAFiles.length).toBeGreaterThan(10);
	});

	it.each(tierAFiles)(
		'%s: decode -> encode -> decode is cell-identical and encoder is a fixed point',
		async name => {
			const bytes = new Uint8Array(readFileSync(path.join(ansiDir, name)));
			const d1 = await decode(name, bytes);
			expect(d1.columns).toBeGreaterThan(0);
			expect(d1.rows).toBeGreaterThan(0);

			wireDoc(d1);
			const e1 = await encode('ans');
			const d2 = await decode('roundtrip.ans', e1);
			expectSameCells(d2, d1, name);

			wireDoc(d2);
			const e2 = await encode('ans');
			expect(e2, `${name}: encoder fixed point`).toEqual(e1);
		},
	);
});

// ---------------------------------------------------------------------------
// Tier (b): synthetic edge cases
// ---------------------------------------------------------------------------

describe('corpus tier (b): synthetic ANSI', () => {
	it('full-width ANSI round-trips', async () => {
		const bytes = makeAnsi({ columns: 80, rows: 50, seed: 42 });
		const d1 = await decode('synthetic.ans', bytes);
		expect(d1.columns).toBe(80);
		wireDoc(d1);
		const d2 = await decode('rt.ans', await encode('ans'));
		expectSameCells(d2, d1, 'full-width');
	});

	it('CRLF partial rows round-trip', async () => {
		const bytes = makeAnsi({ columns: 80, rows: 30, seed: 7, lineBreaks: true });
		const d1 = await decode('crlf.ans', bytes);
		wireDoc(d1);
		const d2 = await decode('rt.ans', await encode('ans'));
		expectSameCells(d2, d1, 'crlf');
	});

	it('ice color ANSI keeps bright backgrounds and the SAUCE flag', async () => {
		const bytes = makeAnsi({
			columns: 80,
			rows: 25,
			ice: true,
			seed: 99,
			sauce: { title: 'ice test', flags: 0b00010011, tinfo1: 80, tinfo2: 25 },
		});
		const d1 = await decode('ice.ans', bytes);
		expect(d1.iceColors).toBe(true);
		// The generator produced at least one bright background cell
		const hasBrightBg = Array.from(d1.data).some(cell => ((cell >> 4) & 15) > 7);
		expect(hasBrightBg).toBe(true);
		wireDoc(d1);
		const d2 = await decode('rt.ans', await encode('ans'));
		expectSameCells(d2, d1, 'ice');
		expect(d2.iceColors).toBe(true);
	});

	it('132-column ANSI preserves width through SAUCE', async () => {
		const bytes = makeAnsi({
			columns: 132,
			rows: 40,
			seed: 5,
			sauce: { tinfo1: 132, tinfo2: 40 },
		});
		const d1 = await decode('wide.ans', bytes);
		expect(d1.columns).toBe(132);
		wireDoc(d1);
		const d2 = await decode('rt.ans', await encode('ans'));
		expectSameCells(d2, d1, '132col');
	});

	// 160k cells through encode and decode twice: comfortably fast
	// locally, but slow CI shards have blown the 5s default
	it('large documents round-trip (80x2000)', { timeout: 30_000 }, async () => {
		const bytes = makeAnsi({ columns: 80, rows: 2000, seed: 13 });
		const d1 = await decode('tall.ans', bytes);
		expect(d1.rows).toBe(2000);
		wireDoc(d1);
		const d2 = await decode('rt.ans', await encode('ans'));
		expectSameCells(d2, d1, 'tall');
	});
});

describe('corpus tier (b): weird SAUCE records', () => {
	it('comment blocks, 9px flag, and font name survive decode', async () => {
		const comments = ['first comment line', 'second line', 'a'.repeat(64)];
		const bytes = makeAnsi({
			columns: 80,
			rows: 10,
			seed: 3,
			sauce: {
				title: 'T'.repeat(35),
				author: 'author name',
				group: 'group name',
				comments,
				// ice (bit 0) + 9px letter spacing (bits 1-2 = 10)
				flags: 0b00010101,
				fontName: 'IBM VGA',
				tinfo1: 80,
				tinfo2: 10,
			},
		});
		const d1 = await decode('sauced.ans', bytes);
		expect(d1.iceColors).toBe(true);
		expect(d1.letterSpacing).toBe(true);
		expect(d1.fontName).toBe('IBM VGA');
		// SAUCE text fields land in the (mocked) UI for the next save
		expect(getElement('sauceTitle').value).toBe('T'.repeat(35));
		expect(getElement('sauceAuthor').value).toBe('author name');
		expect(getElement('sauceGroup').value).toBe('group name');
		expect(getElement('sauceComments').value).toContain('first comment line');

		wireDoc(d1);
		const d2 = await decode('rt.ans', await encode('ans'));
		expectSameCells(d2, d1, 'sauce');
		expect(d2.letterSpacing).toBe(true);
		expect(d2.fontName).toBe('IBM VGA');
		expect(getElement('sauceTitle').value).toBe('T'.repeat(35));
	});

	it('LS bits decode tri-state', async () => {
		const noPref = await decode(
			'nopref.ans',
			makeAnsi({
				columns: 80,
				rows: 5,
				seed: 2,
				sauce: { tinfo1: 80, tinfo2: 5, flags: 0 },
			}),
		);
		// bits 00 state no preference: the toggle stays the artist's
		expect(noPref.letterSpacing).toBeUndefined();
		const eightPx = await decode(
			'8px.ans',
			makeAnsi({
				columns: 80,
				rows: 5,
				seed: 2,
				sauce: { tinfo1: 80, tinfo2: 5, flags: 0b00000010 },
			}),
		);
		expect(eightPx.letterSpacing).toBe(false);
		const sauceless = await decode(
			'bare.ans',
			makeAnsi({ columns: 80, rows: 5, seed: 2 }),
		);
		expect(sauceless.letterSpacing).toBeUndefined();
	});

	it('LS no preference survives an untouched resave', async () => {
		const d1 = await decode(
			'nopref.ans',
			makeAnsi({
				columns: 80,
				rows: 5,
				seed: 2,
				sauce: { tinfo1: 80, tinfo2: 5, flags: 0 },
			}),
		);
		expect(d1.letterSpacing).toBeUndefined();
		wireDoc(d1);
		const record = parseSauce(await encode('ans'));
		expect((record.flags >> 1) & 0x03).toBe(0);
		const d2 = await decode('rt.ans', await encode('ans'));
		expect(d2.letterSpacing).toBeUndefined();
	});

	it('aspect bits ride a resave verbatim', async () => {
		const d1 = await decode(
			'aspect.ans',
			makeAnsi({
				columns: 80,
				rows: 5,
				seed: 2,
				sauce: { tinfo1: 80, tinfo2: 5, flags: 0b00001000 },
			}),
		);
		wireDoc(d1);
		const record = parseSauce(await encode('ans'));
		expect((record.flags >> 3) & 0x03).toBe(1);
	});

	it('a trailing SAUCE-sized text file without signature is not misread', async () => {
		// 128+ bytes of plain text; must parse as content, not SAUCE
		const bytes = concatBytes([
			makeAnsi({ columns: 80, rows: 2, seed: 1 }),
			textToBytes('x'.repeat(200)),
		]);
		const d1 = await decode('nosig.ans', bytes);
		expect(d1.iceColors).toBe(false);
		expect(d1.fontName).toBe('');
	});

	// Trusting TInfo1 = 0 verbatim yields a 0-column doc; the loader
	// must keep content-derived dims instead
	it('SAUCE with zero tinfo falls back to content-derived dimensions', async () => {
		const body = makeAnsi({ columns: 80, rows: 5, seed: 2 });
		const bytes = concatBytes([
			body,
			new Uint8Array([0x1a]),
			makeSauce({ fileSize: body.length, tinfo1: 0, tinfo2: 0 }),
		]);
		const d1 = await decode('zerotinfo.ans', bytes);
		expect(d1.columns).toBe(80);
		expect(d1.rows).toBeGreaterThan(0);
	});
});

describe('corpus tier (b): BIN', () => {
	it('BIN SAUCE populates the modal and round-trips its flags', async () => {
		const d1 = await decode(
			'flags.bin',
			makeBin({
				columns: 160,
				rows: 5,
				seed: 3,
				sauce: { title: 'bin fixture', flags: 0b00001000 },
			}),
		);
		expect(getElement('sauceTitle').value).toBe('bin fixture');
		wireDoc(d1);
		const record = parseSauce(await encode('bin'));
		expect((record.flags >> 3) & 0x03).toBe(1);
	});

	it('a BIN open replaces the previous file stashed flags', async () => {
		// the review's exact repro: A.ans carries AR bits, then a
		// SAUCE-less BIN opens; its save must not inherit A's flags
		await decode(
			'a.ans',
			makeAnsi({
				columns: 80,
				rows: 5,
				seed: 2,
				sauce: { tinfo1: 80, tinfo2: 5, flags: 0b00001000 },
			}),
		);
		const bin = await decode('b.bin', makeBin({ columns: 160, rows: 5 }));
		wireDoc(bin);
		const record = parseSauce(await encode('bin'));
		expect((record.flags >> 3) & 0x03).toBe(0);
		expect((record.flags >> 1) & 0x03).not.toBe(0);
	});

	it('BIN with SAUCE round-trips byte-identically in the image region', async () => {
		const bytes = makeBin({
			columns: 160,
			rows: 50,
			seed: 21,
			sauce: { title: 'bin fixture' },
		});
		const d1 = await decode('fixture.bin', bytes);
		expect(d1.columns).toBe(160);
		expect(d1.rows).toBe(50);
		wireDoc(d1);
		const e1 = await encode('bin');
		// Image region (before EOF byte + SAUCE) must match the original
		const imageLen = 160 * 50 * 2;
		expect(Array.from(e1.subarray(0, imageLen))).toEqual(
			Array.from(bytes.subarray(0, imageLen)),
		);
		const d2 = await decode('rt.bin', e1);
		expectSameCells(d2, d1, 'bin');
	});

	it('BIN with SAUCE FileType 0 derives rows from file size at the default width', async () => {
		// FileType 0 means "unspecified" (same convention as zero TInfo):
		// keep the 160-column default and compute rows from the payload
		// size, never from counting newlines in binary data
		const image = makeBin({ columns: 160, rows: 40, seed: 23 });
		const ft0 = makeBin({
			columns: 160,
			rows: 40,
			seed: 23,
			sauce: { filetype: 0, title: 'filetype zero' },
		});
		const d1 = await decode('ft0.bin', ft0);
		expect(d1.columns).toBe(160);
		expect(d1.rows).toBe(40);
		const reference = await decode('ref.bin', image);
		expectSameCells(d1, reference, 'filetype-0 bin');
	});

	it('headerless BIN derives rows from byte length at the default width', async () => {
		const bytes = makeBin({ columns: 160, rows: 30, seed: 24 });
		const d1 = await decode('plain.bin', bytes);
		expect(d1.columns).toBe(160);
		expect(d1.rows).toBe(30);
	});

	it('wide BIN (320 columns) round-trips', async () => {
		const bytes = makeBin({
			columns: 320,
			rows: 100,
			seed: 22,
			sauce: {},
		});
		const d1 = await decode('wide.bin', bytes);
		expect(d1.columns).toBe(320);
		wireDoc(d1);
		const d2 = await decode('rt.bin', await encode('bin'));
		expectSameCells(d2, d1, 'wide bin');
	});
});

describe('corpus tier (b): XBin', () => {
	it('XBin opens leave the spacing toggle alone', async () => {
		// XBin SAUCE defines no LS bits (DataType 6, no TFlags)
		const d1 = await decode('plain.xb', makeXBin({ sauce: {} }));
		expect(d1.letterSpacing).toBeUndefined();
	});

	it('RLE data with all four run types decodes to the expected cells', async () => {
		const columns = 16;
		const { cells, rle } = makeXBinRleRuns(columns);
		const rows = cells.length / columns;
		const bytes = makeXBin({
			columns,
			rows,
			palette: makeXBinPalette(),
			compressed: rle,
			sauce: {},
		});
		const d1 = await decode('rle.xb', bytes);
		expect(d1.data).toEqual(cells);
	});

	it('compressed XBin with palette round-trips through save', async () => {
		const columns = 16;
		const { cells, rle } = makeXBinRleRuns(columns);
		const rows = cells.length / columns;
		const palette = makeXBinPalette();
		const bytes = makeXBin({
			columns,
			rows,
			palette,
			compressed: rle,
			iceColors: true,
			sauce: {},
		});
		const d1 = await decode('rle.xb', bytes);
		expect(d1.iceColors).toBe(true);
		expect(d1.paletteData).toEqual(palette);

		wireDoc(d1);
		const e1 = await encode('xb');
		const d2 = await decode('rt.xb', e1);
		expectSameCells(d2, d1, 'xb rle');
		expect(d2.paletteData).toEqual(palette);
		expect(d2.iceColors).toBe(true);

		// Encoder fixed point
		wireDoc(d2);
		const e2 = await encode('xb');
		expect(e2).toEqual(e1);
	});

	it('uncompressed XBin with embedded 256-glyph font round-trips', async () => {
		const columns = 40;
		const rows = 30;
		const cells = makeCells(columns, rows, 31);
		const font = makeXBinFont(256, 16);
		const palette = makeXBinPalette();
		const bytes = makeXBin({
			columns,
			rows,
			palette,
			font,
			rawCells: cells,
			sauce: {},
		});
		const d1 = await decode('font.xb', bytes);
		expect(d1.fontData).not.toBeNull();
		expect(d1.fontData.bytes.length).toBe(256 * 16);

		wireDoc(d1);
		const d2 = await decode('rt.xb', await encode('xb'));
		expectSameCells(d2, d1, 'xb font');
		expect(d2.fontData.bytes).toEqual(font);
	});

	// Save.xb must set the 512-glyph flag (header bit 4); without it
	// readers parse 256 glyphs and misalign the image
	it('512-glyph XBin font round-trips through save', async () => {
		const columns = 40;
		const rows = 20;
		const cells = makeCells(columns, rows, 33);
		const font = makeXBinFont(512, 16, 17);
		const bytes = makeXBin({
			columns,
			rows,
			palette: makeXBinPalette(),
			font,
			font512: true,
			fontHeight: 16,
			rawCells: cells,
			sauce: {},
		});
		const d1 = await decode('font512.xb', bytes);
		expect(d1.fontData.bytes.length).toBe(512 * 16);

		wireDoc(d1);
		const d2 = await decode('rt.xb', await encode('xb'));
		expect(d2.fontData.bytes.length).toBe(512 * 16);
		expectSameCells(d2, d1, 'xb 512');
	});
});

describe('corpus tier (b): UTF-8 ANSI', () => {
	it('utf8 SAUCE LS decodes tri-state', async () => {
		const body = makeUtf8Ansi({ columns: 10, rows: 2 });
		const ninePx = await decode(
			'x.utf8.ans',
			concatBytes([
				body,
				new Uint8Array([0x1a]),
				makeSauce({ fileSize: body.length, tinfo1: 10, flags: 0b00000100 }),
			]),
		);
		expect(ninePx.letterSpacing).toBe(true);
		const noPref = await decode(
			'y.utf8.ans',
			concatBytes([
				body,
				new Uint8Array([0x1a]),
				makeSauce({ fileSize: body.length, tinfo1: 10, flags: 0 }),
			]),
		);
		expect(noPref.letterSpacing).toBeUndefined();
	});

	it('multibyte rows decode through the CP437 reverse map', async () => {
		const bytes = makeUtf8Ansi({ columns: 40, rows: 10, seed: 71 });
		const d1 = await decode('fixture.utf8.ans', bytes);
		// No SAUCE, so the loader falls back to the 80-column default
		expect(d1.columns).toBe(80);
		expect(d1.rows).toBe(10);
		// Every decoded glyph must be a CP437 code point (reverse map hit)
		Array.from(d1.data).forEach(cell => {
			expect(cell >> 8).toBeLessThan(256);
		});
		// Multibyte block glyphs actually resolved (e.g. U+2591 -> 176)
		const codes = new Set(Array.from(d1.data).map(cell => cell >> 8));
		expect(codes.has(176)).toBe(true);
	});

	// Full-width rows + LF reimport losslessly: the reader swallows the
	// one LF after an auto-wrap, and the writer's SAUCE pins the real
	// width.
	it('UTF-8 export of a CP437 doc re-imports losslessly', async () => {
		const bytes = makeAnsi({ columns: 80, rows: 25, seed: 55 });
		const d1 = await decode('cp437.ans', bytes);
		const core1 = coreDecodeAns(bytes);
		// core and v2 agree on the source doc
		expect(v3ToU16(core1.doc).imageData).toEqual(d1.data);
		const e1 = coreEncodeUtf8(core1.doc);
		const d2 = coreDecodeAns(e1, { utf8: true });
		expect(d2.doc.getRows()).toBe(core1.doc.getRows());
		expect(v3ToU16(d2.doc).imageData).toEqual(v3ToU16(core1.doc).imageData);
	});
});

// ---------------------------------------------------------------------------
// Core codec parity (0wnzlib): the same bytes through the v2 loader
// and the core codecs must produce identical docs, and core-encoded bytes
// must decode identically through BOTH decoders. ANSI/CP437 is the critical
// surface, so every committed artwork file runs through it.
// ---------------------------------------------------------------------------

const coreDecode = (name, bytes) => {
	const n = name.toLowerCase();
	if (n.endsWith('.xb')) {
		return coreDecodeXBin(bytes);
	}
	if (n.endsWith('.bin')) {
		return coreDecodeBin(bytes);
	}
	return coreDecodeAns(bytes, { utf8: n.endsWith('.utf8.ans') || n.endsWith('.txt') });
};

/** Decode through both engines; assert doc identity; return both. */
const expectCoreParity = async (name, bytes) => {
	const v2 = await decode(name, bytes);
	const result = coreDecode(name, bytes);
	// lossy: a 512-glyph XBin's upper page lives as non-identity glyph
	// defs now, and the strict projection throws on those by contract
	const u16 = v3ToU16Lossy(result.doc);
	expect(u16.columns, `${name}: core columns`).toBe(v2.columns);
	expect(u16.rows, `${name}: core rows`).toBe(v2.rows);
	expect(u16.imageData, `${name}: core cells`).toEqual(v2.data);
	expect(!!u16.iceColors, `${name}: core iceColors`).toBe(!!v2.iceColors);
	expect(
		!!u16.letterSpacing,
		`${name}: core letterSpacing`,
	).toBe(!!v2.letterSpacing);
	return { v2, result };
};

describe('core codec parity: ANSI', () => {
	it.each(tierAFiles)(
		'%s: core decoder matches v2 and core-encoded bytes satisfy both',
		async name => {
			const bytes = new Uint8Array(readFileSync(path.join(ansiDir, name)));
			const { result } = await expectCoreParity(name, bytes);

			// Core encode, then BOTH decoders must agree on the result and
			// reproduce the original cells
			const encoded = coreEncodeAns(result.doc, { meta: result.meta });
			const { result: reResult } = await expectCoreParity(
				'core-roundtrip.ans',
				encoded,
			);
			expect(
				v3ToU16(reResult.doc).imageData,
				`${name}: cells after core encode`,
			).toEqual(v3ToU16(result.doc).imageData);

			// Core encoder is a fixed point
			const encodedAgain = coreEncodeAns(reResult.doc, { meta: reResult.meta });
			expect(encodedAgain, `${name}: core encoder fixed point`).toEqual(
				encoded,
			);
		},
	);

	it('synthetic ANSI fixtures decode identically through both engines', async () => {
		const fixtures = [
			['full-width.ans', makeAnsi({ columns: 80, rows: 50, seed: 42 })],
			[
				'crlf.ans',
				makeAnsi({ columns: 80, rows: 30, seed: 7, lineBreaks: true }),
			],
			[
				'ice.ans',
				makeAnsi({
					columns: 80,
					rows: 25,
					ice: true,
					seed: 99,
					sauce: {
						title: 'ice test',
						flags: 0b00010011,
						tinfo1: 80,
						tinfo2: 25,
					},
				}),
			],
			[
				'wide.ans',
				makeAnsi({
					columns: 132,
					rows: 40,
					seed: 5,
					sauce: { tinfo1: 132, tinfo2: 40 },
				}),
			],
			['tall.ans', makeAnsi({ columns: 80, rows: 2000, seed: 13 })],
			[
				'nosig.ans',
				concatBytes([
					makeAnsi({ columns: 80, rows: 2, seed: 1 }),
					textToBytes('x'.repeat(200)),
				]),
			],
		];
		const zeroBody = makeAnsi({ columns: 80, rows: 5, seed: 2 });
		fixtures.push([
			'zerotinfo.ans',
			concatBytes([
				zeroBody,
				new Uint8Array([0x1a]),
				makeSauce({ fileSize: zeroBody.length, tinfo1: 0, tinfo2: 0 }),
			]),
		]);
		for (const [name, bytes] of fixtures) {
			await expectCoreParity(name, bytes);
		}
	});

	it('lenient UTF-8 decode matches v2', async () => {
		const bytes = makeUtf8Ansi({ columns: 40, rows: 10, seed: 7 });
		await expectCoreParity('fixture.utf8.ans', bytes);
	});
});

describe('core codec parity: BIN', () => {
	it('BIN fixtures decode identically and core encode satisfies both', async () => {
		const fixtures = [
			[
				'sauced.bin',
				makeBin({ columns: 160, rows: 50, seed: 21, sauce: { title: 'b' } }),
			],
			[
				'ft0.bin',
				makeBin({ columns: 160, rows: 40, seed: 23, sauce: { filetype: 0 } }),
			],
			['plain.bin', makeBin({ columns: 160, rows: 30, seed: 24 })],
			['wide.bin', makeBin({ columns: 320, rows: 100, seed: 22, sauce: {} })],
		];
		for (const [name, bytes] of fixtures) {
			const { result } = await expectCoreParity(name, bytes);
			const encoded = coreEncodeBin(result.doc, { meta: result.meta });
			const { result: reResult } = await expectCoreParity(
				'core-roundtrip.bin',
				encoded,
			);
			expect(
				v3ToU16(reResult.doc).imageData,
				`${name}: cells after core encode`,
			).toEqual(v3ToU16(result.doc).imageData);
		}
	});
});

describe('core codec parity: XBin', () => {
	it('XBin fixtures decode identically including font and palette', async () => {
		const rle = makeXBinRleRuns(16);
		const fixtures = [
			[
				'raw.xb',
				makeXBin({
					columns: 32,
					rows: 8,
					rawCells: makeCells(32, 8, 13),
					sauce: {},
				}),
			],
			[
				'rle.xb',
				makeXBin({
					columns: 16,
					rows: rle.cells.length / 16,
					compressed: rle.rle,
					sauce: {},
				}),
			],
			[
				'full.xb',
				makeXBin({
					columns: 32,
					rows: 8,
					rawCells: makeCells(32, 8, 17),
					font: makeXBinFont(512, 16, 9),
					font512: true,
					fontHeight: 16,
					palette: makeXBinPalette(5),
					iceColors: true,
					sauce: { title: 'xb 512' },
				}),
			],
		];
		for (const [name, bytes] of fixtures) {
			const { v2, result } = await expectCoreParity(name, bytes);
			if (v2.paletteData) {
				expect(result.palette6, `${name}: palette bytes`).toEqual(
					v2.paletteData,
				);
			}
			if (v2.fontData && v2.fontData.bytes) {
				expect(result.fontBytes, `${name}: font bytes`).toEqual(
					v2.fontData.bytes,
				);
				expect(result.fontHeight, `${name}: font height`).toBe(
					v2.fontData.height,
				);
			}
			const encoded = coreEncodeXBin(result.doc, {
				palette6: result.palette6,
				fontBytes: result.fontBytes,
				fontHeight: result.fontHeight,
				meta: result.meta,
			});
			const { result: reResult } = await expectCoreParity(
				'core-roundtrip.xb',
				encoded,
			);
			expect(
				v3ToU16Lossy(reResult.doc).imageData,
				`${name}: cells after core encode`,
			).toEqual(v3ToU16Lossy(result.doc).imageData);
		}
	});
});
