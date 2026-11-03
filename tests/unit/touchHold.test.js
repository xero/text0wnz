import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	createTouchHold,
	LONG_PRESS_MS,
	LONG_PRESS_SLOP_PX,
} from '../../src/js/client/touchHold.js';

/* global PointerEvent -- jsdom provides it; the shared eslint env predates it */
const pev = (type, props = {}) =>
	new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		pointerId: 1,
		pointerType: 'touch',
		isPrimary: true,
		clientX: 10,
		clientY: 10,
		...props,
	});

describe('createTouchHold', () => {
	let el, hold, fired, cancel;
	const down = (props = {}) => el.dispatchEvent(pev('pointerdown', props));

	beforeEach(() => {
		vi.useFakeTimers();
		document.body.innerHTML = '<div id="held"></div><div id="other"></div>';
		el = document.getElementById('held');
		hold = createTouchHold();
		fired = vi.fn();
		cancel = vi.fn();
		el.addEventListener('pointerdown', e => hold.arm(e, fired, cancel));
		el.addEventListener('pointermove', hold.move);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('a still primary touch fires once, after the hold time', () => {
		down();
		vi.advanceTimersByTime(LONG_PRESS_MS - 1);
		expect(fired).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(fired).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(LONG_PRESS_MS * 2);
		expect(fired).toHaveBeenCalledTimes(1);
	});

	it('a mouse, a pen, or a secondary touch never arms', () => {
		down({ pointerType: 'mouse' });
		down({ pointerType: 'pen' });
		down({ isPrimary: false });
		vi.advanceTimersByTime(LONG_PRESS_MS * 2);
		expect(fired).not.toHaveBeenCalled();
	});

	it('a wobble inside the slop still holds, a wander past it cancels', () => {
		down();
		el.dispatchEvent(pev('pointermove', { clientX: 10 + LONG_PRESS_SLOP_PX }));
		vi.advanceTimersByTime(LONG_PRESS_MS);
		expect(fired).toHaveBeenCalledTimes(1);
		down();
		el.dispatchEvent(
			pev('pointermove', { clientX: 10 + LONG_PRESS_SLOP_PX + 1 }),
		);
		vi.advanceTimersByTime(LONG_PRESS_MS);
		expect(fired).toHaveBeenCalledTimes(1);
	});

	it('the finger lifting or cancelling disarms, wherever the event lands', () => {
		const other = document.getElementById('other');
		down();
		other.dispatchEvent(pev('pointerup'));
		down();
		other.dispatchEvent(pev('pointercancel'));
		vi.advanceTimersByTime(LONG_PRESS_MS * 2);
		expect(fired).not.toHaveBeenCalled();
	});

	it('a second finger anywhere cancels', () => {
		down();
		document
			.getElementById('other')
			.dispatchEvent(pev('pointerdown', { pointerId: 2, isPrimary: false }));
		vi.advanceTimersByTime(LONG_PRESS_MS * 2);
		expect(fired).not.toHaveBeenCalled();
	});

	it('a fresh press re-arms instead of stacking a second timer', () => {
		down();
		vi.advanceTimersByTime(LONG_PRESS_MS / 2);
		down();
		vi.advanceTimersByTime(LONG_PRESS_MS / 2);
		expect(fired).not.toHaveBeenCalled();
		vi.advanceTimersByTime(LONG_PRESS_MS);
		expect(fired).toHaveBeenCalledTimes(1);
	});

	it('a wander, a second finger, or a cancel drops the press, and a lift or a fire does not', () => {
		const other = document.getElementById('other');
		down();
		other.dispatchEvent(pev('pointerup'));
		down();
		vi.advanceTimersByTime(LONG_PRESS_MS);
		other.dispatchEvent(pev('pointercancel'));
		expect(cancel).not.toHaveBeenCalled();
		down();
		el.dispatchEvent(
			pev('pointermove', { clientX: 10 + LONG_PRESS_SLOP_PX + 1 }),
		);
		down();
		other.dispatchEvent(pev('pointerdown', { pointerId: 2, isPrimary: false }));
		down();
		other.dispatchEvent(pev('pointercancel'));
		expect(cancel).toHaveBeenCalledTimes(3);
		vi.advanceTimersByTime(LONG_PRESS_MS * 2);
		expect(cancel).toHaveBeenCalledTimes(3);
		expect(fired).toHaveBeenCalledTimes(1);
	});

	it('flush fires an armed hold at once, and only once', () => {
		hold.flush();
		expect(fired).not.toHaveBeenCalled();
		down();
		vi.advanceTimersByTime(LONG_PRESS_MS - 100);
		hold.flush();
		expect(fired).toHaveBeenCalledTimes(1);
		hold.flush();
		vi.advanceTimersByTime(LONG_PRESS_MS * 2);
		expect(fired).toHaveBeenCalledTimes(1);
	});
});
