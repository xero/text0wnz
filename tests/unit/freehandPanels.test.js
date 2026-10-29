import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
