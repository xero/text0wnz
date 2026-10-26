import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom';
import {
	createPanelManager,
	promoteRowLead,
} from '../../src/js/client/panels.js';

vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

/**
 * The module registry: layout() placement from data, persistence with
 * the tolerant merge, the legacy position migration, and the row lead
 * promotion rule the phase 3 docks will render.
 */
const moduleMarkup = key => `
	<section class="mod" data-m="${key}" aria-label="${key}">
		<header class="modHeader">
			<b class="modTitle">${key}</b>
			<i class="modLine"></i>
			<button class="modShade" type="button" aria-expanded="true"><b></b></button>
			${key === 'tool' ? '<button class="modClose" type="button">x</button>' : ''}
		</header>
		<div class="modBody"><div class="modContent"></div></div>
		${key === 'map' ? '<i class="modResize"></i>' : ''}
	</section>`;

const fixture = () => {
	document.body.innerHTML = `
		<div id="bodyContainer">
			<div id="topStrip">
				<button id="drawerButton" aria-expanded="false"></button>
			</div>
			<button id="sidebarGrip" aria-expanded="true"><i></i></button>
			<div id="dockTop"></div>
			<div id="viewport"></div>
			<div id="dockBottom"></div>
			<div id="mapStrip"></div>
			<div id="sidebar">
				${['sauce', 'canvas', 'pos', 'zoom', 'ref', 'map'].map(moduleMarkup).join('')}
			</div>
			${['frames', 'tool', 'chat'].map(moduleMarkup).join('')}
		</div>
		<div id="panelMenu" class="flyout" hidden role="menu">
			<b id="panelMenuTitle" class="flyHead"></b>
			<article id="panelDockSide" class="menuItem" role="menuitem">Dock Right</article>
			<article id="panelDockTop" class="menuItem" role="menuitem">Dock Top</article>
			<article id="panelDockBottom" class="menuItem" role="menuitem">Dock Bottom</article>
			<article id="panelFloat" class="menuItem" role="menuitem">Float</article>
			<article class="separator"></article>
			<article id="panelMoveUp" class="menuItem" role="menuitem">Move Up</article>
			<article id="panelMoveDown" class="menuItem" role="menuitem">Move Down</article>
			<article id="panelPinSep" class="separator" hidden></article>
			<article id="panelPin" class="menuItem" role="menuitem" hidden>
				<span id="panelPinLabel">Pin</span>
			</article>
		</div>`;
};

const el = key => document.querySelector(`.mod[data-m="${key}"]`);
const sidebarKeys = () =>
	[...document.querySelectorAll('#sidebar > .mod')].map(m => m.dataset.m);
const dockRows = dock =>
	[...document.querySelectorAll(`#${dock} > .drow`)].map(row =>
		[...row.children]
			.filter(c => c.classList.contains('mod'))
			.map(c => c.dataset.m));

const registerAll = (manager, overrides = {}) => {
	manager.register('sauce', {});
	manager.register('canvas', {});
	manager.register('pos', {});
	manager.register('zoom', {});
	manager.register('ref', { visible: overrides.ref ?? (() => false) });
	manager.register('map', { grow: true, visible: overrides.map ?? (() => true) });
	manager.register('frames', {
		big: true,
		visible: overrides.frames ?? (() => false),
	});
	manager.register('tool', {
		big: true,
		closable: true,
		visible: overrides.tool ?? (() => true),
	});
	manager.register('chat', {
		floatOnly: true,
		visible: overrides.chat ?? (() => false),
	});
	return manager;
};

describe('panel manager', () => {
	beforeEach(() => {
		localStorage.clear();
		fixture();
	});

	describe('layout from data', () => {
		it('docks the default sidebar modules in order and floats the rest', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			expect(sidebarKeys()).toEqual(['sauce', 'canvas', 'pos', 'zoom', 'ref', 'map']);
			for (const key of ['sauce', 'canvas', 'pos', 'zoom']) {
				expect(el(key)).toHaveClass('dk');
				expect(el(key).hidden).toBe(false);
			}
			expect(el('tool')).toHaveClass('fl');
			expect(el('tool').style.getPropertyValue('--mx')).toBe('58px');
			// frames defaults to the bottom dock as a bar
			expect(el('frames')).toHaveClass('tb');
			expect(dockRows('dockBottom')).toEqual([['frames']]);
			expect(el('frames').hidden).toBe(true);
		});

		it('builds dock rows from ORD with ln joining columns when wide', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({
					v: 2,
					MOD: {
						sauce: { dk: 'top' },
						canvas: { dk: 'top', ln: 1 },
						zoom: { dk: 'top' },
					},
				}),
			);
			const manager = registerAll(createPanelManager());
			manager.layout();
			expect(dockRows('dockTop')).toEqual([['sauce', 'canvas'], ['zoom']]);
			expect(el('sauce')).toHaveClass('tb');
			expect(el('canvas')).toHaveClass('tb');
		});

		it('narrow screens split every bar onto its own row but keep ln', () => {
			vi.stubGlobal('innerWidth', 500);
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({
					v: 2,
					MOD: {
						sauce: { dk: 'top' },
						canvas: { dk: 'top', ln: 1 },
					},
				}),
			);
			const manager = registerAll(createPanelManager());
			manager.layout();
			expect(dockRows('dockTop')).toEqual([['sauce'], ['canvas']]);
			const saved = JSON.parse(localStorage.getItem('panelLayout'));
			expect(saved.MOD.canvas.ln).toBe(1);
			vi.unstubAllGlobals();
		});

		it('a big module never joins a column row', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({
					v: 2,
					ORD: ['sauce', 'tool', 'canvas'],
					MOD: {
						sauce: { dk: 'top' },
						tool: { dk: 'top', ln: 1 },
						canvas: { dk: 'top', ln: 1 },
					},
				}),
			);
			const manager = registerAll(createPanelManager());
			manager.layout();
			// tool is big: its ln is ignored and small canvas cannot join it
			expect(dockRows('dockTop')).toEqual([
				['sauce'],
				['tool'],
				['canvas'],
			]);
		});

		it('a grow module docked in a bar snaps back to the sidebar', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({ v: 2, MOD: { map: { dk: 'top' } } }),
			);
			const manager = registerAll(createPanelManager());
			manager.layout();
			expect(el('map')).toHaveClass('dk');
			expect(el('map').parentNode.id).toBe('sidebar');
		});

		it('derives visibility from the registered predicates', () => {
			let refOn = false;
			const manager = registerAll(createPanelManager(), { ref: () => refOn });
			manager.layout();
			expect(el('ref').hidden).toBe(true);
			refOn = true;
			manager.layout();
			expect(el('ref').hidden).toBe(false);
		});

		it('an X-closed closable module hides until reopened', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			expect(el('tool').hidden).toBe(false);
			manager.close('tool');
			expect(el('tool').hidden).toBe(true);
			manager.reopen('tool');
			expect(el('tool').hidden).toBe(false);
		});

		it('floating stack order follows focus', () => {
			const manager = registerAll(createPanelManager(), { chat: () => true });
			manager.layout();
			manager.focus('tool');
			const toolZ = parseInt(el('tool').style.zIndex, 10);
			const chatZ = parseInt(el('chat').style.zIndex, 10);
			expect(toolZ).toBeGreaterThan(chatZ);
			manager.focus('chat');
			expect(parseInt(el('chat').style.zIndex, 10)).toBeGreaterThan(
				parseInt(el('tool').style.zIndex, 10),
			);
		});

		it('shade state renders as the shaded class and aria', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.toggleShade('sauce');
			expect(el('sauce')).toHaveClass('shaded');
			expect(
				el('sauce').querySelector('.modShade').getAttribute('aria-expanded'),
			).toBe('false');
		});

		it('folds the sidebar column away when nothing docked is visible', () => {
			const manager = createPanelManager();
			manager.register('ref', { visible: () => false });
			manager.register('tool', { closable: true, visible: () => true });
			manager.layout();
			expect(document.getElementById('bodyContainer')).toHaveClass('noSidebar');
			const populated = registerAll(createPanelManager());
			populated.layout();
			expect(document.getElementById('bodyContainer')).not.toHaveClass(
				'noSidebar',
			);
		});
	});

	describe('persistence', () => {
		it('round-trips shade, order, and collapse through the store', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.toggleShade('canvas');
			document.getElementById('sidebarGrip').click();
			const saved = JSON.parse(localStorage.getItem('panelLayout'));
			expect(saved.v).toBe(2);
			expect(saved.MOD.canvas.sh).toBe(1);
			expect(saved.sidebarCollapsed).toBe(true);

			fixture();
			const next = registerAll(createPanelManager());
			next.layout();
			expect(el('canvas')).toHaveClass('shaded');
			expect(next.isCollapsed()).toBe(true);
		});

		it('merges a saved order tolerantly: unknown keys drop, missing append', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({
					v: 2,
					ORD: ['zoom', 'ghost', 'sauce'],
					MOD: { ghost: { dk: 'side' } },
				}),
			);
			const manager = registerAll(createPanelManager());
			manager.layout();
			const keys = sidebarKeys();
			expect(keys[0]).toBe('zoom');
			expect(keys[1]).toBe('sauce');
			expect(keys).not.toContain('ghost');
			expect(keys).toContain('map');
		});

		it('migrates the legacy tool position key once', () => {
			localStorage.setItem(
				'toolSettingsPos',
				JSON.stringify({ x: 123, y: 45 }),
			);
			const manager = registerAll(createPanelManager());
			manager.layout();
			expect(el('tool').style.getPropertyValue('--mx')).toBe('123px');
			expect(el('tool').style.getPropertyValue('--my')).toBe('45px');
			expect(localStorage.getItem('toolSettingsPos')).toBeNull();
		});

		it('a saved tool position beats the legacy key', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({ v: 2, MOD: { tool: { x: 300, y: 200 } } }),
			);
			localStorage.setItem('toolSettingsPos', JSON.stringify({ x: 9, y: 9 }));
			const manager = registerAll(createPanelManager());
			manager.layout();
			expect(el('tool').style.getPropertyValue('--mx')).toBe('300px');
			expect(localStorage.getItem('toolSettingsPos')).toBeNull();
		});

		it('reset returns every module to its defaults', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.toggleShade('sauce');
			manager.close('tool');
			manager.reset();
			expect(el('sauce')).not.toHaveClass('shaded');
			expect(el('tool').hidden).toBe(false);
			expect(sidebarKeys()).toEqual(['sauce', 'canvas', 'pos', 'zoom', 'ref', 'map']);
		});
	});

	describe('size persistence and reset', () => {
		it('a saved float size restores even without a default', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({ v: 2, MOD: { tool: { dk: 0, w: 321 } } }),
			);
			const manager = registerAll(createPanelManager());
			manager.layout();
			expect(el('tool').style.getPropertyValue('--mw')).toBe('321px');
		});

		it('reset drops custom sizes, their inline vars, and the save', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.setFloatWidth('tool', 480);
			expect(el('tool').style.getPropertyValue('--mw')).toBe('480px');
			manager.reset();
			expect(el('tool').style.getPropertyValue('--mw')).toBe('');
			const saved = JSON.parse(localStorage.getItem('panelLayout'));
			expect(saved.MOD.tool.w).toBeUndefined();
		});
	});

	describe('keyboard docking verbs', () => {
		it('dockTo moves a panel between every home the drag reaches', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.dockTo('sauce', 'top');
			expect(el('sauce')).toHaveClass('tb');
			expect(dockRows('dockTop')).toEqual([['sauce']]);
			manager.dockTo('sauce', 'bot');
			expect(dockRows('dockBottom')).toContainEqual(['sauce']);
			manager.dockTo('sauce', 0);
			expect(el('sauce')).toHaveClass('fl');
			manager.dockTo('sauce', 'side');
			expect(el('sauce')).toHaveClass('dk');
			expect(sidebarKeys()).toContain('sauce');
		});

		it('a grow module refuses the bars and floatOnly refuses docks', () => {
			const manager = registerAll(createPanelManager(), { chat: () => true });
			manager.layout();
			manager.dockTo('map', 'top');
			expect(el('map')).toHaveClass('dk');
			manager.dockTo('chat', 'side');
			expect(el('chat')).toHaveClass('fl');
		});

		it('docking to the sidebar reopens a collapsed one', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({ v: 2, sidebarCollapsed: true }),
			);
			const manager = registerAll(createPanelManager());
			manager.layout();
			const container = document.getElementById('bodyContainer');
			expect(container).toHaveClass('sidebarCollapsed');
			manager.dockTo('frames', 'side');
			expect(container).not.toHaveClass('sidebarCollapsed');
		});

		it('a leaving row lead hands the row to its mate', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({
					v: 2,
					MOD: {
						sauce: { dk: 'top', ln: 0 },
						canvas: { dk: 'top', ln: 1 },
					},
					ORD: ['sauce', 'canvas'],
				}),
			);
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.dockTo('sauce', 0);
			expect(el('canvas')).toHaveClass('tb');
			expect(dockRows('dockTop')).toEqual([['canvas']]);
		});

		it('nudge swaps a panel with its visible dock neighbor', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			expect(sidebarKeys()).toEqual([
				'sauce',
				'canvas',
				'pos',
				'zoom',
				'ref',
				'map',
			]);
			manager.nudge('canvas', -1);
			expect(sidebarKeys()).toEqual([
				'canvas',
				'sauce',
				'pos',
				'zoom',
				'ref',
				'map',
			]);
			// ref is hidden, so zoom's next visible neighbor is map
			manager.nudge('zoom', 1);
			expect(sidebarKeys()).toEqual([
				'canvas',
				'sauce',
				'pos',
				'map',
				'ref',
				'zoom',
			]);
			// the first slot has nowhere up to go
			manager.nudge('canvas', -1);
			expect(sidebarKeys()[0]).toBe('canvas');
		});

		it('nudge is a no-op for floating panels', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.nudge('tool', 1);
			expect(el('tool')).toHaveClass('fl');
		});
	});

	describe('drag cancellation', () => {
		const pev = (type, props) =>
			Object.assign(new Event(type, { bubbles: true }), props);

		const startDragPastThreshold = () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			const sauce = el('sauce');
			const header = sauce.querySelector('.modHeader');
			header.dispatchEvent(
				pev('pointerdown', { button: 0, pointerId: 3, clientX: 10, clientY: 10 }),
			);
			sauce.dispatchEvent(
				pev('pointermove', {
					buttons: 1,
					pointerId: 3,
					clientX: 40,
					clientY: 40,
				}),
			);
			expect(document.querySelector('.dph')).toBeTruthy();
			return { manager, sauce };
		};

		it('layout aborts a live container drag instead of committing stale state', () => {
			const before = ['sauce', 'canvas', 'pos', 'zoom', 'ref', 'map'];
			const { manager, sauce } = startDragPastThreshold();
			// a real mid-drag relayout trigger (tool switch class)
			manager.toggleShade('sauce');
			// cancelDrag animates the placeholder out; gone or dismissing
			const ph = document.querySelector('.dph');
			expect(!ph || ph.classList.contains('out')).toBe(true);
			sauce.dispatchEvent(pev('pointerup', { pointerId: 3 }));
			expect(sidebarKeys()).toEqual(before);
		});

		it('the resize debounce cancels both drag kinds', () => {
			vi.useFakeTimers();
			try {
				const before = ['sauce', 'canvas', 'pos', 'zoom', 'ref', 'map'];
				const { sauce } = startDragPastThreshold();
				window.dispatchEvent(new Event('resize'));
				vi.advanceTimersByTime(150);
				const ph = document.querySelector('.dph');
				expect(!ph || ph.classList.contains('out')).toBe(true);
				sauce.dispatchEvent(pev('pointerup', { pointerId: 3 }));
				expect(sidebarKeys()).toEqual(before);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe('per-tool pins', () => {
		const storedPins = () =>
			JSON.parse(localStorage.getItem('panelLayout') || '{}').pins;

		it('a pinned tool reopens into its pinned placement', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.reopen('tool', 'line');
			manager.dockTo('tool', 'top');
			manager.togglePin();
			expect(manager.isPinned()).toBe(true);
			// square wanders off somewhere else
			manager.reopen('tool', 'square');
			manager.dockTo('tool', 0);
			expect(el('tool')).toHaveClass('fl');
			// line comes back pinned to the top bar
			manager.reopen('tool', 'line');
			expect(el('tool')).toHaveClass('tb');
			expect(dockRows('dockTop')).toEqual([['tool']]);
		});

		it('a gesture while pinned retrains the pin', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.reopen('tool', 'square');
			manager.togglePin();
			// follow semantics: the dock verb rewrites square's pin
			manager.dockTo('tool', 'bot');
			manager.reopen('tool', 'line');
			manager.dockTo('tool', 0);
			manager.reopen('tool', 'square');
			expect(el('tool')).toHaveClass('tb');
			expect(dockRows('dockBottom')).toContainEqual(['tool']);
			expect(storedPins().square.dk).toBe('bot');
		});

		it('unpinned tools share the wander placement', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.reopen('tool', 'line');
			manager.dockTo('tool', 'top');
			manager.reopen('tool', 'square');
			expect(el('tool')).toHaveClass('tb');
			expect(storedPins()).toEqual({});
		});

		it('unpin keeps the current placement as the wander state', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.reopen('tool', 'line');
			manager.dockTo('tool', 'top');
			manager.togglePin();
			manager.togglePin();
			expect(manager.isPinned()).toBe(false);
			expect(storedPins()).toEqual({});
			expect(el('tool')).toHaveClass('tb');
		});

		it('pins survive a reload and garbage entries are dropped', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({
					v: 2,
					pins: {
						line: { dk: 'side', sh: 1, hid: 1 },
						square: { dk: 'nope', x: 5 },
						circle: { dk: 0, x: 40, y: 50, w: 'wide' },
					},
				}),
			);
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.reopen('tool', 'line');
			// only strips and floats shade, so the sh pin rides a side dock
			expect(el('tool')).toHaveClass('dk');
			expect(el('tool')).toHaveClass('shaded');
			// hid never rides a pin: reopen's clear-on-select contract
			expect(el('tool').hidden).toBe(false);
			manager.reopen('tool', 'circle');
			expect(el('tool')).toHaveClass('fl');
			expect(el('tool').style.getPropertyValue('--mx')).toBe('40px');
			// the garbage dk pin fell out entirely
			manager.layout();
			expect(storedPins().square).toBeUndefined();
			expect(storedPins().circle.w).toBeUndefined();
		});

		it('a pin without a size sheds the previous size vars', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({
					v: 2,
					pins: {
						square: { dk: 0, x: 10, y: 10, w: 300, h: 200 },
						line: { dk: 0, x: 20, y: 20 },
					},
				}),
			);
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.reopen('tool', 'square');
			expect(el('tool').style.getPropertyValue('--mw')).toBe('300px');
			manager.reopen('tool', 'line');
			expect(el('tool').style.getPropertyValue('--mw')).toBe('');
			expect(el('tool').style.getPropertyValue('--mh')).toBe('');
		});

		it('the corner grip width gesture retrains the pin too', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.reopen('tool', 'character');
			manager.togglePin();
			manager.setFloatWidth('tool', 320);
			manager.reopen('tool', 'line');
			manager.reopen('tool', 'character');
			expect(el('tool').style.getPropertyValue('--mw')).toBe('320px');
			expect(storedPins().character.w).toBe(320);
		});

		it('a same-dock reapply never pops a collapsed sidebar', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({
					v: 2,
					MOD: { tool: { dk: 'side' } },
					sidebarCollapsed: true,
					pins: { line: { dk: 'side' } },
				}),
			);
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.reopen('tool', 'line');
			expect(manager.isCollapsed()).toBe(true);
		});

		it('reset clears every pin, in memory and on disk', () => {
			const manager = registerAll(createPanelManager());
			manager.layout();
			manager.reopen('tool', 'line');
			manager.togglePin();
			expect(storedPins()).not.toEqual({});
			manager.reset();
			expect(manager.isPinned()).toBe(false);
			expect(storedPins()).toEqual({});
		});

		it('the menu offers Pin only for the tool module, labeled and flipping', async () => {
			const State = (await import('../../src/js/client/state.js')).default;
			State.flyouts = {
				show: vi.fn((_id, menuEl) => {
					menuEl.hidden = false;
				}),
				close: vi.fn(),
				isOpen: vi.fn(() => false),
			};
			try {
				const manager = registerAll(createPanelManager());
				manager.layout();
				manager.reopen('tool', 'line');
				el('tool').dispatchEvent(
					Object.assign(new Event('contextmenu', { bubbles: true }), {
						clientX: 20,
						clientY: 20,
					}),
				);
				const pin = document.getElementById('panelPin');
				expect(pin.hidden).toBe(false);
				expect(document.getElementById('panelPinSep').hidden).toBe(false);
				expect(document.getElementById('panelPinLabel').textContent).toBe(
					'Pin this tool',
				);
				pin.dispatchEvent(new Event('click', { bubbles: true }));
				expect(manager.isPinned()).toBe(true);
				expect(document.getElementById('panelPinLabel').textContent).toBe(
					'Unpin this tool',
				);
				// another module's menu keeps the verb hidden
				el('canvas').dispatchEvent(
					Object.assign(new Event('contextmenu', { bubbles: true }), {
						clientX: 20,
						clientY: 20,
					}),
				);
				expect(pin.hidden).toBe(true);
			} finally {
				delete State.flyouts;
			}
		});
	});

	describe('wide long-press', () => {
		let State;

		beforeEach(async () => {
			State = (await import('../../src/js/client/state.js')).default;
			State.flyouts = {
				show: vi.fn((_id, menuEl) => {
					menuEl.hidden = false;
				}),
				close: vi.fn(),
				isOpen: vi.fn(() => false),
			};
		});

		afterEach(() => {
			delete State.flyouts;
		});

		const pev = (type, props) =>
			Object.assign(new Event(type, { bubbles: true }), {
				pointerId: 7,
				...props,
			});

		const touchDown = (target, props = {}) =>
			target.dispatchEvent(
				pev('pointerdown', {
					pointerType: 'touch',
					isPrimary: true,
					clientX: 30,
					clientY: 10,
					...props,
				}),
			);

		it('a stationary wide hold opens the full docking menu', () => {
			vi.useFakeTimers();
			try {
				const manager = registerAll(createPanelManager());
				manager.layout();
				const header = el('canvas').querySelector('.modHeader');
				touchDown(header);
				vi.advanceTimersByTime(500);
				expect(State.flyouts.show).toHaveBeenCalledWith(
					'panelMenu',
					document.getElementById('panelMenu'),
					expect.anything(),
					expect.objectContaining({ at: { x: 30, y: 10 } }),
				);
				// wide keeps every verb on the table
				expect(document.getElementById('panelDockSide').hidden).toBe(false);
				expect(document.getElementById('panelFloat').hidden).toBe(false);
				// the hold stood the armed drag down: a late move must not
				// lift the panel into a drag
				document.getElementById('bodyContainer').dispatchEvent(
					pev('pointermove', { buttons: 1, clientX: 70, clientY: 60 }),
				);
				expect(document.querySelector('.dph')).toBeFalsy();
			} finally {
				vi.useRealTimers();
			}
		});

		it('a live drag outlives the timer: no menu, no shootdown', () => {
			vi.useFakeTimers();
			try {
				const manager = registerAll(createPanelManager());
				manager.layout();
				const header = el('sauce').querySelector('.modHeader');
				touchDown(header);
				// the move rides the container, as pointer capture would
				// retarget it, so the header's slop guard never sees it
				document.getElementById('bodyContainer').dispatchEvent(
					pev('pointermove', { buttons: 1, clientX: 60, clientY: 40 }),
				);
				expect(el('sauce')).toHaveClass('drag');
				vi.advanceTimersByTime(600);
				expect(State.flyouts.show).not.toHaveBeenCalled();
				// only cancelDrag strips the lift class; the hold timer
				// must have stood down
				expect(el('sauce')).toHaveClass('drag');
				document
					.getElementById('bodyContainer')
					.dispatchEvent(pev('pointerup', {}));
			} finally {
				vi.useRealTimers();
			}
		});

		it('a lift the header never sees still disarms the hold', () => {
			vi.useFakeTimers();
			try {
				const manager = registerAll(createPanelManager());
				manager.layout();
				const header = el('canvas').querySelector('.modHeader');
				touchDown(header);
				// capture retargets the lift away from the header; the
				// document still sees it
				document
					.getElementById('bodyContainer')
					.dispatchEvent(pev('pointerup', {}));
				vi.advanceTimersByTime(600);
				expect(State.flyouts.show).not.toHaveBeenCalled();
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe('phone layout', () => {
		const realMatchMedia = window.matchMedia;
		let media;

		beforeEach(() => {
			media = {
				matches: true,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			};
			window.matchMedia = () => media;
		});

		afterEach(() => {
			window.matchMedia = realMatchMedia;
		});

		const phoneManager = overrides =>
			registerAll(createPanelManager(), {
				map: () => true,
				frames: () => true,
				...overrides,
			});

		const pev = (type, props) =>
			Object.assign(new Event(type, { bubbles: true }), props);

		it('a breakpoint flip mid drag disarms the sheet handle', () => {
			const manager = phoneManager();
			manager.layout();
			const tool = el('tool');
			const header = tool.querySelector('.modHeader');
			header.dispatchEvent(
				pev('pointerdown', { button: 0, clientY: 500, pointerId: 7 }),
			);
			tool.dispatchEvent(pev('pointermove', { clientY: 400, pointerId: 7 }));
			expect(tool.style.getPropertyValue('--sh')).not.toBe('');
			media.matches = false;
			const flip = media.addEventListener.mock.calls.find(
				call => call[0] === 'change',
			)[1];
			flip();
			// the persistent handle listeners are disarmed: a later move
			// must not resurrect the stripped --sh, and the up must not
			// commit sheet decisions against the desktop DOM
			tool.dispatchEvent(pev('pointermove', { clientY: 300, pointerId: 7 }));
			expect(tool.style.getPropertyValue('--sh')).toBe('');
			tool.dispatchEvent(pev('pointerup', { pointerId: 7 }));
			expect(tool.style.getPropertyValue('--sh')).toBe('');
		});

		it('a cancelled sheet drag restores the pre drag height', () => {
			const manager = phoneManager();
			manager.layout();
			const tool = el('tool');
			tool.style.setProperty('--sh', '200px');
			const header = tool.querySelector('.modHeader');
			header.dispatchEvent(
				pev('pointerdown', { button: 0, clientY: 500, pointerId: 7 }),
			);
			tool.dispatchEvent(pev('pointermove', { clientY: 400, pointerId: 7 }));
			expect(tool.style.getPropertyValue('--sh')).not.toBe('200px');
			// any layout() mid drag takes the guard path and aborts
			manager.layout();
			expect(tool.style.getPropertyValue('--sh')).toBe('200px');
			expect(tool.classList.contains('snap')).toBe(true);
			tool.dispatchEvent(pev('pointerup', { pointerId: 7 }));
			expect(tool.style.getPropertyValue('--sh')).toBe('200px');
		});

		it('pointerup still snaps a normal sheet drag', () => {
			const manager = phoneManager();
			manager.layout();
			const tool = el('tool');
			const header = tool.querySelector('.modHeader');
			header.dispatchEvent(
				pev('pointerdown', { button: 0, clientY: 500, pointerId: 7 }),
			);
			tool.dispatchEvent(pev('pointermove', { clientY: 400, pointerId: 7 }));
			// jsdom has no layout: hand the commit a height above the
			// dismiss threshold so the snap branch runs
			Object.defineProperty(tool, 'offsetHeight', {
				value: 300,
				configurable: true,
			});
			tool.dispatchEvent(pev('pointerup', { pointerId: 7 }));
			expect(tool.style.getPropertyValue('--sh')).not.toBe('');
			expect(tool.classList.contains('snap')).toBe(true);
			const settled = tool.style.getPropertyValue('--sh');
			tool.dispatchEvent(pev('pointermove', { clientY: 100, pointerId: 7 }));
			expect(tool.style.getPropertyValue('--sh')).toBe(settled);
		});

		it('routes by module: strip, sheet, bottom bar, and the drawer', () => {
			const manager = phoneManager();
			manager.layout();
			const container = document.getElementById('bodyContainer');
			expect(container).toHaveClass('phone');
			expect(el('map')).toHaveClass('st');
			expect(el('map').parentNode.id).toBe('mapStrip');
			expect(el('tool')).toHaveClass('sheet');
			// the sheet rides document.body: grid containers size abspos
			// children by alignment and ignore their height in FF/WebKit
			expect(el('tool').parentNode).toBe(document.body);
			expect(el('frames')).toHaveClass('tb');
			expect(dockRows('dockBottom')).toEqual([['frames']]);
			for (const key of ['sauce', 'canvas', 'pos', 'zoom']) {
				expect(el(key)).toHaveClass('dk');
			}
			// hidden modules (ref, chat) hold their drawer slots like the
			// wide sidebar; chat routes here because floats do not exist
			expect(sidebarKeys()).toEqual([
				'sauce',
				'canvas',
				'pos',
				'zoom',
				'ref',
				'chat',
			]);
		});

		it('a floating module rides the drawer without losing its home', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({ v: 2, MOD: { sauce: { dk: 0, x: 111, y: 222 } } }),
			);
			const manager = phoneManager();
			manager.layout();
			expect(el('sauce')).toHaveClass('dk');
			expect(sidebarKeys()).toContain('sauce');
			// the flip back re-reads the untouched data
			media.matches = false;
			manager.layout();
			expect(el('sauce')).toHaveClass('fl');
			expect(el('sauce').style.getPropertyValue('--mx')).toBe('111px');
			expect(el('map')).toHaveClass('dk');
			expect(el('map').parentNode.id).toBe('sidebar');
			expect(el('tool')).toHaveClass('fl');
		});

		it('the drawer button opens the sidebar and closeDrawer shuts it', () => {
			const manager = phoneManager();
			manager.layout();
			const button = document.getElementById('drawerButton');
			const sidebar = document.getElementById('sidebar');
			expect(manager.closeDrawer()).toBe(false);
			button.click();
			expect(sidebar).toHaveClass('open');
			expect(button.getAttribute('aria-expanded')).toBe('true');
			expect(manager.closeDrawer()).toBe(true);
			expect(sidebar).not.toHaveClass('open');
			expect(button.getAttribute('aria-expanded')).toBe('false');
		});

		it('sheets and strips never shade, and the flags survive', () => {
			const manager = phoneManager();
			manager.toggleShade('tool');
			manager.toggleShade('map');
			expect(el('tool')).not.toHaveClass('shaded');
			expect(el('map')).not.toHaveClass('shaded');
			media.matches = false;
			manager.layout();
			// tool floats shaded, map docks shaded: the flags held
			expect(el('tool')).toHaveClass('shaded');
			expect(el('map')).toHaveClass('shaded');
		});

		it('the collapse and noSidebar classes stay off the phone shell', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({ v: 2, sidebarCollapsed: true }),
			);
			const manager = phoneManager();
			manager.layout();
			const container = document.getElementById('bodyContainer');
			expect(container).not.toHaveClass('sidebarCollapsed');
			expect(container).not.toHaveClass('noSidebar');
			// the flag itself survives for the wide layout
			media.matches = false;
			manager.layout();
			expect(container).toHaveClass('sidebarCollapsed');
		});

		it('the phone shell defers pins to the breakpoint flip', () => {
			localStorage.setItem(
				'panelLayout',
				JSON.stringify({ v: 2, pins: { line: { dk: 'top' } } }),
			);
			const manager = phoneManager();
			manager.layout();
			manager.reopen('tool', 'line');
			// the sheet stays a sheet; wide truth is untouched by the
			// phone switch
			expect(el('tool')).toHaveClass('sheet');
			// landing wide re-asserts the armed pin
			media.matches = false;
			const flip = media.addEventListener.mock.calls.find(
				([name]) => name === 'change',
			)[1];
			flip();
			expect(el('tool')).toHaveClass('tb');
			expect(dockRows('dockTop')).toContainEqual(['tool']);
		});

		describe('stack reorder and the long-press menu', () => {
			let State;

			beforeEach(async () => {
				State = (await import('../../src/js/client/state.js')).default;
				State.flyouts = {
					show: vi.fn((_id, menuEl) => {
						menuEl.hidden = false;
					}),
					close: vi.fn(),
					isOpen: vi.fn(() => false),
				};
			});

			afterEach(() => {
				delete State.flyouts;
			});

			const touchDown = (target, props = {}) =>
				target.dispatchEvent(
					Object.assign(new Event('pointerdown', { bubbles: true }), {
						pointerType: 'touch',
						isPrimary: true,
						clientX: 30,
						clientY: 10,
						...props,
					}),
				);

			it('nudge hops a stack mate even across other ORD entries', () => {
				const manager = phoneManager({ chat: () => true });
				manager.layout();
				// map strips, tool sheets, frames bars: the stack is the rest
				expect(sidebarKeys()).toEqual([
					'sauce',
					'canvas',
					'pos',
					'zoom',
					'ref',
					'chat',
				]);
				// ref is hidden, and map, frames, and tool sit between zoom
				// and chat in ORD without riding the stack
				manager.nudge('chat', -1);
				expect(sidebarKeys()).toEqual([
					'sauce',
					'canvas',
					'pos',
					'chat',
					'zoom',
					'ref',
				]);
				manager.nudge('chat', -1);
				manager.nudge('chat', -1);
				manager.nudge('chat', -1);
				expect(sidebarKeys()[0]).toBe('chat');
				// the top slot has nowhere up to go
				manager.nudge('chat', -1);
				expect(sidebarKeys()[0]).toBe('chat');
			});

			it('a phone reorder mirrors wide only where the dock is shared', () => {
				const manager = phoneManager({ chat: () => true });
				manager.layout();
				// chat hops over zoom, but chat never docks wide, so the
				// wide sidebar must not feel it; pos hops over canvas, and
				// both live in the wide sidebar, so that one mirrors
				manager.nudge('chat', -1);
				manager.nudge('pos', -1);
				media.matches = false;
				manager.layout();
				expect(el('chat')).toHaveClass('fl');
				expect(sidebarKeys()).toEqual([
					'sauce',
					'pos',
					'canvas',
					'zoom',
					'ref',
					'map',
				]);
			});

			it('nudge stays a no-op for modules off the stack', () => {
				const manager = phoneManager();
				manager.layout();
				const before = sidebarKeys();
				manager.nudge('tool', -1);
				manager.nudge('map', 1);
				expect(sidebarKeys()).toEqual(before);
			});

			it('a header long-press opens the menu with only the stack verbs', () => {
				vi.useFakeTimers();
				try {
					const manager = phoneManager({ chat: () => true });
					manager.layout();
					const header = el('canvas').querySelector('.modHeader');
					touchDown(header);
					vi.advanceTimersByTime(500);
					expect(State.flyouts.show).toHaveBeenCalledWith(
						'panelMenu',
						document.getElementById('panelMenu'),
						expect.anything(),
						expect.objectContaining({ at: { x: 30, y: 10 } }),
					);
					// dock and float verbs would lie on the phone shell
					for (const id of [
						'panelDockSide',
						'panelDockTop',
						'panelDockBottom',
						'panelFloat',
					]) {
						expect(document.getElementById(id).hidden).toBe(true);
					}
					expect(document.querySelector('#panelMenu .separator').hidden).toBe(
						true,
					);
					expect(document.getElementById('panelMoveUp').hidden).toBe(false);
					expect(
						document.getElementById('panelMoveUp').classList.contains('disabled'),
					).toBe(false);
				} finally {
					vi.useRealTimers();
				}
			});

			it('the menu Move Up entry hops the stack', () => {
				vi.useFakeTimers();
				try {
					const manager = phoneManager({ chat: () => true });
					manager.layout();
					const header = el('canvas').querySelector('.modHeader');
					touchDown(header);
					vi.advanceTimersByTime(500);
					document
						.getElementById('panelMoveUp')
						.dispatchEvent(new Event('click', { bubbles: true }));
					expect(sidebarKeys().slice(0, 2)).toEqual(['canvas', 'sauce']);
				} finally {
					vi.useRealTimers();
				}
			});

			it('the lift after a hold never shades the strip', () => {
				vi.useFakeTimers();
				try {
					const manager = phoneManager({ chat: () => true });
					manager.layout();
					const header = el('canvas').querySelector('.modHeader');
					touchDown(header);
					vi.advanceTimersByTime(500);
					header.dispatchEvent(new Event('click', { bubbles: true }));
					expect(el('canvas')).not.toHaveClass('shaded');
					// the next plain tap shades as always
					header.dispatchEvent(new Event('click', { bubbles: true }));
					expect(el('canvas')).toHaveClass('shaded');
				} finally {
					vi.useRealTimers();
				}
			});

			it('a wandering or lifted touch never opens the menu', () => {
				vi.useFakeTimers();
				try {
					const manager = phoneManager({ chat: () => true });
					manager.layout();
					const header = el('canvas').querySelector('.modHeader');
					touchDown(header);
					header.dispatchEvent(
						Object.assign(new Event('pointermove', { bubbles: true }), {
							clientX: 60,
							clientY: 10,
						}),
					);
					vi.advanceTimersByTime(600);
					touchDown(header);
					header.dispatchEvent(new Event('pointerup', { bubbles: true }));
					vi.advanceTimersByTime(600);
					expect(State.flyouts.show).not.toHaveBeenCalled();
				} finally {
					vi.useRealTimers();
				}
			});

			it('a mouse press never arms the hold', () => {
				vi.useFakeTimers();
				try {
					const manager = phoneManager({ chat: () => true });
					manager.layout();
					const header = el('canvas').querySelector('.modHeader');
					touchDown(header, { pointerType: 'mouse' });
					vi.advanceTimersByTime(600);
					expect(State.flyouts.show).not.toHaveBeenCalled();
				} finally {
					vi.useRealTimers();
				}
			});

			it('the sheet and strip modules offer no menu', () => {
				vi.useFakeTimers();
				try {
					const manager = phoneManager({ chat: () => true });
					manager.layout();
					for (const key of ['tool', 'map']) {
						const header = el(key).querySelector('.modHeader');
						touchDown(header);
						vi.advanceTimersByTime(600);
					}
					expect(State.flyouts.show).not.toHaveBeenCalled();
				} finally {
					vi.useRealTimers();
				}
			});
		});
	});

	describe('row lead promotion', () => {
		it('the next module in the dock inherits a leaving lead', () => {
			const ORD = ['sauce', 'canvas', 'pos'];
			const MOD = {
				sauce: { dk: 'top', ln: 0 },
				canvas: { dk: 'top', ln: 1 },
				pos: { dk: 'top', ln: 1 },
			};
			promoteRowLead(ORD, MOD, 'sauce', 'top');
			expect(MOD.canvas.ln).toBe(0);
			expect(MOD.pos.ln).toBe(1);
		});

		it('a non-lead leaving promotes nobody', () => {
			const ORD = ['sauce', 'canvas', 'pos'];
			const MOD = {
				sauce: { dk: 'top', ln: 0 },
				canvas: { dk: 'top', ln: 1 },
				pos: { dk: 'top', ln: 1 },
			};
			promoteRowLead(ORD, MOD, 'canvas', 'top');
			expect(MOD.pos.ln).toBe(1);
		});

		it('promotion skips modules docked elsewhere', () => {
			const ORD = ['sauce', 'frames', 'canvas'];
			const MOD = {
				sauce: { dk: 'top', ln: 0 },
				frames: { dk: 'bot', ln: 1 },
				canvas: { dk: 'top', ln: 1 },
			};
			promoteRowLead(ORD, MOD, 'sauce', 'top');
			expect(MOD.frames.ln).toBe(1);
			expect(MOD.canvas.ln).toBe(0);
		});

		it('no dock of origin means no promotion', () => {
			const ORD = ['sauce', 'canvas'];
			const MOD = {
				sauce: { dk: 0, ln: 0 },
				canvas: { dk: 'top', ln: 1 },
			};
			promoteRowLead(ORD, MOD, 'sauce', null);
			expect(MOD.canvas.ln).toBe(1);
		});
	});
});
