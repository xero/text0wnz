import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createCursor,
	createSelectionCursor,
	createKeyboardController,
	createPasteTool,
	createSelectionTool,
} from '../../src/js/client/keyboard.js';
import { createFKeys } from '../../src/js/client/fkeys.js';
import State from '../../src/js/client/state.js';

// every test gets fresh State mocks: tests rewire them in place, so a
// shared object leaks one test's canvas size or draw hook into the next
const { stockState } = vi.hoisted(() => ({
	stockState: () => ({
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
			getAreaCells: vi.fn(() => ({ cells: [], width: 1, height: 1 })),
			setAreaCells: vi.fn(),
			deleteArea: vi.fn(),
			setImageData: vi.fn(),
			getImageData: vi.fn(() => new Uint16Array(2000)),
			getIceColors: vi.fn(() => false),
			getMirrorMode: vi.fn(() => false),
			setMirrorMode: vi.fn(),
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
			getLastSelection: vi.fn(() => null),
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
	}),
}));

vi.mock('../../src/js/client/state.js', () => ({ default: stockState() }));

vi.mock('../../src/js/client/toolbar.js', () => ({
	default: {
		switchTool: vi.fn(),
		returnToPreviousTool: vi.fn(),
	},
}));

vi.mock('../../src/js/client/ui.js', () => ({
	isTextEntry: vi.fn(() => false),
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
	let listeners;

	beforeEach(() => {
		document.body.innerHTML = '';
		vi.clearAllMocks();
		Object.assign(State, stockState());
		global.requestAnimationFrame = vi.fn(cb => setTimeout(cb, 16));
		global.cancelAnimationFrame = vi.fn(id => clearTimeout(id));
		// the paste tool and the cursors hook the shared document for good,
		// and a failing test never reaches its disable(): drop every
		// listener a test adds before the next one runs
		listeners = [];
		const add = document.addEventListener;
		vi.spyOn(document, 'addEventListener').mockImplementation((...args) => {
			listeners.push(args);
			add.apply(document, args);
		});
	});

	afterEach(() => {
		listeners.forEach(args => document.removeEventListener(...args));
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
			controller.disable();

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

		it('pages all 256 CP437 codes onto 12 key classic sets', () => {
			const classic = createFKeys()
				.getSets()
				.filter(page => page.label.startsWith('CP437'));
			expect(classic.every(page => page.chars.length === 12)).toBe(true);
			expect(new Set(classic.flatMap(page => page.chars)).size).toBe(256);
			expect(classic[0].chars.slice(0, 4)).toEqual([218, 191, 192, 217]);
		});

		it('F1-F12 type from the shades and blocks page, never with Ctrl', () => {
			const typed = [];
			State.textArtCanvas.draw.mockImplementation(writer =>
				writer(code => typed.push(code)));
			const controller = createFKeys();
			controller.enable();
			['F1', 'F4', 'F12'].forEach(code =>
				document.dispatchEvent(new KeyboardEvent('keydown', { code })));
			document.dispatchEvent(
				new KeyboardEvent('keydown', { code: 'F2', ctrlKey: true }),
			);
			controller.disable();
			expect(typed).toEqual([176, 219, 32]);
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

			expect(cursor.getX()).toBe(0);
			expect(cursor.getY()).toBe(0);
		});

		it('move clamps to the canvas and sets the caret a pixel up-left of the cell', () => {
			const container = document.createElement('div');
			const cursor = createCursor(container);
			const caret = container.firstChild;

			cursor.move(-5, -5);
			expect([cursor.getX(), cursor.getY()]).toEqual([0, 0]);
			cursor.move(100, 100);
			expect([cursor.getX(), cursor.getY()]).toEqual([79, 24]);
			cursor.move(10, 5);
			expect([caret.style.left, caret.style.top]).toEqual(['79px', '79px']);
		});

		it('re-homes to the origin when a new document loads', () => {
			const container = document.createElement('div');
			const cursor = createCursor(container);

			cursor.move(12, 20);
			expect(cursor.getY()).toBe(20);
			document.dispatchEvent(new CustomEvent('onNewDocument'));
			expect(cursor.getX()).toBe(0);
			expect(cursor.getY()).toBe(0);
		});

		it('holds position across plain buffer swaps', () => {
			const container = document.createElement('div');
			const cursor = createCursor(container);

			cursor.move(12, 20);
			// row/column ops and collab resyncs fire onOpenedFile: they
			// must never teleport the artist mid-edit
			document.dispatchEvent(new CustomEvent('onOpenedFile'));
			expect(cursor.getX()).toBe(12);
			expect(cursor.getY()).toBe(20);
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

		it('reads a reversed drag back as a top-left rect clipped to the canvas', () => {
			const container = document.createElement('div');
			const selectionCursor = createSelectionCursor(container);

			selectionCursor.setStart(10, 8);
			selectionCursor.setEnd(5, 3);
			expect(selectionCursor.getSelection()).toEqual({
				x: 5,
				y: 3,
				width: 6,
				height: 6,
			});
			selectionCursor.setStart(78, 0);
			selectionCursor.setEnd(85, 0);
			expect(selectionCursor.getSelection().width).toBe(2);
		});

		it('remembers the last selection across a hide', () => {
			const container = document.createElement('div');
			const selectionCursor = createSelectionCursor(container);

			expect(selectionCursor.getLastSelection()).toBe(null);
			selectionCursor.setStart(10, 10);
			selectionCursor.setEnd(14, 12);
			selectionCursor.hide();
			expect(selectionCursor.getSelection()).toBe(null);
			expect(selectionCursor.getLastSelection()).toEqual({
				x: 10,
				y: 10,
				width: 5,
				height: 3,
			});
		});

		it('forgets the restore memory when a new document loads', () => {
			const container = document.createElement('div');
			const selectionCursor = createSelectionCursor(container);

			selectionCursor.setStart(10, 10);
			selectionCursor.setEnd(14, 12);
			selectionCursor.hide();
			expect(selectionCursor.getLastSelection()).not.toBe(null);
			document.dispatchEvent(new CustomEvent('onNewDocument'));
			expect(selectionCursor.getLastSelection()).toBe(null);
			expect(selectionCursor.getSelection()).toBe(null);
		});

		it('keeps the restore memory across plain buffer swaps', () => {
			const container = document.createElement('div');
			const selectionCursor = createSelectionCursor(container);

			selectionCursor.setStart(10, 10);
			selectionCursor.setEnd(14, 12);
			selectionCursor.hide();
			document.dispatchEvent(new CustomEvent('onOpenedFile'));
			expect(selectionCursor.getLastSelection()).not.toBe(null);
		});

		it('exposes forget for loaders that bypass the event', () => {
			const container = document.createElement('div');
			const selectionCursor = createSelectionCursor(container);

			selectionCursor.setStart(2, 2);
			selectionCursor.setEnd(4, 4);
			selectionCursor.forget();
			expect(selectionCursor.getLastSelection()).toBe(null);
			expect(selectionCursor.isVisible()).toBe(false);
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

		describe('fixed-canvas row and column edits', () => {
			// a 3x3 virtual grid: pristine cells read a per-coord code so
			// shift mappings are provable; writes land back in the grid
			// the way drawBlocks applies them (immediately)
			const codeAt = (x, y) => 100 + y * 10 + x;
			let grid;

			const wireGrid = (cursorX, cursorY) => {
				grid = new Map();
				const cellAt = (x, y) =>
					grid.get(`${x},${y}`) ?? {
						charCode: codeAt(x, y),
						foregroundColor: 1,
						backgroundColor: 2,
					};
				State.textArtCanvas.getColumns.mockReturnValue(3);
				State.textArtCanvas.getRows.mockReturnValue(3);
				State.textArtCanvas.getBlock.mockImplementation(cellAt);
				State.textArtCanvas.draw.mockImplementation(writer => {
					writer((charCode, fg, bg, x, y) => {
						grid.set(`${x},${y}`, {
							charCode,
							foregroundColor: fg,
							backgroundColor: bg,
						});
					});
				});
				State.cursor.getX.mockReturnValue(cursorX);
				State.cursor.getY.mockReturnValue(cursorY);
				return cellAt;
			};

			it('insertRow shifts rows down and blanks the cursor row', () => {
				const cellAt = wireGrid(0, 1);
				createKeyboardController().insertRow();
				// the canvas never resizes and no buffer swap happens
				expect(State.textArtCanvas.setImageData).not.toHaveBeenCalled();
				expect(State.textArtCanvas.startUndo).toHaveBeenCalledTimes(1);
				expect(cellAt(2, 2).charCode).toBe(codeAt(2, 1)); // old row 1
				expect(cellAt(1, 1).charCode).toBe(32); // blank inserted
				expect(grid.has('0,0')).toBe(false); // row 0 untouched
			});

			it('deleteRow shifts rows up and blanks the bottom row', () => {
				const cellAt = wireGrid(0, 0);
				createKeyboardController().deleteRow();
				expect(cellAt(0, 0).charCode).toBe(codeAt(0, 1)); // old row 1
				expect(cellAt(0, 1).charCode).toBe(codeAt(0, 2)); // old row 2
				expect(cellAt(2, 2).charCode).toBe(32); // bottom blanks
			});

			it('insertColumn shifts right and blanks the cursor column', () => {
				const cellAt = wireGrid(1, 0);
				createKeyboardController().insertColumn();
				expect(cellAt(2, 0).charCode).toBe(codeAt(1, 0)); // old col 1
				expect(cellAt(1, 2).charCode).toBe(32); // blank inserted
				expect(grid.has('0,0')).toBe(false); // col 0 untouched
			});

			it('deleteColumn shifts left and blanks the last column', () => {
				const cellAt = wireGrid(0, 0);
				createKeyboardController().deleteColumn();
				expect(cellAt(0, 1).charCode).toBe(codeAt(1, 1)); // old col 1
				expect(cellAt(1, 1).charCode).toBe(codeAt(2, 1)); // old col 2
				expect(cellAt(2, 1).charCode).toBe(32); // last col blanks
			});

			it('the erase ops blank from the cursor to each edge', () => {
				const ops = {
					eraseRow: ['0,1', '1,1', '2,1'],
					eraseToStartOfRow: ['0,1', '1,1'],
					eraseToEndOfRow: ['1,1', '2,1'],
					eraseColumn: ['1,0', '1,1', '1,2'],
					eraseToStartOfColumn: ['1,0', '1,1'],
					eraseToEndOfColumn: ['1,1', '1,2'],
				};
				for (const [op, cells] of Object.entries(ops)) {
					wireGrid(1, 1);
					createKeyboardController()[op]();
					expect([...grid.keys()].sort(), op).toEqual(cells);
					grid.forEach(cell =>
						expect(cell).toEqual({
							charCode: 32,
							foregroundColor: 7,
							backgroundColor: 0,
						}));
				}
			});

			it('suspends mirror mode around the shift and restores it', () => {
				wireGrid(0, 0);
				State.textArtCanvas.getMirrorMode.mockReturnValue(true);
				createKeyboardController().insertRow();
				expect(State.textArtCanvas.setMirrorMode).toHaveBeenNthCalledWith(1, false);
				expect(State.textArtCanvas.setMirrorMode).toHaveBeenNthCalledWith(2, true);
			});
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

		it('switching away without a live selection leaves the cursor alone', () => {
			State.selectionCursor.isVisible = vi.fn(() => false);
			const controller = createKeyboardController();
			controller.enable();
			controller.disable();
			expect(State.cursor.move).not.toHaveBeenCalled();
		});

		it('parks the cursor at a live selection without scrolling', () => {
			State.selectionCursor.isVisible = vi.fn(() => true);
			State.selectionCursor.getPos = vi.fn(() => ({ x: 7, y: 9 }));
			const controller = createKeyboardController();
			controller.enable();
			controller.disable();
			expect(State.cursor.move).toHaveBeenCalledWith(7, 9, false);
		});

		it('draws CP437 21 exactly once per § keypress', async () => {
			const drawn = [];
			State.textArtCanvas.draw = vi.fn(callback =>
				callback((code, fg, bg, x, y) => drawn.push({ code, x, y })));
			const controller = createKeyboardController();
			controller.enable();
			document.dispatchEvent(new KeyboardEvent('keypress', { key: '§' }));
			controller.disable();
			// typed input rides the queue: flush the microtask hop
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(drawn).toEqual([{ code: 21, x: 0, y: 0 }]);
			expect(State.textArtCanvas.startUndo).toHaveBeenCalledTimes(1);
		});

		it('interns typed non-CP437 glyphs instead of aliasing ids', async () => {
			const drawn = [];
			State.textArtCanvas.draw = vi.fn(callback =>
				callback(code => drawn.push(code)));
			// the doc glyph table hands back an interned id, like paste
			State.textArtCanvas.resolveUnicode = vi.fn(
				async () => new Map([[0x2603, 300]]),
			);
			const controller = createKeyboardController();
			controller.enable();
			document.dispatchEvent(new KeyboardEvent('keypress', { key: '☃' }));
			controller.disable();
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(State.textArtCanvas.resolveUnicode).toHaveBeenCalledWith(
				new Set([0x2603]),
			);
			// a raw codepoint as the glyph id aliases interned glyphs and
			// quantizes to '?' everywhere downstream
			expect(drawn).toEqual([300]);
		});

		it('picks up colors on Ctrl+U through keydown', () => {
			State.textArtCanvas.getBlock = vi.fn(() => ({
				charCode: 65,
				foregroundColor: 12,
				backgroundColor: 3,
			}));
			const controller = createKeyboardController();
			controller.enable();
			// keypress never fires for ctrl combos in modern browsers
			document.dispatchEvent(
				new KeyboardEvent('keydown', { code: 'KeyU', ctrlKey: true }),
			);
			controller.disable();
			expect(State.palette.setForegroundColor).toHaveBeenCalledWith(12);
			expect(State.palette.setBackgroundColor).toHaveBeenCalledWith(3);
		});

		it('Tab draws the tab glyph while the canvas scope holds focus', async () => {
			const drawn = [];
			State.textArtCanvas.draw = vi.fn(callback =>
				callback(code => drawn.push(code)));
			const controller = createKeyboardController();
			controller.enable();
			// jsdom parks focus on body, the post-click state on the page
			const e = new KeyboardEvent('keydown', {
				code: 'Tab',
				cancelable: true,
			});
			document.dispatchEvent(e);
			controller.disable();
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(drawn).toEqual([9]);
			expect(e.defaultPrevented).toBe(true);
		});

		it('Tab types from inside the canvas container too', async () => {
			const drawn = [];
			State.textArtCanvas.draw = vi.fn(callback =>
				callback(code => drawn.push(code)));
			const cc = document.createElement('div');
			cc.id = 'canvasContainer';
			cc.tabIndex = 0;
			document.body.appendChild(cc);
			cc.focus();
			const controller = createKeyboardController();
			controller.enable();
			const e = new KeyboardEvent('keydown', {
				code: 'Tab',
				cancelable: true,
				bubbles: true,
			});
			cc.dispatchEvent(e);
			controller.disable();
			cc.remove();
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(drawn).toEqual([9]);
			expect(e.defaultPrevented).toBe(true);
		});

		it('Tab from a focused control walks instead of typing', async () => {
			const drawn = [];
			State.textArtCanvas.draw = vi.fn(callback =>
				callback(code => drawn.push(code)));
			const button = document.createElement('button');
			document.body.appendChild(button);
			button.focus();
			const controller = createKeyboardController();
			controller.enable();
			const e = new KeyboardEvent('keydown', {
				code: 'Tab',
				cancelable: true,
				bubbles: true,
			});
			button.dispatchEvent(e);
			controller.disable();
			button.remove();
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(drawn).toEqual([]);
			expect(e.defaultPrevented).toBe(false);
		});

		it('Enter on a focused control activates it instead of newlining', async () => {
			const button = document.createElement('button');
			document.body.appendChild(button);
			button.focus();
			const controller = createKeyboardController();
			controller.enable();
			const e = new KeyboardEvent('keypress', {
				key: 'Enter',
				cancelable: true,
				bubbles: true,
			});
			button.dispatchEvent(e);
			controller.disable();
			button.remove();
			await new Promise(resolve => setTimeout(resolve, 0));
			// the default survives so the browser clicks the button
			expect(e.defaultPrevented).toBe(false);
			expect(State.cursor.newLine).not.toHaveBeenCalled();
		});

		it('Enter still newlines while the canvas scope holds focus', async () => {
			const controller = createKeyboardController();
			controller.enable();
			const e = new KeyboardEvent('keypress', {
				key: 'Enter',
				cancelable: true,
			});
			document.dispatchEvent(e);
			controller.disable();
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(e.defaultPrevented).toBe(true);
			expect(State.cursor.newLine).toHaveBeenCalledTimes(1);
		});

		it('shift Tab always walks, so the keyboard can leave the canvas', async () => {
			const drawn = [];
			State.textArtCanvas.draw = vi.fn(callback =>
				callback(code => drawn.push(code)));
			const controller = createKeyboardController();
			controller.enable();
			const e = new KeyboardEvent('keydown', {
				code: 'Tab',
				shiftKey: true,
				cancelable: true,
			});
			document.dispatchEvent(e);
			controller.disable();
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(drawn).toEqual([]);
			expect(e.defaultPrevented).toBe(false);
		});

		it('keeps keystroke order when ascii follows in flight unicode', async () => {
			const drawn = [];
			let cx = 0;
			State.cursor.getX = vi.fn(() => cx);
			State.cursor.right = vi.fn(() => {
				cx++;
			});
			State.textArtCanvas.draw = vi.fn(callback =>
				callback((code, fg, bg, x) => drawn.push({ code, x })));
			let release;
			State.textArtCanvas.resolveUnicode = vi.fn(
				() =>
					new Promise(resolve => {
						release = resolve;
					}),
			);
			const controller = createKeyboardController();
			controller.enable();
			document.dispatchEvent(new KeyboardEvent('keypress', { key: '☃' }));
			document.dispatchEvent(new KeyboardEvent('keypress', { key: 'A' }));
			// let the first link start (the queue defers it a microtask);
			// the ascii keystroke must still wait behind the pending resolve
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(drawn).toEqual([]);
			release(new Map([[0x2603, 300]]));
			await new Promise(resolve => setTimeout(resolve, 0));
			controller.disable();
			expect(drawn).toEqual([
				{ code: 300, x: 0 },
				{ code: 65, x: 1 },
			]);
		});

		it('keeps the typing queue alive after a rejected resolve', async () => {
			const drawn = [];
			State.textArtCanvas.draw = vi.fn(callback =>
				callback(code => drawn.push(code)));
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			State.textArtCanvas.resolveUnicode = vi
				.fn()
				.mockRejectedValueOnce(new Error('glyph table full'))
				.mockResolvedValueOnce(new Map([[0x2603, 300]]));
			const controller = createKeyboardController();
			controller.enable();
			document.dispatchEvent(new KeyboardEvent('keypress', { key: '☃' }));
			await new Promise(resolve => setTimeout(resolve, 0));
			document.dispatchEvent(new KeyboardEvent('keypress', { key: 'A' }));
			document.dispatchEvent(new KeyboardEvent('keypress', { key: '☃' }));
			await new Promise(resolve => setTimeout(resolve, 0));
			controller.disable();
			expect(drawn).toEqual([65, 300]);
			expect(errSpy).toHaveBeenCalledTimes(1);
		});

		it('queues Enter behind a pending unicode glyph', async () => {
			const log = [];
			State.cursor.newLine = vi.fn(() => log.push('nl'));
			State.textArtCanvas.draw = vi.fn(callback =>
				callback(code => log.push(code)));
			let release;
			State.textArtCanvas.resolveUnicode = vi.fn(
				() =>
					new Promise(resolve => {
						release = resolve;
					}),
			);
			const controller = createKeyboardController();
			controller.enable();
			document.dispatchEvent(new KeyboardEvent('keypress', { key: '☃' }));
			document.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));
			// the newline must wait behind the pending resolve
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(log).toEqual([]);
			release(new Map([[0x2603, 300]]));
			await new Promise(resolve => setTimeout(resolve, 0));
			controller.disable();
			expect(log).toEqual([300, 'nl']);
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

	describe('paste modes', () => {
		const makeTool = () => {
			const item = () => document.createElement('div');
			return createPasteTool(item(), item(), item(), item());
		};
		let drawn;

		beforeEach(() => {
			drawn = [];
			State.selectionCursor.isVisible = vi.fn(() => true);
			State.cursor.isVisible = vi.fn(() => false);
			// clipboard: [blank space, red full block]
			State.textArtCanvas.getAreaCells = vi.fn(() => ({
				cells: [
					{ charCode: 32, fg: 0, bg: 0 },
					{ charCode: 219, fg: 4, bg: 0 },
				],
				width: 2,
				height: 1,
			}));
			State.textArtCanvas.draw = vi.fn(callback => {
				callback((code, fg, bg, x, y) => drawn.push({ code, fg, bg, x, y }));
			});
		});

		it('cut copies the rect, then blanks it to the background', () => {
			State.palette.getBackgroundColor.mockReturnValueOnce(4);
			const { getAreaCells, deleteArea } = State.textArtCanvas;
			const tool = makeTool();
			tool.setSelection(3, 2, 2, 1);
			tool.cut();
			expect(getAreaCells).toHaveBeenCalledWith(3, 2, 2, 1);
			expect(deleteArea).toHaveBeenCalledWith(3, 2, 2, 1, 4);
			expect(getAreaCells.mock.invocationCallOrder[0]).toBeLessThan(
				deleteArea.mock.invocationCallOrder[0],
			);
		});

		it('paste lands the copied cells at the current selection', () => {
			const tool = makeTool();
			tool.setSelection(0, 0, 2, 1);
			tool.copy();
			tool.setSelection(5, 6, 1, 1);
			tool.paste();
			expect(State.textArtCanvas.startUndo).toHaveBeenCalledTimes(1);
			expect(State.textArtCanvas.setAreaCells).toHaveBeenCalledWith(
				State.textArtCanvas.getAreaCells.mock.results[0].value,
				5,
				6,
			);
		});

		it('pasteTransparent skips clipboard blanks', () => {
			const tool = makeTool();
			tool.setSelection(0, 0, 2, 1);
			tool.copy();
			tool.pasteTransparent();
			expect(State.textArtCanvas.startUndo).toHaveBeenCalledTimes(1);
			expect(drawn).toEqual([{ code: 219, fg: 4, bg: 0, x: 1, y: 0 }]);
		});

		it('pasteUnder writes only into blank target cells', () => {
			State.textArtCanvas.getBlock = vi.fn(x =>
				(x === 0
					? { charCode: 32, foregroundColor: 7, backgroundColor: 0 }
					: { charCode: 219, foregroundColor: 7, backgroundColor: 0 }));
			const tool = makeTool();
			tool.setSelection(0, 0, 2, 1);
			tool.copy();
			tool.pasteUnder();
			expect(drawn).toEqual([{ code: 32, fg: 0, bg: 0, x: 0, y: 0 }]);
		});

		it('extended-color targets count as occupied for pasteUnder', () => {
			State.textArtCanvas.getBlock = vi.fn(() => ({
				charCode: 32,
				foregroundColor: 7,
				backgroundColor: 0x800000c8, // palette word: colored, not blank
			}));
			const tool = makeTool();
			tool.setSelection(0, 0, 2, 1);
			tool.copy();
			tool.pasteUnder();
			expect(drawn).toEqual([]);
		});

		it('both modes clip at the canvas edge', () => {
			State.textArtCanvas.getColumns = vi.fn(() => 1);
			const tool = makeTool();
			tool.setSelection(0, 0, 2, 1);
			tool.copy();
			tool.pasteTransparent();
			expect(drawn).toEqual([]); // cell 1 clipped, cell 0 blank
		});
	});
});
