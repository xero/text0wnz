/**
 * Pointer normalizer: one pipeline for mouse/pen/touch keeping v2's
 * onTextCanvasDown/Drag/Up/Move contract (detail extended with
 * modifiers, pressure, pointerType). Touch rides the gesture
 * recognizer; pen gets palm rejection; capture ends are first-class.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	createPointerInput,
	PEN_PALM_GRACE_MS,
} from '../../src/js/client/pointer.js';
import { GESTURE_DEFAULTS } from '../../src/js/client/gestures.js';

/* global PointerEvent -- jsdom provides it; the shared eslint env predates it */
const pev = (type, props = {}) => {
	const e = new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		...props,
	});
	// jsdom drops pointer-specific init fields; pin them on
	for (const k of [
		'pointerId',
		'pointerType',
		'pressure',
		'buttons',
		'button',
		'clientX',
		'clientY',
	]) {
		if (k in props && e[k] !== props[k]) {
			Object.defineProperty(e, k, { value: props[k] });
		}
	}
	return e;
};

const makeHarness = () => {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const events = [];
	const sample = vi.fn();
	const undo = vi.fn();
	const redo = vi.fn();
	const input = createPointerInput(container, {
		// 8x16 cells at origin 0,0; clamp to an 80x25 doc
		map: (clientX, clientY, clamp) => {
			let x = Math.floor(clientX / 8);
			let y = Math.floor(clientY / 16);
			let halfBlockY = Math.floor(clientY / 8);
			if (clamp) {
				x = Math.min(Math.max(x, 0), 79);
				y = Math.min(Math.max(y, 0), 24);
				halfBlockY = Math.min(Math.max(halfBlockY, 0), 49);
			}
			return { x, y, halfBlockY };
		},
		dispatch: (name, detail) => events.push({ name, detail }),
		sample,
		undo,
		redo,
	});
	return { container, events, sample, undo, redo, input };
};

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = '';
});

describe('mouse and pen', () => {
	it('down/move/up produce Down, Move+Drag, Up with v2 button semantics', () => {
		const { container, events } = makeHarness();
		container.dispatchEvent(
			pev('pointerdown', {
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				buttons: 1,
				clientX: 20,
				clientY: 40,
			}),
		);
		expect(events[0]).toEqual({
			name: 'onTextCanvasDown',
			detail: {
				x: 2,
				y: 2,
				halfBlockY: 5,
				leftMouseButton: true,
				rightMouseButton: false,
				shiftKey: false,
				altKey: false,
				pressure: 0.5,
				pointerType: 'mouse',
			},
		});
		container.dispatchEvent(
			pev('pointermove', {
				pointerId: 1,
				pointerType: 'mouse',
				buttons: 1,
				clientX: 28,
				clientY: 40,
			}),
		);
		expect(events[1].name).toBe('onTextCanvasMove');
		expect(events[2].name).toBe('onTextCanvasDrag');
		expect(events[2].detail.x).toBe(3);
		container.dispatchEvent(
			pev('pointerup', { pointerId: 1, pointerType: 'mouse', buttons: 0 }),
		);
		expect(events[3].name).toBe('onTextCanvasUp');
	});

	it('hover moves dispatch Move without Drag', () => {
		const { container, events } = makeHarness();
		container.dispatchEvent(
			pev('pointermove', {
				pointerId: 1,
				pointerType: 'mouse',
				buttons: 0,
				clientX: 9,
				clientY: 17,
			}),
		);
		expect(events.map(e => e.name)).toEqual(['onTextCanvasMove']);
	});

	it('ctrl folds into rightMouseButton (v2 behavior)', () => {
		const { container, events } = makeHarness();
		container.dispatchEvent(
			pev('pointerdown', {
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				buttons: 1,
				ctrlKey: true,
				clientX: 0,
				clientY: 0,
			}),
		);
		expect(events[0].detail.leftMouseButton).toBe(false);
		expect(events[0].detail.rightMouseButton).toBe(true);
	});

	it('alt-click samples instead of drawing', () => {
		const { container, events, sample } = makeHarness();
		container.dispatchEvent(
			pev('pointerdown', {
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				buttons: 1,
				altKey: true,
				clientX: 16,
				clientY: 32,
			}),
		);
		expect(sample).toHaveBeenCalledWith(2, 4);
		expect(events).toEqual([]);
	});

	it('drags clamp to the document while captured outside the canvas', () => {
		const { container, events } = makeHarness();
		container.dispatchEvent(
			pev('pointerdown', {
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				buttons: 1,
				clientX: 10,
				clientY: 10,
			}),
		);
		container.dispatchEvent(
			pev('pointermove', {
				pointerId: 1,
				pointerType: 'mouse',
				buttons: 1,
				clientX: -50,
				clientY: 9999,
			}),
		);
		const drag = events.find(e => e.name === 'onTextCanvasDrag');
		expect(drag.detail).toMatchObject({ x: 0, y: 24, halfBlockY: 49 });
		// the hover Move stays unclamped, exactly like v2's raw coords
		const move = events.find(e => e.name === 'onTextCanvasMove');
		expect(move.detail.x).toBe(-7);
	});

	it('pointercancel ends the stroke with Up', () => {
		const { container, events } = makeHarness();
		container.dispatchEvent(
			pev('pointerdown', {
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				buttons: 1,
				clientX: 0,
				clientY: 0,
			}),
		);
		container.dispatchEvent(
			pev('pointercancel', { pointerId: 1, pointerType: 'mouse' }),
		);
		expect(events.map(e => e.name)).toEqual([
			'onTextCanvasDown',
			'onTextCanvasUp',
		]);
	});

	it('pen carries pressure into Down and Drag', () => {
		const { container, events } = makeHarness();
		container.dispatchEvent(
			pev('pointerdown', {
				pointerId: 7,
				pointerType: 'pen',
				button: 0,
				buttons: 1,
				pressure: 0.25,
				clientX: 0,
				clientY: 0,
			}),
		);
		container.dispatchEvent(
			pev('pointermove', {
				pointerId: 7,
				pointerType: 'pen',
				buttons: 1,
				pressure: 0.8,
				clientX: 8,
				clientY: 0,
			}),
		);
		expect(events[0].detail.pressure).toBe(0.25);
		expect(events[0].detail.pointerType).toBe('pen');
		const drag = events.find(e => e.name === 'onTextCanvasDrag');
		expect(drag.detail.pressure).toBe(0.8);
	});
});

describe('touch', () => {
	const touch = (type, id, x, y, extra = {}) =>
		pev(type, {
			pointerId: id,
			pointerType: 'touch',
			clientX: x,
			clientY: y,
			...extra,
		});

	it('single finger draws after the hold, with touch button semantics', () => {
		const { container, events } = makeHarness();
		container.dispatchEvent(touch('pointerdown', 10, 40, 40));
		expect(events).toEqual([]);
		vi.advanceTimersByTime(GESTURE_DEFAULTS.strokeHoldMs);
		expect(events[0].name).toBe('onTextCanvasDown');
		expect(events[0].detail.leftMouseButton).toBe(false);
		expect(events[0].detail.pointerType).toBe('touch');
		container.dispatchEvent(touch('pointermove', 10, 80, 40));
		expect(events.at(-1).name).toBe('onTextCanvasDrag');
		container.dispatchEvent(touch('pointerup', 10, 80, 40));
		expect(events.at(-1).name).toBe('onTextCanvasUp');
	});

	it('2-finger tap undoes once and paints nothing', () => {
		const { container, events, undo } = makeHarness();
		container.dispatchEvent(touch('pointerdown', 10, 40, 40));
		vi.advanceTimersByTime(10);
		container.dispatchEvent(touch('pointerdown', 11, 80, 40));
		vi.advanceTimersByTime(30);
		container.dispatchEvent(touch('pointerup', 10, 40, 40));
		container.dispatchEvent(touch('pointerup', 11, 80, 40));
		expect(undo).toHaveBeenCalledTimes(1);
		expect(events).toEqual([]);
		vi.advanceTimersByTime(1000);
		expect(events).toEqual([]);
	});

	it('3-finger tap redoes', () => {
		const { container, redo } = makeHarness();
		container.dispatchEvent(touch('pointerdown', 10, 40, 40));
		container.dispatchEvent(touch('pointerdown', 11, 80, 40));
		container.dispatchEvent(touch('pointerdown', 12, 60, 80));
		vi.advanceTimersByTime(40);
		container.dispatchEvent(touch('pointerup', 10, 40, 40));
		container.dispatchEvent(touch('pointerup', 11, 80, 40));
		container.dispatchEvent(touch('pointerup', 12, 60, 80));
		expect(redo).toHaveBeenCalledTimes(1);
	});

	it('pinch emits PinchStart/Move/End document events', () => {
		const { container, events } = makeHarness();
		container.dispatchEvent(touch('pointerdown', 10, 100, 100));
		container.dispatchEvent(touch('pointerdown', 11, 200, 100));
		container.dispatchEvent(touch('pointermove', 10, 60, 100));
		container.dispatchEvent(touch('pointermove', 11, 240, 100));
		container.dispatchEvent(touch('pointerup', 10, 60, 100));
		const names = events.map(e => e.name);
		expect(names[0]).toBe('onTextCanvasPinchStart');
		expect(names).toContain('onTextCanvasPinchMove');
		expect(names.at(-1)).toBe('onTextCanvasPinchEnd');
		const moves = events.filter(e => e.name === 'onTextCanvasPinchMove');
		expect(moves.at(-1).detail.scale).toBeGreaterThan(1);
	});

	it('touch is rejected while a pen is down and during the grace window', () => {
		const { container, events, input } = makeHarness();
		container.dispatchEvent(
			pev('pointerdown', {
				pointerId: 7,
				pointerType: 'pen',
				button: 0,
				buttons: 1,
				pressure: 0.5,
				clientX: 0,
				clientY: 0,
			}),
		);
		container.dispatchEvent(touch('pointerdown', 10, 40, 40));
		expect(input.stats().touchCount).toBe(0);
		container.dispatchEvent(
			pev('pointerup', { pointerId: 7, pointerType: 'pen' }),
		);
		// still inside the grace window
		container.dispatchEvent(touch('pointerdown', 11, 40, 40));
		expect(input.stats().touchCount).toBe(0);
		expect(events.filter(e => e.name === 'onTextCanvasDown')).toHaveLength(1);
	});

	it('a pen landing mid-gesture cancels the touch pointers', () => {
		const { container, undo, input } = makeHarness();
		container.dispatchEvent(touch('pointerdown', 10, 40, 40));
		container.dispatchEvent(touch('pointerdown', 11, 80, 40));
		container.dispatchEvent(
			pev('pointerdown', {
				pointerId: 7,
				pointerType: 'pen',
				button: 0,
				buttons: 1,
				pressure: 0.5,
				clientX: 0,
				clientY: 0,
			}),
		);
		expect(input.stats().touchCount).toBe(0);
		container.dispatchEvent(touch('pointerup', 10, 40, 40));
		container.dispatchEvent(touch('pointerup', 11, 80, 40));
		expect(undo).not.toHaveBeenCalled();
	});
});

describe('lifecycle', () => {
	it('sets touch-action none and disposes cleanly', () => {
		const { container, events, input } = makeHarness();
		expect(container.style.touchAction).toBe('none');
		input.dispose();
		container.dispatchEvent(
			pev('pointerdown', {
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				buttons: 1,
				clientX: 0,
				clientY: 0,
			}),
		);
		expect(events).toEqual([]);
	});

	it('exports the palm grace constant for tuning', () => {
		expect(PEN_PALM_GRACE_MS).toBeGreaterThan(0);
	});
});
