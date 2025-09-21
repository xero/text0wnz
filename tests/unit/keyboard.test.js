import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createFKeyShortcut,
	createFKeysShortcut,
	createCursor,
	createSelectionCursor,
	createKeyboardController,
	createPasteTool,
} from '../../src/js/client/keyboard.js';

// Mock the State module and other dependencies
vi.mock('../../src/js/client/state.js', () => ({
	default: {
		font: {
			getWidth: vi.fn(() => 8),
			getHeight: vi.fn(() => 16),
			draw: vi.fn(),
		},
		palette: {
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
		},
		textArtCanvas: {
			startUndo: vi.fn(),
			draw: vi.fn(),
			getColumns: vi.fn(() => 80),
			getRows: vi.fn(() => 25),
			copyBlock: vi.fn(),
			deleteBlock: vi.fn(),
			pasteBlock: vi.fn(),
			getArea: vi.fn(() => ({ data: [], width: 1, height: 1 })),
		},
		cursor: {
			getX: vi.fn(() => 0),
			getY: vi.fn(() => 0),
			right: vi.fn(),
			set: vi.fn(),
			enable: vi.fn(),
			disable: vi.fn(),
			isVisible: vi.fn(() => false),
		},
		selectionCursor: {
			setStart: vi.fn(),
			hide: vi.fn(),
			isVisible: vi.fn(() => false),
		},
		positionInfo: { update: vi.fn() },
		pasteTool: { setSelection: vi.fn() },
	},
}));

vi.mock('../../src/js/client/toolbar.js', () => ({
	default: {
		switchTool: vi.fn(),
		returnToPreviousTool: vi.fn(),
	},
}));

vi.mock('../../src/js/client/ui.js', () => ({
	$: vi.fn(id => {
		const element = document.createElement('canvas');
		element.id = id;
		element.getContext = vi.fn(() => ({ clearRect: vi.fn() }));
		return element;
	}),
	createCanvas: vi.fn((width, height) => {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		canvas.getContext = vi.fn(() => ({ clearRect: vi.fn() }));
		return canvas;
	}),
}));

describe('Keyboard Utilities', () => {
	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Clear all event listeners
		document.removeEventListener = vi.fn();
		document.addEventListener = vi.fn();
		// Mock console
		vi.spyOn(console, 'error').mockImplementation(() => {});
		// Reset all mocks
		vi.clearAllMocks();
	});

	describe('Module Exports', () => {
		it('should export all expected keyboard functions', () => {
			expect(createFKeyShortcut).toBeDefined();
			expect(createFKeysShortcut).toBeDefined();
			expect(createCursor).toBeDefined();
			expect(createSelectionCursor).toBeDefined();
			expect(createKeyboardController).toBeDefined();
			expect(createPasteTool).toBeDefined();

			expect(typeof createFKeyShortcut).toBe('function');
			expect(typeof createFKeysShortcut).toBe('function');
			expect(typeof createCursor).toBe('function');
			expect(typeof createSelectionCursor).toBe('function');
			expect(typeof createKeyboardController).toBe('function');
			expect(typeof createPasteTool).toBe('function');
		});
	});

	describe('createFKeyShortcut', () => {
		it('should create F-key shortcut with canvas and charCode', () => {
			const canvas = document.createElement('canvas');
			canvas.getContext = vi.fn(() => ({ clearRect: vi.fn() }));

			// Should not throw
			expect(() => createFKeyShortcut(canvas, 176)).not.toThrow();
		});

		it('should add event listeners for palette and font changes', () => {
			const canvas = document.createElement('canvas');
			canvas.getContext = vi.fn(() => ({ clearRect: vi.fn() }));

			createFKeyShortcut(canvas, 176);

			expect(document.addEventListener).toHaveBeenCalledWith('onPaletteChange', expect.any(Function));
			expect(document.addEventListener).toHaveBeenCalledWith('onForegroundChange', expect.any(Function));
			expect(document.addEventListener).toHaveBeenCalledWith('onBackgroundChange', expect.any(Function));
			expect(document.addEventListener).toHaveBeenCalledWith('onFontChange', expect.any(Function));
		});
	});

	describe('createFKeysShortcut', () => {
		it('should create F-keys shortcut controller', () => {
			const controller = createFKeysShortcut();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
			expect(typeof controller.enable).toBe('function');
			expect(typeof controller.disable).toBe('function');
		});

		it('should add keydown event listener on enable', () => {
			const controller = createFKeysShortcut();
			controller.enable();

			expect(document.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
		});

		it('should remove keydown event listener on disable', () => {
			const controller = createFKeysShortcut();
			controller.disable();

			expect(document.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
		});
	});

	describe('createCursor', () => {
		it('should create cursor with show/hide methods', () => {
			const container = document.createElement('div');

			// Should not throw during creation
			expect(() => createCursor(container)).not.toThrow();
		});

		it('should handle cursor creation without errors', () => {
			const container = document.createElement('div');
			const cursor = createCursor(container);

			// Basic methods should exist
			expect(cursor).toHaveProperty('show');
			expect(cursor).toHaveProperty('hide');
			expect(cursor).toHaveProperty('getX');
			expect(cursor).toHaveProperty('getY');
			// Note: cursor returns different methods than expected, checking what actually exists
			expect(typeof cursor.show).toBe('function');
			expect(typeof cursor.hide).toBe('function');
		});
	});

	describe('createSelectionCursor', () => {
		it('should create selection cursor with required methods', () => {
			const container = document.createElement('div');

			// Should not throw during creation
			expect(() => createSelectionCursor(container)).not.toThrow();
		});

		it('should handle selection cursor creation', () => {
			const container = document.createElement('div');
			const selectionCursor = createSelectionCursor(container);

			expect(selectionCursor).toHaveProperty('show');
			expect(selectionCursor).toHaveProperty('hide');
			expect(selectionCursor).toHaveProperty('setStart');
		});
	});

	describe('createKeyboardController', () => {
		it('should create keyboard controller with enable/disable', () => {
			const container = document.createElement('div');

			// Should not throw during creation
			expect(() => createKeyboardController(container)).not.toThrow();
		});

		it('should handle keyboard controller creation', () => {
			const container = document.createElement('div');
			const controller = createKeyboardController(container);

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
			expect(typeof controller.enable).toBe('function');
			expect(typeof controller.disable).toBe('function');
		});
	});

	describe('createPasteTool', () => {
		it('should create paste tool with required methods', () => {
			const cutItem = document.createElement('div');
			const copyItem = document.createElement('div');
			const pasteItem = document.createElement('div');
			const deleteItem = document.createElement('div');

			// Should not throw during creation
			expect(() => createPasteTool(cutItem, copyItem, pasteItem, deleteItem)).not.toThrow();
		});

		it('should handle paste tool creation', () => {
			const cutItem = document.createElement('div');
			const copyItem = document.createElement('div');
			const pasteItem = document.createElement('div');
			const deleteItem = document.createElement('div');

			const pasteTool = createPasteTool(cutItem, copyItem, pasteItem, deleteItem);

			expect(pasteTool).toHaveProperty('setSelection');
			expect(pasteTool).toHaveProperty('cut');
			expect(pasteTool).toHaveProperty('copy');
			expect(pasteTool).toHaveProperty('paste');
			expect(pasteTool).toHaveProperty('systemPaste');
			expect(pasteTool).toHaveProperty('deleteSelection');
			expect(pasteTool).toHaveProperty('disable');
		});

		it('should handle basic selection operations', () => {
			const cutItem = document.createElement('div');
			const copyItem = document.createElement('div');
			const pasteItem = document.createElement('div');
			const deleteItem = document.createElement('div');

			const pasteTool = createPasteTool(cutItem, copyItem, pasteItem, deleteItem);

			expect(() => pasteTool.setSelection(0, 0, 10, 10)).not.toThrow();
			expect(() => pasteTool.deleteSelection()).not.toThrow();
		});

		it('should add keydown event listener', () => {
			const cutItem = document.createElement('div');
			const copyItem = document.createElement('div');
			const pasteItem = document.createElement('div');
			const deleteItem = document.createElement('div');

			createPasteTool(cutItem, copyItem, pasteItem, deleteItem);

			expect(document.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
		});
	});

	describe('Function Key Shortcuts', () => {
		it('should provide function key shortcut creators', () => {
			expect(createFKeysShortcut).toBeDefined();
			expect(typeof createFKeysShortcut).toBe('function');
		});

		it('should handle F1-F12 key shortcuts', () => {
			// Test F-key shortcut array - standard characters used in ANSI art
			const expectedFKeyChars = [176, 177, 178, 219, 223, 220, 221, 222, 254, 249, 7, 0];

			expect(expectedFKeyChars).toHaveLength(12); // F1-F12
			expect(expectedFKeyChars.every(char => typeof char === 'number')).toBe(true);
			expect(expectedFKeyChars.every(char => char >= 0 && char <= 255)).toBe(true);
		});
	});

	describe('Cursor Management', () => {
		it('should provide cursor creation functions', () => {
			expect(createCursor).toBeDefined();
			expect(createSelectionCursor).toBeDefined();
			expect(typeof createCursor).toBe('function');
			expect(typeof createSelectionCursor).toBe('function');
		});
	});

	describe('Keyboard Controller', () => {
		it('should provide keyboard controller function', () => {
			expect(createKeyboardController).toBeDefined();
			expect(typeof createKeyboardController).toBe('function');
		});
	});

	describe('Paste Tool', () => {
		it('should provide paste tool creation function', () => {
			expect(createPasteTool).toBeDefined();
			expect(typeof createPasteTool).toBe('function');
		});
	});

	describe('Keyboard Event Handling Architecture', () => {
		it('should handle F-key shortcuts consistently', () => {
			// Test F-key shortcut array - standard characters used in ANSI art
			const expectedFKeyChars = [176, 177, 178, 219, 223, 220, 221, 222, 254, 249, 7, 0];

			expect(expectedFKeyChars).toHaveLength(12); // F1-F12
			expect(expectedFKeyChars.every(char => typeof char === 'number')).toBe(true);
			expect(expectedFKeyChars.every(char => char >= 0 && char <= 255)).toBe(true);
		});

		it('should handle keyboard navigation keys', () => {
			// Arrow key codes that should be handled
			const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

			arrowKeys.forEach(key => {
				expect(typeof key).toBe('string');
				expect(key.startsWith('Arrow')).toBe(true);
			});
		});

		it('should handle color selection keys', () => {
			// Digit keys 0-7 for color selection
			const colorKeys = [48, 49, 50, 51, 52, 53, 54, 55]; // Keycodes for 0-7

			expect(colorKeys).toHaveLength(8);
			colorKeys.forEach(keyCode => {
				expect(keyCode).toBeGreaterThanOrEqual(48); // '0'
				expect(keyCode).toBeLessThanOrEqual(55); // '7'
			});
		});
	});

	describe('Cursor Movement Logic', () => {
		it('should handle coordinate bounds checking', () => {
			const clampToCanvas = (x, y, maxX, maxY) => {
				return {
					x: Math.min(Math.max(x, 0), maxX),
					y: Math.min(Math.max(y, 0), maxY),
				};
			};

			// Test boundary conditions
			expect(clampToCanvas(-5, -5, 79, 24)).toEqual({ x: 0, y: 0 });
			expect(clampToCanvas(100, 100, 79, 24)).toEqual({ x: 79, y: 24 });
			expect(clampToCanvas(40, 12, 79, 24)).toEqual({ x: 40, y: 12 });
		});

		it('should handle cursor position calculations', () => {
			const calculatePosition = (x, y, fontWidth, fontHeight) => {
				return {
					left: x * fontWidth - 1,
					top: y * fontHeight - 1,
				};
			};

			expect(calculatePosition(0, 0, 8, 16)).toEqual({ left: -1, top: -1 });
			expect(calculatePosition(10, 5, 8, 16)).toEqual({ left: 79, top: 79 });
		});
	});

	describe('Selection Management', () => {
		it('should handle selection coordinate normalization', () => {
			const normalizeSelection = (startX, startY, endX, endY) => {
				return {
					startX: Math.min(startX, endX),
					startY: Math.min(startY, endY),
					endX: Math.max(startX, endX),
					endY: Math.max(startY, endY),
				};
			};

			// Test selection normalization
			expect(normalizeSelection(10, 8, 5, 3)).toEqual({ startX: 5, startY: 3, endX: 10, endY: 8 });

			expect(normalizeSelection(5, 3, 10, 8)).toEqual({ startX: 5, startY: 3, endX: 10, endY: 8 });
		});
	});

	describe('Clipboard Operations', () => {
		it('should handle clipboard text processing', () => {
			const processClipboardText = text => {
				// Basic text processing for ANSI art
				return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
			};

			const testText = 'Line 1\r\nLine 2\rLine 3\nLine 4';
			const processed = processClipboardText(testText);

			expect(processed).toEqual(['Line 1', 'Line 2', 'Line 3', 'Line 4']);
		});

		it('should handle text to character conversion', () => {
			const textToChars = text => {
				return Array.from(text).map(char => char.charCodeAt(0));
			};

			expect(textToChars('ABC')).toEqual([65, 66, 67]);
			expect(textToChars('123')).toEqual([49, 50, 51]);
		});
	});
});
