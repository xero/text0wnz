import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLazyFont } from '../../src/js/client/lazyFont.js';

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
	});

	afterEach(() => {
		// Clean up large objects
		mockPalette = null;
		fontData = null;
		// Restore all mocks
		vi.restoreAllMocks();
	});

	describe('createLazyFont', () => {
		it('should create a lazy font instance', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false);

			expect(lazyFont).toBeDefined();
			expect(lazyFont.getData).toBeDefined();
			expect(lazyFont.getWidth).toBeDefined();
			expect(lazyFont.getHeight).toBeDefined();
			expect(lazyFont.draw).toBeDefined();
			expect(lazyFont.drawWithAlpha).toBeDefined();
		});

		it('should return correct font dimensions', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false);

			expect(lazyFont.getWidth()).toBe(8);
			expect(lazyFont.getHeight()).toBe(16);
		});

		it('should return font data', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false);

			expect(lazyFont.getData()).toEqual(fontData);
		});

		it('should pre-generate common glyphs', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false);

			// Common glyphs should be cached immediately
			const cacheSize = lazyFont.getCacheSize();
			expect(cacheSize).toBeGreaterThan(0);

			// Space (32) and block characters (176, 177, 178, 219) * 16 * 16 = 1280 glyphs
			expect(cacheSize).toBe(5 * 16 * 16);
		});

		it('should generate glyphs on demand', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false);

			const initialCacheSize = lazyFont.getCacheSize();

			// Request a glyph that wasn't pre-generated (e.g., 'A' = 65)
			const glyph = lazyFont.getGlyph(65, 7, 0);

			expect(glyph).toBeDefined();
			expect(glyph.data).toBeInstanceOf(Uint8ClampedArray);

			// Cache should have grown
			expect(lazyFont.getCacheSize()).toBe(initialCacheSize + 1);
		});

		it('should cache and reuse glyphs', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false);

			const initialCacheSize = lazyFont.getCacheSize();

			// Request the same glyph twice
			const glyph1 = lazyFont.getGlyph(100, 5, 3);
			const glyph2 = lazyFont.getGlyph(100, 5, 3);

			// Should return the same cached instance
			expect(glyph1).toBe(glyph2);

			// Cache should have grown by 1 (not 2)
			expect(lazyFont.getCacheSize()).toBe(initialCacheSize + 1);
		});

		it('should handle different foreground/background combinations', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false);

			const initialCacheSize = lazyFont.getCacheSize();

			// Request same character with different colors
			const glyph1 = lazyFont.getGlyph(50, 7, 0);
			const glyph2 = lazyFont.getGlyph(50, 15, 1);
			const glyph3 = lazyFont.getGlyph(50, 7, 0); // Duplicate

			// Should cache separately for different color combinations
			expect(glyph1).not.toBe(glyph2);
			expect(glyph1).toBe(glyph3); // But reuse for same combination

			expect(lazyFont.getCacheSize()).toBe(initialCacheSize + 2);
		});

		it('should generate alpha glyphs for specific characters', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false);

			// Lower half-block character (223)
			const alphaGlyph = lazyFont.getAlphaGlyph(223, 7);

			expect(alphaGlyph).toBeDefined();
		});

		it('should cache alpha glyphs separately', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false);

			// Upper half-block character (220)
			const alphaGlyph1 = lazyFont.getAlphaGlyph(220, 5);
			const alphaGlyph2 = lazyFont.getAlphaGlyph(220, 5);

			expect(alphaGlyph1).toBe(alphaGlyph2);

			// Alpha cache should have pre-generated glyphs (80 = 5 chars * 16 foreground colors)
			expect(lazyFont.getAlphaCacheSize()).toBe(80);
		});

		it('should handle letter spacing', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, true);

			// Should have letter spacing data cached
			const spacingData = lazyFont.getLetterSpacingData(7);

			expect(spacingData).toBeDefined();
			expect(spacingData.data).toBeInstanceOf(Uint8ClampedArray);
		});
	});

	describe('Glyph Drawing', () => {
		it('should draw glyph without letter spacing', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false);

			const mockCtx = { putImageData: vi.fn() };

			lazyFont.draw(65, 7, 0, mockCtx, 5, 10);

			expect(mockCtx.putImageData).toHaveBeenCalledWith(
				expect.anything(),
				5 * 8, // x * width
				10 * 16, // y * height
			);
		});

		it('should draw glyph with letter spacing', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, true);

			const mockCtx = { putImageData: vi.fn() };

			lazyFont.draw(65, 7, 0, mockCtx, 5, 10);

			expect(mockCtx.putImageData).toHaveBeenCalledWith(
				expect.anything(),
				5 * (8 + 1), // x * (width + 1)
				10 * 16, // y * height
			);
		});

		it('should draw alpha glyph without letter spacing', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false);

			const mockCtx = { drawImage: vi.fn() };

			lazyFont.drawWithAlpha(223, 7, mockCtx, 3, 5);

			expect(mockCtx.drawImage).toHaveBeenCalledWith(
				expect.anything(),
				3 * 8, // x * width
				5 * 16, // y * height
			);
		});

		it('should draw alpha glyph with letter spacing', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, true);

			const mockCtx = { drawImage: vi.fn() };

			lazyFont.drawWithAlpha(220, 7, mockCtx, 3, 5);

			expect(mockCtx.drawImage).toHaveBeenCalled();
		});
	});

	describe('Memory Efficiency', () => {
		it('should not pre-generate all glyphs', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false);

			// Total possible glyphs: 256 chars × 16 fg × 16 bg = 65,536
			// But we only pre-generate common ones: 5 chars × 16 × 16 = 1,280
			expect(lazyFont.getCacheSize()).toBeLessThan(2000);
			expect(lazyFont.getCacheSize()).toBe(1280);
		});

		it('should generate glyphs lazily as needed', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false);

			const initialSize = lazyFont.getCacheSize();

			// Request 10 different glyphs
			for (let i = 0; i < 10; i++) {
				lazyFont.getGlyph(100 + i, 7, 0);
			}

			expect(lazyFont.getCacheSize()).toBe(initialSize + 10);
		});
	});
});
