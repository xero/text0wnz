import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The unified settings window controller: section exclusivity, the
 * reopen rule, single-owner persistence, and position restore with
 * viewport clamping.
 */
const mocks = vi.hoisted(() => ({
	focus: vi.fn(),
	onClose: null,
	floatOptions: null,
}));

vi.mock('../../src/js/client/ui.js', () => ({
	$: vi.fn(id => document.getElementById(id)),
	makePanelFloat: vi.fn((_panel, onClose, options) => {
		mocks.onClose = onClose;
		mocks.floatOptions = options;
		return { focus: mocks.focus };
	}),
}));

import { createToolSettings } from '../../src/js/client/toolSettings.js';

const fixture = () => {
	document.body.innerHTML = `
		<div id="toolSettings" class="hide">
			<h3 id="toolSettingsTitle"></h3>
			<div id="tsLine" class="hide"></div>
			<div id="tsSquare" class="hide"></div>
			<div id="tsCircle" class="hide"></div>
			<div id="tsAscii" class="hide"></div>
			<div id="tsAttrib" class="hide"></div>
			<div id="tsShading" class="hide"></div>
			<div id="tsCharacter" class="hide"></div>
		</div>`;
};

const panel = () => document.getElementById('toolSettings');
const hidden = id => document.getElementById(id).classList.contains('hide');

describe('createToolSettings', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
		fixture();
	});

	describe('sections', () => {
		it('show reveals the window and exactly one section', () => {
			const ts = createToolSettings();
			ts.show('line');
			expect(panel().classList.contains('hide')).toBe(false);
			expect(hidden('tsLine')).toBe(false);
			expect(hidden('tsSquare')).toBe(true);
			expect(hidden('tsAttrib')).toBe(true);
			expect(document.getElementById('toolSettingsTitle').innerText).toBe(
				'Line',
			);
			expect(mocks.focus).toHaveBeenCalled();
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
			expect(panel().classList.contains('hide')).toBe(true);
		});

		it('hide hides, and the next show reopens', () => {
			const ts = createToolSettings();
			ts.show('line');
			ts.hide();
			expect(panel().classList.contains('hide')).toBe(true);
			ts.show('square');
			expect(panel().classList.contains('hide')).toBe(false);
			expect(hidden('tsSquare')).toBe(false);
		});

		it('the close chrome hides the window the same way', () => {
			const ts = createToolSettings();
			ts.show('line');
			mocks.onClose();
			expect(panel().classList.contains('hide')).toBe(true);
			ts.show('line');
			expect(panel().classList.contains('hide')).toBe(false);
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

	describe('position', () => {
		it('a drag end saves the spot', () => {
			createToolSettings();
			mocks.floatOptions.onMoved(120, 240);
			expect(JSON.parse(localStorage.getItem('toolSettingsPos'))).toEqual({
				x: 120,
				y: 240,
			});
		});

		it('a saved spot restores at creation', () => {
			localStorage.setItem('toolSettingsPos', JSON.stringify({ x: 99, y: 77 }));
			createToolSettings();
			expect(panel().style.left).toBe('99px');
			expect(panel().style.top).toBe('77px');
		});

		it('an off screen spot clamps back into the viewport', () => {
			vi.stubGlobal('innerWidth', 800);
			vi.stubGlobal('innerHeight', 600);
			localStorage.setItem(
				'toolSettingsPos',
				JSON.stringify({ x: 5000, y: -50 }),
			);
			createToolSettings();
			expect(panel().style.left).toBe('720px');
			expect(panel().style.top).toBe('0px');
			vi.unstubAllGlobals();
		});

		it('a viewport under the margin clamps to zero, never negative', () => {
			vi.stubGlobal('innerWidth', 60);
			vi.stubGlobal('innerHeight', 40);
			localStorage.setItem(
				'toolSettingsPos',
				JSON.stringify({ x: 500, y: 500 }),
			);
			createToolSettings();
			expect(panel().style.left).toBe('0px');
			expect(panel().style.top).toBe('0px');
			vi.unstubAllGlobals();
		});

		it('garbage position data leaves the default spot alone', () => {
			localStorage.setItem('toolSettingsPos', '"sideways"');
			createToolSettings();
			expect(panel().style.left).toBe('');
		});
	});
});
