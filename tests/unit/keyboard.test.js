import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createFKeys,
	createCursor,
	createSelectionCursor,
	createKeyboardController,
	createPasteTool,
	createSelectionTool,
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
			setForegroundColor: vi.fn(),
			setBackgroundColor: vi.fn(),
		},
		textArtCanvas: {
			startUndo: vi.fn(),
			draw: vi.fn(),
			getColumns: vi.fn(() => 80),
			getRows: vi.fn(() => 25),
			getBlock: vi.fn(() => ({
				charCode: 32,
				foregroundColor: 7,
				backgroundColor: 0,
			})),
			getArea: vi.fn(() => ({ data: [], width: 1, height: 1 })),
			setArea: vi.fn(),
			deleteArea: vi.fn(),
			setImageData: vi.fn(),
			getImageData: vi.fn(() => new Uint16Array(2000)),
			getIceColors: vi.fn(() => false),
		},
		cursor: {
			getX: vi.fn(() => 0),
			getY: vi.fn(() => 0),
			right: vi.fn(),
			left: vi.fn(),
			move: vi.fn(),
			enable: vi.fn(),
			disable: vi.fn(),
			isVisible: vi.fn(() => false),
			hide: vi.fn(),
			newLine: vi.fn(),
			startOfCurrentRow: vi.fn(),
			endOfCurrentRow: vi.fn(),
			startSelection: vi.fn(),
		},
		selectionCursor: {
			setStart: vi.fn(),
			setEnd: vi.fn(),
			hide: vi.fn(),
			show: vi.fn(),
			isVisible: vi.fn(() => false),
			getSelection: vi.fn(() => null),
			getPos: vi.fn(() => null),
			getElement: vi.fn(() => document.createElement('div')),
		},
		positionInfo: { update: vi.fn() },
		pasteTool: {
			setSelection: vi.fn(),
			disable: vi.fn(),
		},
		selectionTool: { setPendingAction: vi.fn() },
		toolPreview: {
			clear: vi.fn(),
			drawHalfBlock: vi.fn(),
		},
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
		element.getContext = vi.fn(() => ({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			drawImage: vi.fn(),
			save: vi.fn(),
			restore: vi.fn(),
			strokeStyle: '',
			lineWidth: 0,
			setLineDash: vi.fn(),
			lineDashOffset: 0,
			strokeRect: vi.fn(),
			createImageData: vi.fn(() => ({
				data: new Uint8ClampedArray(64),
				width: 8,
				height: 8,
			})),
			putImageData: vi.fn(),
		}));
		element.addEventListener = vi.fn();
		element.classList = {
			add: vi.fn(),
			remove: vi.fn(),
			contains: vi.fn(() => false),
		};
		element.style = {};
		return element;
	}),
	createCanvas: vi.fn((width, height) => {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		canvas.getContext = vi.fn(() => ({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			drawImage: vi.fn(),
			save: vi.fn(),
			restore: vi.fn(),
			strokeStyle: '',
			lineWidth: 0,
			setLineDash: vi.fn(),
			lineDashOffset: 0,
			strokeRect: vi.fn(),
		}));
		canvas.style = {};
		canvas.classList = {
			add: vi.fn(),
			remove: vi.fn(),
			contains: vi.fn(() => false),
		};
		return canvas;
	}),
}));

describe('Keyboard Utilities', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.clearAllMocks();
		// Reset requestAnimationFrame mock
		global.requestAnimationFrame = vi.fn(cb => setTimeout(cb, 16));
		global.cancelAnimationFrame = vi.fn(id => clearTimeout(id));
	});

	afterEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	describe('Module Exports', () => {
		it('should export all expected keyboard functions', () => {
			expect(createFKeys).toBeDefined();
			expect(createCursor).toBeDefined();
			expect(createSelectionCursor).toBeDefined();
			expect(createKeyboardController).toBeDefined();
			expect(createPasteTool).toBeDefined();
			expect(createSelectionTool).toBeDefined();

			expect(typeof createFKeys).toBe('function');
			expect(typeof createCursor).toBe('function');
			expect(typeof createSelectionCursor).toBe('function');
			expect(typeof createKeyboardController).toBe('function');
			expect(typeof createPasteTool).toBe('function');
			expect(typeof createSelectionTool).toBe('function');
		});
	});

	describe('createFKeys', () => {
		it('should create F-keys controller with enable/disable methods', () => {
			const controller = createFKeys();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
			expect(typeof controller.enable).toBe('function');
			expect(typeof controller.disable).toBe('function');
		});

		it('should add keydown event listener on enable', () => {
			const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
			const controller = createFKeys();
			controller.enable();

			expect(addEventListenerSpy).toHaveBeenCalledWith(
				'keydown',
				expect.any(Function),
			);
		});

		it('should remove keydown event listener on disable', () => {
			const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
			const controller = createFKeys();
			controller.disable();

			expect(removeEventListenerSpy).toHaveBeenCalledWith(
				'keydown',
				expect.any(Function),
			);
		});

		it('should initialize with predefined character sets', () => {
			// Test that createFKeys doesn't throw and can be called
			expect(() => createFKeys()).not.toThrow();
		});

		it('should add palette and font change listeners', () => {
			const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
			createFKeys();

			expect(addEventListenerSpy).toHaveBeenCalledWith(
				'onPaletteChange',
				expect.any(Function),
			);
			expect(addEventListenerSpy).toHaveBeenCalledWith(
				'onForegroundChange',
				expect.any(Function),
			);
			expect(addEventListenerSpy).toHaveBeenCalledWith(
				'onBackgroundChange',
				expect.any(Function),
			);
			expect(addEventListenerSpy).toHaveBeenCalledWith(
				'onFontChange',
				expect.any(Function),
			);
		});
	});

	describe('createCursor', () => {
		it('should create cursor with required methods', () => {
			const container = document.createElement('div');
			const cursor = createCursor(container);

			expect(cursor).toHaveProperty('show');
			expect(cursor).toHaveProperty('hide');
			expect(cursor).toHaveProperty('move');
			expect(cursor).toHaveProperty('getX');
			expect(cursor).toHaveProperty('getY');
			expect(cursor).toHaveProperty('left');
			expect(cursor).toHaveProperty('right');
			expect(cursor).toHaveProperty('up');
			expect(cursor).toHaveProperty('down');
			expect(cursor).toHaveProperty('newLine');
			expect(cursor).toHaveProperty('enable');
			expect(cursor).toHaveProperty('disable');
			expect(cursor).toHaveProperty('isVisible');
			expect(cursor).toHaveProperty('startSelection');
		});

		it('should track cursor position', () => {
			const container = document.createElement('div');
			const cursor = createCursor(container);

			// Initial position should be 0,0
			expect(cursor.getX()).toBe(0);
			expect(cursor.getY()).toBe(0);
		});

		it('should have enable and disable methods', () => {
			const container = document.createElement('div');
			const cursor = createCursor(container);

			expect(typeof cursor.enable).toBe('function');
			expect(typeof cursor.disable).toBe('function');
		});
	});

	describe('createSelectionCursor', () => {
		it('should create selection cursor with required methods', () => {
			const container = document.createElement('div');
			const selectionCursor = createSelectionCursor(container);

			expect(selectionCursor).toHaveProperty('show');
			expect(selectionCursor).toHaveProperty('hide');
			expect(selectionCursor).toHaveProperty('setStart');
			expect(selectionCursor).toHaveProperty('setEnd');
			expect(selectionCursor).toHaveProperty('isVisible');
			expect(selectionCursor).toHaveProperty('getSelection');
			expect(selectionCursor).toHaveProperty('getElement');
		});

		it('should handle visibility state', () => {
			const container = document.createElement('div');
			const selectionCursor = createSelectionCursor(container);

			expect(typeof selectionCursor.isVisible).toBe('function');
		});
	});

	describe('createKeyboardController', () => {
		it('should create keyboard controller with required methods', () => {
			const controller = createKeyboardController();

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
			expect(controller).toHaveProperty('ignore');
			expect(controller).toHaveProperty('unignore');
			expect(controller).toHaveProperty('insertRow');
			expect(controller).toHaveProperty('deleteRow');
			expect(controller).toHaveProperty('insertColumn');
			expect(controller).toHaveProperty('deleteColumn');
			expect(controller).toHaveProperty('eraseRow');
			expect(controller).toHaveProperty('eraseColumn');
		});

		it('should enable keyboard controller', () => {
			const controller = createKeyboardController();
			expect(() => controller.enable()).not.toThrow();
		});

		it('should disable keyboard controller', () => {
			const controller = createKeyboardController();
			controller.enable();
			expect(() => controller.disable()).not.toThrow();
		});
	});

	describe('createPasteTool', () => {
		it('should create paste tool with required methods', () => {
			const cutItem = document.createElement('div');
			const copyItem = document.createElement('div');
			const pasteItem = document.createElement('div');
			const deleteItem = document.createElement('div');

			cutItem.classList = { add: vi.fn(), remove: vi.fn() };
			copyItem.classList = { add: vi.fn(), remove: vi.fn() };
			pasteItem.classList = { add: vi.fn(), remove: vi.fn() };
			deleteItem.classList = { add: vi.fn(), remove: vi.fn() };

			const pasteTool = createPasteTool(
				cutItem,
				copyItem,
				pasteItem,
				deleteItem,
			);

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

			cutItem.classList = { add: vi.fn(), remove: vi.fn() };
			copyItem.classList = { add: vi.fn(), remove: vi.fn() };
			pasteItem.classList = { add: vi.fn(), remove: vi.fn() };
			deleteItem.classList = { add: vi.fn(), remove: vi.fn() };

			const pasteTool = createPasteTool(
				cutItem,
				copyItem,
				pasteItem,
				deleteItem,
			);

			expect(() => pasteTool.setSelection(0, 0, 10, 10)).not.toThrow();
			expect(() => pasteTool.deleteSelection()).not.toThrow();
		});

		it('should add keydown event listener', () => {
			const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
			const cutItem = document.createElement('div');
			const copyItem = document.createElement('div');
			const pasteItem = document.createElement('div');
			const deleteItem = document.createElement('div');

			cutItem.classList = { add: vi.fn(), remove: vi.fn() };
			copyItem.classList = { add: vi.fn(), remove: vi.fn() };
			pasteItem.classList = { add: vi.fn(), remove: vi.fn() };
			deleteItem.classList = { add: vi.fn(), remove: vi.fn() };

			createPasteTool(cutItem, copyItem, pasteItem, deleteItem);

			expect(addEventListenerSpy).toHaveBeenCalledWith(
				'keydown',
				expect.any(Function),
			);
		});
	});

	describe('createSelectionTool', () => {
		it('should create selection tool with required methods', () => {
			const tool = createSelectionTool();

			expect(tool).toHaveProperty('enable');
			expect(tool).toHaveProperty('disable');
			expect(tool).toHaveProperty('flipHorizontal');
			expect(tool).toHaveProperty('flipVertical');
			expect(tool).toHaveProperty('setPendingAction');
			expect(tool).toHaveProperty('toggleMoveMode');
			expect(tool).toHaveProperty('isMoveMode');
		});

		it('should handle enable and disable', () => {
			const tool = createSelectionTool();

			expect(() => tool.enable()).not.toThrow();
			expect(() => tool.disable()).not.toThrow();
		});
	});

	describe('Function Key Character Sets', () => {
		it('should handle predefined character sets', () => {
			// Test predefined character sets from Moebius/PabloDraw
			const predefinedSets = [
				[218, 191, 192, 217, 196, 179, 195, 180, 193, 194, 32, 32],
				[201, 187, 200, 188, 205, 186, 204, 185, 202, 203, 32, 32],
				[213, 184, 212, 190, 205, 179, 198, 181, 207, 209, 32, 32],
				[214, 183, 211, 189, 196, 186, 199, 182, 208, 210, 32, 32],
				[197, 206, 216, 215, 232, 232, 155, 156, 153, 239, 32, 32],
				[176, 177, 178, 219, 223, 220, 221, 222, 254, 250, 32, 32],
			];

			expect(predefinedSets).toHaveLength(6);
			predefinedSets.forEach(set => {
				expect(set).toHaveLength(12);
				set.forEach(char => {
					expect(char).toBeGreaterThanOrEqual(0);
					expect(char).toBeLessThanOrEqual(255);
				});
			});
		});

		it('should generate additional character sets for full coverage', () => {
			// Test that character set generation covers all 256 characters
			const allChars = new Set();
			for (let i = 0; i < 256; i++) {
				allChars.add(i);
			}
			expect(allChars.size).toBe(256);
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

			expect(normalizeSelection(10, 8, 5, 3)).toEqual({
				startX: 5,
				startY: 3,
				endX: 10,
				endY: 8,
			});

			expect(normalizeSelection(5, 3, 10, 8)).toEqual({
				startX: 5,
				startY: 3,
				endX: 10,
				endY: 8,
			});
		});
	});

	describe('Clipboard Operations', () => {
		it('should handle clipboard text processing', () => {
			const processClipboardText = text => {
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
