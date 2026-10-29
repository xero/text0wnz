// one guard instance for the whole file: its document listeners are
// permanent, like in the app
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGestureGuard } from '../../src/js/client/gestureGuard.js';
import { GESTURE_DEFAULTS } from '../../src/js/client/gestures.js';

/* global PointerEvent -- jsdom provides it; the shared eslint env predates it */
const pev = (type, props = {}) => {
	const e = new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		...props,
	});
	// jsdom drops pointer-specific init fields; pin them on
	for (const k of ['pointerId', 'pointerType', 'clientX', 'clientY']) {
		if (k in props) {
			Object.defineProperty(e, k, { value: props[k] });
		}
	}
	return e;
};

document.body.innerHTML =
	'<div id="canvasContainer"></div><div id="chrome"></div>';
const container = document.getElementById('canvasContainer');
const outside = document.getElementById('chrome');
const events = [];
for (const name of [
	'onTextCanvasPinchStart',
	'onTextCanvasPinchMove',
	'onTextCanvasPinchEnd',
]) {
	document.addEventListener(name, e => events.push([name, e.detail]));
}
createGestureGuard(container);

const touch = (target, type, pointerId, clientX = 0, clientY = 0) =>
	target.dispatchEvent(
		pev(type, { pointerId, pointerType: 'touch', clientX, clientY }),
	);

const pinch = (target, idA, idB) => {
	const slop = GESTURE_DEFAULTS.slopPx + 5;
	touch(target, 'pointerdown', idA, 100, 100);
	touch(target, 'pointerdown', idB, 200, 100);
	// first past-slop move enters the pinch (its scale baselines at 1),
	// the second one spreads further and must report scale > 1
	touch(target, 'pointermove', idB, 200 + slop * 2, 100);
	touch(target, 'pointermove', idB, 200 + slop * 6, 100);
	touch(target, 'pointerup', idA);
	touch(target, 'pointerup', idB);
};

describe('gesture guard', () => {
	beforeEach(() => {
		events.length = 0;
	});

	it('routes chrome pinches to the canvas pinch events', () => {
		pinch(outside, 1, 2);
		const names = events.map(([n]) => n);
		expect(names).toContain('onTextCanvasPinchStart');
		expect(names).toContain('onTextCanvasPinchMove');
		expect(names).toContain('onTextCanvasPinchEnd');
		const moves = events.filter(([n]) => n === 'onTextCanvasPinchMove');
		const last = moves[moves.length - 1][1];
		expect(last.scale).toBeGreaterThan(1);
		expect(last.centroid).toBeDefined();
	});

	it('ignores touches that start on the canvas', () => {
		pinch(container, 3, 4);
		expect(events).toEqual([]);
	});

	it('ignores mouse pointers everywhere', () => {
		outside.dispatchEvent(
			pev('pointerdown', {
				pointerId: 5,
				pointerType: 'mouse',
				clientX: 10,
				clientY: 10,
			}),
		);
		expect(events).toEqual([]);
	});

	it('blocks the Safari page zoom gesture events', () => {
		const g = new Event('gesturestart', { cancelable: true });
		const spy = vi.spyOn(g, 'preventDefault');
		document.dispatchEvent(g);
		expect(spy).toHaveBeenCalled();
	});
});
