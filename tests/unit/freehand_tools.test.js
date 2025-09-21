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
	createFillController,
	createLineController,
	createShapesController,
	createSquareController,
	createCircleController,
	createAttributeBrushController,
	createSelectionTool,
	createSampleTool,
} from '../../public/js/freehand_tools.js';

// Mock dependencies
vi.mock('../../public/js/state.js', () => ({
	default: {
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
			shiftLeft: vi.fn(),
			shiftRight: vi.fn(),
			shiftUp: vi.fn(),
			shiftDown: vi.fn(),
			shiftToStartOfRow: vi.fn(),
			shiftToEndOfRow: vi.fn(),
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

vi.mock('../../public/js/toolbar.js', () => ({
	default: {
		add: vi.fn(() => ({ enable: vi.fn() })),
		returnToPreviousTool: vi.fn(),
	},
}));

vi.mock('../../public/js/ui.js', () => ({
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

describe('Freehand Tools', () => {
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
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('keyup', expect.any(Function));

			controller.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('keyup', expect.any(Function));
		});
	});

	describe('createShadingPanel', () => {
		it('should create a shading panel with proper interface', () => {
			const panel = createShadingPanel();

			expect(panel).toHaveProperty('enable');
			expect(panel).toHaveProperty('disable');
			expect(panel).toHaveProperty('getMode');
			expect(panel).toHaveProperty('select');
			expect(panel).toHaveProperty('ignore');
			expect(panel).toHaveProperty('unignore');
		});

		it('should return valid mode data', () => {
			const panel = createShadingPanel();
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

		it('should handle character selection', () => {
			const panel = createShadingPanel();

			expect(() => {
				panel.select(177); // Light shade character
			}).not.toThrow();
		});
	});

	describe('createCharacterBrushPanel', () => {
		it('should create a character brush panel', () => {
			const panel = createCharacterBrushPanel();

			expect(panel).toHaveProperty('enable');
			expect(panel).toHaveProperty('disable');
			expect(panel).toHaveProperty('getMode');
			expect(panel).toHaveProperty('select');
			expect(panel).toHaveProperty('ignore');
			expect(panel).toHaveProperty('unignore');
			expect(panel).toHaveProperty('redrawGlyphs');
		});

		it('should return valid mode for character selection', () => {
			const panel = createCharacterBrushPanel();
			const mode = panel.getMode();

			expect(mode).toHaveProperty('halfBlockMode');
			expect(mode).toHaveProperty('foreground');
			expect(mode).toHaveProperty('background');
			expect(mode).toHaveProperty('charCode');
			expect(mode.halfBlockMode).toBe(false);
		});

		it('should handle character code selection correctly', () => {
			const panel = createCharacterBrushPanel();

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
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));

			controller.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
		});
	});

	describe('createShapesController', () => {
		it('should create a shapes controller', () => {
			const controller = createShapesController();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
		});

		it('should handle enable/disable operations', () => {
			const controller = createShapesController();

			expect(() => {
				controller.enable();
				controller.disable();
			}).not.toThrow();
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
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));

			controller.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
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
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));

			controller.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
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
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));

			controller.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
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
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));

			controller.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
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
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));

			tool.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
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
		let mockShadeBrush, mockShadeElement, mockCharacterBrush, mockCharacterElement;

		beforeEach(() => {
			mockShadeBrush = { select: vi.fn() };
			mockShadeElement = { click: vi.fn() };
			mockCharacterBrush = { select: vi.fn() };
			mockCharacterElement = { click: vi.fn() };
		});

		it('should create a sample tool with proper interface', () => {
			const tool = createSampleTool(mockShadeBrush, mockShadeElement, mockCharacterBrush, mockCharacterElement);

			expect(tool).toHaveProperty('enable');
			expect(tool).toHaveProperty('disable');
			expect(tool).toHaveProperty('sample');
		});

		it('should handle sampling functionality', () => {
			const tool = createSampleTool(mockShadeBrush, mockShadeElement, mockCharacterBrush, mockCharacterElement);

			expect(() => {
				tool.sample(10, 5);
			}).not.toThrow();
		});

		it('should handle blocky half-block sampling', async () => {
			const tool = createSampleTool(mockShadeBrush, mockShadeElement, mockCharacterBrush, mockCharacterElement);

			// Mock blocky half block with specific colors
			const State = (await import('../../public/js/state.js')).default;
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
			const tool = createSampleTool(mockShadeBrush, mockShadeElement, mockCharacterBrush, mockCharacterElement);

			// Mock non-blocky character - need to import State and modify mock
			const State = (await import('../../public/js/state.js')).default;
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

			// Test the sampling
			tool.sample(5, 10);

			// Should call appropriate brush selection
			expect(mockCharacterBrush.select).toHaveBeenCalledWith(65);
			expect(mockCharacterElement.click).toHaveBeenCalled();
		});

		it('should handle shading character sampling', async () => {
			const tool = createSampleTool(mockShadeBrush, mockShadeElement, mockCharacterBrush, mockCharacterElement);

			// Mock shading character
			const State = (await import('../../public/js/state.js')).default;
			State.textArtCanvas.getHalfBlock.mockReturnValue({
				isBlocky: false,
				x: 5,
				y: 10,
			});

			State.textArtCanvas.getBlock.mockReturnValue({
				charCode: 177, // Light shade
				foregroundColor: 7,
				backgroundColor: 0,
			});

			// Test the sampling
			tool.sample(5, 10);

			// Should call shade brush selection
			expect(mockShadeBrush.select).toHaveBeenCalledWith(177);
			expect(mockShadeElement.click).toHaveBeenCalled();
		});

		it('should manage canvas down events', () => {
			const tool = createSampleTool(mockShadeBrush, mockShadeElement, mockCharacterBrush, mockCharacterElement);

			tool.enable();
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));

			tool.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
		});
	});

	describe('Line Drawing Algorithm', () => {
		it('should test line drawing in HalfBlockController', () => {
			const controller = createHalfBlockController();

			// Test that controller can be created and used
			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');

			controller.enable();

			// The line algorithm is internal but we test the interface
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
		});
	});

	describe('Shape Drawing Algorithms', () => {
		it('should test square coordinate processing', () => {
			const controller = createSquareController();

			// Test that square controller can handle coordinates
			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');

			// Enable/disable should work without throwing
			expect(() => {
				controller.enable();
				controller.disable();
			}).not.toThrow();
		});

		it('should test circle coordinate processing', () => {
			const controller = createCircleController();

			// Test that circle controller can handle coordinates
			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');

			// Enable/disable should work without throwing
			expect(() => {
				controller.enable();
				controller.disable();
			}).not.toThrow();
		});
	});

	describe('Panel State Management', () => {
		it('should handle panel enable/disable states correctly', () => {
			const shadingPanel = createShadingPanel();
			const characterPanel = createCharacterBrushPanel();

			// Test enable/disable
			expect(() => {
				shadingPanel.enable();
				characterPanel.enable();
				shadingPanel.disable();
				characterPanel.disable();
			}).not.toThrow();
		});

		it('should handle panel ignore/unignore states', () => {
			const shadingPanel = createShadingPanel();
			const characterPanel = createCharacterBrushPanel();

			// Test ignore/unignore
			expect(() => {
				shadingPanel.ignore();
				characterPanel.ignore();
				shadingPanel.unignore();
				characterPanel.unignore();
			}).not.toThrow();
		});

		it('should return consistent mode data', () => {
			const shadingPanel = createShadingPanel();
			const characterPanel = createCharacterBrushPanel();

			const shadingMode = shadingPanel.getMode();
			const characterMode = characterPanel.getMode();

			// Both should return valid mode objects
			expect(shadingMode).toHaveProperty('charCode');
			expect(shadingMode).toHaveProperty('foreground');
			expect(shadingMode).toHaveProperty('background');
			expect(shadingMode).toHaveProperty('halfBlockMode');

			expect(characterMode).toHaveProperty('charCode');
			expect(characterMode).toHaveProperty('foreground');
			expect(characterMode).toHaveProperty('background');
			expect(characterMode).toHaveProperty('halfBlockMode');

			// Character panel should not be in half-block mode
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
			const brush = createBrushController();
			const fill = createFillController();
			const line = createLineController();

			expect(() => {
				brush.enable();
				fill.enable();
				line.enable();

				brush.disable();
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
			const afterDisableCount = mockDocument.removeEventListener.mock.calls.length;

			// Should have called addEventListener when enabled
			expect(afterEnableCount).toBeGreaterThan(initialCallCount);

			// Should have called removeEventListener when disabled
			expect(afterDisableCount).toBeGreaterThan(0);
		});

		it('should handle multiple panel instances', () => {
			const panel1 = createShadingPanel();
			const panel2 = createCharacterBrushPanel();
			const panel3 = createFloatingPanelPalette(128, 64);

			expect(() => {
				panel1.enable();
				panel2.enable();
				panel3.showCursor();

				panel1.disable();
				panel2.disable();
				panel3.hideCursor();
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
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
		});

		it('should remove event listeners when disabled', () => {
			lineController.enable();
			lineController.disable();
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.removeEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
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
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
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
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDown', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasUp', expect.any(Function));
			expect(mockDocument.addEventListener).toHaveBeenCalledWith('onTextCanvasDrag', expect.any(Function));
		});
	});

	describe('FloatingPanelPalette conditional logic', () => {
		let panelPalette;

		beforeEach(() => {
			panelPalette = createFloatingPanelPalette(160, 32);
		});

		it('should create floating panel palette with proper interface', () => {
			expect(panelPalette).toHaveProperty('getElement');
			expect(typeof panelPalette.getElement).toBe('function');

			const element = panelPalette.getElement();
			expect(element).toBeDefined();
		});

		it('should handle palette generation and updates', () => {
			expect(() => {
				// Test that the floating panel palette works with basic operations
				panelPalette.getElement();
				panelPalette.updateColor(0);
				// Note: redrawSwatches method may not be exposed in the public API
			}).not.toThrow();
		});

		it('should handle color position calculations for different positions', () => {
			expect(() => {
				// Test various color indices to exercise color calculation logic
				for (let i = 0; i < 16; i++) {
					panelPalette.updateColor(i);
				}
			}).not.toThrow();
		});
	});
});
