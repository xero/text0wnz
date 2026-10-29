// @ts-check
/**
 * Touch gesture recognizer, a pure state machine fed touch pointers
 * only (mouse and pen skip it). One finger strokes only after a short
 * hold, so a gesture whose second finger lands inside it never paints.
 *
 * After a gesture, remaining fingers are inert until everything lifts;
 * nothing paints on the tail of a half-finished gesture. pointercancel
 * kills tap eligibility but still ends strokes and pinches cleanly, so
 * a browser-stolen gesture (notification shade, palm) never wedges the
 * machine, and capture-fed events mean fingers may wander anywhere on
 * screen.
 *
 * Timing and the scheduler are injectable for tests. Tunables ride
 * magicNumbers so device tuning is one file.
 */

import magicNumbers from './magicNumbers.js';

/**
 * @typedef {object} GesturePoint
 * @property {number} clientX
 * @property {number} clientY
 */

/**
 * @typedef {object} GestureCallbacks
 * @property {(pt: GesturePoint) => void} [onStrokeStart]
 * @property {(pt: GesturePoint) => void} [onStrokeMove]
 * @property {() => void} [onStrokeEnd]
 * @property {() => void} [onUndo]
 * @property {() => void} [onRedo]
 * @property {(centroid: GesturePoint) => void} [onPinchStart]
 * @property {(update: {centroid: GesturePoint, centroidDelta: GesturePoint, scale: number}) => void} [onPinchMove]
 * @property {() => void} [onPinchEnd]
 */

export const GESTURE_DEFAULTS = {
	tapWindowMs: magicNumbers.GESTURE_TAP_WINDOW_MS,
	slopPx: magicNumbers.GESTURE_SLOP_PX,
	strokeHoldMs: magicNumbers.GESTURE_STROKE_HOLD_MS,
};

/**
 * @param {GestureCallbacks} callbacks
 * @param {object} [options]
 * @param {number} [options.tapWindowMs]
 * @param {number} [options.slopPx]
 * @param {number} [options.strokeHoldMs]
 * @param {() => number} [options.now]
 * @param {(fn: () => void, ms: number) => unknown} [options.schedule]
 * @param {(handle: unknown) => void} [options.cancelSchedule]
 */
export const createGestureRecognizer = (callbacks, options = {}) => {
	const tapWindowMs = options.tapWindowMs ?? GESTURE_DEFAULTS.tapWindowMs;
	const slopPx = options.slopPx ?? GESTURE_DEFAULTS.slopPx;
	const strokeHoldMs = options.strokeHoldMs ?? GESTURE_DEFAULTS.strokeHoldMs;
	const now = options.now ?? (() => performance.now());
	const schedule =
		options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
	const cancelSchedule =
		options.cancelSchedule ?? (handle => clearTimeout(/** @type {any} */ (handle)));

	/**
	 * @typedef {object} TrackedPointer
	 * @property {number} startX
	 * @property {number} startY
	 * @property {number} lastX
	 * @property {number} lastY
	 * @property {boolean} cancelled
	 */

	/** @type {Map<number, TrackedPointer>} */
	const pointers = new Map();
	/** 'idle' | 'hold' | 'stroke' | 'gesture' | 'dead' */
	let state = 'idle';
	/** @type {unknown} */
	let holdTimer = null;
	let firstDownAt = 0;
	let maxTravel = 0;
	let maxCount = 0;
	let pinching = false;
	let pinchStartDist = 0;
	let lastCentroidX = 0;
	let lastCentroidY = 0;
	let tapEligible = true;

	const clearHold = () => {
		if (holdTimer !== null) {
			cancelSchedule(holdTimer);
			holdTimer = null;
		}
	};

	// pinch math always runs on the first two pointers so a grazing
	// third finger (or palm edge) cannot freeze an active pinch
	const pair = () => [...pointers.values()].slice(0, 2);

	const pairDistance = () => {
		const pts = pair();
		if (pts.length < 2) {
			return 0;
		}
		return Math.hypot(
			pts[0].lastX - pts[1].lastX,
			pts[0].lastY - pts[1].lastY,
		);
	};

	const pairCentroid = () => {
		const pts = pair();
		let cx = 0;
		let cy = 0;
		for (const p of pts) {
			cx += p.lastX;
			cy += p.lastY;
		}
		const n = pts.length || 1;
		return { clientX: cx / n, clientY: cy / n };
	};

	const updateTravel = () => {
		for (const p of pointers.values()) {
			const travel = Math.hypot(p.lastX - p.startX, p.lastY - p.startY);
			if (travel > maxTravel) {
				maxTravel = travel;
			}
		}
	};

	// internal cleanup: the lift paths emit their own end events first
	const clearAll = () => {
		clearHold();
		pointers.clear();
		state = 'idle';
		maxTravel = 0;
		maxCount = 0;
		pinching = false;
		tapEligible = true;
	};

	// external reset (dispose paths): an in-flight stroke or pinch must
	// end observably, or consumers (the zoom controller's interactive
	// flag, tools awaiting Up) wedge
	const reset = () => {
		if (state === 'stroke') {
			callbacks.onStrokeEnd?.();
		}
		if (pinching) {
			callbacks.onPinchEnd?.();
		}
		clearAll();
	};

	/** @param {GesturePoint} pt */
	const beginStroke = pt => {
		state = 'stroke';
		clearHold();
		callbacks.onStrokeStart?.(pt);
	};

	const enterGesture = () => {
		clearHold();
		state = 'gesture';
		if (pointers.size >= 2) {
			pinchStartDist = pairDistance();
			const c = pairCentroid();
			lastCentroidX = c.clientX;
			lastCentroidY = c.clientY;
		}
	};

	/** @param {number} id @param {number} clientX @param {number} clientY */
	const down = (id, clientX, clientY) => {
		pointers.set(id, {
			startX: clientX,
			startY: clientY,
			lastX: clientX,
			lastY: clientY,
			cancelled: false,
		});
		maxCount = Math.max(maxCount, pointers.size);
		if (state === 'idle') {
			state = 'hold';
			firstDownAt = now();
			maxTravel = 0;
			tapEligible = true;
			holdTimer = schedule(() => {
				holdTimer = null;
				if (state === 'hold' && pointers.size === 1) {
					const p = pointers.get(id);
					if (p) {
						beginStroke({ clientX: p.startX, clientY: p.startY });
						if (p.lastX !== p.startX || p.lastY !== p.startY) {
							callbacks.onStrokeMove?.({
								clientX: p.lastX,
								clientY: p.lastY,
							});
						}
					}
				}
			}, strokeHoldMs);
		} else if (state === 'hold') {
			// second finger inside the hold: it was never a stroke
			enterGesture();
		} else if (state === 'stroke') {
			// drawn cells stay, and no tap fires: a straggly 2-finger tap
			// would undo the dot the stroke just painted
			callbacks.onStrokeEnd?.();
			enterGesture();
			tapEligible = false;
		}
		// extra fingers during a pinch just join the map; the pair math
		// and the tap counting already handle them
	};

	/** @param {number} id @param {number} clientX @param {number} clientY */
	const move = (id, clientX, clientY) => {
		const p = pointers.get(id);
		if (!p) {
			return;
		}
		p.lastX = clientX;
		p.lastY = clientY;
		updateTravel();
		if (state === 'hold') {
			if (maxTravel > slopPx) {
				// real stroke: start at the ORIGINAL down point, no ink lost
				beginStroke({ clientX: p.startX, clientY: p.startY });
				callbacks.onStrokeMove?.({ clientX, clientY });
			}
		} else if (state === 'stroke') {
			callbacks.onStrokeMove?.({ clientX, clientY });
		} else if (state === 'gesture' && pointers.size >= 2) {
			if (!pinching && maxTravel > slopPx) {
				pinching = true;
				pinchStartDist = pairDistance() || 1;
				const c = pairCentroid();
				lastCentroidX = c.clientX;
				lastCentroidY = c.clientY;
				callbacks.onPinchStart?.(c);
			}
			if (pinching) {
				const c = pairCentroid();
				const dist = pairDistance();
				callbacks.onPinchMove?.({
					centroid: c,
					centroidDelta: {
						clientX: c.clientX - lastCentroidX,
						clientY: c.clientY - lastCentroidY,
					},
					scale: pinchStartDist > 0 ? dist / pinchStartDist : 1,
				});
				lastCentroidX = c.clientX;
				lastCentroidY = c.clientY;
			}
		}
	};

	/** @param {number} id @param {boolean} cancelled */
	const lift = (id, cancelled) => {
		const p = pointers.get(id);
		if (!p) {
			return;
		}
		if (cancelled) {
			tapEligible = false;
		}
		pointers.delete(id);
		if (state === 'hold') {
			clearHold();
			if (!cancelled) {
				// a quick tap paints one point
				beginStroke({ clientX: p.startX, clientY: p.startY });
				callbacks.onStrokeEnd?.();
			}
			clearAll();
			return;
		}
		if (state === 'stroke') {
			callbacks.onStrokeEnd?.();
			clearAll();
			return;
		}
		if (state === 'gesture') {
			if (pinching) {
				// a pinch ends at the first lift; survivors go inert
				pinching = false;
				callbacks.onPinchEnd?.();
				state = pointers.size === 0 ? 'idle' : 'dead';
				if (pointers.size === 0) {
					clearAll();
				}
				return;
			}
			if (pointers.size === 0) {
				// fingers lift one at a time; the tap evaluates on the last
				const quick = now() - firstDownAt < tapWindowMs;
				const still = maxTravel <= slopPx;
				if (tapEligible && quick && still) {
					if (maxCount === 2) {
						callbacks.onUndo?.();
					} else if (maxCount >= 3) {
						callbacks.onRedo?.();
					}
				}
				clearAll();
			}
			return;
		}
		if (state === 'dead' && pointers.size === 0) {
			clearAll();
		}
	};

	return {
		down,
		move,
		/** @param {number} id */
		up: id => lift(id, false),
		/** @param {number} id */
		cancel: id => lift(id, true),
		/** test/debug introspection */
		stats: () => ({
			state,
			pointerCount: pointers.size,
			pinching,
			maxTravel,
		}),
		reset,
	};
};
