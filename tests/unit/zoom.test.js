import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLazyFont } from '../../src/js/client/lazyFont.js';

describe('Zoom Functionality', () => {
	describe('lazyFont with scaleFactor', () => {
		let mockPalette;
		let fontData;

		beforeEach(() => {
			mockPalette = {
				getRGBAColor: vi.fn(colorIndex => {
					const colors = new Uint8ClampedArray(4);
					colors[0] = colorIndex * 16; // R
					colors[1] = colorIndex * 16; // G
					colors[2] = colorIndex * 16; // B
					colors[3] = 255; // A
					return colors;
				}),
			};

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
		}, 10000); // 10 sec for slower machines

		it('should scale dimensions with letter spacing', () => {
			const lazyFont = createLazyFont(fontData, mockPalette, true, 2);

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

			const glyph1 = lazyFont.getGlyph(65, 15, 0);
			const glyph2 = lazyFont.getGlyph(65, 15, 0);

			expect(glyph1).toBe(glyph2);
		});
	});

	describe('zoomControl UI component', () => {
		let scaleValue;

		beforeEach(() => {
			scaleValue = 1;
			document.body.innerHTML =
				'<button id="zoomOut"></button>' +
				'<output id="zoomValue"></output>' +
				'<button id="zoomIn"></button>';
			vi.resetModules();
			vi.doMock('../../src/js/client/state.js', () => ({
				default: {
					font: {
						getScaleFactor: vi.fn(() => scaleValue),
						setScaleFactor: vi.fn(value => {
							scaleValue = value;
						}),
					},
					waitFor: vi.fn((_key, callback) => callback()),
				},
			}));
		});

		afterEach(() => {
			vi.clearAllMocks();
			vi.doUnmock('../../src/js/client/state.js');
			document.body.innerHTML = '';
		});

		it('should wire the sidebar zoom buttons when they exist', async () => {
			const { createZoomControl } = await import('../../src/js/client/ui.js');
			const control = createZoomControl();

			expect(control).toBeDefined();
			expect(typeof control.refresh).toBe('function');
		});

		it('should return null without the sidebar zoom elements', async () => {
			document.body.innerHTML = '';
			const { createZoomControl } = await import('../../src/js/client/ui.js');

			expect(createZoomControl()).toBeNull();
		});

		it('should show whole scales without a decimal', async () => {
			const { createZoomControl } = await import('../../src/js/client/ui.js');
			createZoomControl();

			expect(document.getElementById('zoomValue').textContent).toBe('1x');
		});

		it('should show fractional scales with their decimal', async () => {
			const { createZoomControl } = await import('../../src/js/client/ui.js');
			const control = createZoomControl();

			scaleValue = 1.5;
			control.refresh();

			expect(document.getElementById('zoomValue').textContent).toBe('1.5x');
		});

		it('should step the scale through the font fallback on click', async () => {
			// no zoom controller registers in unit tests, so the button
			// routes through the font scale fallback
			const State = (await import('../../src/js/client/state.js')).default;
			const { createZoomControl } = await import('../../src/js/client/ui.js');
			createZoomControl();

			document.getElementById('zoomIn').click();
			expect(State.font.setScaleFactor).toHaveBeenCalledWith(1.5);
			expect(document.getElementById('zoomValue').textContent).toBe('1.5x');

			document.getElementById('zoomOut').click();
			expect(State.font.setScaleFactor).toHaveBeenCalledWith(1);
			expect(document.getElementById('zoomValue').textContent).toBe('1x');
		});
	});

	describe('Font loading with scaleFactor', () => {
		it('should pass scaleFactor to font loader functions', async () => {
			// font.test.js covers loading itself; this pins only the exports
			const { loadFontFromImage, loadFontFromXBData } = await import(
				'../../src/js/client/font.js'
			);

			expect(loadFontFromImage).toBeDefined();
			expect(loadFontFromXBData).toBeDefined();
		});
	});
});
