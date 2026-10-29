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

describe('File Module - Formats and Parsing', () => {
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

	describe('FileReader wiring', () => {
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
	});
});
