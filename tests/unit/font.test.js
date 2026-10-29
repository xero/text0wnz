/* eslint-disable prefer-arrow-callback */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	loadFontFromXBData,
	loadFontFromImage,
	clearGlyphZero,
} from '../../src/js/client/font.js';

const imgDataCap = 256;

vi.mock('../../src/js/client/fontCache.js', () => ({
	FontCache: {
		// a miss: the image loads directly
		getFont: vi.fn(() => Promise.resolve(null)),
		preloadCommonFonts: vi.fn(),
		clearCache: vi.fn(),
		memoryCache: new Map(),
	},
}));

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
				data: new Uint8ClampedArray(Math.min(width * height * 4, imgDataCap)),
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
		if (global.gc) {
			global.gc();
		}

		mockPalette = {
			getRGBAColor: vi.fn(color => [color * 16, color * 8, color * 4, 255]),
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
		};

		global.Image = vi.fn(function () {
			return {
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				src: '',
				width: 128,
				height: 256,
			};
		});
	});

	afterEach(() => {
		mockPalette = null;
		vi.clearAllMocks();
		if (global.gc) {
			global.gc();
		}
	});

	describe('clearGlyphZero', () => {
		it('blanks only glyph 0, so an inked atlas slot cannot leak', () => {
			// Topaz-437 ships glyph 0 inked; deletes write char 0 and must
			// render empty like every other font
			const bytesPerGlyph = (8 * 16) / 8;
			const data = new Uint8Array(bytesPerGlyph * 256).fill(0xff);
			const cleared = clearGlyphZero({ width: 8, height: 16, data });
			expect(
				[...cleared.data.slice(0, bytesPerGlyph)].every(b => b === 0),
			).toBe(true);
			expect(cleared.data[bytesPerGlyph]).toBe(0xff);
			expect(cleared.data[cleared.data.length - 1]).toBe(0xff);
		});
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

		it('rejects font bytes shorter than 256 glyphs of the cell height', async () => {
			await expect(
				loadFontFromXBData(new Uint8Array(4 * 256 - 1), 8, 4, false, mockPalette),
			).rejects.toThrow('Failed to load XB font data');
		});

		it('loads 8x4 font bytes into a 1024 byte glyph table', async () => {
			const bytes = new Uint8Array(4 * 256).fill(0x81);
			const handle = await loadFontFromXBData(bytes, 8, 4, false, mockPalette);
			expect(handle.getWidth()).toBe(8);
			expect(handle.getHeight()).toBe(4);
			expect(handle.getData().data).toEqual(bytes);
		});

		it('setLetterSpacing adds the ninth column and announces only real changes', async () => {
			const handle = await loadFontFromXBData(
				new Uint8Array(4 * 256),
				8,
				4,
				false,
				mockPalette,
			);
			const seen = vi.fn();
			document.addEventListener('onLetterSpacingChange', seen);
			handle.setLetterSpacing(true);
			handle.setLetterSpacing(true);
			expect(handle.getWidth()).toBe(9);
			expect(handle.getLetterSpacing()).toBe(true);
			expect(seen).toHaveBeenCalledTimes(1);
			handle.setLetterSpacing(false);
			document.removeEventListener('onLetterSpacingChange', seen);
			expect(handle.getWidth()).toBe(8);
			expect(seen).toHaveBeenCalledTimes(2);
			expect(seen.mock.calls.map(([e]) => e.detail)).toEqual([true, false]);
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

			global.Image = vi.fn(function () {
				return mockImage;
			});
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

	describe('handle palette rebinding', () => {
		const makeCtx = () => ({ drawImage: vi.fn(), putImageData: vi.fn() });

		const makeRebindPalette = shade => ({
			getRGBAColor: vi.fn(() => [shade, shade, shade, 255]),
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
		});

		it('setPalette rebuilds glyphs from the new palette', async () => {
			const palA = makeRebindPalette(10);
			const palB = makeRebindPalette(200);
			const handle = await loadFontFromXBData(
				new Uint8Array(1024),
				8,
				4,
				false,
				palA,
			);
			handle.draw(65, 7, 0, makeCtx(), 0, 0);
			expect(palA.getRGBAColor).toHaveBeenCalled();
			handle.setPalette(palB);
			palA.getRGBAColor.mockClear();
			palB.getRGBAColor.mockClear();
			handle.draw(65, 7, 0, makeCtx(), 0, 0);
			expect(palB.getRGBAColor).toHaveBeenCalled();
			expect(palA.getRGBAColor).not.toHaveBeenCalled();
		});

		it('setPalette with the same ref keeps the glyph cache', async () => {
			const pal = makeRebindPalette(10);
			const handle = await loadFontFromXBData(
				new Uint8Array(1024),
				8,
				4,
				false,
				pal,
			);
			handle.draw(65, 7, 0, makeCtx(), 0, 0);
			pal.getRGBAColor.mockClear();
			handle.draw(65, 7, 0, makeCtx(), 0, 0);
			// the second draw hits the lazy cache
			expect(pal.getRGBAColor).not.toHaveBeenCalled();
			handle.setPalette(pal);
			handle.draw(65, 7, 0, makeCtx(), 0, 0);
			// a same-ref rebind must not flush the cache
			expect(pal.getRGBAColor).not.toHaveBeenCalled();
		});

		it('redraw keeps reading the bound palette', async () => {
			const palA = makeRebindPalette(10);
			const palB = makeRebindPalette(200);
			const handle = await loadFontFromXBData(
				new Uint8Array(1024),
				8,
				4,
				false,
				palA,
			);
			handle.setPalette(palB);
			handle.redraw();
			palB.getRGBAColor.mockClear();
			handle.draw(65, 7, 0, makeCtx(), 0, 0);
			// setRGBAColor-style cache flushes compose with the rebind
			expect(palB.getRGBAColor).toHaveBeenCalled();
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
			global.Image = vi.fn(function () {
				return mockImage;
			});

			await expect(
				loadFontFromImage('NonExistentFont', false, mockPalette),
			).rejects.toThrow();
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
			global.Image = vi.fn(function () {
				return mockImage;
			});

			loadFontFromImage('TestFont', true, mockPalette);

			// Wait for FontCache.getFont promise to resolve
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(mockImage.src).toBe('/ui/fonts/TestFont.png');

			loadFontFromImage('AnotherFont', false, mockPalette);

			// Wait for FontCache.getFont promise to resolve
			await new Promise(resolve => setTimeout(resolve, 0));

			expect(mockImage.src).toBe('/ui/fonts/AnotherFont.png');
		});
	});
});
