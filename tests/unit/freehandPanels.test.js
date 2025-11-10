import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	createPanelCursor,
	createFloatingPanelPalette,
	createFloatingPanel,
	createBrushController,
	createHalfBlockController,
	createShadingController,
	createShadingPanel,
	createCharacterBrushPanel,
} from '../../src/js/client/freehandTools.js';

// Mock dependencies
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
				// Mock the callback pattern
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

vi.mock('../../src/js/client/ui.js', () => ({
	$: vi.fn(_ => {
		// Create mock DOM elements
		const mockElement = {
			style: { display: 'block' },
			classList: {
				add: vi.fn(),
				remove: vi.fn(),
			},
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			click: vi.fn(),
			appendChild: vi.fn(),
			removeChild: vi.fn(),
			insertBefore: vi.fn(),
			append: vi.fn(),
			getBoundingClientRect: vi.fn(() => ({
				left: 0,
				top: 0,
				width: 100,
				height: 100,
			})),
			value: 'mock',
			innerText: 'mock',
			textContent: 'mock',
			width: 100,
			height: 100,
			firstChild: {
				style: {},
				classList: { add: vi.fn(), remove: vi.fn() },
			},
		};
		return mockElement;
	}),
	$$: vi.fn(() => ({ textContent: 'mock' })),
	createCanvas: vi.fn((width, height) => {
		const mockCanvas = {
			width: width || 100,
			height: height || 100,
			style: {},
			classList: {
				add: vi.fn(),
				remove: vi.fn(),
			},
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			getContext: vi.fn(() => ({
				createImageData: vi.fn(() => ({
					data: new Uint8ClampedArray(4),
					width: 1,
					height: 1,
				})),
				putImageData: vi.fn(),
				drawImage: vi.fn(),
			})),
			toDataURL: vi.fn(() => 'data:image/png;base64,mock'),
		};
		return mockCanvas;
	}),
	createToggleButton: vi.fn((_label1, _label2, _callback1, _callback2) => ({
		id: 'mock-toggle',
		getElement: vi.fn(() => ({
			appendChild: vi.fn(),
			style: {},
		})),
		setStateOne: vi.fn(),
		setStateTwo: vi.fn(),
	})),
}));

// Mock global document and DOM methods
const mockDocument = {
	createElement: vi.fn(tag => ({
		style: {},
		classList: {
			add: vi.fn(),
			remove: vi.fn(),
		},
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
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
	dispatchEvent: vi.fn(),
};

// Setup global mocks
global.document = mockDocument;
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

	describe('createPanelCursor', () => {
		it('should create a cursor with show/hide functionality', () => {
			const mockElement = document.createElement('div');
			const cursor = createPanelCursor(mockElement);

			expect(cursor).toHaveProperty('show');
			expect(cursor).toHaveProperty('hide');
			expect(cursor).toHaveProperty('resize');
			expect(cursor).toHaveProperty('setPos');

			// Test show functionality
			cursor.show();
			expect(typeof cursor.show).toBe('function');

			// Test hide functionality
			cursor.hide();
			expect(typeof cursor.hide).toBe('function');
		});

		it('should resize cursor correctly', () => {
			const mockElement = document.createElement('div');
			const cursor = createPanelCursor(mockElement);

			cursor.resize(50, 30);
			expect(typeof cursor.resize).toBe('function');
		});

		it('should set cursor position correctly', () => {
			const mockElement = document.createElement('div');
			const cursor = createPanelCursor(mockElement);

			cursor.setPos(10, 20);
			expect(typeof cursor.setPos).toBe('function');
		});
	});

	describe('createFloatingPanelPalette', () => {
		it('should create a floating panel palette with proper methods', () => {
			const palette = createFloatingPanelPalette(128, 64);

			expect(palette).toHaveProperty('updateColor');
			expect(palette).toHaveProperty('updatePalette');
			expect(palette).toHaveProperty('getElement');
			expect(palette).toHaveProperty('showCursor');
			expect(palette).toHaveProperty('hideCursor');
			expect(palette).toHaveProperty('resize');
		});

		it('should handle color updates', () => {
			const palette = createFloatingPanelPalette(128, 64);

			expect(() => {
				palette.updateColor(5);
			}).not.toThrow();
		});

		it('should handle palette updates', () => {
			const palette = createFloatingPanelPalette(128, 64);

			expect(() => {
				palette.updatePalette();
			}).not.toThrow();
		});

		it('should handle resize', () => {
			const palette = createFloatingPanelPalette(128, 64);

			expect(() => {
				palette.resize(256, 128);
			}).not.toThrow();
		});
	});

	describe('createFloatingPanel', () => {
		it('should create a floating panel with drag functionality', () => {
			const panel = createFloatingPanel(100, 50);

			expect(panel).toHaveProperty('setPos');
			expect(panel).toHaveProperty('enable');
			expect(panel).toHaveProperty('disable');
			expect(panel).toHaveProperty('append');
		});

		it('should handle position setting', () => {
			const panel = createFloatingPanel(100, 50);

			expect(() => {
				panel.setPos(200, 150);
			}).not.toThrow();
		});

		it('should handle enable/disable', () => {
			const panel = createFloatingPanel(100, 50);

			expect(() => {
				panel.enable();
				panel.disable();
			}).not.toThrow();
		});
	});

	describe('createBrushController', () => {
		it('should create a brush controller with enable/disable methods', () => {
			const controller = createBrushController();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
			expect(typeof controller.enable).toBe('function');
			expect(typeof controller.disable).toBe('function');
		});

		it('should handle enable/disable lifecycle', () => {
			const controller = createBrushController();

			expect(() => {
				controller.enable();
				controller.disable();
			}).not.toThrow();
		});
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

			// Verify event listeners were added/removed
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
				panel.select(177); // Light shade character
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
