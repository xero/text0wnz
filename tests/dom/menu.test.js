import { describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { createFlyoutManager } from '../../src/js/client/flyouts.js';

/**
 * The flyout manager carries every rail popover, the tabbed File/Edit
 * menu included: toggle semantics, outside-press close, Escape with
 * focus return, and arrow-key walking.
 */

const fixture = () => {
	document.body.innerHTML = `
		<div id="rail">
			<button id="fileMenu" aria-label="File and Edit Menu"></button>
			<button id="brushes" aria-label="Brushes"></button>
			<button id="elsewhere"></button>
		</div>
		<div id="mainMenu" class="flyout" hidden>
			<nav class="menuTabs">
				<button id="menuTabFile" class="on">File</button>
				<button id="menuTabEdit">Edit</button>
			</nav>
			<div id="fileList" class="menuPane">
				<article id="new" class="menuItem">New</article>
				<article id="open" class="menuItem">Open</article>
			</div>
			<div id="editList" class="menuPane hide">
				<article id="navUndo" class="menuItem">Undo</article>
			</div>
		</div>
		<div id="brushToolbar" class="flyout" hidden>
			<div id="halfblock" class="toolButton"></div>
			<div id="shadingBrush" class="toolButton"></div>
		</div>`;
};

// happy-dom lacks PointerEvent; the manager only reads target
const press = el =>
	el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

describe('flyout manager', () => {
	let fly;

	beforeEach(() => {
		fixture();
		fly = createFlyoutManager();
	});

	it('toggle opens, the same id closes, another id swaps', () => {
		const menu = document.getElementById('mainMenu');
		const brushes = document.getElementById('brushToolbar');
		fly.toggle('menu', menu, document.getElementById('fileMenu'));
		expect(menu.hidden).toBe(false);
		expect(fly.isOpen('menu')).toBe(true);

		fly.toggle('brushes', brushes, document.getElementById('brushes'));
		expect(menu.hidden).toBe(true);
		expect(brushes.hidden).toBe(false);

		fly.toggle('brushes', brushes, document.getElementById('brushes'));
		expect(brushes.hidden).toBe(true);
		expect(fly.isOpen()).toBe(false);
	});

	it('a press outside closes, a press inside does not', () => {
		const menu = document.getElementById('mainMenu');
		fly.toggle('menu', menu, document.getElementById('fileMenu'));
		press(document.getElementById('new'));
		expect(menu.hidden).toBe(false);
		press(document.getElementById('elsewhere'));
		expect(menu.hidden).toBe(true);
	});

	it('a press on the opener leaves the toggle to its own handler', () => {
		const menu = document.getElementById('mainMenu');
		const opener = document.getElementById('fileMenu');
		fly.toggle('menu', menu, opener);
		press(opener);
		expect(menu.hidden).toBe(false);
	});

	it('closeAndFocus reports whether anything closed and refocuses', () => {
		const menu = document.getElementById('mainMenu');
		const opener = document.getElementById('fileMenu');
		expect(fly.closeAndFocus()).toBe(false);
		fly.toggle('menu', menu, opener);
		expect(fly.closeAndFocus()).toBe(true);
		expect(document.activeElement).toBe(opener);
	});

	it('arrow keys walk the items and skip hidden panes', () => {
		const menu = document.getElementById('mainMenu');
		fly.toggle('menu', menu, document.getElementById('fileMenu'));
		document.getElementById('menuTabFile').focus();
		const walk = () =>
			document.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
			);
		walk();
		expect(document.activeElement).toBe(
			document.getElementById('menuTabEdit'),
		);
		walk();
		// the edit pane wears .hide, so its items never take focus
		expect(document.activeElement).toBe(document.getElementById('new'));
	});

	it('focuses the active item when opening', () => {
		const menu = document.getElementById('mainMenu');
		fly.toggle('menu', menu, document.getElementById('fileMenu'));
		expect(document.activeElement).toBe(
			document.getElementById('menuTabFile'),
		);
	});

	it('Tab cycles inside the flyout instead of leaving it', () => {
		const menu = document.getElementById('mainMenu');
		fly.toggle('menu', menu, document.getElementById('fileMenu'));
		document.getElementById('menuTabFile').focus();
		const tab = shiftKey =>
			document.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true }),
			);
		tab(false);
		expect(document.activeElement).toBe(
			document.getElementById('menuTabEdit'),
		);
		// shift-tab walks back, never out the top
		tab(true);
		expect(document.activeElement).toBe(
			document.getElementById('menuTabFile'),
		);
		tab(true);
		expect(document.activeElement.id).not.toBe('');
		expect(menu.contains(document.activeElement)).toBe(true);
	});

	it('Tab pulls wandering focus back into the open flyout', () => {
		const menu = document.getElementById('mainMenu');
		fly.toggle('menu', menu, document.getElementById('fileMenu'));
		document.body.focus?.();
		document.getElementById('fileMenu').focus();
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
		);
		expect(menu.contains(document.activeElement)).toBe(true);
	});
});

describe('menu tab panes', () => {
	// the tab wiring lives in main.js; this covers the pane contract the
	// markup and CSS rely on
	beforeEach(fixture);

	it('one pane shows at a time through the hide class', () => {
		const file = document.getElementById('fileList');
		const edit = document.getElementById('editList');
		expect(file.classList.contains('hide')).toBe(false);
		expect(edit.classList.contains('hide')).toBe(true);
		file.classList.add('hide');
		edit.classList.remove('hide');
		expect(file.classList.contains('hide')).toBe(true);
		expect(edit.classList.contains('hide')).toBe(false);
	});

	it('menu items keep their action ids', () => {
		expect(document.querySelector('#fileList #new')).not.toBeNull();
		expect(document.querySelector('#fileList #open')).not.toBeNull();
		expect(document.querySelector('#editList #navUndo')).not.toBeNull();
	});
});

describe('escape handling', () => {
	beforeEach(fixture);

	it('swallows nothing when closed and closes when open', () => {
		const fly = createFlyoutManager();
		const menu = document.getElementById('mainMenu');
		const opener = document.getElementById('fileMenu');
		// toolbar.js owns the global Escape ordering; the manager's
		// contract is just closeAndFocus's return value
		expect(fly.closeAndFocus()).toBe(false);
		fly.toggle('menu', menu, opener);
		expect(fly.closeAndFocus()).toBe(true);
		expect(menu.hidden).toBe(true);
	});
});
