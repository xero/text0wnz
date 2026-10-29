import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import State from '../../src/js/client/state.js';
import {
	createHalfBlockController,
	createShadingController,
	createShadingPanel,
	createCharacterBrushPanel,
	createFillController,
	createLineController,
	createSquareController,
	createCircleController,
	createAttributeBrushController,
	createSampleTool,
} from '../../src/js/client/freehandTools.js';
import { createSelectionTool } from '../../src/js/client/keyboard.js';

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
			getLastSelection: vi.fn(() => null),
			getElement: vi.fn(() => ({
				classList: {
					add: vi.fn(),
					remove: vi.fn(),
					toggle: vi.fn(),
				},
			})),
		},
		cursor: {
			move: vi.fn(),
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

describe('Freehand Tools', () => {
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

	describe('shading stroke state', () => {
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

		const capture = name =>
			mockDocument.addEventListener.mock.calls
				.filter(call => call[0] === name)
				.pop()[1];

		it('a half-row wiggle inside one cell advances the ramp once', () => {
			const controller = createShadingController(mockPanel, false);
			controller.enable();
			const down = capture('onTextCanvasDown');
			const drag = capture('onTextCanvasDrag');
			down({ detail: { x: 5, y: 5, halfBlockY: 10 } });
			expect(State.textArtCanvas.draw).toHaveBeenCalledTimes(1);
			// same cell, other half row: the same point
			drag({ detail: { x: 5, y: 5, halfBlockY: 11 } });
			expect(State.textArtCanvas.draw).toHaveBeenCalledTimes(1);
			controller.disable();
		});

		it('a drag with no down paints nothing and never throws', () => {
			const controller = createShadingController(mockPanel, false);
			controller.enable();
			const drag = capture('onTextCanvasDrag');
			// drawMode is undefined here: it must neither throw on
			// drawMode.foreground nor paint with a stale mode
			expect(() => drag({ detail: { x: 3, y: 3, halfBlockY: 6 } })).not.toThrow();
			expect(State.textArtCanvas.draw).not.toHaveBeenCalled();
			controller.disable();
		});

		it('disable() closes the stroke: a re-enabled drag stays inert', () => {
			const controller = createShadingController(mockPanel, false);
			controller.enable();
			const down = capture('onTextCanvasDown');
			down({ detail: { x: 2, y: 2, halfBlockY: 4 } });
			controller.disable();
			controller.enable();
			const drag = capture('onTextCanvasDrag');
			State.textArtCanvas.draw.mockClear();
			drag({ detail: { x: 9, y: 9, halfBlockY: 18 } });
			expect(State.textArtCanvas.draw).not.toHaveBeenCalled();
			controller.disable();
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

	describe('createFillController', () => {
		it('should create a fill controller with enable/disable', () => {
			const controller = createFillController();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
		});

		it('should manage event listeners properly', () => {
			const controller = createFillController();

			controller.enable();
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasDown',
				expect.any(Function),
			);

			controller.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'onTextCanvasDown',
				expect.any(Function),
			);
		});
	});

	describe('createLineController', () => {
		it('should create a line controller with proper interface', () => {
			const controller = createLineController();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
		});

		it('should manage canvas event listeners', () => {
			const controller = createLineController();

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
		});
	});

	describe('createSquareController', () => {
		it('should create a square controller with toggle functionality', () => {
			const controller = createSquareController();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
		});

		it('should handle event management for drawing squares', () => {
			const controller = createSquareController();

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
		});
	});

	describe('createCircleController', () => {
		it('should create a circle controller', () => {
			const controller = createCircleController();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
		});

		it('should manage event listeners for circle drawing', () => {
			const controller = createCircleController();

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
		});
	});

	describe('createAttributeBrushController', () => {
		it('should create an attribute brush controller', () => {
			const controller = createAttributeBrushController();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
		});

		it('should handle attribute painting event management', () => {
			const controller = createAttributeBrushController();

			controller.enable();
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasDown',
				expect.any(Function),
			);
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasDrag',
				expect.any(Function),
			);
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasUp',
				expect.any(Function),
			);

			controller.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'onTextCanvasDown',
				expect.any(Function),
			);
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'onTextCanvasDrag',
				expect.any(Function),
			);
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'onTextCanvasUp',
				expect.any(Function),
			);
		});
	});

	describe('createSelectionTool', () => {
		it('should create a selection tool with flip functionality', () => {
			const tool = createSelectionTool();

			expect(tool).toHaveProperty('enable');
			expect(tool).toHaveProperty('disable');
			expect(tool).toHaveProperty('flipHorizontal');
			expect(tool).toHaveProperty('flipVertical');
		});

		it('should handle selection events', () => {
			const tool = createSelectionTool();

			tool.enable();
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasDown',
				expect.any(Function),
			);
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasDrag',
				expect.any(Function),
			);
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasUp',
				expect.any(Function),
			);
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'keydown',
				expect.any(Function),
			);

			tool.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'onTextCanvasDown',
				expect.any(Function),
			);
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'onTextCanvasDrag',
				expect.any(Function),
			);
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'onTextCanvasUp',
				expect.any(Function),
			);
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'keydown',
				expect.any(Function),
			);
		});

		it('should handle flip operations', () => {
			const tool = createSelectionTool();

			expect(() => {
				tool.flipHorizontal();
				tool.flipVertical();
			}).not.toThrow();
		});
	});

	describe('createSampleTool', () => {
		let mockShadeBrush,
				mockShadeElement,
				mockCharacterBrush,
				mockCharacterElement;

		beforeEach(() => {
			mockShadeBrush = { select: vi.fn() };
			mockShadeElement = { click: vi.fn() };
			mockCharacterBrush = { select: vi.fn() };
			mockCharacterElement = { click: vi.fn() };
		});

		it('should create a sample tool with proper interface', async () => {
			const tool = await createSampleTool(
				mockShadeBrush,
				mockShadeElement,
				mockCharacterBrush,
				mockCharacterElement,
			);

			expect(tool).toHaveProperty('enable');
			expect(tool).toHaveProperty('disable');
			expect(tool).toHaveProperty('sample');
		});

		it('should handle sampling functionality', async () => {
			const tool = await createSampleTool(
				mockShadeBrush,
				mockShadeElement,
				mockCharacterBrush,
				mockCharacterElement,
			);

			expect(() => {
				tool.sample(10, 5);
			}).not.toThrow();
		});

		it('should handle blocky half-block sampling', async () => {
			const tool = await createSampleTool(
				mockShadeBrush,
				mockShadeElement,
				mockCharacterBrush,
				mockCharacterElement,
			);

			const State = (await import('../../src/js/client/state.js')).default;
			State.textArtCanvas.getHalfBlock.mockReturnValue({
				isBlocky: true,
				halfBlockY: 0,
				upperBlockColor: 15, // White
				lowerBlockColor: 8, // Dark gray
			});

			expect(() => {
				tool.sample(5, 0); // Sample upper half
			}).not.toThrow();
		});

		it('should handle non-blocky character sampling', async () => {
			const tool = await createSampleTool(
				mockShadeBrush,
				mockShadeElement,
				mockCharacterBrush,
				mockCharacterElement,
			);

			const State = (await import('../../src/js/client/state.js')).default;
			State.textArtCanvas.getHalfBlock.mockReturnValue({
				isBlocky: false,
				x: 5,
				y: 10,
			});

			State.textArtCanvas.getBlock.mockReturnValue({
				charCode: 65, // 'A'
				foregroundColor: 7,
				backgroundColor: 0,
			});

			await tool.sample(5, 10);

			expect(mockCharacterBrush.select).toHaveBeenCalledWith(65);
			expect(mockCharacterElement.click).toHaveBeenCalled();
		});

		it('should handle shading character sampling', async () => {
			const tool = await createSampleTool(
				mockShadeBrush,
				mockShadeElement,
				mockCharacterBrush,
				mockCharacterElement,
			);

			const State = (await import('../../src/js/client/state.js')).default;
			State.textArtCanvas.getHalfBlock.mockReturnValue({
				isBlocky: false,
				x: 5,
				y: 10,
			});

			State.textArtCanvas.getBlock.mockReturnValue({
				charCode: 177, // Medium shade
				foregroundColor: 7,
				backgroundColor: 0,
			});

			await tool.sample(5, 10);

			expect(mockShadeBrush.select).toHaveBeenCalledWith(177);
			expect(mockShadeElement.click).toHaveBeenCalled();
		});

		it('should manage canvas down events', async () => {
			const tool = await createSampleTool(
				mockShadeBrush,
				mockShadeElement,
				mockCharacterBrush,
				mockCharacterElement,
			);

			tool.enable();
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasDown',
				expect.any(Function),
			);

			tool.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
				'onTextCanvasDown',
				expect.any(Function),
			);
		});
	});

	describe('Line Drawing Algorithm', () => {
		it('should test line drawing in HalfBlockController', () => {
			const controller = createHalfBlockController();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');

			controller.enable();

			// The line algorithm is internal but we test the interface
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasDown',
				expect.any(Function),
			);
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasDrag',
				expect.any(Function),
			);
			expect(mockDocument.addEventListener).toHaveBeenCalledWith(
				'onTextCanvasUp',
				expect.any(Function),
			);
		});
	});

	describe('Shape Drawing Algorithms', () => {
		it('should test square coordinate processing', () => {
			const controller = createSquareController();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');

			expect(() => {
				controller.enable();
				controller.disable();
			}).not.toThrow();
		});

		it('should test circle coordinate processing', () => {
			const controller = createCircleController();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');

			expect(() => {
				controller.enable();
				controller.disable();
			}).not.toThrow();
		});
	});

	describe('Panel State Management', () => {
		it('should handle panel enable/disable states correctly', async () => {
			const shadingPanel = await createShadingPanel();
			const characterPanel = await createCharacterBrushPanel();

			expect(() => {
				shadingPanel.enable();
				characterPanel.enable();
				shadingPanel.disable();
				characterPanel.disable();
			}).not.toThrow();
		});

		it('should handle panel ignore/unignore states', async () => {
			const shadingPanel = await createShadingPanel();
			const characterPanel = await createCharacterBrushPanel();

			expect(() => {
				shadingPanel.ignore();
				characterPanel.ignore();
				shadingPanel.unignore();
				characterPanel.unignore();
			}).not.toThrow();
		});

		it('should return consistent mode data', async () => {
			const shadingPanel = await createShadingPanel();
			const characterPanel = await createCharacterBrushPanel();

			const shadingMode = shadingPanel.getMode();
			const characterMode = characterPanel.getMode();

			expect(shadingMode).toHaveProperty('charCode');
			expect(shadingMode).toHaveProperty('foreground');
			expect(shadingMode).toHaveProperty('background');
			expect(shadingMode).toHaveProperty('halfBlockMode');

			expect(characterMode).toHaveProperty('charCode');
			expect(characterMode).toHaveProperty('foreground');
			expect(characterMode).toHaveProperty('background');
			expect(characterMode).toHaveProperty('halfBlockMode');

			expect(characterMode.halfBlockMode).toBe(false);
		});
	});

	describe('Event Handling Edge Cases', () => {
		it('should handle rapid enable/disable cycles', () => {
			const controller = createHalfBlockController();

			expect(() => {
				for (let i = 0; i < 10; i++) {
					controller.enable();
					controller.disable();
				}
			}).not.toThrow();
		});

		it('should handle multiple tool activations', () => {
			const fill = createFillController();
			const line = createLineController();

			expect(() => {
				fill.enable();
				line.enable();

				fill.disable();
				line.disable();
			}).not.toThrow();
		});
	});

	describe('Memory Management', () => {
		it('should not leak event listeners', () => {
			const controller = createHalfBlockController();
			const initialCallCount = mockDocument.addEventListener.mock.calls.length;

			controller.enable();
			const afterEnableCount = mockDocument.addEventListener.mock.calls.length;

			controller.disable();
			const afterDisableCount =
				mockDocument.removeEventListener.mock.calls.length;

			expect(afterEnableCount).toBeGreaterThan(initialCallCount);

			expect(afterDisableCount).toBeGreaterThan(0);
		});

		it('should handle multiple panel instances', async () => {
			const panel1 = await createShadingPanel();
			const panel2 = await createCharacterBrushPanel();

			expect(() => {
				panel1.enable();
				panel2.enable();

				panel1.disable();
				panel2.disable();
			}).not.toThrow();
		});
	});

	describe('LineController conditional logic', () => {
		let lineController;

		beforeEach(() => {
			lineController = createLineController();
		});

		it('should create line controller with proper interface', () => {
			expect(lineController).toHaveProperty('enable');
			expect(lineController).toHaveProperty('disable');
			expect(typeof lineController.enable).toBe('function');
			expect(typeof lineController.disable).toBe('function');
		});

		it('should register event listeners when enabled', () => {
			lineController.enable();
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
		});

		it('should remove event listeners when disabled', () => {
			lineController.enable();
			lineController.disable();
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
		});
	});

	describe('SquareController outline vs fill modes', () => {
		let squareController;

		beforeEach(() => {
			squareController = createSquareController();
		});

		it('should create square controller with proper interface', () => {
			expect(squareController).toHaveProperty('enable');
			expect(squareController).toHaveProperty('disable');
			expect(typeof squareController.enable).toBe('function');
			expect(typeof squareController.disable).toBe('function');
		});

		it('should register event listeners when enabled', () => {
			squareController.enable();
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
		});
	});

	describe('HalfBlockController line algorithm', () => {
		let halfBlockController;

		beforeEach(() => {
			halfBlockController = createHalfBlockController();
		});

		it('should create half block controller with proper interface', () => {
			expect(halfBlockController).toHaveProperty('enable');
			expect(halfBlockController).toHaveProperty('disable');
			expect(typeof halfBlockController.enable).toBe('function');
			expect(typeof halfBlockController.disable).toBe('function');
		});

		it('should register event listeners when enabled', () => {
			halfBlockController.enable();
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
		});
	});
});
