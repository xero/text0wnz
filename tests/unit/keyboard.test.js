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
import Toolbar from '../../src/js/client/toolbar.js';
import { cp437ToUnicode } from '../../src/js/core/cp437.js';
import { tokenizePasteText } from '../../src/js/core/paste.js';

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

	// a click focuses the button between the press and the release
	const clickFocus = element => {
		element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		element.focus();
		element.dispatchEvent(new Event('pointerup', { bubbles: true }));
	};

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
			const insert = vi.fn();
			const controller = createFKeys(insert, () => false);
			controller.enable();
			['F1', 'F4', 'F12'].forEach(code =>
				document.dispatchEvent(new KeyboardEvent('keydown', { code })));
			document.dispatchEvent(
				new KeyboardEvent('keydown', { code: 'F2', ctrlKey: true }),
			);
			controller.disable();
			expect(insert.mock.calls).toEqual([[176], [219], [32]]);
		});

		it('F-keys pressed in a text entry stay in the field', () => {
			const insert = vi.fn();
			const input = document.createElement('input');
			document.body.appendChild(input);
			const controller = createFKeys(insert, t => t === input);
			controller.enable();
			const e = new KeyboardEvent('keydown', {
				code: 'F1',
				bubbles: true,
				cancelable: true,
			});
			input.dispatchEvent(e);
			controller.disable();
			expect(e.defaultPrevented).toBe(false);
			expect(insert).not.toHaveBeenCalled();
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
		// the browser rule the handlers share the document under: an
		// uncancelled keydown is followed by a keypress only for a key
		// that yields a character or Enter, and never with ctrl or alt
		const press = (target, init) => {
			const opts = { cancelable: true, bubbles: true, ...init };
			const down = new KeyboardEvent('keydown', opts);
			target.dispatchEvent(down);
			const charKey = [...init.key].length === 1 || init.key === 'Enter';
			if (down.defaultPrevented || !charKey || init.ctrlKey || init.altKey) {
				return { down, keypress: null };
			}
			const keypress = new KeyboardEvent('keypress', opts);
			target.dispatchEvent(keypress);
			return { down, keypress };
		};

		// the real cursor, so its own keydown handler shares the document
		// with the controller's the way it does in the app
		const liveCursor = (x, y) => {
			State.cursor = createCursor(document.createElement('div'));
			State.cursor.move(x, y);
			return State.cursor;
		};

		const settle = () => new Promise(resolve => setTimeout(resolve, 0));

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

		it('every CP437 glyph types as its byte', async () => {
			const drawn = [];
			State.textArtCanvas.draw = vi.fn(callback =>
				callback(code => drawn.push(code)));
			State.textArtCanvas.resolveUnicode = vi.fn(async () => new Map());
			const bytes = Array.from({ length: 255 }, (_, i) => i + 1);
			const controller = createKeyboardController();
			controller.enable();
			for (const byte of bytes) {
				document.dispatchEvent(
					new KeyboardEvent('keypress', { key: String.fromCodePoint(cp437ToUnicode(byte)) }),
				);
			}
			await settle();
			controller.disable();
			expect(drawn).toEqual(bytes);
			expect(State.textArtCanvas.resolveUnicode).not.toHaveBeenCalled();
		});

		it.each(['☺', '¶', '•', '←', '♥', '░', 'é', '☃'])(
			'typed %s lands what a paste of it lands',
			async ch => {
				const drawn = [];
				State.textArtCanvas.draw = vi.fn(callback =>
					callback(code => drawn.push(code)));
				State.textArtCanvas.resolveUnicode = vi.fn(
					async codepoints => new Map([...codepoints].map(cp => [cp, ~cp])),
				);
				const controller = createKeyboardController();
				controller.enable();
				document.dispatchEvent(new KeyboardEvent('keypress', { key: ch }));
				await settle();
				controller.disable();
				expect(drawn).toEqual(tokenizePasteText(ch).tokens);
			},
		);

		describe('keys pressed in a text entry stay in the field', () => {
			it.each([
				['a digit', { key: '5', code: 'Digit5' }],
				['Backspace', { key: 'Backspace', code: 'Backspace' }],
				['Enter', { key: 'Enter', code: 'Enter' }],
				['Space', { key: ' ', code: 'Space' }],
				['Tab', { key: 'Tab', code: 'Tab' }],
				['ArrowUp', { key: 'ArrowUp', code: 'ArrowUp' }],
				['Home', { key: 'Home', code: 'Home' }],
				['shift ArrowLeft', { key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: true }],
				['F1', { key: 'F1', code: 'F1' }],
			])('%s', async (_, init) => {
				const cursor = liveCursor(2, 3);
				const field = document.createElement('input');
				field.type = 'number';
				document.body.appendChild(field);
				field.focus();
				const controller = createKeyboardController();
				controller.enable();
				const { down, keypress } = press(field, init);
				await settle();
				controller.disable();
				expect(down.defaultPrevented).toBe(false);
				expect(keypress?.defaultPrevented ?? false).toBe(false);
				expect(State.textArtCanvas.draw).not.toHaveBeenCalled();
				expect(Toolbar.switchTool).not.toHaveBeenCalled();
				expect([cursor.getX(), cursor.getY()]).toEqual([2, 3]);
			});
		});

		describe('Space and the arrows on a focused control', () => {
			let drawn;
			let button;
			let seen;
			beforeEach(() => {
				drawn = [];
				State.textArtCanvas.draw = vi.fn(callback =>
					callback(code => drawn.push(code)));
				button = document.createElement('button');
				document.body.appendChild(button);
				// what the control's own handler sees, before the document's
				seen = [];
				button.addEventListener('keydown', e =>
					seen.push(e.defaultPrevented));
			});

			it('Space on a control the keyboard reached is left to it', async () => {
				const cursor = liveCursor(2, 3);
				button.focus();
				const controller = createKeyboardController();
				controller.enable();
				const { down, keypress } = press(button, { key: ' ', code: 'Space' });
				await settle();
				controller.disable();
				// an uncancelled keydown is what lets the browser press the
				// button on keyup
				expect(down.defaultPrevented).toBe(false);
				expect(keypress?.defaultPrevented).toBe(false);
				expect(drawn).toEqual([]);
				expect([cursor.getX(), cursor.getY()]).toEqual([2, 3]);
			});

			it('Space on a control a pointer press focused types a space and cannot press it', async () => {
				const cursor = liveCursor(2, 3);
				const controller = createKeyboardController();
				controller.enable();
				clickFocus(button);
				const { down } = press(button, { key: ' ', code: 'Space' });
				await settle();
				controller.disable();
				expect(down.defaultPrevented).toBe(true);
				expect(drawn).toEqual([32]);
				expect([cursor.getX(), cursor.getY()]).toEqual([3, 3]);
			});

			it.each([
				['ArrowRight', {}],
				['ArrowLeft', { shiftKey: true }],
			])('%s on a control the keyboard reached is left to it', async (code, mods) => {
				const cursor = liveCursor(2, 3);
				button.focus();
				const controller = createKeyboardController();
				controller.enable();
				const { down } = press(button, { key: code, code, ...mods });
				await settle();
				controller.disable();
				expect(seen).toEqual([false]);
				expect(down.defaultPrevented).toBe(false);
				expect(Toolbar.switchTool).not.toHaveBeenCalled();
				expect([cursor.getX(), cursor.getY()]).toEqual([2, 3]);
			});

			it('an arrow on a control a pointer press focused reaches it cancelled and moves the cursor', async () => {
				const cursor = liveCursor(2, 3);
				const controller = createKeyboardController();
				controller.enable();
				clickFocus(button);
				press(button, { key: 'ArrowRight', code: 'ArrowRight' });
				await settle();
				controller.disable();
				expect(seen).toEqual([true]);
				expect([cursor.getX(), cursor.getY()]).toEqual([3, 3]);
			});

			it('cmd arrows stay canvas input on a control the keyboard reached', async () => {
				const cursor = liveCursor(2, 3);
				button.focus();
				const controller = createKeyboardController();
				controller.enable();
				const { down } = press(button, {
					key: 'ArrowRight',
					code: 'ArrowRight',
					metaKey: true,
				});
				await settle();
				controller.disable();
				expect(down.defaultPrevented).toBe(true);
				expect([cursor.getX(), cursor.getY()]).toEqual([79, 3]);
			});

			describe('a range slider is a control, not a text field', () => {
				let slider;
				beforeEach(() => {
					slider = document.createElement('input');
					slider.type = 'range';
					document.body.appendChild(slider);
					seen = [];
					slider.addEventListener('keydown', e =>
						seen.push(e.defaultPrevented));
				});

				it('a clicked one leaves letters and arrows to the canvas', async () => {
					const cursor = liveCursor(2, 3);
					const controller = createKeyboardController();
					controller.enable();
					clickFocus(slider);
					const { keypress } = press(slider, { key: 'a', code: 'KeyA' });
					press(slider, { key: 'ArrowDown', code: 'ArrowDown' });
					await settle();
					controller.disable();
					expect(keypress?.defaultPrevented).toBe(true);
					expect(drawn).toEqual([97]);
					// cancelled before the slider's own default steps it
					expect(seen).toEqual([false, true]);
					expect([cursor.getX(), cursor.getY()]).toEqual([3, 4]);
				});

				it('one the keyboard reached keeps its arrows', async () => {
					const cursor = liveCursor(2, 3);
					slider.focus();
					const controller = createKeyboardController();
					controller.enable();
					const { down } = press(slider, {
						key: 'ArrowRight',
						code: 'ArrowRight',
					});
					await settle();
					controller.disable();
					expect(down.defaultPrevented).toBe(false);
					expect(seen).toEqual([false]);
					expect([cursor.getX(), cursor.getY()]).toEqual([2, 3]);
				});

				it.each([
					['a slider', () => slider],
					['a button', () => button],
				])('Home, End, PageUp, and PageDown on %s the keyboard reached', async (name, control) => {
					const cursor = liveCursor(40, 12);
					control().focus();
					const controller = createKeyboardController();
					controller.enable();
					const kept = ['Home', 'End', 'PageUp', 'PageDown'].map(
						code => !press(control(), { key: code, code }).down.defaultPrevented,
					);
					await settle();
					controller.disable();
					// only a slider jumps on them; any other control leaves them
					// to the canvas cursor
					const slid = name === 'a slider';
					expect(kept).toEqual(Array(4).fill(slid));
					expect([cursor.getX(), cursor.getY()]).toEqual(slid ? [40, 12] : [79, 12]);
				});
			});
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

		it.each(['Enter', 'NumpadEnter'])(
			'%s on a focused control activates it instead of newlining',
			async code => {
				const cursor = liveCursor(2, 3);
				const button = document.createElement('button');
				document.body.appendChild(button);
				button.focus();
				const controller = createKeyboardController();
				controller.enable();
				const { keypress } = press(button, { key: 'Enter', code });
				await settle();
				controller.disable();
				// an uncancelled keypress is what the browser turns into
				// the button's click
				expect(keypress?.defaultPrevented).toBe(false);
				expect([cursor.getX(), cursor.getY()]).toEqual([2, 3]);
			},
		);

		it.each(['Enter', 'NumpadEnter'])(
			'%s on a control a pointer press focused newlines',
			async code => {
				const cursor = liveCursor(2, 3);
				const button = document.createElement('button');
				document.body.appendChild(button);
				const controller = createKeyboardController();
				controller.enable();
				clickFocus(button);
				const { down } = press(button, { key: 'Enter', code });
				await settle();
				controller.disable();
				button.remove();
				expect(down.defaultPrevented).toBe(true);
				expect([cursor.getX(), cursor.getY()]).toEqual([0, 4]);
			},
		);

		it('Enter activates a control the keyboard reaches after a click elsewhere', async () => {
			const cursor = liveCursor(2, 3);
			const clicked = document.createElement('button');
			const tabbed = document.createElement('button');
			document.body.append(clicked, tabbed);
			const controller = createKeyboardController();
			controller.enable();
			clickFocus(clicked);
			tabbed.focus();
			const { keypress } = press(tabbed, { key: 'Enter', code: 'Enter' });
			await settle();
			controller.disable();
			clicked.remove();
			tabbed.remove();
			expect(keypress?.defaultPrevented).toBe(false);
			expect([cursor.getX(), cursor.getY()]).toEqual([2, 3]);
		});

		it.each(['Enter', 'NumpadEnter'])(
			'%s newlines while the canvas scope holds focus',
			async code => {
				const cursor = liveCursor(2, 3);
				const controller = createKeyboardController();
				controller.enable();
				const { down } = press(document.body, { key: 'Enter', code });
				await settle();
				controller.disable();
				expect(down.defaultPrevented).toBe(true);
				expect([cursor.getX(), cursor.getY()]).toEqual([0, 4]);
			},
		);

		// the container is a tab stop, so it matches the activation
		// selector; only the canvas scope check keeps Enter a newline
		it('Enter newlines from the focused canvas container', async () => {
			const cursor = liveCursor(2, 3);
			const cc = document.createElement('div');
			cc.id = 'canvasContainer';
			cc.tabIndex = 0;
			document.body.appendChild(cc);
			cc.focus();
			const controller = createKeyboardController();
			controller.enable();
			const { down } = press(cc, { key: 'Enter', code: 'Enter' });
			await settle();
			controller.disable();
			expect(down.defaultPrevented).toBe(true);
			expect([cursor.getX(), cursor.getY()]).toEqual([0, 4]);
		});

		it('Shift+Enter newlines too', async () => {
			const cursor = liveCursor(2, 3);
			const controller = createKeyboardController();
			controller.enable();
			press(document.body, { key: 'Enter', code: 'Enter', shiftKey: true });
			await settle();
			controller.disable();
			expect([cursor.getX(), cursor.getY()]).toEqual([0, 4]);
		});

		it.each(['ctrlKey', 'altKey', 'metaKey'])(
			'Enter with %s leaves the cursor and the default alone',
			async modifier => {
				const cursor = liveCursor(2, 3);
				const controller = createKeyboardController();
				controller.enable();
				const { down } = press(document.body, {
					key: 'Enter',
					code: 'Enter',
					[modifier]: true,
				});
				await settle();
				controller.disable();
				expect(down.defaultPrevented).toBe(false);
				expect([cursor.getX(), cursor.getY()]).toEqual([2, 3]);
			},
		);

		it('Enter and Backspace keep their defaults while a dialog holds the keyboard', async () => {
			const cursor = liveCursor(2, 3);
			const controller = createKeyboardController();
			controller.enable();
			controller.ignore();
			const enter = press(document.body, { key: 'Enter', code: 'Enter' });
			const back = press(document.body, { key: 'Backspace', code: 'Backspace' });
			await settle();
			controller.disable();
			expect(enter.down.defaultPrevented).toBe(false);
			expect(enter.keypress?.defaultPrevented).toBe(false);
			expect(back.down.defaultPrevented).toBe(false);
			expect(State.textArtCanvas.draw).not.toHaveBeenCalled();
			expect([cursor.getX(), cursor.getY()]).toEqual([2, 3]);
		});

		it('Backspace at the start of a row erases nothing', async () => {
			const cursor = liveCursor(0, 3);
			const controller = createKeyboardController();
			controller.enable();
			const { down } = press(document.body, {
				key: 'Backspace',
				code: 'Backspace',
			});
			await settle();
			controller.disable();
			expect(down.defaultPrevented).toBe(true);
			expect(State.textArtCanvas.draw).not.toHaveBeenCalled();
			expect([cursor.getX(), cursor.getY()]).toEqual([0, 3]);
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

		describe('keys behind a pending unicode glyph', () => {
			let drawn;
			let release;

			beforeEach(() => {
				drawn = [];
				State.textArtCanvas.draw = vi.fn(callback =>
					callback((code, fg, bg, x, y) => drawn.push({ code, x, y })));
				State.textArtCanvas.resolveUnicode = vi.fn(
					() =>
						new Promise(resolve => {
							release = resolve;
						}),
				);
			});

			// the typing queue outlives a test: a gate a failed test left
			// shut would stall every later queued key
			afterEach(async () => {
				release?.(new Map());
				await settle();
			});

			it('Enter waits for the glyph to land', async () => {
				const cursor = liveCursor(2, 3);
				const controller = createKeyboardController();
				controller.enable();
				press(document.body, { key: '❤', code: 'Digit3' });
				press(document.body, { key: 'Enter', code: 'Enter' });
				await settle();
				expect([cursor.getX(), cursor.getY()]).toEqual([2, 3]);
				release(new Map([[0x2764, 300]]));
				await settle();
				controller.disable();
				expect(drawn).toEqual([{ code: 300, x: 2, y: 3 }]);
				expect([cursor.getX(), cursor.getY()]).toEqual([0, 4]);
			});

			it('Backspace erases the glyph it waited for', async () => {
				const cursor = liveCursor(2, 3);
				const controller = createKeyboardController();
				controller.enable();
				press(document.body, { key: '❤', code: 'Digit3' });
				press(document.body, { key: 'Backspace', code: 'Backspace' });
				await settle();
				expect(drawn).toEqual([]);
				release(new Map([[0x2764, 300]]));
				await settle();
				controller.disable();
				expect(drawn).toEqual([
					{ code: 300, x: 2, y: 3 },
					{ code: 0, x: 2, y: 3 },
				]);
				expect([cursor.getX(), cursor.getY()]).toEqual([2, 3]);
			});

			it.each([
				['Tab', 9],
				['F1', 176],
			])('%s lands after the glyph', async (key, code) => {
				liveCursor(2, 3);
				const controller = createKeyboardController();
				controller.enable();
				press(document.body, { key: '❤', code: 'Digit3' });
				press(document.body, { key, code: key });
				await settle();
				expect(drawn).toEqual([]);
				release(new Map([[0x2764, 300]]));
				await settle();
				controller.disable();
				expect(drawn).toEqual([
					{ code: 300, x: 2, y: 3 },
					{ code, x: 3, y: 3 },
				]);
			});

			it.each([
				['ArrowDown', [3, 4]],
				['Home', [0, 3]],
			])('%s waits for the glyph to land', async (key, at) => {
				const cursor = liveCursor(2, 3);
				const controller = createKeyboardController();
				controller.enable();
				press(document.body, { key: '❤', code: 'Digit3' });
				press(document.body, { key, code: key });
				await settle();
				expect([cursor.getX(), cursor.getY()]).toEqual([2, 3]);
				release(new Map([[0x2764, 300]]));
				await settle();
				controller.disable();
				expect(drawn).toEqual([{ code: 300, x: 2, y: 3 }]);
				expect([cursor.getX(), cursor.getY()]).toEqual(at);
			});

			it('a glyph that does not resolve in 10 s lands as the substitute and the keys behind it move on', async () => {
				vi.useFakeTimers();
				// the wait counts visible time only
				Object.defineProperty(document, 'hidden', {
					configurable: true,
					get: () => false,
				});
				try {
					const cursor = liveCursor(2, 3);
					const controller = createKeyboardController();
					controller.enable();
					press(document.body, { key: '❤', code: 'Digit3' });
					press(document.body, { key: 'ArrowDown', code: 'ArrowDown' });
					await vi.advanceTimersByTimeAsync(9999);
					expect(drawn).toEqual([]);
					expect([cursor.getX(), cursor.getY()]).toEqual([2, 3]);
					await vi.advanceTimersByTimeAsync(1);
					controller.disable();
					expect(drawn).toEqual([{ code: 63, x: 2, y: 3 }]);
					expect([cursor.getX(), cursor.getY()]).toEqual([3, 4]);
					// a resolve past the wait draws nothing more
					release(new Map([[0x2764, 300]]));
					await vi.advanceTimersByTimeAsync(0);
					expect(drawn).toEqual([{ code: 63, x: 2, y: 3 }]);
					expect([cursor.getX(), cursor.getY()]).toEqual([3, 4]);
				} finally {
					delete document.hidden;
					vi.useRealTimers();
				}
			});
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

		describe('Enter follows the keyboard tool rule', () => {
			let tool;
			let button;
			const enter = (target, code = 'Enter') => {
				const e = new KeyboardEvent('keydown', {
					key: 'Enter',
					code,
					bubbles: true,
					cancelable: true,
				});
				target.dispatchEvent(e);
				return e;
			};
			beforeEach(() => {
				button = document.createElement('button');
				document.body.appendChild(button);
				tool = createSelectionTool();
				tool.enable();
			});
			afterEach(() => tool.disable());

			it('Enter on a button the keyboard reached is left to the button', () => {
				button.focus();
				const e = enter(button);
				expect(e.defaultPrevented).toBe(false);
				expect(Toolbar.switchTool).not.toHaveBeenCalled();
				expect(State.cursor.newLine).not.toHaveBeenCalled();
			});

			it('Enter on a button a pointer press focused returns to keyboard mode and newlines', () => {
				clickFocus(button);
				const e = enter(button);
				expect(e.defaultPrevented).toBe(true);
				expect(Toolbar.switchTool).toHaveBeenCalledWith('keyboard');
				expect(State.cursor.newLine).toHaveBeenCalledOnce();
			});

			it('NumpadEnter returns to keyboard mode from the canvas', () => {
				const e = enter(document.body, 'NumpadEnter');
				expect(e.defaultPrevented).toBe(true);
				expect(Toolbar.switchTool).toHaveBeenCalledWith('keyboard');
				expect(State.cursor.newLine).toHaveBeenCalledOnce();
			});
		});

		describe('the focused control rule', () => {
			let tool;
			let button;
			let seen;
			const arrow = init => {
				const e = new KeyboardEvent('keydown', {
					bubbles: true,
					cancelable: true,
					...init,
				});
				button.dispatchEvent(e);
				return e;
			};
			beforeEach(() => {
				State.selectionCursor = createSelectionCursor(document.createElement('div'));
				State.selectionCursor.setStart(10, 5);
				State.selectionCursor.setEnd(10, 5);
				button = document.createElement('button');
				document.body.appendChild(button);
				seen = [];
				button.addEventListener('keydown', e => seen.push(e.defaultPrevented));
				tool = createSelectionTool();
				tool.enable();
			});
			afterEach(() => tool.disable());

			it.each([
				['ArrowRight', {}],
				['shift ArrowRight', { shiftKey: true }],
			])('%s on a control the keyboard reached is left to it', (_, mods) => {
				button.focus();
				const e = arrow({ key: 'ArrowRight', code: 'ArrowRight', ...mods });
				expect(e.defaultPrevented).toBe(false);
				expect(seen).toEqual([false]);
				expect(State.selectionCursor.getSelection()).toEqual({
					x: 10,
					y: 5,
					width: 1,
					height: 1,
				});
			});

			it('an arrow on a control a pointer press focused reaches it cancelled and moves the rect', () => {
				clickFocus(button);
				arrow({ key: 'ArrowRight', code: 'ArrowRight' });
				expect(seen).toEqual([true]);
				expect(State.selectionCursor.getSelection()).toEqual({
					x: 11,
					y: 5,
					width: 1,
					height: 1,
				});
			});

			it('Space on a control the keyboard reached is left to it', () => {
				button.focus();
				expect(arrow({ key: ' ', code: 'Space' }).defaultPrevented).toBe(false);
			});

			it('Space on a control a pointer press focused cannot press it', () => {
				clickFocus(button);
				expect(arrow({ key: ' ', code: 'Space' }).defaultPrevented).toBe(true);
				expect(State.selectionCursor.getSelection()).toEqual({
					x: 10,
					y: 5,
					width: 1,
					height: 1,
				});
			});

			it('Home and End on a slider the keyboard reached are left to it', () => {
				const slider = document.createElement('input');
				slider.type = 'range';
				document.body.appendChild(slider);
				slider.focus();
				const kept = ['Home', 'End'].map(code => {
					const e = new KeyboardEvent('keydown', {
						key: code,
						code,
						bubbles: true,
						cancelable: true,
					});
					slider.dispatchEvent(e);
					return !e.defaultPrevented;
				});
				expect(kept).toEqual([true, true]);
				expect(State.selectionCursor.getSelection()).toEqual({
					x: 10,
					y: 5,
					width: 1,
					height: 1,
				});
			});

			it('Enter and the arrows on a clicked checkbox in a dialog are left to it', () => {
				const box = document.createElement('input');
				box.type = 'checkbox';
				document.body.appendChild(box);
				clickFocus(box);
				State.modal = { isOpen: () => true };
				const keys = ['Enter', 'ArrowRight', 'ArrowDown'].map(code => {
					const e = new KeyboardEvent('keydown', {
						key: code,
						code,
						bubbles: true,
						cancelable: true,
					});
					box.dispatchEvent(e);
					return e.defaultPrevented;
				});
				delete State.modal;
				expect(keys).toEqual([false, false, false]);
				expect(Toolbar.switchTool).not.toHaveBeenCalled();
				expect(State.selectionCursor.getSelection()).toEqual({
					x: 10,
					y: 5,
					width: 1,
					height: 1,
				});
			});
		});

		describe('a fresh pick', () => {
			let tool;
			beforeEach(() => {
				State.selectionCursor = createSelectionCursor(document.createElement('div'));
				State.cursor.getX.mockReturnValue(10);
				State.cursor.getY.mockReturnValue(5);
				tool = createSelectionTool();
				tool.enable();
			});
			afterEach(() => tool.disable());

			it('opens without a rect or a restore memory', () => {
				expect(State.selectionCursor.isVisible()).toBe(false);
				expect(State.selectionCursor.getLastSelection()).toBe(null);
				expect(State.selectionCursor.getElement().style.display).toBe('none');
			});

			it('starts a rect at the keyboard cursor on the first arrow', () => {
				document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
				expect(State.selectionCursor.getSelection()).toEqual({
					x: 11,
					y: 5,
					width: 1,
					height: 1,
				});
			});

			it('starts a rect at the keyboard cursor when move mode turns on', () => {
				tool.toggleMoveMode();
				expect(tool.isMoveMode()).toBe(true);
				expect(State.selectionCursor.getSelection()).toEqual({
					x: 10,
					y: 5,
					width: 1,
					height: 1,
				});
				tool.toggleMoveMode();
			});
		});

		describe('rect keys on a bare pick act on the keyboard cursor cell', () => {
			const cell = { x: 10, y: 5, width: 1, height: 1 };
			const press = (init, target = document.body) =>
				target.dispatchEvent(
					new KeyboardEvent('keydown', { bubbles: true, ...init }),
				);
			const fillBuffer = () => {
				State.pasteTool.setSelection(0, 0, 1, 1);
				State.pasteTool.copy();
				State.pasteTool.disable();
				State.textArtCanvas.getAreaCells.mockClear();
			};
			let tool;
			let drawn;
			beforeEach(() => {
				const item = () => document.createElement('div');
				// boot order: the paste tool's permanent listener registers
				// long before the selection tool's
				State.pasteTool = createPasteTool(item(), item(), item(), item());
				State.selectionCursor = createSelectionCursor(document.createElement('div'));
				State.cursor.getX.mockReturnValue(10);
				State.cursor.getY.mockReturnValue(5);
				drawn = [];
				State.textArtCanvas.draw = vi.fn(callback =>
					callback((code, _fg, _bg, x, y) => drawn.push({ code, x, y })));
				tool = createSelectionTool();
				tool.enable();
			});
			afterEach(() => tool.disable());

			it('ctrl c copies it', () => {
				press({ code: 'KeyC', ctrlKey: true });
				expect(State.selectionCursor.getSelection()).toEqual(cell);
				expect(State.textArtCanvas.getAreaCells).toHaveBeenCalledOnce();
				expect(State.textArtCanvas.getAreaCells).toHaveBeenCalledWith(10, 5, 1, 1);
				expect(State.pasteTool.hasBuffer()).toBe(true);
			});

			it('ctrl x cuts it in one undo step', () => {
				press({ code: 'KeyX', metaKey: true });
				expect(State.textArtCanvas.getAreaCells).toHaveBeenCalledWith(10, 5, 1, 1);
				expect(State.textArtCanvas.deleteArea).toHaveBeenCalledOnce();
				expect(State.textArtCanvas.deleteArea).toHaveBeenCalledWith(10, 5, 1, 1, 0);
				expect(State.textArtCanvas.startUndo).toHaveBeenCalledOnce();
			});

			it('ctrl v pastes the buffer there once', () => {
				fillBuffer();
				press({ code: 'KeyV', ctrlKey: true });
				expect(State.selectionCursor.getSelection()).toEqual(cell);
				expect(State.textArtCanvas.setAreaCells).toHaveBeenCalledOnce();
				expect(State.textArtCanvas.setAreaCells).toHaveBeenCalledWith(
					expect.anything(),
					10,
					5,
				);
				expect(State.textArtCanvas.startUndo).toHaveBeenCalledOnce();
			});

			it('ctrl shift v pastes the system clipboard there', async () => {
				const readText = vi.fn(() => Promise.resolve('Z'));
				Object.defineProperty(navigator, 'clipboard', {
					value: { readText },
					configurable: true,
				});
				try {
					press({ code: 'KeyV', ctrlKey: true, shiftKey: true });
					await new Promise(resolve => setTimeout(resolve, 0));
					expect(readText).toHaveBeenCalledOnce();
					expect(drawn).toEqual([{ code: 90, x: 10, y: 5 }]);
					expect(State.textArtCanvas.startUndo).toHaveBeenCalledOnce();
				} finally {
					delete navigator.clipboard;
				}
			});

			it('ctrl backspace deletes it in one undo step', () => {
				press({ code: 'Backspace', ctrlKey: true });
				expect(State.textArtCanvas.deleteArea).toHaveBeenCalledOnce();
				expect(State.textArtCanvas.deleteArea).toHaveBeenCalledWith(10, 5, 1, 1, 0);
				expect(State.textArtCanvas.startUndo).toHaveBeenCalledOnce();
			});

			it('[ and ] flip it', () => {
				press({ key: '[' });
				expect(State.selectionCursor.getSelection()).toEqual(cell);
				expect(drawn).toEqual([{ code: 32, x: 10, y: 5 }]);
				State.selectionCursor.hide();
				press({ key: ']' });
				expect(drawn).toEqual([
					{ code: 32, x: 10, y: 5 },
					{ code: 32, x: 10, y: 5 },
				]);
				expect(State.textArtCanvas.startUndo).toHaveBeenCalledTimes(2);
			});

			it('ctrl shift v without the Clipboard API leaves the tool bare', () => {
				const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
				expect(navigator.clipboard).toBeUndefined();
				press({ code: 'KeyV', ctrlKey: true, shiftKey: true });
				expect(State.selectionCursor.isVisible()).toBe(false);
				expect(warn).not.toHaveBeenCalled();
			});

			it('ctrl v with an empty buffer leaves the tool bare', () => {
				press({ code: 'KeyV', ctrlKey: true });
				expect(State.selectionCursor.isVisible()).toBe(false);
				expect(State.textArtCanvas.setAreaCells).not.toHaveBeenCalled();
			});

			it('combos the paste tool ignores leave the tool bare', () => {
				fillBuffer();
				press({ code: 'KeyV', ctrlKey: true, altKey: true });
				press({ code: 'KeyC', ctrlKey: true, shiftKey: true });
				press({ code: 'KeyX', ctrlKey: true, altKey: true });
				press({ code: 'KeyC' });
				press({ key: '[', altKey: true });
				expect(State.selectionCursor.isVisible()).toBe(false);
				expect(State.textArtCanvas.getAreaCells).not.toHaveBeenCalled();
				expect(State.textArtCanvas.startUndo).not.toHaveBeenCalled();
			});

			it('keys typed into a field or a dialog leave the tool bare', () => {
				const input = document.createElement('input');
				document.body.appendChild(input);
				press({ code: 'KeyC', ctrlKey: true }, input);
				press({ key: '[' }, input);
				expect(State.selectionCursor.isVisible()).toBe(false);

				State.modal = { isOpen: () => true };
				try {
					press({ code: 'KeyC', ctrlKey: true });
				} finally {
					delete State.modal;
				}
				expect(State.selectionCursor.isVisible()).toBe(false);
				expect(State.textArtCanvas.getAreaCells).not.toHaveBeenCalled();
			});

			it('a live rect keeps its geometry', () => {
				State.selectionCursor.setStart(2, 3);
				State.selectionCursor.setEnd(4, 3);
				press({ code: 'KeyC', ctrlKey: true });
				expect(State.textArtCanvas.getAreaCells).toHaveBeenCalledWith(2, 3, 3, 1);
			});

			it('leaving the tool takes the seed with it', () => {
				tool.disable();
				press({ code: 'KeyC', ctrlKey: true });
				expect(State.selectionCursor.isVisible()).toBe(false);
			});
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
