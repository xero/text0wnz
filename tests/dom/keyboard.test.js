import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import State from '../../src/js/client/state.js';
import { createPaintShortcuts } from '../../src/js/client/ui.js';
import {
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
});
