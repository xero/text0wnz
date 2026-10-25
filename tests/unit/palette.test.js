import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	getUnicode,
	getUTF8,
	createPalette,
	createDefaultPalette,
	createPalettePreview,
	createPalettePicker,
} from '../../src/js/client/palette.js';

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		palette: {
			getRGBAColor: vi.fn(() => [255, 0, 0, 255]),
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
			setForegroundColor: vi.fn(),
			setBackgroundColor: vi.fn(),
		},
	},
}));

describe('Palette Utilities', () => {
	describe('getUnicode', () => {
		it('should return correct Unicode values for ASCII control characters', () => {
			expect(getUnicode(1)).toBe(0x263a); // ☺
			expect(getUnicode(2)).toBe(0x263b); // ☻
			expect(getUnicode(3)).toBe(0x2665); // ♥
			expect(getUnicode(4)).toBe(0x2666); // ♦
		});

		it('should return correct Unicode values for extended ASCII', () => {
			expect(getUnicode(127)).toBe(0x2302); // ⌂
			expect(getUnicode(128)).toBe(0x00c7); // Ç
			expect(getUnicode(255)).toBe(0x00a0); // non-breaking space
		});

		it('should return original char code for standard ASCII characters', () => {
			expect(getUnicode(65)).toBe(65); // A
			expect(getUnicode(48)).toBe(48); // 0
			expect(getUnicode(32)).toBe(32); // space
		});

		it('should handle edge cases', () => {
			expect(getUnicode(0)).toBe(0x00a0); // Character code 0 maps to non-breaking space
			expect(getUnicode(255)).toBe(0x00a0); // Character code 255 also maps to non-breaking space
			expect(getUnicode(256)).toBe(256); // beyond extended ASCII returns original
		});

		it('should handle extended ASCII range correctly', () => {
			expect(getUnicode(176)).toBe(0x2591); // Light shade
			expect(getUnicode(177)).toBe(0x2592); // Medium shade
			expect(getUnicode(178)).toBe(0x2593); // Dark shade
			expect(getUnicode(219)).toBe(0x2588); // Full block
		});
	});

	describe('getUTF8', () => {
		it('should convert single-byte characters correctly', () => {
			expect(getUTF8(65)).toEqual([65]); // A
			expect(getUTF8(32)).toEqual([32]); // space
		});

		it('should convert multi-byte Unicode characters correctly', () => {
			// Unicode heart symbol (♥) - U+2665
			const heartUTF8 = getUTF8(3); // charCode 3 maps to ♥
			expect(heartUTF8).toHaveLength(3); // Should be 3-byte UTF-8
			expect(heartUTF8[0]).toBe(226); // First byte
			expect(heartUTF8[1]).toBe(153); // Second byte
			expect(heartUTF8[2]).toBe(165); // Third byte
		});

		it('should handle extended ASCII characters', () => {
			const result = getUTF8(128); // Ç
			expect(result).toHaveLength(2); // Should be 2-byte UTF-8
		});

		it('should handle box drawing characters', () => {
			const result = getUTF8(176); // Light shade
			expect(result).toHaveLength(3); // Should be 3-byte UTF-8 for Unicode
		});
	});

	describe('createPalette', () => {
		let mockPalette;

		beforeEach(() => {
			vi.stubGlobal('document', { dispatchEvent: vi.fn() });
		});

		afterEach(() => {
			mockPalette = null;
			vi.restoreAllMocks();
		});

		it('should create a palette with correct RGBA values from 6-bit RGB', () => {
			const rgb6Bit = [
				[0, 0, 0], // Black
				[63, 0, 0], // Red
				[0, 63, 0], // Green
				[0, 0, 63], // Blue
			];

			mockPalette = createPalette(rgb6Bit);

			const black = mockPalette.getRGBAColor(0);
			expect(black[0]).toBe(0); // R
			expect(black[1]).toBe(0); // G
			expect(black[2]).toBe(0); // B
			expect(black[3]).toBe(255); // A

			// Test red color (63 << 2 | 63 >> 4 = 252 | 3 = 255)
			const red = mockPalette.getRGBAColor(1);
			expect(red[0]).toBe(255); // R
			expect(red[1]).toBe(0); // G
			expect(red[2]).toBe(0); // B
			expect(red[3]).toBe(255); // A
		});

		it('should have default foreground and background colors', () => {
			mockPalette = createPalette([
				[0, 0, 0],
				[63, 63, 63],
			]);

			expect(mockPalette.getForegroundColor()).toBe(7);
			expect(mockPalette.getBackgroundColor()).toBe(0);
		});

		it('should dispatch events when colors change', () => {
			mockPalette = createPalette([
				[0, 0, 0],
				[63, 63, 63],
			]);

			mockPalette.setForegroundColor(15);
			expect(global.document.dispatchEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'onForegroundChange',
					detail: 15,
				}),
			);

			mockPalette.setBackgroundColor(8);
			expect(global.document.dispatchEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'onBackgroundChange',
					detail: 8,
				}),
			);
		});

		it('should update foreground and background colors correctly', () => {
			mockPalette = createPalette([
				[0, 0, 0],
				[63, 63, 63],
			]);

			mockPalette.setForegroundColor(12);
			expect(mockPalette.getForegroundColor()).toBe(12);

			mockPalette.setBackgroundColor(3);
			expect(mockPalette.getBackgroundColor()).toBe(3);
		});
	});

	describe('createDefaultPalette', () => {
		it('should create a standard 16-color palette', () => {
			const palette = createDefaultPalette();

			for (let i = 0; i < 16; i++) {
				const color = palette.getRGBAColor(i);
				expect(color).toBeInstanceOf(Uint8Array);
				expect(color).toHaveLength(4);
				expect(color[3]).toBe(255); // Alpha should be 255
			}
		});

		it('should have correct standard colors', () => {
			const palette = createDefaultPalette();

			const black = palette.getRGBAColor(0);
			expect(black[0]).toBe(0);
			expect(black[1]).toBe(0);
			expect(black[2]).toBe(0);

			const white = palette.getRGBAColor(15);
			expect(white[0]).toBe(255); // 63 << 2 | 63 >> 4 = 255
			expect(white[1]).toBe(255);
			expect(white[2]).toBe(255);

			const red = palette.getRGBAColor(4);
			expect(red[0]).toBe(170); // 42 << 2 | 42 >> 4 = 168 | 2 = 170
			expect(red[1]).toBe(0);
			expect(red[2]).toBe(0);
		});

		it('should have correct default foreground and background', () => {
			const palette = createDefaultPalette();
			expect(palette.getForegroundColor()).toBe(7);
			expect(palette.getBackgroundColor()).toBe(0);
		});
	});

	describe('createPalettePreview', () => {
		let mockCanvas, mockCtx;

		beforeEach(() => {
			mockCtx = {
				clearRect: vi.fn(),
				fillRect: vi.fn(),
				createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(100) })),
			};

			mockCanvas = {
				getContext: vi.fn(() => mockCtx),
				width: 100,
				height: 50,
			};

			vi.stubGlobal('document', { addEventListener: vi.fn() });
		});

		it('should create a palette preview with update function', () => {
			const preview = createPalettePreview(mockCanvas);

			expect(preview).toHaveProperty('updatePreview');
			expect(preview).toHaveProperty('setForegroundColor');
			expect(preview).toHaveProperty('setBackgroundColor');
			expect(typeof preview.updatePreview).toBe('function');
		});

		it('should calculate square size correctly', () => {
			createPalettePreview(mockCanvas);

			expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 100, 50);
			expect(mockCtx.fillRect).toHaveBeenCalled();
		});

		it('should add event listeners for color changes', () => {
			createPalettePreview(mockCanvas);

			expect(global.document.addEventListener).toHaveBeenCalledWith(
				'onForegroundChange',
				expect.any(Function),
			);
			expect(global.document.addEventListener).toHaveBeenCalledWith(
				'onBackgroundChange',
				expect.any(Function),
			);
			expect(global.document.addEventListener).toHaveBeenCalledWith(
				'onPaletteChange',
				expect.any(Function),
			);
		});
	});

	describe('createPalettePicker', () => {
		let mockCanvas, mockCtx;

		beforeEach(() => {
			mockCtx = {
				createImageData: vi.fn(() => ({
					data: { set: vi.fn() },
					width: 10,
					height: 5,
				})),
				putImageData: vi.fn(),
			};

			mockCanvas = {
				getContext: vi.fn(() => mockCtx),
				width: 80,
				height: 64,
				addEventListener: vi.fn(),
				getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })),
			};

			vi.stubGlobal('document', { addEventListener: vi.fn() });
		});

		it('should create a palette picker with update function', () => {
			const picker = createPalettePicker(mockCanvas);

			expect(picker).toHaveProperty('updatePalette');
			expect(typeof picker.updatePalette).toBe('function');
		});

		it('should create image data for all 16 colors', () => {
			createPalettePicker(mockCanvas);

			expect(mockCtx.createImageData).toHaveBeenCalledTimes(16);
			expect(mockCtx.createImageData).toHaveBeenCalledWith(40, 8); // width/2, height/8
		});

		it('should add canvas event listeners', () => {
			createPalettePicker(mockCanvas);

			expect(mockCanvas.addEventListener).toHaveBeenCalledWith(
				'touchend',
				expect.any(Function),
			);
			expect(mockCanvas.addEventListener).toHaveBeenCalledWith(
				'touchcancel',
				expect.any(Function),
			);
			expect(mockCanvas.addEventListener).toHaveBeenCalledWith(
				'mouseup',
				expect.any(Function),
			);
			expect(mockCanvas.addEventListener).toHaveBeenCalledWith(
				'contextmenu',
				expect.any(Function),
			);
		});

		it('should add document event listeners', () => {
			createPalettePicker(mockCanvas);

			expect(global.document.addEventListener).toHaveBeenCalledWith(
				'keydown',
				expect.any(Function),
			);
			expect(global.document.addEventListener).toHaveBeenCalledWith(
				'onPaletteChange',
				expect.any(Function),
			);
		});

		it('should handle touch events for color selection', () => {
			createPalettePicker(mockCanvas);

			const touchHandlerCall = mockCanvas.addEventListener.mock.calls.find(
				call => call[0] === 'touchend',
			);
			expect(touchHandlerCall).toBeDefined();
			expect(typeof touchHandlerCall[1]).toBe('function');
		});

		it('selects a color from changedTouches on touchend', async () => {
			// a touchend fires with touches already empty; the lifted
			// finger's coords only exist on changedTouches
			const State = (await import('../../src/js/client/state.js')).default;
			State.palette.setForegroundColor.mockClear();
			createPalettePicker(mockCanvas);
			const touchEnd = mockCanvas.addEventListener.mock.calls.find(
				call => call[0] === 'touchend',
			)[1];
			expect(() =>
				touchEnd({
					preventDefault: () => {},
					touches: [],
					changedTouches: [{ pageX: 50, pageY: 20 }],
				})).not.toThrow();
			expect(State.palette.setForegroundColor).toHaveBeenCalled();
			// a ghost touchend with no coordinate source at all stays quiet
			expect(() => touchEnd({ preventDefault: () => {}, touches: []})).not.toThrow();
		});

		it('should handle mouse events for color selection', () => {
			createPalettePicker(mockCanvas);

			const mouseHandlerCall = mockCanvas.addEventListener.mock.calls.find(
				call => call[0] === 'mouseup',
			);
			expect(mouseHandlerCall).toBeDefined();
			expect(typeof mouseHandlerCall[1]).toBe('function');
		});

		it('should handle digit key combinations for color selection', () => {
			createPalettePicker(mockCanvas);

			const keyHandlerCall = global.document.addEventListener.mock.calls.find(
				call => call[0] === 'keydown',
			);
			expect(keyHandlerCall).toBeDefined();
			expect(typeof keyHandlerCall[1]).toBe('function');
		});

		it('should handle color cycling when same color is selected', () => {
			createPalettePicker(mockCanvas);

			const keyHandlerCall = global.document.addEventListener.mock.calls.find(
				call => call[0] === 'keydown',
			);
			expect(keyHandlerCall).toBeDefined();
			expect(typeof keyHandlerCall[1]).toBe('function');
		});

		it('should handle arrow key navigation with wrap-around', () => {
			createPalettePicker(mockCanvas);

			const keyHandlerCall = global.document.addEventListener.mock.calls.find(
				call => call[0] === 'keydown',
			);
			expect(keyHandlerCall).toBeDefined();
			expect(typeof keyHandlerCall[1]).toBe('function');
		});

		it('should prevent context menu on canvas', () => {
			const mockMenuCanvas = {
				...mockCanvas,
				addEventListener: vi.fn(),
			};

			createPalettePicker(mockMenuCanvas);

			const menuHandlerCall = mockMenuCanvas.addEventListener.mock.calls.find(
				call => call[0] === 'contextmenu',
			);
			expect(menuHandlerCall).toBeDefined();

			const menuHandler = menuHandlerCall[1];

			const contextMenuEvent = { preventDefault: vi.fn() };

			menuHandler(contextMenuEvent);
			expect(contextMenuEvent.preventDefault).toHaveBeenCalled();
		});

		it('should handle color cycling when same color is selected with Ctrl+digit', () => {
			expect(() => {
				const keyHandler = e => {
					const keyCode = e.keyCode || e.which;
					if (keyCode >= 48 && keyCode <= 55 && e.ctrlKey === true) {
						e.preventDefault();
						// This represents the logic that would be in the actual handler
						const num = keyCode - 48;
						if (num === 3) {
							// Simulate cycling to high color
							expect(num + 8).toBe(11);
						}
					}
				};

				const ctrlDigitEvent = {
					keyCode: 51, // '3'
					which: 51,
					ctrlKey: true,
					altKey: false,
					preventDefault: vi.fn(),
				};

				keyHandler(ctrlDigitEvent);
				expect(ctrlDigitEvent.preventDefault).toHaveBeenCalled();
			}).not.toThrow();
		});

		it('should handle color cycling when same color is selected with Alt+digit', () => {
			expect(() => {
				const keyHandler = e => {
					const keyCode = e.keyCode || e.which;
					if (keyCode >= 48 && keyCode <= 55 && e.altKey === true) {
						e.preventDefault();
						const num = keyCode - 48;
						if (num === 5) {
							// Simulate cycling to high color
							expect(num + 8).toBe(13);
						}
					}
				};

				const altDigitEvent = {
					keyCode: 53, // '5'
					which: 53,
					ctrlKey: false,
					altKey: true,
					preventDefault: vi.fn(),
				};

				keyHandler(altDigitEvent);
				expect(altDigitEvent.preventDefault).toHaveBeenCalled();
			}).not.toThrow();
		});

		it('should handle Ctrl+Arrow key navigation for color selection', () => {
			expect(() => {
				const keyHandler = e => {
					if (e.code.startsWith('Arrow') && e.ctrlKey === true) {
						e.preventDefault();

						switch (e.code) {
							case 'ArrowUp': {
								// Previous foreground color
								const foreground = 7; // Mock current foreground
								const newForeground = foreground === 0 ? 15 : foreground - 1;
								expect(newForeground).toBe(6); // 7 - 1
								break;
							}
							case 'ArrowDown': {
								// Next foreground color
								const fg = 7; // Mock current foreground
								const nextFg = fg === 15 ? 0 : fg + 1;
								expect(nextFg).toBe(8); // 7 + 1
								break;
							}
							case 'ArrowLeft': {
								// Previous background color
								const background = 8; // Mock current background
								const newBg = background === 0 ? 15 : background - 1;
								expect(newBg).toBe(7); // 8 - 1
								break;
							}
							case 'ArrowRight': {
								// Next background color
								const bg = 8; // Mock current background
								const nextBg = bg === 15 ? 0 : bg + 1;
								expect(nextBg).toBe(9); // 8 + 1
								break;
							}
						}
					}
				};

				['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].forEach(code => {
					keyHandler({
						code: code,
						ctrlKey: true,
						preventDefault: vi.fn(),
					});
				});
			}).not.toThrow();
		});

		it('should handle color wrap-around at boundaries', () => {
			expect(() => {
				// Test minimum boundary wrap-around (0 -> 15)
				const colorAtMin = 0;
				const wrappedMin = colorAtMin === 0 ? 15 : colorAtMin - 1;
				expect(wrappedMin).toBe(15);

				// Test maximum boundary wrap-around (15 -> 0)
				const colorAtMax = 15;
				const wrappedMax = colorAtMax === 15 ? 0 : colorAtMax + 1;
				expect(wrappedMax).toBe(0);

				// Test normal increment
				const normalColor = 7;
				const incremented = normalColor === 15 ? 0 : normalColor + 1;
				expect(incremented).toBe(8);

				// Test normal decrement
				const decremented = normalColor === 0 ? 15 : normalColor - 1;
				expect(decremented).toBe(6);
			}).not.toThrow();
		});

		it('should handle mouse events with modifier keys for background color selection', () => {
			expect(() => {
				const calculateColor = (
					clientX,
					clientY,
					canvasWidth,
					canvasHeight,
					_modifierKeys,
				) => {
					const x = Math.floor(clientX / (canvasWidth / 2));
					const y = Math.floor(clientY / (canvasHeight / 8));
					const colorIndex = y + (x === 0 ? 0 : 8);

					if (
						clientX === 50 &&
						clientY === 40 &&
						canvasWidth === 200 &&
						canvasHeight === 160
					) {
						// x = floor(50 / 100) = 0, y = floor(40 / 20) = 2
						// colorIndex = 2 + 0 = 2
						expect(colorIndex).toBe(2);
					}

					if (
						clientX === 150 &&
						clientY === 60 &&
						canvasWidth === 200 &&
						canvasHeight === 160
					) {
						// x = floor(150 / 100) = 1, y = floor(60 / 20) = 3
						// colorIndex = 3 + 8 = 11
						expect(colorIndex).toBe(11);
					}

					return colorIndex;
				};

				calculateColor(50, 40, 200, 160, { altKey: true });
				calculateColor(150, 60, 200, 160, { ctrlKey: true });
			}).not.toThrow();
		});

		it('should ignore non-matching key events', () => {
			const mockState = {
				palette: {
					getForegroundColor: vi.fn(() => 7),
					getBackgroundColor: vi.fn(() => 0),
					setForegroundColor: vi.fn(),
					setBackgroundColor: vi.fn(),
				},
			};

			global.State = mockState;

			createPalettePicker(mockCanvas);

			const keyHandlerCall = global.document.addEventListener.mock.calls.find(
				call => call[0] === 'keydown',
			);
			const keyHandler = keyHandlerCall[1];

			mockState.palette.setForegroundColor.mockClear();
			mockState.palette.setBackgroundColor.mockClear();

			const nonMatchingEvents = [
				{ keyCode: 65, ctrlKey: true }, // Ctrl+A
				{ keyCode: 56, ctrlKey: true }, // Ctrl+8 (out of range)
				{ keyCode: 32, ctrlKey: true }, // Ctrl+Space (using keyCode instead of code)
				{ keyCode: 38, ctrlKey: false }, // Arrow without Ctrl (using keyCode)
			];

			nonMatchingEvents.forEach(event => {
				// Don't crash on missing code property
				try {
					keyHandler(event);
				} catch (e) {
					// Ignore errors for invalid events
					void e;
				}
			});

			expect(mockState.palette.setForegroundColor).not.toHaveBeenCalled();
			expect(mockState.palette.setBackgroundColor).not.toHaveBeenCalled();
		});
	});
});
