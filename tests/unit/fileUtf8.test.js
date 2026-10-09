/* eslint-disable prefer-arrow-callback */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock State module
const mockState = {
	title: 'test-artwork',
	textArtCanvas: {
		getColumns: vi.fn(() => 80),
		getRows: vi.fn(() => 25),
		getImageData: vi.fn(() => new Uint16Array(80 * 25).fill(0x2007)), // Space char with white on black
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

// Note: palette.js is NOT mocked; these tests exercise the real
// getUTF8/getUnicodeReverseMap implementations

describe('UTF-8 ANSI Import and Export', () => {
	let Load, Save, getUTF8;
	let savedBytes;

	// Load a byte stream through the UTF-8 ANSI import path
	const loadUtf8 = bytes => {
		const reader = {
			result: new Uint8Array(bytes).buffer,
			addEventListener: vi.fn(),
			readAsArrayBuffer: vi.fn(),
		};
		global.FileReader = vi.fn(function () {
			return reader;
		});
		const callback = vi.fn();
		Load.file({ name: 'test.utf8.ans' }, callback);
		const onLoad = reader.addEventListener.mock.calls[0][1];
		onLoad({});
		expect(callback).toHaveBeenCalled();
		return callback.mock.calls[0];
	};

	beforeEach(async () => {
		vi.clearAllMocks();
		savedBytes = null;

		global.window = {};
		global.Blob = vi.fn(function (parts, options) {
			savedBytes = parts[0];
			this.parts = parts;
			this.options = options;
			return this;
		});
		const mockURL = vi.fn(function (url) {
			this.href = url;
			return this;
		});
		mockURL.createObjectURL = vi.fn(() => 'blob:mock-url');
		mockURL.revokeObjectURL = vi.fn();
		global.URL = mockURL;
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
		const paletteModule = await import('../../src/js/client/palette.js');
		getUTF8 = paletteModule.getUTF8;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	describe('UTF-8 import', () => {
		it('should round-trip CP437 block characters through UTF-8', () => {
			const chars = [176, 177, 178, 219, 223, 220, 221, 222]; // ░▒▓█▄▀▌▐
			const bytes = [];
			chars.forEach(charCode => {
				bytes.push(...getUTF8(charCode));
			});

			const [width, , data] = loadUtf8(bytes);

			expect(width).toBe(80);
			chars.forEach((charCode, i) => {
				expect(data[i] >> 8).toBe(charCode);
				expect(data[i] & 15).toBe(7); // Default foreground
				expect((data[i] >> 4) & 15).toBe(0); // Default background
			});
		});

		it('should round-trip every CP437 remapped codepoint', () => {
			// All codes with a dedicated Unicode mapping, skipping ANSI
			// control characters the parser interprets
			const chars = [];
			for (let charCode = 1; charCode <= 255; charCode++) {
				if ([10, 13, 26, 27].includes(charCode)) {
					continue;
				}
				chars.push(charCode);
			}
			const bytes = [];
			chars.forEach(charCode => {
				bytes.push(...getUTF8(charCode));
			});

			const [, , data] = loadUtf8(bytes);

			chars.forEach((charCode, i) => {
				const index = Math.floor(i / 80) * 80 + (i % 80);
				expect(data[index] >> 8).toBe(charCode);
			});
		});

		it('should substitute codepoints outside CP437 instead of overflowing', () => {
			// U+1F600 (emoji) has no CP437 equivalent
			const bytes = [0xf0, 0x9f, 0x98, 0x80];

			const [, , data] = loadUtf8(bytes);

			expect(data[0] >> 8).toBe(63); // '?'
		});
	});

	describe('UTF-8 export', () => {
		// Decode a saved UTF-8 ANSI byte stream into lines of cells,
		// skipping escape sequences
		const decodeLines = bytes => {
			const escape = String.fromCharCode(27);
			const text = Buffer.from(bytes).toString('utf8');
			return text
				.replace(new RegExp(`${escape}\\[[0-9;]*m`, 'g'), '')
				.split('\n')
				.slice(0, -1);
		};

		it('should emit exactly one cell per column on every line', async () => {
			// Mix single-byte and multi-byte glyphs in the first row
			const imageData = new Uint16Array(80 * 25).fill(0x2007);
			imageData[0] = (219 << 8) + 7; // █ (multi-byte in UTF-8)
			imageData[1] = (65 << 8) + 7; // A (single byte)
			imageData[2] = (176 << 8) + 7; // ░ (multi-byte)
			mockState.textArtCanvas.getImageData.mockReturnValue(imageData);

			await Save.utf8();

			expect(savedBytes).not.toBeNull();
			const lines = decodeLines(savedBytes);
			expect(lines.length).toBe(25);
			lines.forEach(line => {
				expect([...line].length).toBe(80);
			});
		});
	});
});
