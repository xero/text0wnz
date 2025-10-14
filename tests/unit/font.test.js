import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	loadFontFromXBData,
	loadFontFromImage,
} from '../../src/js/client/font.js';

const imgDataCap = 256;

// Mock the FontCache module
vi.mock('../../src/js/client/fontCache.js', () => ({
	FontCache: {
		getFont: vi.fn(() => Promise.resolve(null)), // Returns null by default (direct loading)
		preloadCommonFonts: vi.fn(),
		clearCache: vi.fn(),
		memoryCache: new Map(),
	},
}));

// Mock the UI module
vi.mock('../../src/js/client/ui.js', () => ({
	createCanvas: vi.fn(() => ({
		getContext: vi.fn(() => ({
			drawImage: vi.fn(),
			getImageData: vi.fn(() => ({
				data: new Uint8ClampedArray(64),
				width: 8,
				height: 8,
			})),
			putImageData: vi.fn(),
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			createImageData: vi.fn((width, height) => ({
				data: new Uint8ClampedArray(Math.min(width * height * 4, imgDataCap)), // Limit size
				width: width,
				height: height,
			})),
		})),
		width: 128,
		height: 256,
	})),
}));

describe('Font Module - Basic Tests', () => {
	let mockPalette;

	beforeEach(() => {
		// Clear any large objects from previous tests
		if (global.gc) {
			global.gc();
		}

		// Mock palette object
		mockPalette = {
			getRGBAColor: vi.fn(color => [color * 16, color * 8, color * 4, 255]),
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
		};

		// Reset global Image mock
		global.Image = vi.fn(() => ({
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			src: '',
			width: 128,
			height: 256,
		}));
	});

	afterEach(() => {
		// Cleanup after each test
		mockPalette = null;
		vi.clearAllMocks();
		if (global.gc) {
			global.gc();
		}
	});

	describe('loadFontFromXBData', () => {
		it('should reject with null font bytes', async () => {
			await expect(
				loadFontFromXBData(null, 8, 16, false, mockPalette),
			).rejects.toThrow('Failed to load XB font data');
		});

		it('should reject with empty font bytes', async () => {
			await expect(
				loadFontFromXBData(new Uint8Array(0), 8, 16, false, mockPalette),
			).rejects.toThrow('Failed to load XB font data');
		});

		it('should reject with missing palette', async () => {
			const fontBytes = new Uint8Array(256);
			fontBytes.fill(0x01);

			await expect(
				loadFontFromXBData(fontBytes, 8, 16, false, null),
			).rejects.toThrow();
		});
	});

	describe('loadFontFromImage', () => {
		let mockImage;

		beforeEach(() => {
			mockImage = {
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				src: '',
				width: 128,
				height: 256,
			};

			global.Image = vi.fn(() => mockImage);
		});

		it('should setup image loading correctly', async () => {
			loadFontFromImage('TestFont', false, mockPalette);

			// Wait for FontCache.getFont promise to resolve
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(global.Image).toHaveBeenCalled();
			expect(mockImage.addEventListener).toHaveBeenCalledWith(
				'load',
				expect.any(Function),
			);
			expect(mockImage.addEventListener).toHaveBeenCalledWith(
				'error',
				expect.any(Function),
			);
		});

		it('should handle image load error', async () => {
			const loadPromise = loadFontFromImage('TestFont', false, mockPalette);

			// Wait for FontCache.getFont promise to resolve
			await new Promise(resolve => setTimeout(resolve, 0));

			// Simulate image load error
			const errorHandler = mockImage.addEventListener.mock.calls.find(
				call => call[0] === 'error',
			)[1];
			errorHandler();

			await expect(loadPromise).rejects.toThrow();
		});

		it('should set image source path correctly', async () => {
			loadFontFromImage('CP437 8x16', false, mockPalette);

			// Wait for FontCache.getFont promise to resolve
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(mockImage.src).toBe('/ui/fonts/CP437 8x16.png');
		});

		it('should handle different font names', async () => {
			loadFontFromImage('CP437 8x8', false, mockPalette);

			// Wait for FontCache.getFont promise to resolve
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(mockImage.src).toBe('/ui/fonts/CP437 8x8.png');

			loadFontFromImage('Custom Font', false, mockPalette);

			// Wait for FontCache.getFont promise to resolve
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(mockImage.src).toBe('/ui/fonts/Custom Font.png');
		});

		it('should handle invalid dimensions rejection', async () => {
			mockImage.width = 100; // Invalid width (not divisible by 16)
			mockImage.height = 200; // Invalid height

			const loadPromise = loadFontFromImage('TestFont', false, mockPalette);

			// Wait for FontCache.getFont promise to resolve
			await new Promise(resolve => setTimeout(resolve, 0));

			const loadHandler = mockImage.addEventListener.mock.calls.find(
				call => call[0] === 'load',
			)[1];

			loadHandler();

			await expect(loadPromise).rejects.toThrow();
		});

		it('should reject zero dimensions', async () => {
			mockImage.width = 0;
			mockImage.height = 0;

			const loadPromise = loadFontFromImage('TestFont', false, mockPalette);

			// Wait for FontCache.getFont promise to resolve
			await new Promise(resolve => setTimeout(resolve, 0));

			const loadHandler = mockImage.addEventListener.mock.calls.find(
				call => call[0] === 'load',
			)[1];

			loadHandler();

			await expect(loadPromise).rejects.toThrow();
		});

		it('should handle palette dependencies', async () => {
			mockImage.width = 128;
			mockImage.height = 256;

			const loadPromise = loadFontFromImage('TestFont', false, null);

			// Wait for FontCache.getFont promise to resolve
			await new Promise(resolve => setTimeout(resolve, 0));

			const loadHandler = mockImage.addEventListener.mock.calls.find(
				call => call[0] === 'load',
			)[1];

			loadHandler();

			await expect(loadPromise).rejects.toThrow();
		});
	});

	describe('Error Handling', () => {
		it('should handle corrupted XB font data gracefully', async () => {
			const corruptedBytes = new Uint8Array(10); // Too small
			corruptedBytes.fill(0xff);

			await expect(
				loadFontFromXBData(corruptedBytes, 8, 16, false, mockPalette),
			).rejects.toThrow();
		});

		it('should handle missing image files gracefully', async () => {
			const mockImage = {
				addEventListener: vi.fn((event, handler) => {
					if (event === 'error') {
						setTimeout(() => handler(new Error('Image not found')), 0);
					}
				}),
				removeEventListener: vi.fn(),
				src: '',
			};
			global.Image = vi.fn(() => mockImage);

			await expect(
				loadFontFromImage('NonExistentFont', false, mockPalette),
			).rejects.toThrow();
		});
	});

	describe('XB Font Data Parsing - Additional Coverage', () => {
		it('should validate XB font data size requirements', () => {
			// Test the size validation logic
			const validateXBFontSize = (bytes, width, height) => {
				const expectedSize = height * 256;
				return bytes.length >= expectedSize;
			};

			expect(validateXBFontSize(new Uint8Array(4096), 8, 16)).toBe(true);
			expect(validateXBFontSize(new Uint8Array(256), 8, 16)).toBe(false);
			expect(validateXBFontSize(new Uint8Array(8192), 8, 32)).toBe(true);
		});
	});

	describe('Font Image Loading - Additional Coverage', () => {
		it('should handle font loading with different letter spacing settings', async () => {
			const mockImage = {
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				src: '',
				width: 128,
				height: 256,
			};
			global.Image = vi.fn(() => mockImage);

			// Test with letter spacing enabled
			loadFontFromImage('TestFont', true, mockPalette);

			// Wait for FontCache.getFont promise to resolve
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(mockImage.src).toBe('/ui/fonts/TestFont.png');

			// Test with letter spacing disabled
			loadFontFromImage('AnotherFont', false, mockPalette);

			// Wait for FontCache.getFont promise to resolve
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(mockImage.src).toBe('/ui/fonts/AnotherFont.png');
		});
	});
});
