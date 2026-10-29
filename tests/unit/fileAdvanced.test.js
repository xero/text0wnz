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
});
