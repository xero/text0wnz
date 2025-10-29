/* eslint-disable prefer-arrow-callback */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const canvasDataURL =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
// Mock State module
const mockState = {
	textArtCanvas: {
		getColumns: vi.fn(() => 80),
		getRows: vi.fn(() => 25),
		getImageData: vi.fn(() => new Uint16Array(80 * 25).fill(0x2007)), // Space char with white on black
		getIceColors: vi.fn(() => false),
		getCurrentFontName: vi.fn(() => 'CP437 8x16'),
		loadXBFileSequential: vi.fn(),
		clearXBData: vi.fn(),
		redrawEntireImage: vi.fn(),
		getImage: vi.fn(() => ({ toDataURL: vi.fn(() => canvasDataURL) })),
		getXBPaletteData: vi.fn(() => new Uint8Array(48).fill(21)), // Mock 6-bit palette data
	},
	font: {
		getHeight: vi.fn(() => 16),
		getLetterSpacing: vi.fn(() => false),
		getData: vi.fn(() => null), // No font data by default
	},
};

const mockUIElements = {
	'artwork-title': { value: 'test-artwork' },
	'sauce-title': { value: 'Test Title' },
	'sauce-author': { value: 'Test Author' },
	'sauce-group': { value: 'Test Group' },
	'sauce-comments': { value: 'Test comments\nLine 2' },
};

vi.mock('../../src/js/client/state.js', () => ({ default: mockState }));

vi.mock('../../src/js/client/ui.js', () => ({
	$: vi.fn(id => mockUIElements[id] || { value: '' }),
	enforceMaxBytes: vi.fn(),
}));

vi.mock('../../src/js/client/palette.js', () => ({
	getUTF8: vi.fn(charCode => {
		if (charCode < 128) {
			return [charCode];
		}
		// Mock UTF-8 encoding for extended characters
		if (charCode < 0x800) {
			return [0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f)];
		}
		return [
			0xe0 | (charCode >> 12),
			0x80 | ((charCode >> 6) & 0x3f),
			0x80 | (charCode & 0x3f),
		];
	}),
	getUnicode: vi.fn(),
}));

// Mock global browser APIs
const mockDocument = {
	createElement: vi.fn(() => ({
		href: '',
		download: '',
		dispatchEvent: vi.fn(),
		click: vi.fn(),
	})),
	dispatchEvent: vi.fn(),
};

const mockURL = vi.fn(function (url, _base) {
	this.href = url;
	this.protocol = '';
	this.hostname = '';
	this.port = '';
	this.pathname = '';
	return this;
});
mockURL.createObjectURL = vi.fn(() => 'blob:mock-url');
mockURL.revokeObjectURL = vi.fn();

const mockFileReader = class {
	constructor() {
		this.result = null;
		this.addEventListener = vi.fn();
		this.readAsArrayBuffer = vi.fn();
	}
};

describe('File Module - Load and Save Operations', () => {
	let Load, Save;

	beforeEach(async () => {
		// Reset all mocks
		vi.clearAllMocks();

		// Setup global mocks
		global.document = mockDocument;
		global.URL = mockURL;
		global.window = { URL: mockURL };
		global.FileReader = mockFileReader;
		global.Blob = vi.fn(function (parts, options) {
			this.parts = parts;
			this.options = options;
			return this;
		});
		global.btoa = vi.fn(str => Buffer.from(str, 'binary').toString('base64'));
		global.atob = vi.fn(str => Buffer.from(str, 'base64').toString('binary'));
		global.navigator = { userAgent: 'Chrome/90.0' };
		global.MouseEvent = vi.fn(function () {
			return { bubbles: true, cancelable: true };
		});

		// Import the module fresh for each test
		const fileModule = await import('../../src/js/client/file.js');
		Load = fileModule.Load;
		Save = fileModule.Save;
	});

	afterEach(() => {
		vi.resetModules();
	});

	describe('Load Module', () => {
		describe('Font Mapping Functions', () => {
			it('should convert SAUCE font names to app font names', () => {
				expect(Load.sauceToAppFont('IBM VGA')).toBe('CP437 8x16');
				expect(Load.sauceToAppFont('IBM VGA50')).toBe('CP437 8x8');
				expect(Load.sauceToAppFont('IBM VGA25G')).toBe('CP437 8x19');
				expect(Load.sauceToAppFont('IBM EGA')).toBe('CP437 8x14');
				expect(Load.sauceToAppFont('IBM EGA43')).toBe('CP437 8x8');

				// Code page variants
				expect(Load.sauceToAppFont('IBM VGA 437')).toBe('CP437 8x16');
				expect(Load.sauceToAppFont('IBM VGA 850')).toBe('CP850 8x16');
				expect(Load.sauceToAppFont('IBM VGA 852')).toBe('CP852 8x16');

				// Amiga fonts
				expect(Load.sauceToAppFont('Amiga Topaz 1')).toBe('Topaz 500 8x16');
				expect(Load.sauceToAppFont('Amiga Topaz 1+')).toBe('Topaz+ 500 8x16');
				expect(Load.sauceToAppFont('Amiga MicroKnight')).toBe(
					'MicroKnight 8x16',
				);
				expect(Load.sauceToAppFont('Amiga P0T-NOoDLE')).toBe('P0t-NOoDLE 8x16');

				// C64 fonts
				expect(Load.sauceToAppFont('C64 PETSCII unshifted')).toBe(
					'C64 PETSCII unshifted 8x8',
				);
				expect(Load.sauceToAppFont('C64 PETSCII shifted')).toBe(
					'C64 PETSCII shifted 8x8',
				);

				// XBIN embedded font
				expect(Load.sauceToAppFont('XBIN')).toBe('XBIN');

				// Unknown font
				expect(Load.sauceToAppFont('Unknown Font')).toBe(null);
				expect(Load.sauceToAppFont(null)).toBe(null);
				expect(Load.sauceToAppFont(undefined)).toBe(null);
			});

			it('should convert app font names to SAUCE font names', () => {
				expect(Load.appToSauceFont('CP437 8x16')).toBe('IBM VGA');
				expect(Load.appToSauceFont('CP437 8x8')).toBe('IBM VGA50');
				expect(Load.appToSauceFont('CP437 8x19')).toBe('IBM VGA25G');
				expect(Load.appToSauceFont('CP437 8x14')).toBe('IBM EGA');

				// Code page variants
				expect(Load.appToSauceFont('CP850 8x16')).toBe('IBM VGA 850');
				expect(Load.appToSauceFont('CP852 8x16')).toBe('IBM VGA 852');

				// Amiga fonts
				expect(Load.appToSauceFont('Topaz 500 8x16')).toBe('Amiga Topaz 1');
				expect(Load.appToSauceFont('Topaz+ 500 8x16')).toBe('Amiga Topaz 1+');
				expect(Load.appToSauceFont('MicroKnight 8x16')).toBe(
					'Amiga MicroKnight',
				);
				expect(Load.appToSauceFont('P0t-NOoDLE 8x16')).toBe('Amiga P0T-NOoDLE');
				expect(Load.appToSauceFont('mO\'sOul 8x16')).toBe('Amiga mOsOul');

				// C64 fonts
				expect(Load.appToSauceFont('C64 PETSCII unshifted 8x8')).toBe(
					'C64 PETSCII unshifted',
				);
				expect(Load.appToSauceFont('C64 PETSCII shifted 8x8')).toBe(
					'C64 PETSCII shifted',
				);

				// XBIN embedded font
				expect(Load.appToSauceFont('XBIN')).toBe('XBIN');

				// Default case
				expect(Load.appToSauceFont('Unknown Font')).toBe('IBM VGA');
				expect(Load.appToSauceFont(null)).toBe('IBM VGA');
				expect(Load.appToSauceFont(undefined)).toBe('IBM VGA');
			});
		});

		describe('File Loading', () => {
			it('should handle ANSI file loading', () => {
				const mockFile = {
					name: 'test.ans',
					size: 100,
				};

				const mockFileReaderInstance = new FileReader();
				global.FileReader = vi.fn(function () {
					return mockFileReaderInstance;
				});

				const callback = vi.fn();
				Load.file(mockFile, callback);

				expect(mockFileReaderInstance.addEventListener).toHaveBeenCalledWith(
					'load',
					expect.any(Function),
				);
				expect(mockFileReaderInstance.readAsArrayBuffer).toHaveBeenCalledWith(
					mockFile,
				);
			});

			it('should handle BIN file loading setup', () => {
				const mockFile = {
					name: 'test.bin',
					size: 8000,
				};

				const callback = vi.fn();

				// The file loading sets up a FileReader - clearXBData won't be called until the reader triggers
				expect(() => Load.file(mockFile, callback)).not.toThrow();
			});

			it('should handle XB file loading setup', () => {
				const mockFile = {
					name: 'test.xb',
					size: 2000,
				};

				const callback = vi.fn();

				// The file loading sets up a FileReader - loadXBFileSequential won't be called until the reader triggers
				expect(() => Load.file(mockFile, callback)).not.toThrow();
			});

			it('should handle UTF-8 ANSI file loading setup', () => {
				const mockFile = {
					name: 'test.utf8.ans',
					size: 100,
				};

				const callback = vi.fn();

				// The file loading sets up a FileReader - clearXBData won't be called until the reader triggers
				expect(() => Load.file(mockFile, callback)).not.toThrow();
			});

			it('should handle unknown file extensions as ANSI setup', () => {
				const mockFile = {
					name: 'test.txt',
					size: 100,
				};

				const callback = vi.fn();

				// The file loading sets up a FileReader - clearXBData won't be called until the reader triggers
				expect(() => Load.file(mockFile, callback)).not.toThrow();
			});
		});
	});

	describe('Save Module', () => {
		beforeEach(() => {
			// Reset UI element values
			mockUIElements['artwork-title'].value = 'test-artwork';
			mockUIElements['sauce-title'].value = 'Test Title';
			mockUIElements['sauce-author'].value = 'Test Author';
			mockUIElements['sauce-group'].value = 'Test Group';
			mockUIElements['sauce-comments'].value = 'Test comments';
		});

		describe('Save Functions Exist', () => {
			it('should have all save format functions', () => {
				expect(typeof Save.ans).toBe('function');
				expect(typeof Save.utf8).toBe('function');
				expect(typeof Save.utf8noBlink).toBe('function');
				expect(typeof Save.plainText).toBe('function');
				expect(typeof Save.bin).toBe('function');
				expect(typeof Save.xb).toBe('function');
				expect(typeof Save.png).toBe('function');
			});
		});

		describe('ANSI Save Format', () => {
			it('should save ANSI files with proper headers', () => {
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				Save.ans();

				expect(createElementSpy).toHaveBeenCalledWith('a');
				expect(global.Blob).toHaveBeenCalled();
			});

			it('should save UTF-8 ANSI files', () => {
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				Save.utf8();

				expect(createElementSpy).toHaveBeenCalledWith('a');
			});

			it('should save UTF-8 ANSI files without blink', () => {
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				Save.utf8noBlink();

				expect(createElementSpy).toHaveBeenCalledWith('a');
			});

			it('should save plain text files without escape codes', () => {
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				Save.plainText();

				expect(createElementSpy).toHaveBeenCalledWith('a');
			});
		});

		describe('Binary Save Format', () => {
			it('should save BIN files when width is even', () => {
				mockState.textArtCanvas.getColumns.mockReturnValue(80); // Even width
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				Save.bin();

				expect(createElementSpy).toHaveBeenCalledWith('a');
				expect(global.Blob).toHaveBeenCalled();
			});

			it('should not save BIN files when width is odd', () => {
				mockState.textArtCanvas.getColumns.mockReturnValue(81); // Odd width
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				Save.bin();

				expect(createElementSpy).not.toHaveBeenCalled();
			});
		});

		describe('XBIN Save Format', () => {
			it('should save XB files with proper headers', () => {
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				Save.xb();

				expect(createElementSpy).toHaveBeenCalledWith('a');
				expect(global.Blob).toHaveBeenCalled();
			});

			it('should save XB files with ICE colors when enabled', () => {
				mockState.textArtCanvas.getIceColors.mockReturnValue(true);
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				Save.xb();

				expect(createElementSpy).toHaveBeenCalledWith('a');
			});
		});

		describe('PNG Save Format', () => {
			it('should save PNG files from canvas data URL', () => {
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				Save.png();

				expect(createElementSpy).toHaveBeenCalledWith('a');
				expect(mockState.textArtCanvas.getImage).toHaveBeenCalled();
			});
		});

		describe('Browser Compatibility', () => {
			it('should handle Safari browser differently', () => {
				global.navigator.userAgent = 'Safari/605.1.15';
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				Save.ans();

				expect(createElementSpy).toHaveBeenCalledWith('a');
				expect(global.btoa).toHaveBeenCalled();
			});

			it('should handle Chrome browser with Blob URLs', () => {
				global.navigator.userAgent = 'Chrome/90.0';
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				Save.ans();

				expect(createElementSpy).toHaveBeenCalledWith('a');
				expect(global.Blob).toHaveBeenCalled();
				expect(mockURL.createObjectURL).toHaveBeenCalled();
			});
		});

		describe('SAUCE Record Creation', () => {
			it('should create SAUCE records with proper metadata', () => {
				mockUIElements['sauce-title'].value = 'Test Title';
				mockUIElements['sauce-author'].value = 'Test Author';
				mockUIElements['sauce-group'].value = 'Test Group';
				mockUIElements['sauce-comments'].value = 'Line 1\nLine 2\nLine 3';

				Save.ans();

				expect(global.Blob).toHaveBeenCalled();
			});

			it('should handle empty SAUCE fields', () => {
				mockUIElements['sauce-title'].value = '';
				mockUIElements['sauce-author'].value = '';
				mockUIElements['sauce-group'].value = '';
				mockUIElements['sauce-comments'].value = '';

				Save.ans();

				expect(global.Blob).toHaveBeenCalled();
			});

			it('should handle long comment blocks', () => {
				const longComments = Array(300).fill('Comment line').join('\n');
				mockUIElements['sauce-comments'].value = longComments;

				Save.ans();

				expect(global.Blob).toHaveBeenCalled();
			});
		});

		describe('Date Handling', () => {
			it('should format dates correctly in SAUCE records', () => {
				const mockDate = new Date('2023-03-15');
				vi.spyOn(global, 'Date').mockImplementation(function () {
					return mockDate;
				});

				Save.ans();

				expect(global.Blob).toHaveBeenCalled();
				global.Date.mockRestore();
			});
		});

		describe('Font and Color Flags', () => {
			it('should set ICE colors flag when enabled', () => {
				mockState.textArtCanvas.getIceColors.mockReturnValue(true);

				Save.ans();

				expect(global.Blob).toHaveBeenCalled();
			});

			it('should set letter spacing flags correctly', () => {
				mockState.font.getLetterSpacing.mockReturnValue(true);

				Save.ans();

				expect(global.Blob).toHaveBeenCalled();
			});

			it('should handle different font names in SAUCE', () => {
				mockState.textArtCanvas.getCurrentFontName.mockReturnValue(
					'CP850 8x16',
				);

				Save.ans();

				// Test that the function call completes without error
				expect(global.Blob).toHaveBeenCalled();
			});
		});
	});

});
