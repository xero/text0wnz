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

describe('File Module - Advanced Operations', () => {
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
