import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { paletteColor } from '../../src/js/core/doc.js';
import State from '../../src/js/client/state.js';
import { createColorPanel } from '../../src/js/client/colorPanel.js';

vi.mock('../../src/js/client/ui.js', () => ({ $: id => document.getElementById(id) }));

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		palette: {
			getRGBAColor: vi.fn(() => [1, 2, 3, 255]),
			setForegroundColor: vi.fn(),
			setBackgroundColor: vi.fn(),
		},
		flyouts: {
			toggle: vi.fn(() => true),
			isOpen: vi.fn(() => false),
			close: vi.fn(),
		},
	},
}));

/* global PointerEvent -- jsdom provides it; the shared eslint env predates it */
const fire = (el, type, props = {}) =>
	el.dispatchEvent(
		new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, {
			bubbles: true,
			cancelable: true,
			// a pointer's click carries its click count, a keyboard click 0
			detail: type === 'click' ? 1 : 0,
			...props,
		}),
	);

const grid = () => [...document.querySelectorAll('#colorGrid .colorSwatch')];
const recent = () => [...document.querySelectorAll('#colorRecent .colorSwatch')];
const stored = () => JSON.parse(localStorage.getItem('recentColors') ?? '[]');

const fgCalls = () => State.palette.setForegroundColor.mock.calls;
const bgCalls = () => State.palette.setBackgroundColor.mock.calls;

// the grid's first swatch is xterm 16, the corner of the color cube
const first = paletteColor(16);

beforeEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
	document.body.innerHTML = `
		<div id="paletteMore"></div>
		<div id="colorPanel">
			<div id="colorGrid"></div>
			<input id="colorHexInput" type="color" value="#ff00ff">
			<button id="colorRGBfg"></button>
			<button id="colorRGBbg"></button>
			<div id="colorRecent"></div>
			<p id="colorLockNote"></p>
		</div>`;
	createColorPanel();
	document.getElementById('paletteMore').click();
});

describe('color panel swatches', () => {
	it('click picks the foreground', () => {
		const sw = grid()[0];
		fire(sw, 'pointerdown');
		fire(sw, 'click');
		expect(fgCalls()).toEqual([[first]]);
		expect(bgCalls()).toEqual([]);
		expect(stored()).toEqual([first]);
	});

	it('ctrl click picks the background, as Windows and Linux deliver it', () => {
		const sw = grid()[0];
		fire(sw, 'pointerdown', { ctrlKey: true });
		fire(sw, 'mousedown', { ctrlKey: true });
		fire(sw, 'mouseup', { ctrlKey: true });
		fire(sw, 'click', { ctrlKey: true });
		expect(bgCalls()).toEqual([[first]]);
		expect(fgCalls()).toEqual([]);
	});

	it('cmd click is a plain click', () => {
		const sw = grid()[0];
		fire(sw, 'pointerdown', { metaKey: true });
		fire(sw, 'click', { metaKey: true });
		expect(fgCalls()).toEqual([[first]]);
		expect(bgCalls()).toEqual([]);
	});

	it('right click picks the background and suppresses the browser menu', () => {
		const sw = grid()[0];
		fire(sw, 'pointerdown', { button: 2 });
		const menu = new MouseEvent('contextmenu', {
			bubbles: true,
			cancelable: true,
			button: 2,
		});
		sw.dispatchEvent(menu);
		expect(menu.defaultPrevented).toBe(true);
		expect(bgCalls()).toEqual([[first]]);
		expect(fgCalls()).toEqual([]);
	});

	it('a macOS ctrl click picks the background once even when the click follows the contextmenu', () => {
		const sw = grid()[0];
		fire(sw, 'pointerdown', { ctrlKey: true });
		fire(sw, 'mousedown', { ctrlKey: true });
		fire(sw, 'contextmenu', { ctrlKey: true });
		fire(sw, 'mouseup', { ctrlKey: true });
		fire(sw, 'click', { ctrlKey: true });
		// ctrl let go before the button: the trailing click is still
		// the same press
		fire(sw, 'click');
		expect(bgCalls()).toEqual([[first]]);
		expect(fgCalls()).toEqual([]);
		expect(stored()).toEqual([first]);
	});

	it('the press after a contextmenu pick picks again', () => {
		const [a, b] = grid();
		fire(a, 'pointerdown', { button: 2 });
		fire(a, 'contextmenu', { button: 2 });
		fire(b, 'pointerdown');
		fire(b, 'click');
		expect(bgCalls()).toEqual([[first]]);
		expect(fgCalls()).toEqual([[paletteColor(17)]]);
	});

	it('a macOS ctrl click on the recent row cannot spill onto the swatch that slides under the pointer', () => {
		const [a, b] = grid();
		fire(b, 'pointerdown');
		fire(b, 'click');
		fire(a, 'pointerdown');
		fire(a, 'click');
		vi.clearAllMocks();
		expect(stored()).toEqual([first, paletteColor(17)]);

		const older = recent()[1];
		fire(older, 'pointerdown', { ctrlKey: true });
		fire(older, 'contextmenu', { ctrlKey: true });
		// the pick rebuilt the row, so the trailing click lands on the
		// swatch now in that slot
		const slid = recent()[1];
		expect(slid).not.toBe(older);
		fire(slid, 'mouseup', { ctrlKey: true });
		fire(slid, 'click', { ctrlKey: true });
		expect(bgCalls()).toEqual([[paletteColor(17)]]);
		expect(fgCalls()).toEqual([]);
		expect(stored()).toEqual([paletteColor(17), first]);
	});
});

describe('color panel swatches under touch', () => {
	const finger = {
		pointerType: 'touch',
		isPrimary: true,
		pointerId: 1,
		clientX: 5,
		clientY: 5,
	};
	const menu = el => {
		const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		el.dispatchEvent(e);
		return e;
	};

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('a hold picks the background once, and its lift picks nothing', () => {
		const sw = grid()[0];
		fire(sw, 'pointerdown', finger);
		vi.advanceTimersByTime(499);
		expect(bgCalls()).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(bgCalls()).toEqual([[first]]);
		fire(sw, 'pointerup', finger);
		fire(sw, 'click');
		expect(bgCalls()).toEqual([[first]]);
		expect(fgCalls()).toEqual([]);
		expect(stored()).toEqual([first]);
	});

	it('a tap picks the foreground', () => {
		const sw = grid()[0];
		fire(sw, 'pointerdown', finger);
		fire(sw, 'pointerup', finger);
		fire(sw, 'click');
		vi.advanceTimersByTime(1000);
		expect(fgCalls()).toEqual([[first]]);
		expect(bgCalls()).toEqual([]);
	});

	it('the native long-press contextmenu picks nothing more, whether it trails the timer or beats it', () => {
		const [a, b] = grid();
		fire(a, 'pointerdown', finger);
		vi.advanceTimersByTime(500);
		expect(menu(a).defaultPrevented).toBe(true);
		fire(a, 'pointerup', finger);
		fire(b, 'pointerdown', finger);
		vi.advanceTimersByTime(400);
		menu(b);
		expect(bgCalls()).toEqual([[first], [paletteColor(17)]]);
		vi.advanceTimersByTime(200);
		fire(b, 'pointerup', finger);
		expect(bgCalls()).toEqual([[first], [paletteColor(17)]]);
		expect(fgCalls()).toEqual([]);
		expect(stored()).toEqual([paletteColor(17), first]);
	});

	it('a hold that wanders, meets a second finger, or is cancelled picks nothing', () => {
		const [a, b] = grid();
		fire(a, 'pointerdown', finger);
		fire(a, 'pointermove', { ...finger, clientY: 25 });
		vi.advanceTimersByTime(600);
		fire(a, 'pointerdown', finger);
		fire(b, 'pointerdown', { ...finger, pointerId: 2, isPrimary: false });
		vi.advanceTimersByTime(600);
		fire(a, 'pointerdown', finger);
		fire(a, 'pointercancel', finger);
		vi.advanceTimersByTime(600);
		expect(bgCalls()).toEqual([]);
		expect(fgCalls()).toEqual([]);
	});

	it('a hold on the recent row picks once though the row rebuilds under the finger', () => {
		const [a, b] = grid();
		fire(b, 'click');
		fire(a, 'click');
		vi.clearAllMocks();
		expect(stored()).toEqual([first, paletteColor(17)]);

		const older = recent()[1];
		fire(older, 'pointerdown', finger);
		vi.advanceTimersByTime(500);
		// the lift, and Chrome's native contextmenu after it, land on the
		// swatch now in that slot
		const slid = recent()[1];
		expect(slid).not.toBe(older);
		fire(slid, 'pointerup', finger);
		fire(slid, 'click');
		menu(slid);
		expect(bgCalls()).toEqual([[paletteColor(17)]]);
		expect(fgCalls()).toEqual([]);
		expect(stored()).toEqual([paletteColor(17), first]);
	});
});
