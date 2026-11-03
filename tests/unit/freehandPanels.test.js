import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import State from '../../src/js/client/state.js';
import {
	createHalfBlockController,
	createShadingController,
	createShadingPanel,
	createCharacterBrushPanel,
} from '../../src/js/client/freehandTools.js';

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		fontWidth: 8,
		fontHeight: 16,
		palette: {
			getRGBAColor: vi.fn(() => [255, 0, 0, 255]),
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
			setForegroundColor: vi.fn(),
			setBackgroundColor: vi.fn(),
		},
		textArtCanvas: {
			startUndo: vi.fn(),
			drawHalfBlock: vi.fn(callback => {
				const mockCallback = vi.fn();
				callback(mockCallback);
			}),
			draw: vi.fn(callback => {
				const mockCallback = vi.fn();
				callback(mockCallback);
			}),
			getBlock: vi.fn(() => ({
				charCode: 65,
				foregroundColor: 7,
				backgroundColor: 0,
			})),
			getHalfBlock: vi.fn(() => ({
				isBlocky: true,
				halfBlockY: 0,
				upperBlockColor: 7,
				lowerBlockColor: 0,
				x: 0,
				y: 0,
			})),
			getColumns: vi.fn(() => 80),
			getRows: vi.fn(() => 25),
			clear: vi.fn(),
			getMirrorMode: vi.fn(() => false),
			setMirrorMode: vi.fn(),
			getMirrorX: vi.fn(() => 79),
			getCurrentFontName: vi.fn(() => 'CP437 8x16'),
			getArea: vi.fn(() => ({
				data: new Uint16Array(100),
				width: 10,
				height: 10,
			})),
			setArea: vi.fn(),
			deleteArea: vi.fn(),
		},
		font: {
			getWidth: vi.fn(() => 8),
			getHeight: vi.fn(() => 16),
			getData: vi.fn(() => ({})),
			draw: vi.fn(),
			getLetterSpacing: vi.fn(() => false),
			setLetterSpacing: vi.fn(),
		},
		toolPreview: {
			clear: vi.fn(),
			drawHalfBlock: vi.fn(),
		},
		positionInfo: { update: vi.fn() },
		toolSettings: {
			show: vi.fn(),
			hide: vi.fn(),
			mount: vi.fn(),
			get: vi.fn((_key, fallback) => fallback),
			set: vi.fn(),
		},
		selectionCursor: {
			getSelection: vi.fn(() => ({
				x: 10,
				y: 10,
				width: 5,
				height: 5,
			})),
			setStart: vi.fn(),
			setEnd: vi.fn(),
			hide: vi.fn(),
			show: vi.fn(),
			isVisible: vi.fn(() => false),
			getElement: vi.fn(() => ({
				classList: {
					add: vi.fn(),
					remove: vi.fn(),
				},
			})),
		},
		cursor: {
			left: vi.fn(),
			right: vi.fn(),
			up: vi.fn(),
			down: vi.fn(),
			newLine: vi.fn(),
			endOfCurrentRow: vi.fn(),
			startOfCurrentRow: vi.fn(),
			getX: vi.fn(() => 0),
			getY: vi.fn(() => 0),
			hide: vi.fn(),
		},
		pasteTool: { disable: vi.fn() },
		worker: {
			sendResize: vi.fn(),
			sendFontChange: vi.fn(),
			sendIceColorsChange: vi.fn(),
			sendLetterSpacingChange: vi.fn(),
		},
		sampleTool: null,
		title: { value: 'test' },
		chat: {
			isEnabled: vi.fn(() => false),
			toggle: vi.fn(),
		},
	},
}));

vi.mock('../../src/js/client/toolbar.js', () => ({
	default: {
		add: vi.fn(() => ({ enable: vi.fn() })),
		returnToPreviousTool: vi.fn(),
	},
}));

vi.mock('../../src/js/client/ui.js', async () =>
	(await import('./uiMock.js')).createUiMock());

const mockDocument = {
	createElement: vi.fn(tag => ({
		style: {},
		classList: {
			add: vi.fn(),
			remove: vi.fn(),
			toggle: vi.fn(),
		},
		setAttribute: vi.fn(),
		append: vi.fn(),
		prepend: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		appendChild: vi.fn(),
		removeChild: vi.fn(),
		insertBefore: vi.fn(),
		contains: vi.fn(() => false),
		getBoundingClientRect: vi.fn(() => ({
			left: 0,
			top: 0,
			width: 100,
			height: 100,
		})),
		innerText: '',
		textContent: '',
		value: '',
		width: 100,
		height: 100,
		tagName: tag.toUpperCase(),
	})),
	createElementNS: vi.fn(() => ({
		setAttribute: vi.fn(),
		appendChild: vi.fn(),
	})),
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
	dispatchEvent: vi.fn(),
};

vi.stubGlobal('document', mockDocument);
global.Image = vi.fn(() => ({
	addEventListener: vi.fn(),
	onload: null,
	onerror: null,
	src: '',
}));

describe('Freehand Tools - Panels and Cursors', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('createHalfBlockController', () => {
		it('should create a half block controller with proper interface', () => {
			const controller = createHalfBlockController();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
		});

		it('should handle enable/disable and event management', () => {
			const controller = createHalfBlockController();

			expect(() => {
				controller.enable();
				controller.disable();
			}).not.toThrow();

			expect(mockDocument.addEventListener).toHaveBeenCalled();
			expect(mockDocument.removeEventListener).toHaveBeenCalled();
		});
	});

	describe('createShadingController', () => {
		let mockPanel;

		beforeEach(() => {
			mockPanel = {
				enable: vi.fn(),
				disable: vi.fn(),
				getMode: vi.fn(() => ({
					charCode: 178,
					foreground: 7,
					background: 0,
				})),
				select: vi.fn(),
				ignore: vi.fn(),
				unignore: vi.fn(),
				redrawGlyphs: vi.fn(),
			};
		});

		it('should create a shading controller with complete interface', () => {
			const controller = createShadingController(mockPanel, false);

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
			expect(controller).toHaveProperty('select');
			expect(controller).toHaveProperty('ignore');
			expect(controller).toHaveProperty('unignore');
			expect(controller).toHaveProperty('redrawGlyphs');
		});

		it('should proxy panel methods correctly', () => {
			const controller = createShadingController(mockPanel, false);

			controller.select(178);
			expect(mockPanel.select).toHaveBeenCalledWith(178);

			controller.ignore();
			expect(mockPanel.ignore).toHaveBeenCalled();

			controller.unignore();
			expect(mockPanel.unignore).toHaveBeenCalled();

			controller.redrawGlyphs();
			expect(mockPanel.redrawGlyphs).toHaveBeenCalled();
		});

		it('should handle enable/disable with event listeners', () => {
			const controller = createShadingController(mockPanel, false);

			controller.enable();
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasDown',
				expect.any(Function),
			);
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasUp',
				expect.any(Function),
			);
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasDrag',
				expect.any(Function),
			);
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'keydown',
				expect.any(Function),
			);
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'keyup',
				expect.any(Function),
			);

			controller.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'onTextCanvasDown',
				expect.any(Function),
			);
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'onTextCanvasUp',
				expect.any(Function),
			);
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'onTextCanvasDrag',
				expect.any(Function),
			);
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'keydown',
				expect.any(Function),
			);
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'keyup',
				expect.any(Function),
			);
		});
	});

	describe('createShadingPanel', () => {
		it('should create a shading panel with proper interface', async () => {
			const panel = await createShadingPanel();

			expect(panel).toHaveProperty('enable');
			expect(panel).toHaveProperty('disable');
			expect(panel).toHaveProperty('getMode');
			expect(panel).toHaveProperty('select');
			expect(panel).toHaveProperty('ignore');
			expect(panel).toHaveProperty('unignore');
		});

		it('should return valid mode data', async () => {
			const panel = await createShadingPanel();
			const mode = panel.getMode();

			expect(mode).toHaveProperty('halfBlockMode');
			expect(mode).toHaveProperty('foreground');
			expect(mode).toHaveProperty('background');
			expect(mode).toHaveProperty('charCode');
			expect(typeof mode.halfBlockMode).toBe('boolean');
			expect(typeof mode.foreground).toBe('number');
			expect(typeof mode.background).toBe('number');
			expect(typeof mode.charCode).toBe('number');
		});

		it('should handle character selection', async () => {
			const panel = await createShadingPanel();

			expect(() => {
				panel.select(177); // Medium shade
			}).not.toThrow();
		});

		describe('chips', () => {
			// chip 21 sits in band 1 (the medium shade) at color 5
			const setup = async () => {
				const panel = await createShadingPanel();
				const chip = mockDocument.createElement.mock.results
					.map(r => r.value)
					.filter(el => el.className === 'shadeChip')[21];
				const fire = (type, props = {}) => {
					const e = {
						button: 0,
						detail: type === 'click' ? 1 : 0,
						preventDefault: vi.fn(),
						stopPropagation: vi.fn(),
						...props,
					};
					chip.addEventListener.mock.calls
						.filter(c => c[0] === type)
						.forEach(c => c[1](e));
					return e;
				};
				return { panel, fire };
			};
			const fgCalls = () => State.palette.setForegroundColor.mock.calls;
			const bgCalls = () => State.palette.setBackgroundColor.mock.calls;

			it('click picks the foreground and the shade', async () => {
				const { panel, fire } = await setup();
				fire('pointerdown');
				fire('click');
				expect(fgCalls()).toEqual([[5]]);
				expect(bgCalls()).toEqual([]);
				expect(panel.getMode().charCode).toBe(177);
			});

			it('ctrl click picks the background alone, as Windows and Linux deliver it', async () => {
				const { panel, fire } = await setup();
				fire('pointerdown', { ctrlKey: true });
				fire('click', { ctrlKey: true });
				expect(bgCalls()).toEqual([[5]]);
				expect(fgCalls()).toEqual([]);
				expect(panel.getMode().charCode).toBe(176);
			});

			it('right click and the macOS ctrl click pick the background once and keep the panel menu shut', async () => {
				const { panel, fire } = await setup();
				fire('pointerdown', { button: 2 });
				const menu = fire('contextmenu', { button: 2 });
				expect(menu.preventDefault).toHaveBeenCalled();
				expect(menu.stopPropagation).toHaveBeenCalled();
				fire('pointerdown', { ctrlKey: true });
				fire('contextmenu', { ctrlKey: true });
				fire('click', { ctrlKey: true });
				fire('click');
				expect(bgCalls()).toEqual([[5], [5]]);
				expect(fgCalls()).toEqual([]);
				expect(panel.getMode().charCode).toBe(176);
			});

			it('a keyboard click after a menu key pick still picks', async () => {
				const { fire } = await setup();
				fire('contextmenu');
				fire('click', { detail: 0 });
				expect(bgCalls()).toEqual([[5]]);
				expect(fgCalls()).toEqual([[5]]);
			});

			describe('under touch', () => {
				const finger = {
					pointerType: 'touch',
					isPrimary: true,
					pointerId: 1,
					clientX: 5,
					clientY: 5,
				};
				// the hold's lift and second-finger listeners sit on the
				// document
				const doc = (type, e) =>
					mockDocument.addEventListener.mock.calls
						.filter(c => c[0] === type)
						.forEach(c => c[1](e));

				beforeEach(() => {
					vi.useFakeTimers();
				});

				afterEach(() => {
					vi.useRealTimers();
				});

				it('a hold picks the background alone, once, and its lift picks nothing', async () => {
					const { panel, fire } = await setup();
					fire('pointerdown', finger);
					vi.advanceTimersByTime(499);
					expect(bgCalls()).toEqual([]);
					vi.advanceTimersByTime(1);
					expect(bgCalls()).toEqual([[5]]);
					doc('pointerup', finger);
					fire('click');
					expect(bgCalls()).toEqual([[5]]);
					expect(fgCalls()).toEqual([]);
					expect(panel.getMode().charCode).toBe(176);
				});

				it('a tap picks the foreground and the shade', async () => {
					const { panel, fire } = await setup();
					fire('pointerdown', finger);
					doc('pointerup', finger);
					fire('click');
					vi.advanceTimersByTime(1000);
					expect(fgCalls()).toEqual([[5]]);
					expect(bgCalls()).toEqual([]);
					expect(panel.getMode().charCode).toBe(177);
				});

				it('the native long-press contextmenu picks nothing more, whether it trails the timer or beats it', async () => {
					const { fire } = await setup();
					fire('pointerdown', finger);
					vi.advanceTimersByTime(500);
					const menu = fire('contextmenu');
					expect(menu.preventDefault).toHaveBeenCalled();
					expect(menu.stopPropagation).toHaveBeenCalled();
					doc('pointerup', finger);
					fire('pointerdown', finger);
					vi.advanceTimersByTime(400);
					fire('contextmenu');
					expect(bgCalls()).toEqual([[5], [5]]);
					vi.advanceTimersByTime(200);
					doc('pointerup', finger);
					expect(bgCalls()).toEqual([[5], [5]]);
					expect(fgCalls()).toEqual([]);
				});

				it('a hold that wanders, meets a second finger, or is cancelled picks nothing', async () => {
					const { fire } = await setup();
					fire('pointerdown', finger);
					fire('pointermove', { ...finger, clientY: 25 });
					vi.advanceTimersByTime(600);
					fire('pointerdown', finger);
					doc('pointerdown', { ...finger, pointerId: 2, isPrimary: false });
					vi.advanceTimersByTime(600);
					fire('pointerdown', finger);
					doc('pointercancel', finger);
					vi.advanceTimersByTime(600);
					expect(bgCalls()).toEqual([]);
					expect(fgCalls()).toEqual([]);
				});
			});
		});
	});

	describe('createCharacterBrushPanel', () => {
		it('should create a character brush panel', async () => {
			const panel = await createCharacterBrushPanel();

			expect(panel).toHaveProperty('enable');
			expect(panel).toHaveProperty('disable');
			expect(panel).toHaveProperty('getMode');
			expect(panel).toHaveProperty('select');
			expect(panel).toHaveProperty('ignore');
			expect(panel).toHaveProperty('unignore');
			expect(panel).toHaveProperty('redrawGlyphs');
		});

		it('should return valid mode for character selection', async () => {
			const panel = await createCharacterBrushPanel();
			const mode = panel.getMode();

			expect(mode).toHaveProperty('halfBlockMode');
			expect(mode).toHaveProperty('foreground');
			expect(mode).toHaveProperty('background');
			expect(mode).toHaveProperty('charCode');
			expect(mode.halfBlockMode).toBe(false);
		});

		it('should handle character code selection correctly', async () => {
			const panel = await createCharacterBrushPanel();

			expect(() => {
				panel.select(65); // Character 'A'
			}).not.toThrow();
		});
	});
});
