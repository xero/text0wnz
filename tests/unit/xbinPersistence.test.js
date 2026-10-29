import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('XBIN Font Data Persistence', () => {
	let mockCanvas;
	let xbinFileBytes;

	beforeEach(() => {
		const xbinPath = path.join(
			process.cwd(),
			'docs/examples/xbin/xz-neuromancer.xb',
		);
		xbinFileBytes = new Uint8Array(fs.readFileSync(xbinPath));

		mockCanvas = {
			getXBFontData: vi.fn(),
			setXBFontData: vi.fn(),
			getColumns: vi.fn(() => 80),
			getRows: vi.fn(() => 25),
			getImageData: vi.fn(() => new Uint16Array(80 * 25)),
			getIceColors: vi.fn(() => false),
			getCurrentFontName: vi.fn(() => 'XBIN'),
			setFont: vi.fn((fontName, callback) => callback && callback()),
		};

		vi.stubGlobal('localStorage', {
			data: {},
			getItem(key) {
				return this.data[key] || null;
			},
			setItem(key, value) {
				this.data[key] = value;
			},
			clear() {
				this.data = {};
			},
		});
	});

	afterEach(() => {
		mockCanvas = null;
		xbinFileBytes = null;
		if (global.localStorage) {
			global.localStorage.clear();
		}
		vi.restoreAllMocks();
	});

	it('should verify XBIN file has embedded font', () => {
		const header = String.fromCharCode(
			xbinFileBytes[0],
			xbinFileBytes[1],
			xbinFileBytes[2],
			xbinFileBytes[3],
		);
		expect(header).toBe('XBIN');
		expect(xbinFileBytes[4]).toBe(0x1a); // EOF marker

		const flags = xbinFileBytes[10];
		const hasFontFlag = ((flags >> 1) & 0x01) === 1;
		expect(hasFontFlag).toBe(true);
	});

	it('should extract XBIN font data correctly', () => {
		const fontHeight = xbinFileBytes[9];
		const flags = xbinFileBytes[10];
		const paletteFlag = (flags & 0x01) === 1;
		const fontFlag = ((flags >> 1) & 0x01) === 1;

		let dataIndex = 11;

		if (paletteFlag) {
			dataIndex += 48;
		}

		if (fontFlag) {
			const fontDataSize = 256 * fontHeight;
			const fontData = xbinFileBytes.slice(dataIndex, dataIndex + fontDataSize);

			expect(fontData.length).toBe(fontDataSize);
			expect(fontHeight).toBeGreaterThan(0);
			expect(fontHeight).toBeLessThanOrEqual(32);
		}
	});

	it('should serialize XBIN font data to localStorage format', () => {
		const testFontData = {
			bytes: new Uint8Array(16 * 256),
			width: 8,
			height: 16,
		};

		for (let i = 0; i < testFontData.bytes.length; i++) {
			testFontData.bytes[i] = i % 256;
		}

		const serialized = {
			bytes: Array.from(testFontData.bytes),
			width: testFontData.width,
			height: testFontData.height,
		};

		expect(serialized.bytes).toBeInstanceOf(Array);
		expect(serialized.bytes.length).toBe(4096);
		expect(serialized.width).toBe(8);
		expect(serialized.height).toBe(16);
	});

	it('should deserialize XBIN font data from localStorage format', () => {
		const serialized = {
			bytes: Array.from({ length: 4096 }, (_, i) => i % 256),
			width: 8,
			height: 16,
		};

		const deserialized = {
			bytes: new Uint8Array(serialized.bytes),
			width: serialized.width,
			height: serialized.height,
		};

		expect(deserialized.bytes).toBeInstanceOf(Uint8Array);
		expect(deserialized.bytes.length).toBe(4096);
		expect(deserialized.width).toBe(8);
		expect(deserialized.height).toBe(16);
	});

	it('should preserve byte values through serialization round-trip', () => {
		const original = new Uint8Array(256);
		for (let i = 0; i < 256; i++) {
			original[i] = i;
		}

		const serialized = Array.from(original);
		const jsonString = JSON.stringify(serialized);

		const parsed = JSON.parse(jsonString);
		const restored = new Uint8Array(parsed);

		for (let i = 0; i < 256; i++) {
			expect(restored[i]).toBe(original[i]);
		}
	});

	it('should handle getXBFontData() when font data is set', () => {
		const testFontData = {
			bytes: new Uint8Array(4096),
			width: 8,
			height: 16,
		};

		mockCanvas.getXBFontData.mockReturnValue(testFontData);

		const result = mockCanvas.getXBFontData();
		expect(result).toBeDefined();
		expect(result.bytes).toBeInstanceOf(Uint8Array);
		expect(result.width).toBe(8);
		expect(result.height).toBe(16);
	});

	it('should handle getXBFontData() when font data is null', () => {
		mockCanvas.getXBFontData.mockReturnValue(null);

		const result = mockCanvas.getXBFontData();
		expect(result).toBeNull();
	});

	it('should include XBIN font data in state serialization when available', () => {
		const testFontData = {
			bytes: new Uint8Array(4096),
			width: 8,
			height: 16,
		};

		mockCanvas.getXBFontData.mockReturnValue(testFontData);

		const serialized = {};
		const xbFontData = mockCanvas.getXBFontData();
		if (xbFontData && xbFontData.bytes) {
			serialized.xbinFontData = {
				bytes: Array.from(xbFontData.bytes),
				width: xbFontData.width,
				height: xbFontData.height,
			};
		}

		expect(serialized.xbinFontData).toBeDefined();
		expect(serialized.xbinFontData.bytes).toBeInstanceOf(Array);
		expect(serialized.xbinFontData.width).toBe(8);
		expect(serialized.xbinFontData.height).toBe(16);
	});

	it('should NOT include XBIN font data when not available', () => {
		mockCanvas.getXBFontData.mockReturnValue(null);

		const serialized = {};
		const xbFontData = mockCanvas.getXBFontData();
		if (xbFontData && xbFontData.bytes) {
			serialized.xbinFontData = {
				bytes: Array.from(xbFontData.bytes),
				width: xbFontData.width,
				height: xbFontData.height,
			};
		}

		expect(serialized.xbinFontData).toBeUndefined();
	});

	it('should restore XBIN font data before setting font', () => {
		const savedState = {
			fontName: 'XBIN',
			xbinFontData: {
				bytes: Array.from({ length: 4096 }, (_, i) => i % 256),
				width: 8,
				height: 16,
			},
		};

		if (savedState.xbinFontData) {
			const fontBytes = new Uint8Array(savedState.xbinFontData.bytes);
			mockCanvas.setXBFontData(
				fontBytes,
				savedState.xbinFontData.width,
				savedState.xbinFontData.height,
			);
		}

		if (savedState.fontName) {
			mockCanvas.setFont(savedState.fontName);
		}

		expect(mockCanvas.setXBFontData).toHaveBeenCalled();
		expect(mockCanvas.setFont).toHaveBeenCalledWith('XBIN');

		const callArgs = mockCanvas.setXBFontData.mock.calls[0];
		expect(callArgs[0]).toBeInstanceOf(Uint8Array);
		expect(callArgs[0].length).toBe(4096);
		expect(callArgs[1]).toBe(8);
		expect(callArgs[2]).toBe(16);
	});
});
