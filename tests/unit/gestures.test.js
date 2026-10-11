/**
 * Gesture recognizer (PLAN §3.5, D11): stroke vs 2-finger-tap undo vs
 * 3-finger-tap redo vs pinch, driven through an injected clock and
 * scheduler so every timing path is deterministic.
 */
import { describe, it, expect, vi } from 'vitest';
import {
	createGestureRecognizer,
	GESTURE_DEFAULTS,
} from '../../src/js/client/gestures.js';

const harness = () => {
	let clock = 0;
	const timers = [];
	const calls = [];
	const cb = {};
	for (const name of [
		'onStrokeStart',
		'onStrokeMove',
		'onStrokeEnd',
		'onUndo',
		'onRedo',
		'onPinchStart',
		'onPinchMove',
		'onPinchEnd',
	]) {
		cb[name] = vi.fn((...args) => calls.push([name, ...args]));
	}
	const rec = createGestureRecognizer(cb, {
		now: () => clock,
		schedule: (fn, ms) => {
			const t = { at: clock + ms, fn, dead: false };
			timers.push(t);
			return t;
		},
		cancelSchedule: t => {
			t.dead = true;
		},
	});
	const advance = ms => {
		clock += ms;
		for (const t of timers) {
			if (!t.dead && t.at <= clock) {
				t.dead = true;
				t.fn();
			}
		}
	};
	return { rec, cb, calls, advance };
};

const names = calls => calls.map(c => c[0]);

describe('gesture recognizer', () => {
	it('single finger: hold expires into a stroke at the down point', () => {
		const { rec, cb, advance } = harness();
		rec.down(1, 100, 100);
		expect(cb.onStrokeStart).not.toHaveBeenCalled();
		advance(GESTURE_DEFAULTS.strokeHoldMs);
		expect(cb.onStrokeStart).toHaveBeenCalledWith({
			clientX: 100,
			clientY: 100,
		});
		rec.move(1, 120, 110);
		expect(cb.onStrokeMove).toHaveBeenLastCalledWith({
			clientX: 120,
			clientY: 110,
		});
		rec.up(1);
		expect(cb.onStrokeEnd).toHaveBeenCalledTimes(1);
	});

	it('single finger: slop breakout starts the stroke early, no ink lost', () => {
		const { rec, cb } = harness();
		rec.down(1, 50, 50);
		rec.move(1, 75, 50); // 25px > slop, before the hold expires
		expect(cb.onStrokeStart).toHaveBeenCalledWith({ clientX: 50, clientY: 50 });
		expect(cb.onStrokeMove).toHaveBeenCalledWith({ clientX: 75, clientY: 50 });
	});

	it('quick tap paints one point (v2 behavior)', () => {
		const { rec, calls, advance } = harness();
		rec.down(1, 30, 40);
		advance(20);
		rec.up(1);
		expect(names(calls)).toEqual(['onStrokeStart', 'onStrokeEnd']);
	});

	it('2-finger tap fires undo and never paints', () => {
		const { rec, cb, advance } = harness();
		rec.down(1, 100, 100);
		advance(20);
		rec.down(2, 140, 100);
		advance(50);
		rec.up(1);
		rec.up(2);
		expect(cb.onUndo).toHaveBeenCalledTimes(1);
		expect(cb.onStrokeStart).not.toHaveBeenCalled();
		// the pending hold must not fire later
		advance(500);
		expect(cb.onStrokeStart).not.toHaveBeenCalled();
	});

	it('3-finger tap fires redo', () => {
		const { rec, cb, advance } = harness();
		rec.down(1, 100, 100);
		rec.down(2, 140, 100);
		rec.down(3, 120, 140);
		advance(60);
		rec.up(1);
		rec.up(3);
		rec.up(2);
		expect(cb.onRedo).toHaveBeenCalledTimes(1);
		expect(cb.onUndo).not.toHaveBeenCalled();
	});

	it('slow 2-finger lift is not an undo', () => {
		const { rec, cb, advance } = harness();
		rec.down(1, 100, 100);
		rec.down(2, 140, 100);
		advance(GESTURE_DEFAULTS.tapWindowMs + 50);
		rec.up(1);
		rec.up(2);
		expect(cb.onUndo).not.toHaveBeenCalled();
	});

	it('travel past slop turns two fingers into a pinch', () => {
		const { rec, cb } = harness();
		rec.down(1, 100, 100);
		rec.down(2, 200, 100); // dist 100
		rec.move(1, 80, 100); // travel 20 > slop
		expect(cb.onPinchStart).toHaveBeenCalledTimes(1);
		rec.move(2, 240, 100); // dist 160 vs baseline 120
		const update = cb.onPinchMove.mock.calls.at(-1)[0];
		expect(update.scale).toBeCloseTo(160 / 120, 5);
		expect(update.centroid).toEqual({ clientX: 160, clientY: 100 });
		rec.up(1);
		expect(cb.onPinchEnd).toHaveBeenCalledTimes(1);
		expect(cb.onUndo).not.toHaveBeenCalled();
	});

	it('pinch centroid delta pans', () => {
		const { rec, cb } = harness();
		rec.down(1, 100, 100);
		rec.down(2, 200, 100);
		rec.move(1, 120, 140); // breakout
		cb.onPinchMove.mockClear();
		rec.move(1, 120, 160);
		rec.move(2, 200, 120);
		const deltas = cb.onPinchMove.mock.calls.map(c => c[0].centroidDelta);
		const total = deltas.reduce(
			(a, d) => ({ x: a.x + d.clientX, y: a.y + d.clientY }),
			{ x: 0, y: 0 },
		);
		expect(total.y).toBeGreaterThan(0);
	});

	it('finger joining mid-stroke ends the stroke and blocks the tap', () => {
		const { rec, cb, advance } = harness();
		rec.down(1, 100, 100);
		advance(GESTURE_DEFAULTS.strokeHoldMs); // stroke started (dot painted)
		rec.down(2, 140, 100);
		expect(cb.onStrokeEnd).toHaveBeenCalledTimes(1);
		advance(20);
		rec.up(1);
		rec.up(2);
		// no undo: it would eat the dot the stroke just painted
		expect(cb.onUndo).not.toHaveBeenCalled();
	});

	it('pointercancel ends a stroke without painting a tap', () => {
		const { rec, calls, advance } = harness();
		rec.down(1, 10, 10);
		advance(10);
		rec.cancel(1);
		expect(names(calls)).toEqual([]);
		// machine is reusable afterwards
		rec.down(2, 20, 20);
		advance(GESTURE_DEFAULTS.strokeHoldMs);
		expect(names(calls)).toEqual(['onStrokeStart']);
	});

	it('cancelled fingers disqualify gesture taps', () => {
		const { rec, cb, advance } = harness();
		rec.down(1, 100, 100);
		rec.down(2, 140, 100);
		advance(30);
		rec.cancel(1);
		rec.up(2);
		expect(cb.onUndo).not.toHaveBeenCalled();
	});

	it('survivors after a pinch are inert until everything lifts', () => {
		const { rec, cb, advance } = harness();
		rec.down(1, 100, 100);
		rec.down(2, 200, 100);
		rec.move(1, 60, 100); // pinch
		rec.up(1); // pinch ends, finger 2 survives
		expect(cb.onPinchEnd).toHaveBeenCalledTimes(1);
		rec.move(2, 300, 300);
		rec.up(2);
		expect(cb.onStrokeStart).not.toHaveBeenCalled();
		// fresh stroke works after full reset
		rec.down(3, 10, 10);
		advance(GESTURE_DEFAULTS.strokeHoldMs);
		expect(cb.onStrokeStart).toHaveBeenCalledTimes(1);
	});

	it('a grazing third finger does not freeze an active pinch', () => {
		const { rec, cb } = harness();
		rec.down(1, 100, 100);
		rec.down(2, 200, 100);
		rec.move(1, 80, 100); // breakout
		expect(cb.onPinchStart).toHaveBeenCalledTimes(1);
		rec.down(3, 150, 220); // palm edge joins
		cb.onPinchMove.mockClear();
		rec.move(2, 260, 100); // pair keeps pinching
		expect(cb.onPinchMove).toHaveBeenCalled();
		const update = cb.onPinchMove.mock.calls.at(-1)[0];
		expect(update.scale).toBeGreaterThan(1);
	});

	it('external reset mid-stroke and mid-pinch emits the end events', () => {
		const a = harness();
		a.rec.down(1, 50, 50);
		a.rec.move(1, 80, 50); // stroke via slop
		a.rec.reset();
		expect(a.cb.onStrokeEnd).toHaveBeenCalledTimes(1);

		const b = harness();
		b.rec.down(1, 100, 100);
		b.rec.down(2, 200, 100);
		b.rec.move(1, 60, 100); // pinch
		b.rec.reset();
		expect(b.cb.onPinchEnd).toHaveBeenCalledTimes(1);
	});

	it('stats exposes the machine for debugging', () => {
		const { rec } = harness();
		expect(rec.stats()).toEqual({
			state: 'idle',
			pointerCount: 0,
			pinching: false,
			maxTravel: 0,
		});
		rec.down(1, 0, 0);
		expect(rec.stats().state).toBe('hold');
		expect(rec.stats().pointerCount).toBe(1);
	});
});
