import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import State from '../../src/js/client/state.js';
import Toolbar from '../../src/js/client/toolbar.js';
import {
	createPaintShortcuts,
	createSegmentedControl,
} from '../../src/js/client/ui.js';
import {
	createCursor,
	createKeyboardController,
	createPasteTool,
	createSelectionTool,
} from '../../src/js/client/keyboard.js';

vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

vi.mock('../../src/js/client/toolbar.js', () => ({ default: { switchTool: vi.fn() } }));

// these handlers sit on the document and decide by focus, so the keys
// go through user-event from whatever element holds focus
describe('Keyboard shortcuts and focus', () => {
	let user;
	let listeners;

	const focusField = tag => {
		const el = document.createElement(tag);
		document.body.appendChild(el);
		el.focus();
		return el;
	};

	const addById = (tag, ...ids) =>
		ids.forEach(id => {
			const el = document.createElement(tag);
			el.id = id;
			document.body.appendChild(el);
		});

	const createTool = () => {
		const item = () => document.createElement('div');
		return createPasteTool(item(), item(), item(), item());
	};

	beforeEach(() => {
		document.body.innerHTML = '';
		user = userEvent.setup();
		Object.assign(State, {
			palette: {
				getForegroundColor: vi.fn(() => 7),
				setForegroundColor: vi.fn(),
				getBackgroundColor: vi.fn(() => 0),
			},
			cursor: { isVisible: vi.fn(() => false) },
			selectionCursor: {
				isVisible: vi.fn(() => true),
				getSelection: vi.fn(() => ({ x: 1, y: 2, width: 3, height: 1 })),
				getElement: vi.fn(() => document.createElement('div')),
				show: vi.fn(),
				hide: vi.fn(),
			},
			textArtCanvas: {
				startUndo: vi.fn(),
				getAreaCells: vi.fn(() => ({ cells: [], width: 3, height: 1 })),
				setAreaCells: vi.fn(),
				deleteArea: vi.fn(),
				getBlock: vi.fn(() => ({
					charCode: 65,
					foregroundColor: 7,
					backgroundColor: 0,
				})),
				draw: vi.fn(),
			},
			pasteTool: { disable: vi.fn() },
		});
		// the paste tool and the paint shortcuts hook the document for
		// good: drop every listener a test adds before the next one runs
		listeners = [];
		const add = document.addEventListener;
		vi.spyOn(document, 'addEventListener').mockImplementation((...args) => {
			listeners.push(args);
			add.apply(document, args);
		});
	});

	afterEach(() => {
		listeners.forEach(args => document.removeEventListener(...args));
		vi.restoreAllMocks();
	});

	it('paint shortcuts fire from the page and never from a text entry', async () => {
		const brush = document.createElement('button');
		const onClick = vi.fn();
		brush.addEventListener('click', onClick);
		document.body.appendChild(brush);
		createPaintShortcuts({ f: brush });

		await user.keyboard('f3');
		expect(onClick).toHaveBeenCalledTimes(1);
		expect(State.palette.setForegroundColor).toHaveBeenCalledWith(3);

		for (const tag of ['input', 'textarea', 'select']) {
			focusField(tag);
			await user.keyboard('f3');
		}
		expect(onClick).toHaveBeenCalledTimes(1);
		expect(State.palette.setForegroundColor).toHaveBeenCalledTimes(1);
	});

	it('Ctrl paint shortcuts fire from the page and never from a text entry', async () => {
		const attrib = document.createElement('button');
		const onClick = vi.fn();
		attrib.addEventListener('click', onClick);
		document.body.appendChild(attrib);
		createPaintShortcuts({ a: attrib });

		await user.keyboard('{Control>}a{/Control}');
		expect(onClick).toHaveBeenCalledTimes(1);

		for (const tag of ['input', 'textarea', 'select']) {
			focusField(tag);
			await user.keyboard('{Control>}a{/Control}');
		}
		expect(onClick).toHaveBeenCalledTimes(1);

		// Ctrl+A in a field is the browser's select all
		const field = focusField('input');
		field.value = 'abc';
		field.setSelectionRange(3, 3);
		await user.keyboard('{Control>}a{/Control}');
		expect([field.selectionStart, field.selectionEnd]).toEqual([0, 3]);
	});

	it('Ctrl+C, Ctrl+V, and Ctrl+Backspace copy, paste, and delete the selection', async () => {
		const { getAreaCells, setAreaCells, deleteArea } = State.textArtCanvas;
		const tool = createTool();

		tool.setSelection(1, 2, 3, 1);
		await user.keyboard('{Control>}c{/Control}');
		expect(getAreaCells).toHaveBeenCalledWith(1, 2, 3, 1);

		tool.setSelection(5, 6, 3, 1);
		await user.keyboard('{Control>}v{/Control}');
		expect(setAreaCells).toHaveBeenCalledWith(
			getAreaCells.mock.results[0].value,
			5,
			6,
		);

		await user.keyboard('{Control>}{Backspace}{/Control}');
		expect(deleteArea).toHaveBeenCalledWith(5, 6, 3, 1, 0);
	});

	it('clipboard keys in a text entry leave the canvas alone', async () => {
		const { getAreaCells, setAreaCells, deleteArea } = State.textArtCanvas;
		const tool = createTool();
		tool.setSelection(1, 2, 3, 1);
		// a filled buffer, so a leaked Ctrl+V would have something to paste
		await user.keyboard('{Control>}c{/Control}');

		focusField('input');
		await user.keyboard('{Control>}v{/Control}{Control>}x{/Control}');
		focusField('textarea');
		await user.keyboard('{Control>}c{/Control}{Control>}{Backspace}{/Control}');

		expect(getAreaCells).toHaveBeenCalledTimes(1);
		expect(setAreaCells).not.toHaveBeenCalled();
		expect(deleteArea).not.toHaveBeenCalled();
	});

	it('clipboard keys on a clicked checkbox in a dialog leave the canvas alone', async () => {
		const { getAreaCells, setAreaCells, deleteArea } = State.textArtCanvas;
		const tool = createTool();
		tool.setSelection(1, 2, 3, 1);
		// a filled buffer, so a leaked Ctrl+V would have something to paste
		await user.keyboard('{Control>}c{/Control}');

		const box = document.createElement('input');
		box.type = 'checkbox';
		document.body.appendChild(box);
		await user.click(box);
		State.modal = { isOpen: () => true };
		try {
			await user.keyboard(
				'{Control>}x{/Control}{Control>}v{/Control}{Control>}{Backspace}{/Control}',
			);
		} finally {
			delete State.modal;
		}

		expect(getAreaCells).toHaveBeenCalledTimes(1);
		expect(setAreaCells).not.toHaveBeenCalled();
		expect(deleteArea).not.toHaveBeenCalled();
	});

	it('selection keys flip and toggle move mode from the page only', async () => {
		addById('div', 'viewport', 'selectionToolbar');
		addById('button', 'flipHorizontal', 'flipVertical', 'moveBlocks');
		const tool = createSelectionTool();
		tool.enable();

		focusField('input');
		// '[[' is user-event's escape for a literal '['
		await user.keyboard('[[m');
		expect(State.textArtCanvas.startUndo).not.toHaveBeenCalled();
		expect(tool.isMoveMode()).toBe(false);

		document.activeElement.blur();
		await user.keyboard('[[m');
		expect(State.textArtCanvas.startUndo).toHaveBeenCalledTimes(1);
		expect(tool.isMoveMode()).toBe(true);
		tool.disable();
	});

	it('Enter presses a button the keyboard reached in the selection tool', async () => {
		Toolbar.switchTool.mockClear();
		addById('div', 'viewport', 'selectionToolbar');
		addById('button', 'flipHorizontal', 'flipVertical', 'moveBlocks');
		const tool = createSelectionTool();
		tool.enable();
		const button = document.createElement('button');
		const onClick = vi.fn();
		button.addEventListener('click', onClick);
		document.body.appendChild(button);
		button.focus();
		await user.keyboard('{Enter}');
		tool.disable();
		expect(onClick).toHaveBeenCalledTimes(1);
		expect(Toolbar.switchTool).not.toHaveBeenCalled();
	});

	describe('the keyboard tool and focus', () => {
		let controller;
		let drawn;

		const settle = () => new Promise(resolve => setTimeout(resolve, 0));

		const clickable = () => {
			const button = document.createElement('button');
			const onClick = vi.fn();
			button.addEventListener('click', onClick);
			document.body.appendChild(button);
			return { button, onClick };
		};

		beforeEach(() => {
			addById('div', 'viewport');
			Object.assign(State, {
				font: { getWidth: () => 8, getHeight: () => 16 },
				positionInfo: { update: vi.fn() },
				pasteTool: { setSelection: vi.fn(), disable: vi.fn() },
			});
			State.textArtCanvas.getColumns = () => 80;
			State.textArtCanvas.getRows = () => 25;
			State.selectionCursor.isVisible = vi.fn(() => false);
			State.cursor = createCursor(document.createElement('div'));
			State.cursor.move(2, 3);
			drawn = [];
			State.textArtCanvas.draw = vi.fn(callback =>
				callback((code, _fg, _bg, x, y) => drawn.push({ code, x, y })));
			controller = createKeyboardController();
			controller.enable();
		});

		afterEach(() => controller.disable());

		it('a frames panel field keeps its digits, Backspace, Enter, and arrows', async () => {
			const field = document.createElement('input');
			field.type = 'number';
			field.id = 'frameDelay';
			document.body.appendChild(field);
			field.focus();
			await user.keyboard('12{Backspace}{Enter}{ArrowUp}{Home}');
			await settle();
			expect(field.value).toBe('1');
			expect(drawn).toEqual([]);
			expect([State.cursor.getX(), State.cursor.getY()]).toEqual([2, 3]);
		});

		it('Space presses a button the keyboard reached and types nothing', async () => {
			const { button, onClick } = clickable();
			button.focus();
			await user.keyboard(' ');
			await settle();
			expect(onClick).toHaveBeenCalledTimes(1);
			expect(drawn).toEqual([]);
		});

		it('Space on a clicked button types a space and does not press it', async () => {
			const { button, onClick } = clickable();
			await user.click(button);
			expect(document.activeElement).toBe(button);
			await user.keyboard('a b');
			await settle();
			expect(onClick).toHaveBeenCalledTimes(1);
			expect(drawn.map(cell => cell.code)).toEqual([97, 32, 98]);
		});

		// a touch tap focuses on the mouse events that follow its lift
		it('Space after a tap on a button types a space and does not press it', async () => {
			const { button, onClick } = clickable();
			for (const type of ['pointerdown', 'pointerup', 'mousedown']) {
				button.dispatchEvent(new Event(type, { bubbles: true }));
			}
			button.focus();
			button.dispatchEvent(new Event('mouseup', { bubbles: true }));
			button.click();
			await user.keyboard(' ');
			await settle();
			expect(onClick).toHaveBeenCalledTimes(1);
			expect(drawn.map(cell => cell.code)).toEqual([32]);
		});

		// touch on the canvas moves no focus, so the control keeps it
		it('Space and arrows after a press on the canvas go to the canvas', async () => {
			const { button, onClick } = clickable();
			button.focus();
			addById('div', 'canvasContainer');
			const tile = document.createElement('canvas');
			document.getElementById('canvasContainer').appendChild(tile);
			for (const type of ['pointerdown', 'pointerup']) {
				tile.dispatchEvent(new Event(type, { bubbles: true }));
			}
			expect(document.activeElement).toBe(button);
			await user.keyboard(' {ArrowDown}');
			await settle();
			expect(onClick).not.toHaveBeenCalled();
			expect(drawn.map(cell => cell.code)).toEqual([32]);
			expect([State.cursor.getX(), State.cursor.getY()]).toEqual([3, 4]);
		});

		describe('a clicked button that gets focus back', () => {
			let button;
			let onClick;
			let elsewhere;
			beforeEach(async () => {
				elsewhere = document.createElement('button');
				document.body.appendChild(elsewhere);
				({ button, onClick } = clickable());
				await user.click(button);
			});

			it.each([
				[
					'a dialog closes',
					async () => {
						elsewhere.focus();
						button.focus();
					},
				],
				[
					'Escape closes a menu',
					async () => {
						elsewhere.focus();
						document.addEventListener('keydown', e => {
							if (e.key === 'Escape') {
								button.focus();
							}
						});
						await user.keyboard('{Escape}');
					},
				],
				[
					'a window switch',
					async () => {
						window.dispatchEvent(new Event('blur'));
						button.blur();
						button.focus();
					},
				],
			])('Space and arrows go to the canvas after %s', async (_, handBack) => {
				await handBack();
				expect(document.activeElement).toBe(button);
				await user.keyboard(' {ArrowDown}');
				await settle();
				expect(onClick).toHaveBeenCalledTimes(1);
				expect(drawn.map(cell => cell.code)).toEqual([32]);
				expect([State.cursor.getX(), State.cursor.getY()]).toEqual([3, 4]);
			});

			it('is the keyboard\'s again once Tab reaches it', async () => {
				elsewhere.focus();
				await user.tab();
				expect(document.activeElement).toBe(button);
				await user.keyboard(' ');
				await settle();
				expect(onClick).toHaveBeenCalledTimes(2);
				expect(drawn).toEqual([]);
			});

			// a menu reopening focuses its last pick fresh, and a dialog
			// that could not refocus its opener leaves it a fresh stop
			it.each([
				['after focus left it for the page', () => button.blur()],
				[
					'after a dialog closed without refocusing it',
					() => {
						elsewhere.focus();
						document.body.dispatchEvent(new Event('close'));
						elsewhere.blur();
					},
				],
			])('is keyboard-reached when a script focuses it %s', async (_, away) => {
				away();
				button.focus();
				await user.keyboard(' ');
				await settle();
				expect(onClick).toHaveBeenCalledTimes(2);
				expect(drawn).toEqual([]);
			});
		});

		it.each([
			['a context menu', () => document.dispatchEvent(new Event('contextmenu'))],
			['a window switch', () => window.dispatchEvent(new Event('blur'))],
		])('a press %s ends leaves the next focus to the keyboard', async (_, end) => {
			const { button, onClick } = clickable();
			document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
			end();
			button.focus();
			await user.keyboard(' ');
			await settle();
			expect(onClick).toHaveBeenCalledTimes(1);
			expect(drawn).toEqual([]);
		});

		it('arrows step a segmented control the keyboard reached and leave the canvas cursor', async () => {
			const control = createSegmentedControl(
				'testMode',
				[
					{ value: 'block', label: 'Block' },
					{ value: 'oldskool', label: 'Old Skool' },
				],
				vi.fn(),
			);
			document.body.appendChild(control.getElement());
			document.querySelector('#testMode [data-value="block"]').focus();
			await user.keyboard('{ArrowRight}');
			await settle();
			expect(control.value()).toBe('oldskool');
			expect([State.cursor.getX(), State.cursor.getY()]).toEqual([2, 3]);
		});

		it('letters and arrows after a click on a range slider go to the canvas', async () => {
			const slider = document.createElement('input');
			slider.type = 'range';
			slider.value = '5';
			document.body.appendChild(slider);
			await user.click(slider);
			const value = slider.value;
			await user.keyboard('ab{ArrowDown}');
			await settle();
			expect(drawn.map(cell => cell.code)).toEqual([97, 98]);
			expect([State.cursor.getX(), State.cursor.getY()]).toEqual([4, 4]);
			expect(slider.value).toBe(value);
		});

		it('arrows on a clicked segmented control move the canvas cursor and leave the control', async () => {
			const control = createSegmentedControl(
				'testMode',
				[
					{ value: 'block', label: 'Block' },
					{ value: 'oldskool', label: 'Old Skool' },
				],
				vi.fn(),
			);
			document.body.appendChild(control.getElement());
			await user.click(document.querySelector('#testMode [data-value="block"]'));
			await user.keyboard('{ArrowRight}');
			await settle();
			expect(control.value()).toBe('block');
			expect([State.cursor.getX(), State.cursor.getY()]).toEqual([3, 3]);
		});

		it('clicks a focused button and leaves the cursor', async () => {
			const button = document.createElement('button');
			const onClick = vi.fn();
			button.addEventListener('click', onClick);
			document.body.appendChild(button);
			button.focus();
			await user.keyboard('{Enter}');
			expect(onClick).toHaveBeenCalledTimes(1);
			expect([State.cursor.getX(), State.cursor.getY()]).toEqual([2, 3]);
		});

		it('newlines the canvas from the page', async () => {
			await user.keyboard('{Enter}');
			await new Promise(resolve => setTimeout(resolve, 0));
			expect([State.cursor.getX(), State.cursor.getY()]).toEqual([0, 4]);
		});
	});
});
