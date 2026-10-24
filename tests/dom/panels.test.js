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
