import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createCursor,
	createSelectionCursor,
	createSelectionTool,
} from '../../src/js/client/keyboard.js';
import { createSelectionBar } from '../../src/js/client/selectionBar.js';
import State from '../../src/js/client/state.js';

vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

vi.mock('../../src/js/client/toolbar.js', () => ({
	default: {
		getCurrentTool: () => 'selection',
		switchTool: vi.fn(),
	},
}));

// the real cursors and selection tool, so a deselect is judged by
// where the next rect starts and what the tool brings back
describe('Deselect', () => {
	let listeners;
	let tool;
	let bar;

	beforeEach(() => {
		document.body.innerHTML = '';
		for (const [tag, id] of [
			['div', 'viewport'],
			['div', 'selectionToolbar'],
			['button', 'deselect'],
			['button', 'flipHorizontal'],
			['button', 'flipVertical'],
			['button', 'moveBlocks'],
		]) {
			const el = document.createElement(tag);
			el.id = id;
			document.body.appendChild(el);
		}
		// the cursors and the bar hook the document for good: drop every
		// listener a test adds before the next one runs
		listeners = [];
		const add = document.addEventListener;
		vi.spyOn(document, 'addEventListener').mockImplementation((...args) => {
			listeners.push(args);
			add.apply(document, args);
		});
		Object.assign(State, {
			font: { getWidth: () => 8, getHeight: () => 16 },
			textArtCanvas: { getColumns: () => 80, getRows: () => 25 },
			positionInfo: { update: vi.fn() },
			pasteTool: { setSelection: vi.fn(), disable: vi.fn() },
		});
		State.selectionCursor = createSelectionCursor(document.createElement('div'));
		State.cursor = createCursor(document.createElement('div'));
		// typing left the keyboard cursor far from the rect
		State.cursor.move(1, 0);
		tool = createSelectionTool();
		State.selectionTool = tool;
		tool.enable();
		bar = createSelectionBar();
		State.selectionCursor.setStart(10, 5);
		State.selectionCursor.setEnd(12, 6);
	});

	afterEach(() => {
		listeners.forEach(args => document.removeEventListener(...args));
		vi.restoreAllMocks();
		delete State.selectionTool;
	});

	it('parks the keyboard cursor at the rect origin and keeps it hidden', () => {
		expect(bar.dismiss()).toBe(true);
		expect(State.selectionCursor.isVisible()).toBe(false);
		expect([State.cursor.getX(), State.cursor.getY()]).toEqual([10, 5]);
		expect(State.cursor.isVisible()).toBe(false);
	});

	it('the next arrow starts a rect where the deselected one was', () => {
		bar.dismiss();
		document.dispatchEvent(
			new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' }),
		);
		expect(State.selectionCursor.getSelection()).toEqual({
			x: 11,
			y: 5,
			width: 1,
			height: 1,
		});
	});

	it('forgets the rect, so coming back to the tool brings nothing back', () => {
		bar.dismiss();
		expect(State.selectionCursor.getLastSelection()).toBe(null);
		tool.disable();
		tool.enable();
		expect(State.selectionCursor.isVisible()).toBe(false);
	});

	it('leaves the cursor alone when nothing is selected', () => {
		State.selectionCursor.hide();
		expect(bar.dismiss()).toBe(false);
		expect([State.cursor.getX(), State.cursor.getY()]).toEqual([1, 0]);
	});
});
