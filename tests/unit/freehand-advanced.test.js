import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	createBrushController,
	createHalfBlockController,
	createShadingPanel,
	createFloatingPanelPalette,
	createCharacterBrushPanel,
	createFillController,
	createLineController,
	createSquareController,
	createCircleController,
	createSampleTool,
} from '../../src/js/client/freehand_tools.js';

// Mock dependencies
vi.mock('../../src/js/client/state.js', () => ({
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

describe('Freehand Tools - Advanced Tools and Algorithms', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
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

		it('should create a sample tool with proper interface', () => {
			const tool = createSampleTool(
				mockShadeBrush,
				mockShadeElement,
				mockCharacterBrush,
				mockCharacterElement,
			);

			expect(tool).toHaveProperty('enable');
			expect(tool).toHaveProperty('disable');
			expect(tool).toHaveProperty('sample');
		});

		it('should handle sampling functionality', () => {
			const tool = createSampleTool(
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
			const tool = createSampleTool(
				mockShadeBrush,
				mockShadeElement,
				mockCharacterBrush,
				mockCharacterElement,
			);

			// Mock blocky half block with specific colors
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
			const tool = createSampleTool(
				mockShadeBrush,
				mockShadeElement,
				mockCharacterBrush,
				mockCharacterElement,
			);

			// Mock non-blocky character - need to import State and modify mock
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

			// Test the sampling
			tool.sample(5, 10);

			// Should call appropriate brush selection
			expect(mockCharacterBrush.select).toHaveBeenCalledWith(65);
			expect(mockCharacterElement.click).toHaveBeenCalled();
		});

		it('should handle shading character sampling', async () => {
			const tool = createSampleTool(
				mockShadeBrush,
				mockShadeElement,
				mockCharacterBrush,
				mockCharacterElement,
			);

			// Mock shading character
			const State = (await import('../../src/js/client/state.js')).default;
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
			const tool = createSampleTool(
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

			// Test that controller can be created and used
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
			const afterDisableCount =
				mockDocument.removeEventListener.mock.calls.length;

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
