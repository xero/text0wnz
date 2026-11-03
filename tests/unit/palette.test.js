import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	getUnicode,
	getUTF8,
	createPalette,
	createDefaultPalette,
	createPalettePreview,
	createPalettePicker,
	picksBackground,
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
			expect(getUnicode(0)).toBe(0x00a0); // non-breaking space
			expect(getUnicode(255)).toBe(0x00a0); // non-breaking space
			expect(getUnicode(256)).toBe(256);
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
			// ♥ U+2665 encodes as E2 99 A5
			const heartUTF8 = getUTF8(3);
			expect(heartUTF8).toHaveLength(3);
			expect(heartUTF8[0]).toBe(226);
			expect(heartUTF8[1]).toBe(153);
			expect(heartUTF8[2]).toBe(165);
		});

		it('should handle extended ASCII characters', () => {
			const result = getUTF8(128); // Ç
			expect(result).toHaveLength(2);
		});

		it('should handle box drawing characters', () => {
			const result = getUTF8(176); // Light shade
			expect(result).toHaveLength(3);
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

			// 63 << 2 | 63 >> 4 = 252 | 3 = 255
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
				expect(color[3]).toBe(255);
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

	describe('picksBackground', () => {
		it('right click and ctrl click pick the background on every OS, a left click the foreground', () => {
			expect(picksBackground({ button: 0 })).toBe(false);
			expect(picksBackground({ button: 0, ctrlKey: true })).toBe(true);
			expect(picksBackground({ button: 2 })).toBe(true);
			expect(picksBackground({ button: 2, ctrlKey: true })).toBe(true);
			expect(picksBackground({ button: 0, metaKey: true })).toBe(false);
			expect(picksBackground({ button: 1 })).toBeUndefined();
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

		describe('picker input', () => {
			let palette;
			const handler = type =>
				global.document.addEventListener.mock.calls.find(c => c[0] === type)[1];
			const key = (code, mods = {}) => ({
				code: code,
				ctrlKey: false,
				altKey: false,
				metaKey: false,
				preventDefault: vi.fn(),
				...mods,
			});

			beforeEach(async () => {
				palette = (await import('../../src/js/client/state.js')).default.palette;
				palette.setForegroundColor.mockClear();
				palette.setBackgroundColor.mockClear();
				createPalettePicker(mockCanvas);
			});

			it('Ctrl+digit picks the foreground, and again picks its bright twin', () => {
				const e = key('Digit3', { ctrlKey: true });
				handler('keydown')(e);
				expect(e.preventDefault).toHaveBeenCalled();
				expect(palette.setForegroundColor).toHaveBeenLastCalledWith(3);
				palette.getForegroundColor.mockReturnValueOnce(3);
				handler('keydown')(key('Digit3', { ctrlKey: true }));
				expect(palette.setForegroundColor).toHaveBeenLastCalledWith(11);
				expect(palette.setBackgroundColor).not.toHaveBeenCalled();
			});

			it('Alt+digit picks the background, and again picks its bright twin', () => {
				handler('keydown')(key('Digit5', { altKey: true }));
				expect(palette.setBackgroundColor).toHaveBeenLastCalledWith(5);
				palette.getBackgroundColor.mockReturnValueOnce(5);
				handler('keydown')(key('Digit5', { altKey: true }));
				expect(palette.setBackgroundColor).toHaveBeenLastCalledWith(13);
				expect(palette.setForegroundColor).not.toHaveBeenCalled();
			});

			it('Ctrl+Arrow steps foreground on up/down and background on left/right', () => {
				handler('keydown')(key('ArrowUp', { ctrlKey: true }));
				expect(palette.setForegroundColor).toHaveBeenLastCalledWith(6);
				handler('keydown')(key('ArrowDown', { ctrlKey: true }));
				expect(palette.setForegroundColor).toHaveBeenLastCalledWith(8);
				handler('keydown')(key('ArrowRight', { ctrlKey: true }));
				expect(palette.setBackgroundColor).toHaveBeenLastCalledWith(1);
				palette.getBackgroundColor.mockReturnValueOnce(8);
				handler('keydown')(key('ArrowLeft', { ctrlKey: true }));
				expect(palette.setBackgroundColor).toHaveBeenLastCalledWith(7);
			});

			it('Ctrl+Arrow wraps between 0 and 15', () => {
				palette.getForegroundColor.mockReturnValueOnce(0);
				handler('keydown')(key('ArrowUp', { ctrlKey: true }));
				expect(palette.setForegroundColor).toHaveBeenLastCalledWith(15);
				palette.getForegroundColor.mockReturnValueOnce(15);
				handler('keydown')(key('ArrowDown', { ctrlKey: true }));
				expect(palette.setForegroundColor).toHaveBeenLastCalledWith(0);
				handler('keydown')(key('ArrowLeft', { ctrlKey: true }));
				expect(palette.setBackgroundColor).toHaveBeenLastCalledWith(15);
				palette.getBackgroundColor.mockReturnValueOnce(15);
				handler('keydown')(key('ArrowRight', { ctrlKey: true }));
				expect(palette.setBackgroundColor).toHaveBeenLastCalledWith(0);
			});

			it('ignores digits past 7, unmodified keys, and other Ctrl combos', () => {
				const events = [
					key('Digit8', { ctrlKey: true }),
					key('Digit9', { altKey: true }),
					key('Digit3'),
					key('ArrowUp'),
					key('KeyA', { ctrlKey: true }),
					key('Space', { ctrlKey: true }),
				];
				events.forEach(e => handler('keydown')(e));
				expect(palette.setForegroundColor).not.toHaveBeenCalled();
				expect(palette.setBackgroundColor).not.toHaveBeenCalled();
				events.forEach(e => expect(e.preventDefault).not.toHaveBeenCalled());
			});

			it('mouseup picks the foreground under the pointer, low colors on the left', () => {
				mockCanvas.getBoundingClientRect.mockReturnValue({
					left: 0,
					top: 0,
					width: 200,
					height: 160,
				});
				const mouseup = mockCanvas.addEventListener.mock.calls.find(
					c => c[0] === 'mouseup',
				)[1];
				mouseup({ clientX: 50, clientY: 40, button: 0, altKey: true });
				expect(palette.setForegroundColor).toHaveBeenLastCalledWith(2);
				mouseup({ clientX: 150, clientY: 60, button: 0, shiftKey: true });
				expect(palette.setForegroundColor).toHaveBeenLastCalledWith(11);
				expect(palette.setBackgroundColor).not.toHaveBeenCalled();
			});

			it('right click and ctrl click pick the background, left click the foreground', () => {
				mockCanvas.getBoundingClientRect.mockReturnValue({
					left: 0,
					top: 0,
					width: 200,
					height: 160,
				});
				const mouseup = mockCanvas.addEventListener.mock.calls.find(
					c => c[0] === 'mouseup',
				)[1];
				mouseup({ clientX: 150, clientY: 100, button: 2 });
				expect(palette.setBackgroundColor).toHaveBeenLastCalledWith(13);
				mouseup({ clientX: 50, clientY: 20, button: 0, ctrlKey: true });
				expect(palette.setBackgroundColor).toHaveBeenLastCalledWith(1);
				expect(palette.setForegroundColor).not.toHaveBeenCalled();
			});

			it('a middle click picks nothing and cmd click picks the foreground', () => {
				mockCanvas.getBoundingClientRect.mockReturnValue({
					left: 0,
					top: 0,
					width: 200,
					height: 160,
				});
				const mouseup = mockCanvas.addEventListener.mock.calls.find(
					c => c[0] === 'mouseup',
				)[1];
				mouseup({ clientX: 50, clientY: 20, button: 1 });
				expect(palette.setForegroundColor).not.toHaveBeenCalled();
				mouseup({ clientX: 50, clientY: 20, button: 0, metaKey: true });
				expect(palette.setForegroundColor).toHaveBeenLastCalledWith(1);
				expect(palette.setBackgroundColor).not.toHaveBeenCalled();
			});

			it('a macOS ctrl click picks the background once, through mouseup alone', () => {
				mockCanvas.getBoundingClientRect.mockReturnValue({
					left: 0,
					top: 0,
					width: 200,
					height: 160,
				});
				const on = type =>
					mockCanvas.addEventListener.mock.calls.find(c => c[0] === type)[1];
				const at = { clientX: 150, clientY: 100, button: 0, ctrlKey: true };
				const menu = { ...at, preventDefault: vi.fn() };
				on('contextmenu')(menu);
				on('mouseup')(at);
				expect(menu.preventDefault).toHaveBeenCalled();
				expect(palette.setBackgroundColor.mock.calls).toEqual([[13]]);
				expect(palette.setForegroundColor).not.toHaveBeenCalled();
			});

			it('a left pick right after a right click picks instead of opening the editor', () => {
				// ui.js bound $ to the jsdom document before the stub
				vi.unstubAllGlobals();
				const jsdom = document;
				vi.stubGlobal('document', { addEventListener: vi.fn() });
				const editor = jsdom.createElement('input');
				editor.id = 'customColor';
				editor.click = vi.fn();
				jsdom.body.append(editor);
				palette.getRGBColor = vi.fn(() => '#000000');
				try {
					mockCanvas.getBoundingClientRect.mockReturnValue({
						left: 0,
						top: 0,
						width: 200,
						height: 160,
					});
					createPalettePicker(mockCanvas);
					const mouseup = mockCanvas.addEventListener.mock.calls.findLast(
						c => c[0] === 'mouseup',
					)[1];
					// every pick lands on color 13, so only the timing guard
					// keeps the editor shut
					mouseup({ clientX: 150, clientY: 100, button: 2 });
					mouseup({ clientX: 150, clientY: 100, button: 0 });
					expect(editor.click).not.toHaveBeenCalled();
					expect(palette.setForegroundColor.mock.calls).toEqual([[13]]);
					// a ctrl pick inside the threshold is a background pick too
					mouseup({ clientX: 150, clientY: 100, button: 0, ctrlKey: true });
					expect(editor.click).not.toHaveBeenCalled();
					expect(palette.setBackgroundColor.mock.calls).toEqual([[13], [13]]);
					// a second left pick inside the threshold still edits
					mouseup({ clientX: 150, clientY: 100, button: 0 });
					expect(editor.click).toHaveBeenCalled();
				} finally {
					editor.remove();
					delete palette.getRGBColor;
				}
			});
		});

		describe('touch hold', () => {
			let palette, editor;
			// the hold's lift and second-finger listeners sit on the
			// stubbed document, the rest on the canvas
			const on = (target, type) => e =>
				target.addEventListener.mock.calls
					.filter(c => c[0] === type)
					.forEach(c => c[1](e));
			const strip = type => on(mockCanvas, type);
			const doc = type => on(global.document, type);
			// a 200x160 strip: (150, 100) is color 13, (50, 20) color 1
			const down = (clientX = 150, clientY = 100, props = {}) =>
				strip('pointerdown')({
					pointerType: 'touch',
					isPrimary: true,
					pointerId: 1,
					clientX,
					clientY,
					...props,
				});
			const lift = (pageX = 150, pageY = 100, type = 'touchend') => {
				doc('pointerup')({ pointerId: 1 });
				strip(type)({
					preventDefault: vi.fn(),
					touches: [],
					changedTouches: [{ pageX, pageY }],
				});
			};
			const tap = (x, y) => {
				down(x, y);
				lift(x, y);
			};
			const menu = () => {
				const e = { preventDefault: vi.fn() };
				strip('contextmenu')(e);
				return e;
			};
			const fgCalls = () => palette.setForegroundColor.mock.calls;
			const bgCalls = () => palette.setBackgroundColor.mock.calls;

			beforeEach(async () => {
				vi.useFakeTimers();
				// ui.js bound $ to the jsdom document before the stub
				vi.unstubAllGlobals();
				const jsdom = document;
				vi.stubGlobal('document', { addEventListener: vi.fn() });
				editor = jsdom.createElement('input');
				editor.id = 'customColor';
				editor.click = vi.fn();
				jsdom.body.append(editor);
				palette = (await import('../../src/js/client/state.js')).default
					.palette;
				palette.getRGBColor = vi.fn(() => '#000000');
				palette.setForegroundColor.mockClear();
				palette.setBackgroundColor.mockClear();
				mockCanvas.getBoundingClientRect.mockReturnValue({
					left: 0,
					top: 0,
					width: 200,
					height: 160,
				});
				createPalettePicker(mockCanvas);
			});

			afterEach(() => {
				vi.useRealTimers();
				editor.remove();
				delete palette.getRGBColor;
			});

			it('a lift just past an edge of the strip picks the nearest color', () => {
				// no pointermove, standing in for a slide inside the hold's
				// slop, which still picks like a tap
				down(3, 20);
				lift(-3, 20);
				down(197, 20);
				lift(203, 20);
				down(50, 157);
				lift(50, 163);
				expect(fgCalls()).toEqual([[1], [9], [7]]);
				expect(bgCalls()).toEqual([]);
				expect(editor.click).not.toHaveBeenCalled();
			});

			it('a hold picks the background under the finger once, and its lift picks nothing', () => {
				down();
				vi.advanceTimersByTime(499);
				expect(bgCalls()).toEqual([]);
				vi.advanceTimersByTime(1);
				expect(bgCalls()).toEqual([[13]]);
				lift();
				expect(fgCalls()).toEqual([]);
				// a long press that ends in touchcancel is a lift too
				down(50, 20);
				vi.advanceTimersByTime(500);
				lift(50, 20, 'touchcancel');
				expect(bgCalls()).toEqual([[13], [1]]);
				expect(fgCalls()).toEqual([]);
			});

			it('a tap picks the foreground, and a wobble inside the slop is still a tap', () => {
				tap(150, 100);
				vi.advanceTimersByTime(1000);
				down(50, 20);
				strip('pointermove')({ pointerId: 1, clientX: 50, clientY: 28 });
				lift(50, 28);
				vi.advanceTimersByTime(1000);
				expect(fgCalls()).toEqual([[13], [1]]);
				expect(bgCalls()).toEqual([]);
			});

			it('the native long-press contextmenu picks nothing more, whether it trails the timer or beats it', () => {
				down();
				vi.advanceTimersByTime(500);
				expect(menu().preventDefault).toHaveBeenCalled();
				lift();
				down(50, 20);
				vi.advanceTimersByTime(400);
				menu();
				expect(bgCalls()).toEqual([[13], [1]]);
				vi.advanceTimersByTime(200);
				lift(50, 20);
				expect(bgCalls()).toEqual([[13], [1]]);
				expect(fgCalls()).toEqual([]);
			});

			it('a press that wanders, meets a second finger, or is cancelled picks nothing, even at its lift', () => {
				const second = {
					pointerType: 'touch',
					isPrimary: false,
					pointerId: 2,
				};
				down();
				strip('pointermove')({ pointerId: 1, clientX: 150, clientY: 120 });
				vi.advanceTimersByTime(600);
				lift(150, 120);
				down();
				doc('pointerdown')(second);
				vi.advanceTimersByTime(600);
				lift();
				// a pinch that only lands its second finger on the strip
				down(50, 20, second);
				lift(50, 20);
				// a scroll cancels the pointer, yet its touchend still comes
				down();
				doc('pointercancel')({ pointerId: 1 });
				vi.advanceTimersByTime(600);
				lift(150, 140);
				expect(bgCalls()).toEqual([]);
				expect(fgCalls()).toEqual([]);
			});

			it('a hold then a quick tap on the same color picks instead of opening the editor', () => {
				down();
				vi.advanceTimersByTime(500);
				lift();
				tap(150, 100);
				expect(editor.click).not.toHaveBeenCalled();
				expect(fgCalls()).toEqual([[13]]);
				expect(bgCalls()).toEqual([[13]]);
			});

			it('a pen hold picks the background once, whether it lifts through touchend or a mouseup', () => {
				down(150, 100, { pointerType: 'pen' });
				vi.advanceTimersByTime(500);
				lift();
				// a desktop pen lifts with no touch events at all
				down(50, 20, { pointerType: 'pen' });
				vi.advanceTimersByTime(500);
				doc('pointerup')({ pointerId: 1 });
				strip('mouseup')({ button: 0, clientX: 50, clientY: 20 });
				expect(bgCalls()).toEqual([[13], [1]]);
				expect(fgCalls()).toEqual([]);
			});

			it('a pen tap and a mouse click after a pen hold still pick the foreground', () => {
				down(50, 20, { pointerType: 'pen' });
				vi.advanceTimersByTime(500);
				doc('pointerup')({ pointerId: 1 });
				strip('mouseup')({ button: 0, clientX: 50, clientY: 20 });
				vi.advanceTimersByTime(1000);
				down(150, 100, { pointerType: 'pen' });
				doc('pointerup')({ pointerId: 1 });
				strip('mouseup')({ button: 0, clientX: 150, clientY: 100 });
				vi.advanceTimersByTime(1000);
				down(50, 20, { pointerType: 'mouse' });
				strip('mouseup')({ button: 0, clientX: 50, clientY: 20 });
				expect(fgCalls()).toEqual([[13], [1]]);
				expect(bgCalls()).toEqual([[1]]);
			});

			it('a double tap still opens the color editor', () => {
				tap(50, 60);
				tap(50, 60);
				expect(editor.click).toHaveBeenCalled();
				expect(bgCalls()).toEqual([]);
			});

			it('quick picks of two colors pick both, by touch or mouse, and only one color twice edits', () => {
				tap(50, 20);
				tap(150, 20);
				expect(editor.click).not.toHaveBeenCalled();
				tap(150, 20);
				expect(editor.click).toHaveBeenCalledTimes(1);
				strip('mouseup')({ button: 0, clientX: 50, clientY: 60 });
				strip('mouseup')({ button: 0, clientX: 150, clientY: 60 });
				expect(editor.click).toHaveBeenCalledTimes(1);
				expect(fgCalls()).toEqual([[1], [9], [3], [11]]);
			});

			it('the editor input is laid out after it is unhidden and before it is clicked', () => {
				// Chrome for Android opens no picker for an input with no layout box
				const order = [];
				editor.classList.add('hide');
				editor.getBoundingClientRect = vi.fn(() => {
					order.push(editor.classList.contains('hide') ? 'hidden layout' : 'layout');
					return {};
				});
				editor.click = vi.fn(() => order.push('click'));
				tap(50, 60);
				tap(50, 60);
				expect(order).toEqual(['layout', 'click']);
			});
		});
	});
});
