import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock State module
const mockState = {
	title: 'test-artwork',
	textArtCanvas: {
		getColumns: vi.fn(() => 80),
		getRows: vi.fn(() => 25),
		getImageData: vi.fn(() => new Uint16Array(80 * 25).fill(0x2007)),
		getIceColors: vi.fn(() => false),
		getCurrentFontName: vi.fn(() => 'CP437 8x16'),
		getXBPaletteData: vi.fn(() => new Uint8Array(48).fill(21)),
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

vi.mock('../../src/js/client/palette.js', () => ({
	getUTF8: vi.fn(charCode => [charCode]),
	getUnicode: vi.fn(),
	getUnicodeReverseMap: new Map(),
}));

// Reference decoder matching the loader's uncompress() run types
const uncompress = (bytes, dataIndex, dataEnd, columns, rows) => {
	const data = new Uint16Array(columns * rows);
	let i, value, count, j, k, char, attribute;
	for (i = dataIndex, j = 0; i < dataEnd;) {
		value = bytes[i++];
		count = value & 0x3f;
		switch (value >> 6) {
			case 1:
				char = bytes[i++];
				for (k = 0; k <= count; k++) {
					data[j++] = (char << 8) + bytes[i++];
				}
				break;
			case 2:
				attribute = bytes[i++];
				for (k = 0; k <= count; k++) {
					data[j++] = (bytes[i++] << 8) + attribute;
				}
				break;
			case 3:
				char = bytes[i++];
				attribute = bytes[i++];
				for (k = 0; k <= count; k++) {
					data[j++] = (char << 8) + attribute;
				}
				break;
			default:
				for (k = 0; k <= count; k++) {
					data[j++] = (bytes[i++] << 8) + bytes[i++];
				}
				break;
		}
	}
	return data;
};

describe('XBin Save Compression', () => {
	let Save;
	let savedBytes;

	const parseSavedXBin = () => {
		expect(savedBytes).not.toBeNull();
		const header = savedBytes.subarray(0, 11);
		expect(String.fromCharCode(...header.subarray(0, 4))).toBe('XBIN');
		const columns = (header[6] << 8) + header[5];
		const rows = (header[8] << 8) + header[7];
		const flags = header[10];
		let dataIndex = 11;
		if (flags & 0x01) {
			dataIndex += 48; // Palette data
		}
		if ((flags >> 1) & 0x01) {
			dataIndex += 256 * header[9]; // Font data
		}
		// Image data runs to the EOF byte before the SAUCE record
		const dataEnd = savedBytes.length - 1 - 128;
		return { columns, rows, flags, dataIndex, dataEnd };
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
		Save = fileModule.Save;
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	// Build a canvas that exercises all four run types
	const buildTestImage = (columns, rows) => {
		const imageData = new Uint16Array(columns * rows);
		for (let i = 0; i < imageData.length; i++) {
			const row = Math.floor(i / columns);
			const col = i % columns;
			if (row % 4 === 0) {
				imageData[i] = (219 << 8) + 7; // Repeated char and attribute
			} else if (row % 4 === 1) {
				imageData[i] = (176 << 8) + (col & 15); // Repeated char only
			} else if (row % 4 === 2) {
				imageData[i] = ((col & 255) << 8) + 7; // Repeated attribute only
			} else {
				imageData[i] = ((col & 255) << 8) + ((col * 7) & 255); // Literals
			}
		}
		return imageData;
	};

	it('should save compressed XBin files that round-trip losslessly', async () => {
		const imageData = buildTestImage(80, 25);
		mockState.textArtCanvas.getImageData.mockReturnValue(imageData);

		await Save.xb();

		const { columns, rows, flags, dataIndex, dataEnd } = parseSavedXBin();
		expect(columns).toBe(80);
		expect(rows).toBe(25);
		expect((flags >> 2) & 0x01).toBe(1); // Compression flag set

		// Compressed data must be smaller than raw
		expect(dataEnd - dataIndex).toBeLessThan(imageData.length * 2);

		const decoded = uncompress(savedBytes, dataIndex, dataEnd, columns, rows);
		expect(decoded).toEqual(imageData);
	});

	it('should compress long runs down to a few bytes per row', async () => {
		const imageData = new Uint16Array(80 * 25).fill((219 << 8) + 7);
		mockState.textArtCanvas.getImageData.mockReturnValue(imageData);

		await Save.xb();

		const { flags, dataIndex, dataEnd } = parseSavedXBin();
		expect((flags >> 2) & 0x01).toBe(1);
		// 80 cells per row = two 64-max runs of 3 bytes each
		expect(dataEnd - dataIndex).toBe(25 * 6);

		const decoded = uncompress(savedBytes, dataIndex, dataEnd, 80, 25);
		expect(decoded).toEqual(imageData);
	});

	it('should keep raw image data when compression is disabled', async () => {
		const imageData = buildTestImage(80, 25);
		mockState.textArtCanvas.getImageData.mockReturnValue(imageData);

		await Save.xb(false);

		const { flags, dataIndex, dataEnd } = parseSavedXBin();
		expect((flags >> 2) & 0x01).toBe(0); // Compression flag clear
		expect(dataEnd - dataIndex).toBe(imageData.length * 2);

		for (let i = 0; i < imageData.length; i++) {
			const value =
				(savedBytes[dataIndex + i * 2] << 8) + savedBytes[dataIndex + i * 2 + 1];
			expect(value).toBe(imageData[i]);
		}
	});

	it('should keep raw image data when compression does not help', async () => {
		// Noisy canvas where neighbors never share a char or attribute
		const columns = 80;
		const rows = 5;
		const imageData = new Uint16Array(columns * rows);
		for (let i = 0; i < imageData.length; i++) {
			imageData[i] = (((i * 13) & 255) << 8) + ((i * 7) & 255);
		}
		mockState.textArtCanvas.getColumns.mockReturnValue(columns);
		mockState.textArtCanvas.getRows.mockReturnValue(rows);
		mockState.textArtCanvas.getImageData.mockReturnValue(imageData);

		await Save.xb();

		const { flags, dataIndex, dataEnd } = parseSavedXBin();
		expect((flags >> 2) & 0x01).toBe(0);
		expect(dataEnd - dataIndex).toBe(imageData.length * 2);
	});
});
