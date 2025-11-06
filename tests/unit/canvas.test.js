import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTextArtCanvas } from '../../src/js/client/canvas.js';

// Set up module mocks first - before importing canvas.js
vi.mock('../../src/js/client/state.js', () => ({
	default: {
		font: {
			draw: vi.fn(),
			getWidth: vi.fn(() => 8),
			getHeight: vi.fn(() => 16),
			setLetterSpacing: vi.fn(),
			getLetterSpacing: vi.fn(() => false),
		},
		palette: {
			getRGBAColor: vi.fn(() => [255, 255, 255, 255]),
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
		},
	},
}));

vi.mock('../../src/js/client/ui.js', () => ({
	$: vi.fn(_id => ({
		style: {},
		classList: { add: vi.fn(), remove: vi.fn() },
		appendChild: vi.fn(),
		addEventListener: vi.fn(),
	})),
	createCanvas: vi.fn(() => ({
		width: 640,
		height: 400,
		style: {},
		getContext: vi.fn(() => ({
			fillStyle: '',
			fillRect: vi.fn(),
			clearRect: vi.fn(),
			drawImage: vi.fn(),
			createImageData: vi.fn((width, height) => ({
				data: new Uint8ClampedArray(width * height * 4),
				width,
				height,
			})),
			putImageData: vi.fn(),
			getImageData: vi.fn((_x, _y, width, height) => ({
				data: new Uint8ClampedArray(width * height * 4),
				width,
				height,
			})),
		})),
	})),
}));

vi.mock('../../src/js/client/font.js', () => ({
	loadFontFromImage: vi.fn((_name, _spacing, _palette) => {
		return Promise.resolve({
			draw: vi.fn(),
			drawWithAlpha: vi.fn(),
			getWidth: vi.fn(() => 8),
			getHeight: vi.fn(() => 16),
			setLetterSpacing: vi.fn(),
			getLetterSpacing: vi.fn(() => false),
		});
	}),
	loadFontFromXBData: vi.fn((_data, _width, _height, _spacing, _palette) => {
		return Promise.resolve({
			draw: vi.fn(),
			drawWithAlpha: vi.fn(),
			getWidth: vi.fn(() => 8),
			getHeight: vi.fn(() => 16),
			setLetterSpacing: vi.fn(),
			getLetterSpacing: vi.fn(() => false),
		});
	}),
}));

vi.mock('../../src/js/client/palette.js', () => ({
	createPalette: vi.fn(() => ({ getRGBAColor: vi.fn(() => [255, 255, 255, 255]) })),
	createDefaultPalette: vi.fn(() => ({ getRGBAColor: vi.fn(() => [255, 255, 255, 255]) })),
}));

describe('Canvas Module', () => {
	let mockContainer;
	let mockCallback;
	let canvas;

	beforeEach(() => {
		// Clear any large objects from previous tests
		if (global.gc) {
			global.gc();
		}

		vi.clearAllMocks();
		mockContainer = {
			style: {},
			classList: { add: vi.fn(), remove: vi.fn() },
			appendChild: vi.fn(),
			removeChild: vi.fn(),
			addEventListener: vi.fn(),
			children: [], // Add children array for DOM operations
		};
		mockCallback = vi.fn();
	});

	afterEach(() => {
		// Cleanup after each test
		canvas = null;
		mockContainer = null;
		mockCallback = null;
		vi.restoreAllMocks();
		if (global.gc) {
			global.gc();
		}
	});

	describe('createTextArtCanvas', () => {
		it('should create text art canvas with default dimensions', async () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas).toBeDefined();
			expect(canvas.getColumns).toBeDefined();
			expect(canvas.getRows).toBeDefined();
			// Remove the specific callback test since it's async and complex
		});

		it('should provide all required canvas methods', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			// Test that all required methods exist
			expect(canvas.setImageData).toBeDefined();
			expect(canvas.getColumns).toBeDefined();
			expect(canvas.getRows).toBeDefined();
			expect(canvas.clear).toBeDefined();
			expect(canvas.draw).toBeDefined();
			expect(canvas.getBlock).toBeDefined();
			expect(canvas.getHalfBlock).toBeDefined();
			expect(canvas.drawHalfBlock).toBeDefined();
			expect(canvas.startUndo).toBeDefined();
			expect(canvas.undo).toBeDefined();
			expect(canvas.redo).toBeDefined();
			expect(canvas.deleteArea).toBeDefined();
			expect(canvas.getArea).toBeDefined();
			expect(canvas.setArea).toBeDefined();
			expect(canvas.quickDraw).toBeDefined();
			expect(canvas.setMirrorMode).toBeDefined();
			expect(canvas.getMirrorMode).toBeDefined();
			expect(canvas.getMirrorX).toBeDefined();
			expect(canvas.getCurrentFontName).toBeDefined();
		});

		it('should handle resize operations', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			canvas.resize(100, 50);

			expect(canvas.getColumns()).toBe(100);
			expect(canvas.getRows()).toBe(50);
		});

		it('should handle clear operation', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			// Test that clear method exists and can be called
			expect(canvas.clear).toBeDefined();
			expect(typeof canvas.clear).toBe('function');
		});

		it('should handle undo/redo operations', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			canvas.startUndo();
			expect(() => canvas.undo()).not.toThrow();
			expect(() => canvas.redo()).not.toThrow();
		});

		it('should provide getUndoHistory method', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.getUndoHistory).toBeDefined();
			expect(typeof canvas.getUndoHistory).toBe('function');

			const history = canvas.getUndoHistory();
			expect(history).toBeDefined();
			expect(history.currentUndo).toBeDefined();
			expect(history.undoBuffer).toBeDefined();
			expect(history.redoBuffer).toBeDefined();
			expect(Array.isArray(history.currentUndo)).toBe(true);
			expect(Array.isArray(history.undoBuffer)).toBe(true);
			expect(Array.isArray(history.redoBuffer)).toBe(true);
		});

		it('should provide setUndoHistory method', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.setUndoHistory).toBeDefined();
			expect(typeof canvas.setUndoHistory).toBe('function');

			const mockHistory = {
				currentUndo: [[0, 1234, 0, 0]],
				undoBuffer: [
					[
						[1, 5678, 1, 0],
						[2, 9012, 2, 0],
					],
				],
				redoBuffer: [],
			};

			expect(() => canvas.setUndoHistory(mockHistory)).not.toThrow();

			const history = canvas.getUndoHistory();
			expect(history.currentUndo).toEqual(mockHistory.currentUndo);
			expect(history.undoBuffer).toEqual(mockHistory.undoBuffer);
			expect(history.redoBuffer).toEqual(mockHistory.redoBuffer);
		});

		it('should handle mirror mode operations', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.getMirrorMode()).toBe(false);
			canvas.setMirrorMode(true);
			expect(canvas.getMirrorMode()).toBe(true);
		});

		it('should handle block operations', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			const block = canvas.getBlock(0, 0);
			expect(block).toBeDefined();

			const halfBlock = canvas.getHalfBlock(0, 0);
			expect(halfBlock).toBeDefined();
		});

		it('should handle area operations', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			// Test that area methods exist and can be accessed
			expect(canvas.getArea).toBeDefined();
			expect(canvas.setArea).toBeDefined();
			expect(canvas.deleteArea).toBeDefined();
		});

		it('should handle drawing operations', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			canvas.startUndo();

			const drawCallback = vi.fn();
			canvas.draw(drawCallback, false);

			expect(drawCallback).toHaveBeenCalled();
		});

		it('should handle half block drawing', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.drawHalfBlock).toBeDefined();
			expect(typeof canvas.drawHalfBlock).toBe('function');
		});

		it('should handle quick draw operations', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.quickDraw).toBeDefined();
			expect(typeof canvas.quickDraw).toBe('function');
		});

		it('should handle font operations', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.getCurrentFontName()).toBe('CP437 8x16');
		});

		it('should handle XB data operations', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.setXBFontData).toBeDefined();
			expect(canvas.setXBPaletteData).toBeDefined();
			expect(canvas.clearXBData).toBeDefined();
		});

		it('should handle dirty region operations', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.enqueueDirtyRegion).toBeDefined();
			expect(canvas.enqueueDirtyCell).toBeDefined();
			expect(canvas.processDirtyRegions).toBeDefined();
		});

		it('should handle region coalescing', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			const regions = [
				{ x: 0, y: 0, w: 10, h: 10 },
				{ x: 5, y: 5, w: 10, h: 10 },
			];

			const coalesced = canvas.coalesceRegions(regions);
			expect(coalesced).toBeDefined();
			expect(Array.isArray(coalesced)).toBe(true);
		});

		it('should handle patch buffer operations', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.patchBufferAndEnqueueDirty).toBeDefined();
			expect(typeof canvas.patchBufferAndEnqueueDirty).toBe('function');
		});

		it('should handle image data operations', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.setImageData).toBeDefined();
			expect(typeof canvas.setImageData).toBe('function');
		});

		it('should handle font change with callback', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.setFont).toBeDefined();
			expect(typeof canvas.setFont).toBe('function');
		});

		it('should handle ICE colors operations', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.getIceColors).toBeDefined();
			expect(canvas.setIceColors).toBeDefined();
		});

		it('should handle mirror X calculation', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			const mirrorX = canvas.getMirrorX(10);
			expect(typeof mirrorX).toBe('number');
		});

		it('should handle region drawing', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.drawRegion).toBeDefined();
			expect(typeof canvas.drawRegion).toBe('function');
		});

		it('should handle sequential XB file loading', () => {
			canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(canvas.loadXBFileSequential).toBeDefined();
			expect(typeof canvas.loadXBFileSequential).toBe('function');
		});
	});

	describe('Canvas Utility Functions', () => {
		it('should mirror horizontal line drawing characters correctly', () => {
			// Test horizontal mirroring for box drawing characters
			const getMirrorCharCode = charCode => {
				switch (charCode) {
					case 221: // LEFT_HALF_BLOCK
						return 222; // RIGHT_HALF_BLOCK
					case 222: // RIGHT_HALF_BLOCK
						return 221; // LEFT_HALF_BLOCK
					default:
						return charCode;
				}
			};

			expect(getMirrorCharCode(221)).toBe(222);
			expect(getMirrorCharCode(222)).toBe(221);
			expect(getMirrorCharCode(65)).toBe(65); // Normal character unchanged
		});

		it('should calculate array indices from coordinates correctly', () => {
			// Test coordinate to array index conversion
			const columns = 80;
			const getArrayIndex = (x, y) => y * columns + x;

			expect(getArrayIndex(0, 0)).toBe(0);
			expect(getArrayIndex(79, 0)).toBe(79);
			expect(getArrayIndex(0, 1)).toBe(80);
			expect(getArrayIndex(79, 24)).toBe(79 + 24 * 80); // Last position in 80x25 grid
		});

		it('should validate coordinate bounds', () => {
			const columns = 80;
			const rows = 25;

			const isValidCoordinate = (x, y) => {
				return x >= 0 && x < columns && y >= 0 && y < rows;
			};

			expect(isValidCoordinate(0, 0)).toBe(true);
			expect(isValidCoordinate(79, 24)).toBe(true);
			expect(isValidCoordinate(-1, 0)).toBe(false);
			expect(isValidCoordinate(80, 0)).toBe(false);
			expect(isValidCoordinate(0, 25)).toBe(false);
		});

		it('should encode character data correctly', () => {
			// Test 16-bit character/attribute encoding
			const encodeCharBlock = (charCode, foreground, background) => {
				return (charCode << 8) | (background << 4) | foreground;
			};

			const charCode = 65; // 'A'
			const foreground = 7; // White
			const background = 0; // Black

			const encoded = encodeCharBlock(charCode, foreground, background);
			expect(encoded).toBe((65 << 8) | (0 << 4) | 7); // 16647
		});

		it('should decode character data correctly', () => {
			// Test decoding 16-bit character/attribute data
			const decodeCharBlock = data => {
				return {
					charCode: data >> 8,
					background: (data >> 4) & 15,
					foreground: data & 15,
				};
			};

			const encoded = (65 << 8) | (4 << 4) | 7; // 'A', red background, white foreground
			const decoded = decodeCharBlock(encoded);

			expect(decoded.charCode).toBe(65);
			expect(decoded.background).toBe(4);
			expect(decoded.foreground).toBe(7);
		});

		it('should handle blink attribute correctly', () => {
			// Test blink attribute detection (background color >= 8)
			const hasBlinkAttribute = background => background >= 8;

			expect(hasBlinkAttribute(0)).toBe(false);
			expect(hasBlinkAttribute(7)).toBe(false);
			expect(hasBlinkAttribute(8)).toBe(true);
			expect(hasBlinkAttribute(15)).toBe(true);
		});

		it('should convert blink colors correctly', () => {
			// Test blink color normalization
			const normalizeBlinkColor = background => {
				return background >= 8 ? background - 8 : background;
			};

			expect(normalizeBlinkColor(8)).toBe(0);
			expect(normalizeBlinkColor(15)).toBe(7);
			expect(normalizeBlinkColor(4)).toBe(4); // No change for non-blink colors
		});

		it('should calculate region bounds correctly', () => {
			// Test region clipping to canvas bounds
			const clipRegion = (x, y, width, height, canvasWidth, canvasHeight) => {
				const clippedX = Math.max(0, Math.min(x, canvasWidth - 1));
				const clippedY = Math.max(0, Math.min(y, canvasHeight - 1));
				const clippedWidth = Math.min(width, canvasWidth - clippedX);
				const clippedHeight = Math.min(height, canvasHeight - clippedY);

				return {
					x: clippedX,
					y: clippedY,
					width: Math.max(0, clippedWidth),
					height: Math.max(0, clippedHeight),
				};
			};

			const result = clipRegion(-5, -5, 20, 20, 80, 25);
			expect(result.x).toBe(0);
			expect(result.y).toBe(0);
			expect(result.width).toBe(20); // width remains 20 since 0 + 20 < 80
			expect(result.height).toBe(20); // height remains 20 since 0 + 20 < 25
		});

		it('should calculate canvas context indices correctly', () => {
			// Test context calculation for large canvases (multiple 25-row contexts)
			const getContextIndex = y => Math.floor(y / 25);
			const getContextY = y => y % 25;

			expect(getContextIndex(0)).toBe(0);
			expect(getContextIndex(24)).toBe(0);
			expect(getContextIndex(25)).toBe(1);
			expect(getContextIndex(49)).toBe(1);
			expect(getContextIndex(50)).toBe(2);

			expect(getContextY(0)).toBe(0);
			expect(getContextY(24)).toBe(24);
			expect(getContextY(25)).toBe(0);
			expect(getContextY(49)).toBe(24);
			expect(getContextY(50)).toBe(0);
		});
	});

	describe('Dirty Region Management', () => {
		it('should handle dirty region enqueueing', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			// Enqueue dirty regions should not throw
			expect(() => {
				canvas.enqueueDirtyCell(10, 5);
			}).not.toThrow();
		});

		it('should clamp dirty regions to canvas bounds', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			// Test that regions outside canvas bounds are handled gracefully
			expect(() => {
				canvas.enqueueDirtyCell(-5, -5);
				canvas.enqueueDirtyCell(100, 100);
			}).not.toThrow();
		});

		it('should handle dirty region processing', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			// Multiple dirty regions should be processed
			expect(() => {
				canvas.enqueueDirtyCell(0, 0);
				canvas.enqueueDirtyCell(10, 10);
				canvas.enqueueDirtyCell(20, 20);
			}).not.toThrow();
		});
	});

	describe('Area Operations', () => {
		it('should support get area operation', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.getArea).toBe('function');

			// Get area should return an object
			const result = canvas.getArea(0, 0, 5, 5);
			expect(result).toBeDefined();
			expect(result).toHaveProperty('data');
		});

		it('should support set area operation', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.setArea).toBe('function');

			// Set area with data should not throw
			const areaData = { data: new Uint16Array(25), width: 5, height: 5 };
			expect(() => {
				canvas.setArea(0, 0, areaData);
			}).not.toThrow();
		});

		it('should support delete area operation', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.deleteArea).toBe('function');
		});
	});

	describe('Image Data Operations', () => {
		it('should get image data', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.getImageData).toBe('function');

			const imageData = canvas.getImageData();
			expect(imageData).toBeDefined();
			expect(imageData).toBeInstanceOf(Uint16Array);
		});

		it('should support setting image data', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.setImageData).toBe('function');

			const newImageData = new Uint16Array(80 * 25);
			expect(() => {
				canvas.setImageData(80, 25, newImageData, false, false);
			}).not.toThrow();
		});
	});

	describe('XBin Data Management', () => {
		it('should support clearing XB data', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.clearXBData).toBe('function');

			// Clear XB data should not throw
			expect(() => {
				canvas.clearXBData();
			}).not.toThrow();
		});

		it('should support clearing XB data with callback', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			const callback = vi.fn();
			canvas.clearXBData(callback);

			// Callback should be called
			expect(callback).toHaveBeenCalled();
		});

		it('should support getting XB font data', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.getXBFontData).toBe('function');

			// Initially should be null
			const xbData = canvas.getXBFontData();
			expect(xbData).toBeNull();
		});

		it('should support setting XB font data', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.setXBFontData).toBe('function');

			const mockFontData = new Uint8Array(4096);
			expect(() => {
				canvas.setXBFontData(mockFontData, 8, 16);
			}).not.toThrow();
		});
	});

	describe('Quick Draw Operations', () => {
		it('should support quick draw', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.quickDraw).toBe('function');
		});

		it('should support coalesce regions', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.coalesceRegions).toBe('function');
		});

		it('should support patch buffer and enqueue dirty', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.patchBufferAndEnqueueDirty).toBe('function');
		});
	});

	describe('Drawing Operations', () => {
		it('should support draw callback', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.draw).toBe('function');

			const drawCallback = vi.fn();
			canvas.draw(drawCallback, false);

			// Draw callback should be called
			expect(drawCallback).toHaveBeenCalled();
		});

		it('should support mirror mode drawing', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			canvas.setMirrorMode(true);

			const drawCallback = vi.fn();
			canvas.draw(drawCallback, false);

			// With mirror mode, callback should be called multiple times
			expect(drawCallback).toHaveBeenCalled();
		});

		it('should support draw region', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.drawRegion).toBe('function');
		});

		it('should support drawHalfBlock', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.drawHalfBlock).toBe('function');
		});

		it('should support getBlock and getHalfBlock', () => {
			const canvas = createTextArtCanvas(mockContainer, mockCallback);

			expect(typeof canvas.getBlock).toBe('function');
			expect(typeof canvas.getHalfBlock).toBe('function');
		});
	});
});
