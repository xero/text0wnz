import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The unified settings module controller: section exclusivity, the
 * reopen rule through the panel manager, and single-owner persistence.
 * Placement, shading, and the close chrome belong to panels.js now.
 */
const mocks = vi.hoisted(() => ({
	reopen: vi.fn(),
	layout: vi.fn(),
}));

vi.mock('../../src/js/client/ui.js', () => ({ $: vi.fn(id => document.getElementById(id)) }));

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		panels: {
			reopen: mocks.reopen,
			layout: mocks.layout,
		},
	},
}));

import { createToolSettings } from '../../src/js/client/toolSettings.js';

const fixture = () => {
	document.body.innerHTML = `
		<section id="toolSettings" class="mod" data-m="tool" hidden>
			<header class="modHeader">
				<b class="modTitle" id="toolSettingsTitle"></b>
			</header>
			<div class="modBody"><div class="modContent">
				<div id="tsLine" class="hide"></div>
				<div id="tsSquare" class="hide"></div>
				<div id="tsCircle" class="hide"></div>
				<div id="tsAscii" class="hide"></div>
				<div id="tsAttrib" class="hide"></div>
				<div id="tsShading" class="hide"></div>
				<div id="tsCharacter" class="hide"></div>
			</div></div>
		</section>`;
};

const hidden = id => document.getElementById(id).classList.contains('hide');

describe('createToolSettings', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
		fixture();
	});

	describe('sections', () => {
		it('show reveals exactly one section and reopens the module', () => {
			const ts = createToolSettings();
			ts.show('line');
			expect(hidden('tsLine')).toBe(false);
			expect(hidden('tsSquare')).toBe(true);
			expect(hidden('tsAttrib')).toBe(true);
			expect(document.getElementById('toolSettingsTitle').innerText).toBe(
				'Line',
			);
			expect(ts.hasSection()).toBe(true);
			expect(mocks.reopen).toHaveBeenCalledWith('tool');
		});

		it('show swaps sections in place', () => {
			const ts = createToolSettings();
			ts.show('line');
			ts.show('circle');
			expect(hidden('tsLine')).toBe(true);
			expect(hidden('tsCircle')).toBe(false);
		});

		it('the picker sections ride the same law', () => {
			const ts = createToolSettings();
			ts.show('shading');
			expect(hidden('tsShading')).toBe(false);
			expect(document.getElementById('toolSettingsTitle').innerText).toBe(
				'Shading Brush',
			);
			ts.show('character');
			expect(hidden('tsShading')).toBe(true);
			expect(hidden('tsCharacter')).toBe(false);
		});

		it('an unknown section changes nothing', () => {
			const ts = createToolSettings();
			ts.show('bogus');
			expect(ts.hasSection()).toBe(false);
			expect(mocks.reopen).not.toHaveBeenCalled();
		});

		it('hide drops the section, and the next show reopens', () => {
			const ts = createToolSettings();
			ts.show('line');
			ts.hide();
			expect(ts.hasSection()).toBe(false);
			expect(mocks.layout).toHaveBeenCalled();
			ts.show('square');
			expect(ts.hasSection()).toBe(true);
			expect(hidden('tsSquare')).toBe(false);
		});

		it('every show reopens, so an X-closed module always comes back', () => {
			const ts = createToolSettings();
			ts.show('line');
			ts.show('line');
			expect(mocks.reopen).toHaveBeenCalledTimes(2);
		});

		it('mount appends into the named section', () => {
			const ts = createToolSettings();
			const el = document.createElement('div');
			el.id = 'mounted';
			ts.mount('ascii', el);
			expect(document.querySelector('#tsAscii #mounted')).not.toBeNull();
		});
	});

	describe('persistence', () => {
		it('set merges keys instead of clobbering them', () => {
			const ts = createToolSettings();
			ts.set('lineMode', 'nuskool');
			ts.set('squareFill', 'filled');
			expect(ts.get('lineMode', 'block')).toBe('nuskool');
			expect(ts.get('squareFill', 'outline')).toBe('filled');
		});

		it('get falls back when the key is unset', () => {
			const ts = createToolSettings();
			expect(ts.get('circleMode', 'block')).toBe('block');
		});

		it('corrupted storage reads as defaults', () => {
			localStorage.setItem('toolSettings', '{nope');
			const ts = createToolSettings();
			expect(ts.get('lineMode', 'block')).toBe('block');
			ts.set('lineMode', 'oldskool');
			expect(ts.get('lineMode', 'block')).toBe('oldskool');
		});

		it('a throwing store never breaks the window', () => {
			const ts = createToolSettings();
			const spy = vi
				.spyOn(Object.getPrototypeOf(localStorage), 'setItem')
				.mockImplementation(() => {
					throw new Error('quota');
				});
			expect(() => ts.set('lineMode', 'nuskool')).not.toThrow();
			spy.mockRestore();
		});

		it('a choice made this session survives a dead store', () => {
			const ts = createToolSettings();
			const spy = vi
				.spyOn(Object.getPrototypeOf(localStorage), 'setItem')
				.mockImplementation(() => {
					throw new Error('quota');
				});
			ts.set('squareFill', 'filled');
			// a controller re-reads on every enable; memory is the truth
			expect(ts.get('squareFill', 'outline')).toBe('filled');
			spy.mockRestore();
		});

		it('an array under the key reads as defaults and writes recover', () => {
			localStorage.setItem('toolSettings', '[]');
			const ts = createToolSettings();
			expect(ts.get('lineMode', 'block')).toBe('block');
			ts.set('lineMode', 'nuskool');
			expect(ts.get('lineMode', 'block')).toBe('nuskool');
			expect(JSON.parse(localStorage.getItem('toolSettings'))).toEqual({ lineMode: 'nuskool' });
		});
	});
});
