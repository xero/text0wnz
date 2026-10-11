// @ts-check
/**
 * Touch gesture recognizer (PLAN §3.5, D11). Pure state machine: the
 * pointer normalizer feeds it touch pointers only (mouse and pen skip
 * it entirely) and it decides between a draw stroke and the gestures:
 *
 * - one finger: a stroke, after a short disambiguation hold. The hold
 *   ends early when the finger moves past slop (stroke starts at the
 *   ORIGINAL down point so no ink is lost) or lifts (a tap paints one
 *   point, v2 behavior). A second finger landing inside the hold means
 *   it was never a stroke: nothing paints, which fixes v2's "second
 *   finger paints first" bug without undo hacks.
 * - two fingers, both lift within tapWindowMs with travel under
 *   slopPx: undo (D11).
 * - two fingers traveling past slop: pinch-zoom/pan at the centroid
 *   until a finger lifts.
 * - three or more fingers, clean tap: redo.
 * - a finger joining mid-stroke ends the stroke (already-drawn cells
 *   stay) and opens gesture tracking.
 *
 * After a gesture, remaining fingers are inert until everything lifts;
 * nothing paints on the tail of a half-finished gesture. pointercancel
 * kills tap eligibility but still ends strokes and pinches cleanly, so
 * a browser-stolen gesture (notification shade, palm) never wedges the
 * machine, and capture-fed events mean fingers may wander anywhere on
 * screen (the pinch the owner lost to focus in past attempts).
 *
 * Timing and the scheduler are injectable for tests; defaults are the
 * DOM clock. Tunables ride magicNumbers so device tuning (the owner
 * handoff) is one file.
 */

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
	tapWindowMs: 250,
	slopPx: 10,
	strokeHoldMs: 70,
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

	const centroid = () => {
		let cx = 0;
		let cy = 0;
		for (const p of pointers.values()) {
			cx += p.lastX;
			cy += p.lastY;
		}
		const n = pointers.size || 1;
		return { clientX: cx / n, clientY: cy / n };
	};

	const pairDistance = () => {
		const pts = [...pointers.values()];
		if (pts.length < 2) {
			return 0;
		}
		return Math.hypot(
			pts[0].lastX - pts[1].lastX,
			pts[0].lastY - pts[1].lastY,
		);
	};

	const updateTravel = () => {
		for (const p of pointers.values()) {
			const travel = Math.hypot(p.lastX - p.startX, p.lastY - p.startY);
			if (travel > maxTravel) {
				maxTravel = travel;
			}
		}
	};

	const reset = () => {
		clearHold();
		pointers.clear();
		state = 'idle';
		maxTravel = 0;
		maxCount = 0;
		pinching = false;
		tapEligible = true;
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
		if (pointers.size === 2) {
			pinchStartDist = pairDistance();
			const c = centroid();
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
			// finger joined mid-stroke: end the stroke (drawn cells stay),
			// open a gesture, and disqualify taps so a straggly 2-finger
			// tap can't undo the dot the stroke just painted
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
		} else if (state === 'gesture' && pointers.size === 2) {
			if (!pinching && maxTravel > slopPx) {
				pinching = true;
				pinchStartDist = pairDistance() || 1;
				const c = centroid();
				lastCentroidX = c.clientX;
				lastCentroidY = c.clientY;
				callbacks.onPinchStart?.(c);
			}
			if (pinching) {
				const c = centroid();
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
				// a quick tap paints one point (v2 behavior)
				beginStroke({ clientX: p.startX, clientY: p.startY });
				callbacks.onStrokeEnd?.();
			}
			reset();
			return;
		}
		if (state === 'stroke') {
			callbacks.onStrokeEnd?.();
			reset();
			return;
		}
		if (state === 'gesture') {
			if (pinching) {
				// a pinch ends at the first lift; survivors go inert
				pinching = false;
				callbacks.onPinchEnd?.();
				state = pointers.size === 0 ? 'idle' : 'dead';
				if (pointers.size === 0) {
					reset();
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
				reset();
			}
			return;
		}
		if (state === 'dead' && pointers.size === 0) {
			reset();
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
