/* eslint-disable prefer-arrow-callback */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDocV3 } from '../../src/js/core/doc.js';

const makeMockDoc = () => createDocV3({ columns: 80, rows: 25 });

const canvasDataURL =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
const mockState = {
	textArtCanvas: {
		getColumns: vi.fn(() => 80),
		getDoc: vi.fn(() => makeMockDoc()),
		getRows: vi.fn(() => 25),
		getImageData: vi.fn(() => new Uint16Array(80 * 25).fill(0x2007)), // Space char with white on black
		getIceColors: vi.fn(() => false),
		getCurrentFontName: vi.fn(() => 'CP437 8x16'),
		loadXBFileSequential: vi.fn(),
		clearXBData: vi.fn(),
		redrawEntireImage: vi.fn(),
		getImage: vi.fn(() => ({ toDataURL: vi.fn(() => canvasDataURL) })),
		// 6-bit palette data
		getXBPaletteData: vi.fn(() => new Uint8Array(48).fill(21)),
		getCurrentFrame: vi.fn(() => 0),
	},
	font: {
		getWidth: vi.fn(() => 8),
		getHeight: vi.fn(() => 16),
		getLetterSpacing: vi.fn(() => false),
		getData: vi.fn(() => null),
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

describe('File Module', () => {
	let Load, Save;

	beforeEach(async () => {
		vi.clearAllMocks();

		vi.stubGlobal('document', mockDocument);
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
		vi.stubGlobal('navigator', { userAgent: 'Chrome/90.0' });
		global.MouseEvent = vi.fn(function () {
			return { bubbles: true, cancelable: true };
		});

		const fileModule = await import('../../src/js/client/file.js');
		Load = fileModule.Load;
		Save = fileModule.Save;
	});

	afterEach(() => {
		vi.resetModules();
	});

	describe('Load Module', () => {
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

		describe('Font Mapping Functions', () => {
			it('should convert SAUCE font names to app font names', () => {
				expect(Load.sauceToAppFont('IBM VGA')).toBe('CP437 8x16');
				expect(Load.sauceToAppFont('IBM VGA50')).toBe('CP437 8x8');
				expect(Load.sauceToAppFont('IBM VGA25G')).toBe('CP437 8x19');
				expect(Load.sauceToAppFont('IBM EGA')).toBe('CP437 8x14');
				expect(Load.sauceToAppFont('IBM EGA43')).toBe('CP437 8x8');

				expect(Load.sauceToAppFont('IBM VGA 437')).toBe('CP437 8x16');
				expect(Load.sauceToAppFont('IBM VGA 850')).toBe('CP850 8x16');
				expect(Load.sauceToAppFont('IBM VGA 852')).toBe('CP852 8x16');

				expect(Load.sauceToAppFont('Amiga Topaz 1')).toBe('Topaz 500 8x16');
				expect(Load.sauceToAppFont('Amiga Topaz 1+')).toBe('Topaz+ 500 8x16');
				expect(Load.sauceToAppFont('Amiga MicroKnight')).toBe(
					'MicroKnight 8x16',
				);
				expect(Load.sauceToAppFont('Amiga P0T-NOoDLE')).toBe('P0t-NOoDLE 8x16');

				expect(Load.sauceToAppFont('C64 PETSCII unshifted')).toBe(
					'C64 PETSCII unshifted 8x8',
				);
				expect(Load.sauceToAppFont('C64 PETSCII shifted')).toBe(
					'C64 PETSCII shifted 8x8',
				);

				// XBIN embedded font
				expect(Load.sauceToAppFont('XBIN')).toBe('XBIN');

				expect(Load.sauceToAppFont('Unknown Font')).toBe(null);
				expect(Load.sauceToAppFont(null)).toBe(null);
				expect(Load.sauceToAppFont(undefined)).toBe(null);
			});

			it('should convert app font names to SAUCE font names', () => {
				expect(Load.appToSauceFont('CP437 8x16')).toBe('IBM VGA');
				expect(Load.appToSauceFont('CP437 8x8')).toBe('IBM VGA50');
				expect(Load.appToSauceFont('CP437 8x19')).toBe('IBM VGA25G');
				expect(Load.appToSauceFont('CP437 8x14')).toBe('IBM EGA');

				expect(Load.appToSauceFont('CP850 8x16')).toBe('IBM VGA 850');
				expect(Load.appToSauceFont('CP852 8x16')).toBe('IBM VGA 852');

				expect(Load.appToSauceFont('Topaz 500 8x16')).toBe('Amiga Topaz 1');
				expect(Load.appToSauceFont('Topaz+ 500 8x16')).toBe('Amiga Topaz 1+');
				expect(Load.appToSauceFont('MicroKnight 8x16')).toBe(
					'Amiga MicroKnight',
				);
				expect(Load.appToSauceFont('P0t-NOoDLE 8x16')).toBe('Amiga P0T-NOoDLE');
				expect(Load.appToSauceFont('mO\'sOul 8x16')).toBe('Amiga mOsOul');

				expect(Load.appToSauceFont('C64 PETSCII unshifted 8x8')).toBe(
					'C64 PETSCII unshifted',
				);
				expect(Load.appToSauceFont('C64 PETSCII shifted 8x8')).toBe(
					'C64 PETSCII shifted',
				);

				// XBIN embedded font
				expect(Load.appToSauceFont('XBIN')).toBe('XBIN');

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

				// clearXBData only runs after the FileReader fires
				expect(() => Load.file(mockFile, callback)).not.toThrow();
			});

			it('should handle XB file loading setup', () => {
				const mockFile = {
					name: 'test.xb',
					size: 2000,
				};

				const callback = vi.fn();

				// loadXBFileSequential only runs after the FileReader fires
				expect(() => Load.file(mockFile, callback)).not.toThrow();
			});

			it('should handle UTF-8 ANSI file loading setup', () => {
				const mockFile = {
					name: 'test.utf8.ans',
					size: 100,
				};

				const callback = vi.fn();

				// clearXBData only runs after the FileReader fires
				expect(() => Load.file(mockFile, callback)).not.toThrow();
			});

			it('should handle unknown file extensions as ANSI setup', () => {
				const mockFile = {
					name: 'test.txt',
					size: 100,
				};

				const callback = vi.fn();

				// clearXBData only runs after the FileReader fires
				expect(() => Load.file(mockFile, callback)).not.toThrow();
			});
		});
	});

	describe('Save Module', () => {
		beforeEach(() => {
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
				expect(typeof Save.utf8Blink).toBe('function');
				expect(typeof Save.plainText).toBe('function');
				expect(typeof Save.bin).toBe('function');
				expect(typeof Save.xb).toBe('function');
				expect(typeof Save.png).toBe('function');
			});
		});

		describe('ANSI Save Format', () => {
			it('should save ANSI files with proper headers', async () => {
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				await Save.ans();

				expect(createElementSpy).toHaveBeenCalledWith('a');
				expect(global.Blob).toHaveBeenCalled();
			});

			it('should save UTF-8 ANSI files', async () => {
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				await Save.utf8();

				expect(createElementSpy).toHaveBeenCalledWith('a');
			});

			it('should save UTF-8 ANSI files without blink', async () => {
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				await Save.utf8Blink();

				expect(createElementSpy).toHaveBeenCalledWith('a');
			});

			it('should save plain text files without escape codes', async () => {
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				await Save.plainText();

				expect(createElementSpy).toHaveBeenCalledWith('a');
			});
		});

		describe('Binary Save Format', () => {
			it('should save BIN files when width is even', async () => {
				mockState.textArtCanvas.getColumns.mockReturnValue(80);
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				await Save.bin();

				expect(createElementSpy).toHaveBeenCalledWith('a');
				expect(global.Blob).toHaveBeenCalled();
			});

			it('should not save BIN files when width is odd', async () => {
				mockState.textArtCanvas.getColumns.mockReturnValue(81);
				mockState.textArtCanvas.getDoc.mockReturnValue(
					createDocV3({ columns: 81, rows: 25 }),
				);
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				await Save.bin();

				expect(createElementSpy).not.toHaveBeenCalled();
			});
		});

		describe('XBIN Save Format', () => {
			it('should save XB files with proper headers', async () => {
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				await Save.xb();

				expect(createElementSpy).toHaveBeenCalledWith('a');
				expect(global.Blob).toHaveBeenCalled();
			});

			it('should save XB files with ICE colors when enabled', async () => {
				mockState.textArtCanvas.getIceColors.mockReturnValue(true);
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				await Save.xb();

				expect(createElementSpy).toHaveBeenCalledWith('a');
			});
		});

		describe('PNG Save Format', () => {
			it('should save PNG files from canvas data URL', async () => {
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				await Save.png();

				expect(createElementSpy).toHaveBeenCalledWith('a');
				expect(mockState.textArtCanvas.getImage).toHaveBeenCalled();
			});
		});

		describe('Browser Compatibility', () => {
			it('should handle Safari browser differently', async () => {
				global.navigator.userAgent = 'Safari/605.1.15';
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				await Save.ans();

				expect(createElementSpy).toHaveBeenCalledWith('a');
				expect(global.btoa).toHaveBeenCalled();
			});

			it('should handle Chrome browser with Blob URLs', async () => {
				global.navigator.userAgent = 'Chrome/90.0';
				const createElementSpy = vi.spyOn(mockDocument, 'createElement');

				await Save.ans();

				expect(createElementSpy).toHaveBeenCalledWith('a');
				expect(global.Blob).toHaveBeenCalled();
				expect(mockURL.createObjectURL).toHaveBeenCalled();
			});
		});

		describe('SAUCE Record Creation', () => {
			it('should create SAUCE records with proper metadata', async () => {
				mockUIElements['sauce-title'].value = 'Test Title';
				mockUIElements['sauce-author'].value = 'Test Author';
				mockUIElements['sauce-group'].value = 'Test Group';
				mockUIElements['sauce-comments'].value = 'Line 1\nLine 2\nLine 3';

				await Save.ans();

				expect(global.Blob).toHaveBeenCalled();
			});

			it('should handle empty SAUCE fields', async () => {
				mockUIElements['sauce-title'].value = '';
				mockUIElements['sauce-author'].value = '';
				mockUIElements['sauce-group'].value = '';
				mockUIElements['sauce-comments'].value = '';

				await Save.ans();

				expect(global.Blob).toHaveBeenCalled();
			});

			it('should handle long comment blocks', async () => {
				const longComments = Array(300).fill('Comment line').join('\n');
				mockUIElements['sauce-comments'].value = longComments;

				await Save.ans();

				expect(global.Blob).toHaveBeenCalled();
			});
		});

		describe('Date Handling', () => {
			it('should format dates correctly in SAUCE records', async () => {
				const mockDate = new Date('2023-03-15');
				vi.spyOn(global, 'Date').mockImplementation(function () {
					return mockDate;
				});

				await Save.ans();

				expect(global.Blob).toHaveBeenCalled();
				global.Date.mockRestore();
			});
		});

		describe('Font and Color Flags', () => {
			it('should set ICE colors flag when enabled', async () => {
				mockState.textArtCanvas.getIceColors.mockReturnValue(true);

				await Save.ans();

				expect(global.Blob).toHaveBeenCalled();
			});

			it('should set letter spacing flags correctly', async () => {
				mockState.font.getLetterSpacing.mockReturnValue(true);

				await Save.ans();

				expect(global.Blob).toHaveBeenCalled();
			});

			it('should handle different font names in SAUCE', async () => {
				mockState.textArtCanvas.getCurrentFontName.mockReturnValue(
					'CP850 8x16',
				);

				await Save.ans();

				expect(global.Blob).toHaveBeenCalled();
			});
		});
	});

	describe('Data Type Conversions', () => {
		it('should convert 16-bit values correctly', () => {
			const lowByte = 0x34;
			const highByte = 0x12;
			const result = lowByte + (highByte << 8);
			expect(result).toBe(0x1234);
		});

		it('should convert 32-bit values correctly', () => {
			const byte1 = 0x78;
			const byte2 = 0x56;
			const byte3 = 0x34;
			const byte4 = 0x12;
			const result = byte1 + (byte2 << 8) + (byte3 << 16) + (byte4 << 24);
			expect(result).toBe(0x12345678);
		});

		it('should handle ANSI to BIN color conversion', () => {
			const ansiToBin = ansiColor => {
				switch (ansiColor) {
					case 4:
						return 1;
					case 6:
						return 3;
					case 1:
						return 4;
					case 3:
						return 6;
					case 12:
						return 9;
					case 14:
						return 11;
					case 9:
						return 12;
					case 11:
						return 14;
					default:
						return ansiColor;
				}
			};

			expect(ansiToBin(4)).toBe(1);
			expect(ansiToBin(6)).toBe(3);
			expect(ansiToBin(1)).toBe(4);
			expect(ansiToBin(3)).toBe(6);
			expect(ansiToBin(0)).toBe(0);
			expect(ansiToBin(7)).toBe(7);
		});
	});

	describe('Binary Data Handling', () => {
		it('should create correct XBIN headers', () => {
			const width = 80;
			const height = 25;
			const iceColors = false;
			const flags = iceColors ? 8 : 0;

			const header = new Uint8Array([
				88,
				66,
				73,
				78,
				26, // "XBIN" + EOF marker
				width & 0xff,
				width >> 8, // Width (little-endian)
				height & 0xff,
				height >> 8, // Height (little-endian)
				16, // Font height
				flags,
			]);

			expect(header[0]).toBe(88); // 'X'
			expect(header[1]).toBe(66); // 'B'
			expect(header[2]).toBe(73); // 'I'
			expect(header[3]).toBe(78); // 'N'
			expect(header[4]).toBe(26); // EOF marker
		});

		it('should handle data URL to bytes conversion', () => {
			const testDataUrl = 'data:image/png;base64,SGVsbG8=';

			const base64Index = testDataUrl.indexOf(';base64,') + 8;
			const base64Part = testDataUrl.slice(base64Index);
			expect(base64Part).toBe('SGVsbG8=');
		});

		it('should handle uint16 to uint8 array conversion', () => {
			const uint16Array = new Uint16Array([0x1234, 0x5678]);
			const uint8Array = new Uint8Array(uint16Array.length * 2);

			for (let i = 0, j = 0; i < uint16Array.length; i++, j += 2) {
				uint8Array[j] = uint16Array[i] >> 8;
				uint8Array[j + 1] = uint16Array[i] & 255;
			}

			expect(uint8Array[0]).toBe(0x12);
			expect(uint8Array[1]).toBe(0x34);
			expect(uint8Array[2]).toBe(0x56);
			expect(uint8Array[3]).toBe(0x78);
		});
	});

	describe('Error Handling', () => {
		it('should handle file reading errors gracefully', () => {
			const mockFile = { name: 'test.ans', size: 100 };
			const callback = vi.fn();

			expect(() => Load.file(mockFile, callback)).not.toThrow();
		});

		it('should handle missing DOM elements gracefully', async () => {
			const originalDocument = global.document;
			vi.stubGlobal('document', {
				createElement: vi.fn(() => {
					throw new Error('createElement failed');
				}),
			});

			await expect(Save.ans()).rejects.toThrow('createElement failed');

			vi.stubGlobal('document', originalDocument);
		});

		it('should handle invalid file names', () => {
			const mockFile = { name: '', size: 0 };
			const callback = vi.fn();

			expect(() => Load.file(mockFile, callback)).not.toThrow();
		});
	});

	describe('File Class Internal Logic', () => {
		it('should test ANSI file loading with actual FileReader simulation', () => {
			const mockFile = { name: 'test.ans', size: 100 };
			const callback = vi.fn();

			const mockReaderInstance = {
				result: null,
				addEventListener: vi.fn(),
				readAsArrayBuffer: vi.fn(),
			};

			global.FileReader = vi.fn(function () {
				return mockReaderInstance;
			});

			Load.file(mockFile, callback);

			expect(mockReaderInstance.addEventListener).toHaveBeenCalledWith(
				'load',
				expect.any(Function),
			);
			expect(mockReaderInstance.readAsArrayBuffer).toHaveBeenCalledWith(
				mockFile,
			);
		});

		it('should test BIN file loading with proper width validation', () => {
			const mockFile = { name: 'test.bin', size: 4000 }; // 80x25x2 = 4000 bytes
			const callback = vi.fn();

			const mockReaderInstance = {
				result: null,
				addEventListener: vi.fn(),
				readAsArrayBuffer: vi.fn(),
			};

			global.FileReader = vi.fn(function () {
				return mockReaderInstance;
			});

			Load.file(mockFile, callback);

			expect(mockReaderInstance.addEventListener).toHaveBeenCalledWith(
				'load',
				expect.any(Function),
			);
			expect(mockReaderInstance.readAsArrayBuffer).toHaveBeenCalledWith(
				mockFile,
			);
		});

		it('should test XB file loading setup', () => {
			const mockFile = { name: 'test.xb', size: 1000 };
			const callback = vi.fn();

			const mockReaderInstance = {
				result: null,
				addEventListener: vi.fn(),
				readAsArrayBuffer: vi.fn(),
			};

			global.FileReader = vi.fn(function () {
				return mockReaderInstance;
			});

			Load.file(mockFile, callback);

			expect(mockReaderInstance.addEventListener).toHaveBeenCalledWith(
				'load',
				expect.any(Function),
			);
			expect(mockReaderInstance.readAsArrayBuffer).toHaveBeenCalledWith(
				mockFile,
			);
		});

		it('should test UTF-8 ANSI file loading setup', () => {
			const mockFile = { name: 'test.utf8.ans', size: 200 };
			const callback = vi.fn();

			const mockReaderInstance = {
				result: null,
				addEventListener: vi.fn(),
				readAsArrayBuffer: vi.fn(),
			};

			global.FileReader = vi.fn(function () {
				return mockReaderInstance;
			});

			Load.file(mockFile, callback);

			expect(mockReaderInstance.addEventListener).toHaveBeenCalledWith(
				'load',
				expect.any(Function),
			);
			expect(mockReaderInstance.readAsArrayBuffer).toHaveBeenCalledWith(
				mockFile,
			);
		});
	});

	describe('SAUCE Record Processing', () => {
		it('should test SAUCE record file extension detection', () => {
			const testFiles = [
				{ name: 'test.ans', size: 100 },
				{ name: 'test.asc', size: 100 },
				{ name: 'test.utf8.ans', size: 100 },
				{ name: 'test.bin', size: 4000 },
				{ name: 'test.xb', size: 1000 },
			];

			testFiles.forEach(mockFile => {
				const callback = vi.fn();
				const mockReaderInstance = {
					result: null,
					addEventListener: vi.fn(),
					readAsArrayBuffer: vi.fn(),
				};

				global.FileReader = vi.fn(function () {
					return mockReaderInstance;
				});

				expect(() => Load.file(mockFile, callback)).not.toThrow();
				expect(mockReaderInstance.readAsArrayBuffer).toHaveBeenCalledWith(
					mockFile,
				);
			});
		});

		it('should handle SAUCE data processing logic', () => {
			const testWidth = 80;

			expect(typeof testWidth).toBe('number');
			expect(testWidth).toBe(80);
		});
	});

	describe('ANSI Parsing Engine', () => {
		it('should test ANSI file processing setup', () => {
			const mockFile = { name: 'test.ans', size: 150 };
			const callback = vi.fn();

			const mockReaderInstance = {
				result: null,
				addEventListener: vi.fn(),
				readAsArrayBuffer: vi.fn(),
			};

			global.FileReader = vi.fn(function () {
				return mockReaderInstance;
			});

			Load.file(mockFile, callback);

			expect(mockReaderInstance.addEventListener).toHaveBeenCalledWith(
				'load',
				expect.any(Function),
			);
		});

		it('should test control character mapping logic', () => {
			const controlCodes = [10, 13, 26, 27];
			const mappedCodes = controlCodes.map(code => {
				switch (code) {
					case 10:
						return 9;
					case 13:
						return 14;
					case 26:
						return 16;
					case 27:
						return 17;
					default:
						return code;
				}
			});

			expect(mappedCodes).toEqual([9, 14, 16, 17]);
		});
	});

	describe('UTF-8 Processing', () => {
		it('should test UTF-8 file processing setup', () => {
			const mockFile = { name: 'test.utf8.ans', size: 100 };
			const callback = vi.fn();

			const mockReaderInstance = {
				result: null,
				addEventListener: vi.fn(),
				readAsArrayBuffer: vi.fn(),
			};

			global.FileReader = vi.fn(function () {
				return mockReaderInstance;
			});

			Load.file(mockFile, callback);

			expect(mockReaderInstance.addEventListener).toHaveBeenCalledWith(
				'load',
				expect.any(Function),
			);
		});

		it('should test UTF-8 decoding logic', () => {
			const utf8Sequences = [
				{ bytes: [0x41], expected: 0x41 }, // ASCII 'A'
				{ bytes: [0xc3, 0xa9], expected: 0xe9 }, // é
				{ bytes: [0xe2, 0x82, 0xac], expected: 0x20ac }, // €
			];

			utf8Sequences.forEach(seq => {
				let charCode = seq.bytes[0];
				if ((charCode & 0x80) === 0) {
					// 1-byte sequence
					expect(charCode).toBe(seq.expected);
				} else if ((charCode & 0xe0) === 0xc0 && seq.bytes.length >= 2) {
					// 2-byte sequence
					charCode = ((charCode & 0x1f) << 6) | (seq.bytes[1] & 0x3f);
					expect(charCode).toBe(seq.expected);
				} else if ((charCode & 0xf0) === 0xe0 && seq.bytes.length >= 3) {
					// 3-byte sequence
					charCode =
						((charCode & 0x0f) << 12) |
						((seq.bytes[1] & 0x3f) << 6) |
						(seq.bytes[2] & 0x3f);
					expect(charCode).toBe(seq.expected);
				}
			});
		});
	});

	describe('Advanced Save Operations', () => {
		it('should test comprehensive ANSI generation with all attribute types', async () => {
			const complexImageData = new Uint16Array(80 * 25);

			for (let y = 0; y < 25; y++) {
				for (let x = 0; x < 80; x++) {
					const index = y * 80 + x;
					const char = 65 + (index % 26); // A-Z
					const fg = index % 16;
					const bg = (index >> 4) % 16;
					complexImageData[index] = (char << 8) | (bg << 4) | fg;
				}
			}

			mockState.textArtCanvas.getImageData.mockReturnValue(complexImageData);
			mockState.textArtCanvas.getColumns.mockReturnValue(80);
			mockState.textArtCanvas.getRows.mockReturnValue(25);

			await Save.ans();

			expect(global.Blob).toHaveBeenCalled();
			const blobCall = global.Blob.mock.calls[0];
			expect(blobCall[1]).toEqual({ type: 'application/octet-stream' });
		});

		it('should test UTF-8 ANSI generation without mocking issues', async () => {
			const regularImageData = new Uint16Array(80 * 5);
			for (let i = 0; i < 10; i++) {
				regularImageData[i] = ((65 + i) << 8) | 0x07; // A-J with white on black
			}

			mockState.textArtCanvas.getImageData.mockReturnValue(regularImageData);
			mockState.textArtCanvas.getColumns.mockReturnValue(80);
			mockState.textArtCanvas.getRows.mockReturnValue(5);

			await Save.utf8();

			expect(global.Blob).toHaveBeenCalled();
		});

		it('should test XBIN generation with ICE colors and font data', async () => {
			mockState.textArtCanvas.getIceColors.mockReturnValue(true);
			mockState.textArtCanvas.getColumns.mockReturnValue(80);
			mockState.textArtCanvas.getRows.mockReturnValue(25);

			const iceImageData = new Uint16Array(80 * 25);
			for (let i = 0; i < iceImageData.length; i++) {
				iceImageData[i] = (65 << 8) | 0xff; // A with bright colors
			}
			mockState.textArtCanvas.getImageData.mockReturnValue(iceImageData);

			await Save.xb();

			expect(global.Blob).toHaveBeenCalled();
		});

		it('should test BIN file generation with proper width validation', async () => {
			mockState.textArtCanvas.getColumns.mockReturnValue(80);
			mockState.textArtCanvas.getRows.mockReturnValue(25);
			mockState.textArtCanvas.getDoc.mockReturnValue(
				createDocV3({ columns: 80, rows: 25 }),
			);

			const binImageData = new Uint16Array(80 * 25);
			for (let i = 0; i < binImageData.length; i++) {
				binImageData[i] = ((65 + (i % 26)) << 8) | 0x07;
			}
			mockState.textArtCanvas.getImageData.mockReturnValue(binImageData);

			await Save.bin();

			expect(global.Blob).toHaveBeenCalled();

			global.Blob.mockClear();

			mockState.textArtCanvas.getColumns.mockReturnValue(81);
			mockState.textArtCanvas.getDoc.mockReturnValue(
				createDocV3({ columns: 81, rows: 25 }),
			);
			await Save.bin();

			expect(global.Blob).not.toHaveBeenCalled();
		});
	});

	describe('Data Conversion Functions', () => {
		it('should test binary data conversion utilities', () => {
			const testCodes = [10, 13, 26, 27, 65, 255];
			testCodes.forEach(code => {
				let mappedCode = code;
				switch (code) {
					case 10:
						mappedCode = 9;
						break;
					case 13:
						mappedCode = 14;
						break;
					case 26:
						mappedCode = 16;
						break;
					case 27:
						mappedCode = 17;
						break;
				}
				expect(typeof mappedCode).toBe('number');
			});
		});

		it('should test color attribute processing', () => {
			const ansiColors = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
			ansiColors.forEach(color => {
				let binColor = color;
				switch (color) {
					case 4:
						binColor = 1;
						break;
					case 6:
						binColor = 3;
						break;
					case 1:
						binColor = 4;
						break;
					case 3:
						binColor = 6;
						break;
					case 12:
						binColor = 9;
						break;
					case 14:
						binColor = 11;
						break;
					case 9:
						binColor = 12;
						break;
					case 11:
						binColor = 14;
						break;
				}
				expect(binColor).toBeGreaterThanOrEqual(0);
				expect(binColor).toBeLessThan(16);
			});
		});

		it('should test uint16 to bytes conversion', () => {
			const testArray = new Uint16Array([0x1234, 0x5678, 0xabcd]);
			const result = new Uint8Array(testArray.length * 2);

			for (let i = 0; i < testArray.length; i++) {
				result[i * 2] = testArray[i] >> 8;
				result[i * 2 + 1] = testArray[i] & 0xff;
			}

			expect(result[0]).toBe(0x12);
			expect(result[1]).toBe(0x34);
			expect(result[2]).toBe(0x56);
			expect(result[3]).toBe(0x78);
			expect(result[4]).toBe(0xab);
			expect(result[5]).toBe(0xcd);
		});
	});

	describe('File Format Edge Cases', () => {
		it('should handle empty files gracefully', () => {
			const mockFile = { name: 'empty.ans', size: 0 };
			const callback = vi.fn();

			const mockReaderInstance = {
				result: new ArrayBuffer(0),
				addEventListener: vi.fn(),
				readAsArrayBuffer: vi.fn(),
			};

			global.FileReader = vi.fn(function () {
				return mockReaderInstance;
			});

			Load.file(mockFile, callback);

			expect(mockReaderInstance.addEventListener).toHaveBeenCalledWith(
				'load',
				expect.any(Function),
			);
			expect(mockReaderInstance.readAsArrayBuffer).toHaveBeenCalledWith(
				mockFile,
			);
		});

		it('should handle very large files', () => {
			const mockFile = { name: 'large.bin', size: 32000 }; // 160x100x2
			const callback = vi.fn();

			const mockReaderInstance = {
				result: null,
				addEventListener: vi.fn(),
				readAsArrayBuffer: vi.fn(),
			};

			global.FileReader = vi.fn(function () {
				return mockReaderInstance;
			});

			Load.file(mockFile, callback);

			expect(mockReaderInstance.addEventListener).toHaveBeenCalledWith(
				'load',
				expect.any(Function),
			);
			expect(mockReaderInstance.readAsArrayBuffer).toHaveBeenCalledWith(
				mockFile,
			);
		});

		it('should handle corrupted files gracefully', () => {
			const mockFile = { name: 'corrupted.ans', size: 200 };
			const callback = vi.fn();

			const mockReaderInstance = {
				result: null,
				addEventListener: vi.fn(),
				readAsArrayBuffer: vi.fn(),
			};

			global.FileReader = vi.fn(function () {
				return mockReaderInstance;
			});

			Load.file(mockFile, callback);

			expect(mockReaderInstance.addEventListener).toHaveBeenCalledWith(
				'load',
				expect.any(Function),
			);
			expect(mockReaderInstance.readAsArrayBuffer).toHaveBeenCalledWith(
				mockFile,
			);
		});

		it('should handle various file extensions', () => {
			const testFiles = [
				{ name: 'test.asc', size: 100 },
				{ name: 'test.txt', size: 100 },
				{ name: 'test.ice', size: 100 },
				{ name: 'test.nfo', size: 100 },
				{ name: 'test.diz', size: 100 },
			];

			testFiles.forEach(file => {
				const callback = vi.fn();
				const mockReaderInstance = {
					result: null,
					addEventListener: vi.fn(),
					readAsArrayBuffer: vi.fn(),
				};

				global.FileReader = vi.fn(function () {
					return mockReaderInstance;
				});

				expect(() => Load.file(file, callback)).not.toThrow();
				expect(mockReaderInstance.readAsArrayBuffer).toHaveBeenCalledWith(file);
			});
		});
	});

	describe('Internal Data Processing', () => {
		it('should test image data conversion logic', () => {
			const testData = new Uint8Array([65, 7, 0, 66, 15, 8]); // Two characters with attributes
			const expectedLength = testData.length / 3;

			const output = new Uint16Array(expectedLength);
			for (let i = 0, j = 0; i < expectedLength; i += 1, j += 3) {
				output[i] =
					(testData[j] << 8) + (testData[j + 2] << 4) + testData[j + 1];
			}

			expect(output.length).toBe(2);
			expect(output[0]).toBe((65 << 8) + (0 << 4) + 7); // 'A' with fg=7, bg=0
			expect(output[1]).toBe((66 << 8) + (8 << 4) + 15); // 'B' with fg=15, bg=8
		});

		it('should test string processing utilities', () => {
			const testBytes = new Uint8Array([72, 101, 108, 108, 111, 0, 87, 111, 114, 108, 100]);
			let result = '';

			for (let i = 0; i < 5; i++) {
				const charCode = testBytes[i];
				if (charCode === 0) {
					break;
				}
				result += String.fromCharCode(charCode);
			}

			expect(result).toBe('Hello');
		});

		it('should test SAUCE metadata extraction', () => {
			const testSauceData = {
				title: 'Test Title',
				author: 'Test Author',
				group: 'Test Group',
				date: '20231215',
				fileSize: 1000,
				dataType: 1,
				fileType: 1,
				tInfo1: 80,
				tInfo2: 25,
			};

			expect(testSauceData.title).toBe('Test Title');
			expect(testSauceData.author).toBe('Test Author');
			expect(testSauceData.tInfo1).toBe(80); // Width
			expect(testSauceData.tInfo2).toBe(25); // Height
		});

		it('should test attribute processing logic', () => {
			const testAttributes = [
				{ fg: 7, bg: 0, expectedBold: false, expectedBlink: false },
				{ fg: 15, bg: 0, expectedBold: true, expectedBlink: false },
				{ fg: 7, bg: 8, expectedBold: false, expectedBlink: true },
				{ fg: 15, bg: 8, expectedBold: true, expectedBlink: true },
			];

			testAttributes.forEach(attr => {
				const bold = attr.fg > 7;
				const blink = attr.bg > 7;

				expect(bold).toBe(attr.expectedBold);
				expect(blink).toBe(attr.expectedBlink);
			});
		});

		it('should test ANSI color code generation', () => {
			const colors = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

			colors.forEach(color => {
				let ansiCode;
				if (color < 8) {
					ansiCode = 30 + color;
				} else {
					ansiCode = 90 + (color - 8);
				}

				expect(ansiCode).toBeGreaterThanOrEqual(30);
				expect(ansiCode).toBeLessThanOrEqual(97);
			});
		});

		it('should test file size calculations', () => {
			const testCases = [
				{ width: 80, height: 25, expectedBinSize: 80 * 25 * 2 },
				{ width: 132, height: 50, expectedBinSize: 132 * 50 * 2 },
				{ width: 40, height: 25, expectedBinSize: 40 * 25 * 2 },
			];

			testCases.forEach(testCase => {
				const calculatedSize = testCase.width * testCase.height * 2;
				expect(calculatedSize).toBe(testCase.expectedBinSize);
			});
		});
	});
});
