/* eslint-disable prefer-arrow-callback */
/**
 * The byte fallback for .txt opens: invalid UTF-8 means raw scene
 * bytes (amiga latin-1 collys), which must land in the glyph-indexed
 * byte loader instead of throwing, and callers that already know the
 * bytes are scene art can skip the UTF-8 reader with preferBytes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDocV3 } from '../../src/js/core/doc.js';

const makeMockDoc = () => createDocV3({ columns: 80, rows: 25 });

const mockState = {
	title: 'test-artwork',
	textArtCanvas: {
		getColumns: vi.fn(() => 80),
		getDoc: vi.fn(() => makeMockDoc()),
		getRows: vi.fn(() => 25),
		getImageData: vi.fn(() => new Uint16Array(80 * 25).fill(0x2007)),
		getIceColors: vi.fn(() => false),
		getCurrentFontName: vi.fn(() => 'CP437 8x16'),
		clearXBData: vi.fn(callback => callback()),
		getXBPaletteData: vi.fn(() => new Uint8Array(48)),
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
	$: vi.fn(() => ({ value: '' })),
	enforceMaxBytes: vi.fn(),
}));

describe('latin-1 txt fallback', () => {
	let Load;

	const loadTxt = (bytes, opts) => {
		const reader = {
			result: new Uint8Array(bytes).buffer,
			addEventListener: vi.fn(),
			readAsArrayBuffer: vi.fn(),
		};
		// a constructor mock: new FileReader() needs a function expression
		global.FileReader = vi.fn(function () {
			return reader;
		});
		const callback = vi.fn();
		Load.file({ name: 'colly.txt' }, callback, opts);
		const onLoad = reader.addEventListener.mock.calls[0][1];
		onLoad({});
		expect(callback).toHaveBeenCalled();
		return callback.mock.calls[0];
	};

	beforeEach(async () => {
		vi.clearAllMocks();
		global.window = {};
		const fileModule = await import('../../src/js/client/file.js');
		Load = fileModule.Load;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it('falls back to the byte loader when a .txt is not UTF-8', () => {
		// lone high bytes: typical amiga latin-1, invalid as UTF-8
		const bytes = [...new TextEncoder().encode('hi '), 0xab, 0xcd, 0xef];
		const [columns, , data] = loadTxt(bytes);
		expect(columns).toBe(80);
		// the byte loader keeps raw bytes as glyph indices
		expect(data[3] >> 8).toBe(0xab);
		expect(data[4] >> 8).toBe(0xcd);
	});

	it('skips the UTF-8 reader outright when preferBytes is set', () => {
		// valid UTF-8 for é, but the caller says these are scene bytes
		const bytes = [0xc3, 0xa9];
		const [, , data] = loadTxt(bytes, { preferBytes: true });
		expect(data[0] >> 8).toBe(0xc3);
		expect(data[1] >> 8).toBe(0xa9);
	});

	it('still reads valid UTF-8 .txt through the core reader', () => {
		const bytes = [...new TextEncoder().encode('é')];
		const result = loadTxt(bytes);
		// the UTF-8 path hands back a plane-native doc in the last slot
		expect(result[6]).toBeTruthy();
	});
});
