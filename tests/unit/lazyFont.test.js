import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLazyFont } from '../../src/js/client/lazyFont.js';

// Common-glyph pre-generation is deferred to idle time and drained in
// slices, one per tick in the setTimeout fallback; interleave enough ticks
// with the same mechanism so assertions see the fully populated cache
// (85 slices: 5 chars x 16 backgrounds + 5 alpha chars)
const flushIdle = async () => {
	const idle = globalThis.requestIdleCallback || (fn => setTimeout(fn, 0));
	for (let i = 0; i < 100; i++) {
		await new Promise(resolve => idle(() => resolve()));
	}
};

// Mock the UI module
vi.mock('../../src/js/client/ui.js', () => ({
	createCanvas: vi.fn(() => ({
		getContext: vi.fn(() => ({
			createImageData: vi.fn((width, height) => ({
				data: new Uint8ClampedArray(width * height * 4),
				width: width,
				height: height,
			})),
			putImageData: vi.fn(),
			getImageData: vi.fn((x, y, width, height) => ({
				data: new Uint8ClampedArray(width * height * 4),
				width: width,
				height: height,
			})),
			drawImage: vi.fn(),
		})),
		width: 8,
		height: 16,
	})),
}));

describe('Lazy Font Module', () => {
	let mockPalette;
	let fontData;
	let lazyFontInstance;

	beforeEach(() => {
		// Mock palette object
		mockPalette = { getRGBAColor: vi.fn(color => [color * 16, color * 8, color * 4, 255]) };

		// Create minimal font data (8x16 font)
		const width = 8;
		const height = 16;
		const dataSize = (width * height * 256) / 8;
		const data = new Uint8Array(dataSize);

		// Set some test patterns
		for (let i = 0; i < dataSize; i++) {
			data[i] = i % 256;
		}

		fontData = {
			width: width,
			height: height,
			data: data,
		};

		lazyFontInstance = null;
	});

	afterEach(() => {
		// Clean up lazy font cache explicitly to free memory
		if (lazyFontInstance && typeof lazyFontInstance.clearCache === 'function') {
			lazyFontInstance.clearCache();
		}
		lazyFontInstance = null;

		// Clean up large objects
		if (fontData && fontData.data) {
			fontData.data = null;
		}
		fontData = null;
		mockPalette = null;

		// Clear all mocks to release closures
		vi.clearAllMocks();
		// Restore all mocks
		vi.restoreAllMocks();
	});

	describe('createLazyFont', () => {
		it('should create a lazy font instance', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);

			expect(lazyFontInstance).toBeDefined();
			expect(lazyFontInstance.getData).toBeDefined();
			expect(lazyFontInstance.getWidth).toBeDefined();
			expect(lazyFontInstance.getHeight).toBeDefined();
			expect(lazyFontInstance.draw).toBeDefined();
			expect(lazyFontInstance.drawWithAlpha).toBeDefined();
		});

		it('should return correct font dimensions', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);

			expect(lazyFontInstance.getWidth()).toBe(8);
			expect(lazyFontInstance.getHeight()).toBe(16);
		});

		it('should return font data', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);

			expect(lazyFontInstance.getData()).toEqual(fontData);
		});

		it('should pre-generate common glyphs', async () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);
			await flushIdle();

			// Common glyphs are cached once the thread idles
			const cacheSize = lazyFontInstance.getCacheSize();
			expect(cacheSize).toBeGreaterThan(0);

			// Space (32) and block characters (176, 177, 178, 219) * 16 * 16 = 1280 glyphs
			expect(cacheSize).toBe(5 * 16 * 16);
		});

		it('should generate glyphs on demand', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);

			const initialCacheSize = lazyFontInstance.getCacheSize();

			// Request a glyph that wasn't pre-generated (e.g., 'A' = 65)
			const glyph = lazyFontInstance.getGlyph(65, 7, 0);

			expect(glyph).toBeDefined();
			expect(glyph.data).toBeInstanceOf(Uint8ClampedArray);

			// Cache should have grown
			expect(lazyFontInstance.getCacheSize()).toBe(initialCacheSize + 1);
		});

		it('should cache and reuse glyphs', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);

			const initialCacheSize = lazyFontInstance.getCacheSize();

			// Request the same glyph twice
			const glyph1 = lazyFontInstance.getGlyph(100, 5, 3);
			const glyph2 = lazyFontInstance.getGlyph(100, 5, 3);

			// Should return the same cached instance
			expect(glyph1).toBe(glyph2);

			// Cache should have grown by 1 (not 2)
			expect(lazyFontInstance.getCacheSize()).toBe(initialCacheSize + 1);
		});

		it('should handle different foreground/background combinations', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);

			const initialCacheSize = lazyFontInstance.getCacheSize();

			// Request same character with different colors
			const glyph1 = lazyFontInstance.getGlyph(50, 7, 0);
			const glyph2 = lazyFontInstance.getGlyph(50, 15, 1);
			const glyph3 = lazyFontInstance.getGlyph(50, 7, 0); // Duplicate

			// Should cache separately for different color combinations
			expect(glyph1).not.toBe(glyph2);
			expect(glyph1).toBe(glyph3); // But reuse for same combination

			expect(lazyFontInstance.getCacheSize()).toBe(initialCacheSize + 2);
		});

		it('should generate alpha glyphs for specific characters', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);

			// Lower half-block character (223)
			const alphaGlyph = lazyFontInstance.getAlphaGlyph(223, 7);

			expect(alphaGlyph).toBeDefined();
		});

		it('should cache alpha glyphs separately', async () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);
			await flushIdle();

			// Upper half-block character (220)
			const alphaGlyph1 = lazyFontInstance.getAlphaGlyph(220, 5);
			const alphaGlyph2 = lazyFontInstance.getAlphaGlyph(220, 5);

			expect(alphaGlyph1).toBe(alphaGlyph2);

			// Alpha cache should have pre-generated glyphs (80 = 5 chars * 16 foreground colors)
			expect(lazyFontInstance.getAlphaCacheSize()).toBe(80);
		});

		it('should bound the glyph cache size', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);

			// Request far more combinations than the cache cap
			for (let charCode = 0; charCode < 256; charCode++) {
				for (let fg = 0; fg < 16; fg++) {
					lazyFontInstance.getGlyph(charCode, fg, 0);
					lazyFontInstance.getGlyph(charCode, fg, 1);
				}
			}

			expect(lazyFontInstance.getCacheSize()).toBeLessThanOrEqual(4096);
		});
	});

	describe('9px Letter Spacing Glyphs', () => {
		const pixelAt = (glyph, x, y) =>
			Array.from(glyph.data.slice((y * glyph.width + x) * 4, (y * glyph.width + x) * 4 + 4));

		it('should emit nine-pixel-wide glyphs when letter spacing is on', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, true);

			const glyph = lazyFontInstance.getGlyph(65, 7, 1);

			expect(glyph.width).toBe(9);
			expect(glyph.height).toBe(16);
		});

		it('should keep eight-pixel glyphs when letter spacing is off', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);

			const glyph = lazyFontInstance.getGlyph(0xc0, 7, 1);

			expect(glyph.width).toBe(8);
		});

		it('should fill column nine with the background color', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, true);

			const background = 1;
			const backgroundColor = mockPalette.getRGBAColor(background);
			const glyph = lazyFontInstance.getGlyph(65, 7, background);

			for (let y = 0; y < 16; y++) {
				expect(pixelAt(glyph, 8, y)).toEqual(backgroundColor);
			}
		});

		it('should duplicate column eight into column nine for chars 0xC0-0xDF', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, true);

			[0xc0, 0xcd, 0xdf].forEach(charCode => {
				const glyph = lazyFontInstance.getGlyph(charCode, 7, 1);
				for (let y = 0; y < 16; y++) {
					expect(pixelAt(glyph, 8, y)).toEqual(pixelAt(glyph, 7, y));
				}
			});
		});

		it('should draw nine-pixel glyphs at the nine-pixel pitch', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, true);

			const mockCtx = { putImageData: vi.fn() };
			lazyFontInstance.draw(0xc0, 7, 1, mockCtx, 3, 2);

			expect(mockCtx.putImageData).toHaveBeenCalledWith(
				expect.objectContaining({ width: 9 }),
				3 * 9,
				2 * 16,
			);
		});
	});

	describe('Glyph Drawing', () => {
		it('should draw glyph without letter spacing', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);

			const mockCtx = { putImageData: vi.fn() };

			lazyFontInstance.draw(65, 7, 0, mockCtx, 5, 10);

			expect(mockCtx.putImageData).toHaveBeenCalledWith(
				expect.anything(),
				5 * 8, // x * width
				10 * 16, // y * height
			);
		});

		it('should draw glyph with letter spacing', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, true);

			const mockCtx = { putImageData: vi.fn() };

			lazyFontInstance.draw(65, 7, 0, mockCtx, 5, 10);

			expect(mockCtx.putImageData).toHaveBeenCalledWith(
				expect.anything(),
				5 * (8 + 1), // x * (width + 1)
				10 * 16, // y * height
			);
		});

		it('should draw alpha glyph without letter spacing', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);

			const mockCtx = { drawImage: vi.fn() };

			lazyFontInstance.drawWithAlpha(223, 7, mockCtx, 3, 5);

			expect(mockCtx.drawImage).toHaveBeenCalledWith(
				expect.anything(),
				3 * 8, // x * width
				5 * 16, // y * height
			);
		});

		it('should draw alpha glyph with letter spacing', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, true);

			const mockCtx = { drawImage: vi.fn() };

			lazyFontInstance.drawWithAlpha(220, 7, mockCtx, 3, 5);

			expect(mockCtx.drawImage).toHaveBeenCalled();
		});
	});

	describe('Memory Efficiency', () => {
		it('should not pre-generate all glyphs', async () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);
			await flushIdle();

			// Total possible glyphs: 256 chars × 16 fg × 16 bg = 65,536
			// But we only pre-generate common ones: 5 chars × 16 × 16 = 1,280
			expect(lazyFontInstance.getCacheSize()).toBeLessThan(2000);
			expect(lazyFontInstance.getCacheSize()).toBe(1280);
		});

		it('should generate glyphs lazily as needed', () => {
			lazyFontInstance = createLazyFont(fontData, mockPalette, false);

			const initialSize = lazyFontInstance.getCacheSize();

			// Request 10 different glyphs
			for (let i = 0; i < 10; i++) {
				lazyFontInstance.getGlyph(100 + i, 7, 0);
			}

			expect(lazyFontInstance.getCacheSize()).toBe(initialSize + 10);
		});
	});
});
