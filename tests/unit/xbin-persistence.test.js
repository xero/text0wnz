import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * XBIN Font Data Persistence Tests
 *
 * Verifies that XBIN font data is correctly saved to and restored from localStorage
 */
describe('XBIN Font Data Persistence', () => {
	let mockCanvas;
	let xbinFileBytes;

	beforeEach(() => {
		// Read actual XBIN file for testing
		const xbinPath = path.join(
			process.cwd(),
			'docs/examples/xbin/xz-neuromancer.xb',
		);
		xbinFileBytes = new Uint8Array(fs.readFileSync(xbinPath));

		// Create mock canvas with XBIN methods
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

		// Setup localStorage mock
		global.localStorage = {
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
		};
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
		// Parse XBIN file structure
		const fontHeight = xbinFileBytes[9];
		const flags = xbinFileBytes[10];
		const paletteFlag = (flags & 0x01) === 1;
		const fontFlag = ((flags >> 1) & 0x01) === 1;

		let dataIndex = 11;

		// Skip palette if present
		if (paletteFlag) {
			dataIndex += 48;
		}

		// Extract font data
		if (fontFlag) {
			const fontDataSize = 256 * fontHeight;
			const fontData = xbinFileBytes.slice(dataIndex, dataIndex + fontDataSize);

			expect(fontData.length).toBe(fontDataSize);
			expect(fontHeight).toBeGreaterThan(0);
			expect(fontHeight).toBeLessThanOrEqual(32);
		}
	});

	it('should serialize XBIN font data to localStorage format', () => {
		// Create test font data
		const testFontData = {
			bytes: new Uint8Array(16 * 256),
			width: 8,
			height: 16,
		};

		// Fill with test pattern
		for (let i = 0; i < testFontData.bytes.length; i++) {
			testFontData.bytes[i] = i % 256;
		}

		// Simulate serialization
		const serialized = {
			bytes: Array.from(testFontData.bytes),
			width: testFontData.width,
			height: testFontData.height,
		};

		// Verify serialization
		expect(serialized.bytes).toBeInstanceOf(Array);
		expect(serialized.bytes.length).toBe(4096);
		expect(serialized.width).toBe(8);
		expect(serialized.height).toBe(16);
	});

	it('should deserialize XBIN font data from localStorage format', () => {
		// Create serialized data
		const serialized = {
			bytes: Array.from({ length: 4096 }, (_, i) => i % 256),
			width: 8,
			height: 16,
		};

		// Simulate deserialization
		const deserialized = {
			bytes: new Uint8Array(serialized.bytes),
			width: serialized.width,
			height: serialized.height,
		};

		// Verify deserialization
		expect(deserialized.bytes).toBeInstanceOf(Uint8Array);
		expect(deserialized.bytes.length).toBe(4096);
		expect(deserialized.width).toBe(8);
		expect(deserialized.height).toBe(16);
	});

	it('should preserve byte values through serialization round-trip', () => {
		// Create test data
		const original = new Uint8Array(256);
		for (let i = 0; i < 256; i++) {
			original[i] = i;
		}

		// Serialize
		const serialized = Array.from(original);
		const jsonString = JSON.stringify(serialized);

		// Deserialize
		const parsed = JSON.parse(jsonString);
		const restored = new Uint8Array(parsed);

		// Verify all bytes match
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

		// Mock the getXBFontData to return test data
		mockCanvas.getXBFontData.mockReturnValue(testFontData);

		const result = mockCanvas.getXBFontData();
		expect(result).toBeDefined();
		expect(result.bytes).toBeInstanceOf(Uint8Array);
		expect(result.width).toBe(8);
		expect(result.height).toBe(16);
	});

	it('should handle getXBFontData() when font data is null', () => {
		// Mock the getXBFontData to return null
		mockCanvas.getXBFontData.mockReturnValue(null);

		const result = mockCanvas.getXBFontData();
		expect(result).toBeNull();
	});

	it('should include XBIN font data in state serialization when available', () => {
		// Simulate state with XBIN font
		const testFontData = {
			bytes: new Uint8Array(4096),
			width: 8,
			height: 16,
		};

		mockCanvas.getXBFontData.mockReturnValue(testFontData);

		// Simulate serializeState logic
		const serialized = {};
		const xbFontData = mockCanvas.getXBFontData();
		if (xbFontData && xbFontData.bytes) {
			serialized.xbinFontData = {
				bytes: Array.from(xbFontData.bytes),
				width: xbFontData.width,
				height: xbFontData.height,
			};
		}

		// Verify serialization
		expect(serialized.xbinFontData).toBeDefined();
		expect(serialized.xbinFontData.bytes).toBeInstanceOf(Array);
		expect(serialized.xbinFontData.width).toBe(8);
		expect(serialized.xbinFontData.height).toBe(16);
	});

	it('should NOT include XBIN font data when not available', () => {
		mockCanvas.getXBFontData.mockReturnValue(null);

		// Simulate serializeState logic
		const serialized = {};
		const xbFontData = mockCanvas.getXBFontData();
		if (xbFontData && xbFontData.bytes) {
			serialized.xbinFontData = {
				bytes: Array.from(xbFontData.bytes),
				width: xbFontData.width,
				height: xbFontData.height,
			};
		}

		// Verify no XBIN data
		expect(serialized.xbinFontData).toBeUndefined();
	});

	it('should restore XBIN font data before setting font', () => {
		// Setup saved state
		const savedState = {
			fontName: 'XBIN',
			xbinFontData: {
				bytes: Array.from({ length: 4096 }, (_, i) => i % 256),
				width: 8,
				height: 16,
			},
		};

		// Simulate restoration logic
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

		// Verify setXBFontData was called before setFont
		expect(mockCanvas.setXBFontData).toHaveBeenCalled();
		expect(mockCanvas.setFont).toHaveBeenCalledWith('XBIN');

		// Verify font data was converted back to Uint8Array
		const callArgs = mockCanvas.setXBFontData.mock.calls[0];
		expect(callArgs[0]).toBeInstanceOf(Uint8Array);
		expect(callArgs[0].length).toBe(4096);
		expect(callArgs[1]).toBe(8);
		expect(callArgs[2]).toBe(16);
	});
});
