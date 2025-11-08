import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLazyFont } from '../../src/js/client/lazyFont.js';

describe('Zoom Functionality', () => {
	describe('lazyFont with scaleFactor', () => {
		let mockPalette;
		let fontData;

		beforeEach(() => {
			mockPalette = {
				getRGBAColor: vi.fn(colorIndex => {
					// Return different colors for foreground/background
					const colors = new Uint8ClampedArray(4);
					colors[0] = colorIndex * 16; // R
					colors[1] = colorIndex * 16; // G
					colors[2] = colorIndex * 16; // B
					colors[3] = 255; // A
					return colors;
				}),
			};

			// Create minimal font data (8x16 font)
			fontData = {
				width: 8,
				height: 16,
				data: new Uint8Array(256 * 16), // 256 chars * 16 bytes each for 8x16
			};
		});

		afterEach(() => {
			vi.clearAllMocks();
		});

		it('should create a lazy font with default scaleFactor of 1', () => {
			const lazyFont = createLazyFont(fontData, mockPalette);

			expect(lazyFont.getScaleFactor()).toBe(1);
			expect(lazyFont.getWidth()).toBe(8);
			expect(lazyFont.getHeight()).toBe(16);
		});

		it('should create a lazy font with custom scaleFactor', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false, 2);

			expect(lazyFont.getScaleFactor()).toBe(2);
			expect(lazyFont.getWidth()).toBe(16); // 8 * 2
			expect(lazyFont.getHeight()).toBe(32); // 16 * 2
		});

		it('should scale dimensions correctly for various scale factors', () => {
			const testCases = [
				{ scale: 0.5, expectedW: 4, expectedH: 8 },
				{ scale: 1, expectedW: 8, expectedH: 16 },
				{ scale: 1.5, expectedW: 12, expectedH: 24 },
				{ scale: 2, expectedW: 16, expectedH: 32 },
				{ scale: 3, expectedW: 24, expectedH: 48 },
				{ scale: 4, expectedW: 32, expectedH: 64 },
			];

			testCases.forEach(({ scale, expectedW, expectedH }) => {
				const lazyFont = createLazyFont(fontData, mockPalette, false, scale);
				expect(lazyFont.getWidth()).toBe(expectedW);
				expect(lazyFont.getHeight()).toBe(expectedH);
			});
		});

		it('should scale dimensions with letter spacing', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, true, 2);

			// With letter spacing: (width * scale) + (1 * scale)
			expect(lazyFont.getWidth()).toBe(18); // (8 * 2) + (1 * 2)
			expect(lazyFont.getHeight()).toBe(32); // 16 * 2
		});

		it('should return scaled glyph data', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false, 2);
			const glyph = lazyFont.getGlyph(65, 15, 0); // 'A' character

			expect(glyph).toBeDefined();
			expect(glyph.width).toBe(16); // 8 * 2
			expect(glyph.height).toBe(32); // 16 * 2
		});

		it('should cache glyphs with scaleFactor in key', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, false, 2);

			// First call generates glyph
			const glyph1 = lazyFont.getGlyph(65, 15, 0);
			// Second call should use cache
			const glyph2 = lazyFont.getGlyph(65, 15, 0);

			expect(glyph1).toBe(glyph2); // Same object reference (cached)
		});
	});

	describe('zoomControl UI component', () => {
		let container;

		beforeEach(() => {
			// Mock State module
			vi.doMock('../../src/js/client/state.js', () => ({
				default: {
					font: {
						getScaleFactor: vi.fn(() => 1),
						setScaleFactor: vi.fn(),
					},
					waitFor: vi.fn((key, callback) => callback()),
				},
			}));
		});

		afterEach(() => {
			vi.clearAllMocks();
			vi.doUnmock('../../src/js/client/state.js');
		});

		it('should create zoom control container', async () => {
			const { createZoomControl } = await import(
				'../../src/js/client/zoomControl.js'
			);
			container = createZoomControl();

			expect(container).toBeDefined();
			expect(container.className).toBe('zoomControl');
		});

		it('should have label, slider, and display elements', async () => {
			const { createZoomControl } = await import(
				'../../src/js/client/zoomControl.js'
			);
			container = createZoomControl();

			const label = container.querySelector('label');
			const slider = container.querySelector('input[type="range"]');
			const display = container.querySelector('.zoomDisplay');

			expect(label).toBeDefined();
			expect(label.textContent).toBe('Zoom:');
			expect(slider).toBeDefined();
			expect(display).toBeDefined();
		});

		it('should configure slider with correct attributes', async () => {
			const { createZoomControl } = await import(
				'../../src/js/client/zoomControl.js'
			);
			container = createZoomControl();

			const slider = container.querySelector('input[type="range"]');

			expect(slider.min).toBe('0.5');
			expect(slider.max).toBe('4');
			expect(slider.step).toBe('0.5');
			expect(slider.value).toBe('1');
		});

		it('should initialize display from current font scale', async () => {
			const { createZoomControl } = await import(
				'../../src/js/client/zoomControl.js'
			);
			container = createZoomControl();

			const display = container.querySelector('.zoomDisplay');
			expect(display.textContent).toBe('1.0x');
		});

		it('should update display when slider input changes', async () => {
			const { createZoomControl } = await import(
				'../../src/js/client/zoomControl.js'
			);
			container = createZoomControl();

			const slider = container.querySelector('input[type="range"]');
			const display = container.querySelector('.zoomDisplay');

			slider.value = '2';
			slider.dispatchEvent(new Event('input'));

			expect(display.textContent).toBe('2.0x');
		});
	});

	describe('Font loading with scaleFactor', () => {
		it('should pass scaleFactor to font loader functions', async () => {
			// This is more of an integration test
			// The actual font loading is tested in font.test.js
			// Here we just verify the structure exists
			const { loadFontFromImage, loadFontFromXBData } = await import(
				'../../src/js/client/font.js'
			);

			expect(loadFontFromImage).toBeDefined();
			expect(loadFontFromXBData).toBeDefined();
		});
	});
});
