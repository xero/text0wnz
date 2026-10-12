// @ts-check
/**
 * Pointer Events normalizer: the single input pipeline for mouse,
 * pen, and touch on the canvas. Tools receive the
 * onTextCanvasDown/Drag/Up/Move custom events on document, with
 * detail extended by {shiftKey, altKey, pressure, pointerType}.
 *
 * Every pointer is captured on down, so moves and lifts route here no
 * matter where the pointer travels; a pinch that starts on the canvas
 * and ends on the toolbar still ends cleanly. pointercancel and
 * lostpointercapture are first-class ends, so nothing wedges when the
 * browser steals a gesture.
 *
 * Touch routes through the gesture recognizer (strokes vs taps vs
 * pinch); mouse and pen bypass it. Palm rejection: touch is ignored
 * while a pen is down and for a grace period after it lifts, and a pen
 * landing mid-touch-gesture cancels the touch. Pinch updates leave as
 * onTextCanvasPinchStart/Move/End document events for the zoom
 * controller.
 */

import { createGestureRecognizer } from './gestures.js';
import magicNumbers from './magicNumbers.js';

export const PEN_PALM_GRACE_MS = magicNumbers.PEN_PALM_GRACE_MS;

/**
 * @typedef {{x: number, y: number, halfBlockY: number}} MappedCell
 */

/**
 * @typedef {object} PointerHandlers
 * @property {(clientX: number, clientY: number, clamp: boolean) => MappedCell | null} map
 * @property {(x: number, halfBlockY: number) => void} [sample]
 * @property {() => void} undo
 * @property {() => void} redo
 * @property {(name: string, detail: object) => void} [dispatch]
 */

/**
 * @param {HTMLElement} container
 * @param {PointerHandlers} handlers
 * @param {object} [options] recognizer options passthrough (tests)
 */
export const createPointerInput = (container, handlers, options = {}) => {
	const dispatch =
		handlers.dispatch ??
		((name, detail) =>
			document.dispatchEvent(new CustomEvent(name, { detail })));

	// the browser must never pan/zoom a gesture we are interpreting
	container.style.touchAction = 'none';

	/** @param {PointerEvent} e */
	const pressureOf = e => {
		if (typeof e.pressure === 'number' && e.pressure > 0) {
			return e.pressure;
		}
		return e.buttons ? 0.5 : 0;
	};

	/** @param {number} id */
	const capture = id => {
		try {
			container.setPointerCapture?.(id);
		} catch {
			// capture is an optimization; a pointer that lifted mid-call
			// or a test DOM without the API must not break input
		}
	};

	// ---- mouse + pen stroke state -----------------------------------
	/** @type {number | null} */
	let strokePointer = null;
	// pen pointers tracked by id, never a counter: every end path
	// (up, cancel, lost capture) deletes, so a missed decrement cannot
	// leave palm rejection stuck on forever
	/** @type {Set<number>} */
	const penIds = new Set();
	let penGraceUntil = 0;

	const penActive = () =>
		penIds.size > 0 || performance.now() < penGraceUntil;

	/** @param {number} id */
	const penLifted = id => {
		if (penIds.delete(id) && penIds.size === 0) {
			penGraceUntil = performance.now() + PEN_PALM_GRACE_MS;
		}
	};

	// ---- touch state -------------------------------------------------
	/** @type {Set<number>} */
	const touchIds = new Set();
	let touchMods = { ctrlKey: false, altKey: false, pressure: 0 };

	const recognizer = createGestureRecognizer(
		{
			onStrokeStart: pt => {
				const cell = handlers.map(pt.clientX, pt.clientY, false);
				if (!cell) {
					return;
				}
				if (touchMods.altKey && handlers.sample) {
					handlers.sample(cell.x, cell.halfBlockY);
					return;
				}
				dispatch('onTextCanvasDown', {
					x: cell.x,
					y: cell.y,
					halfBlockY: cell.halfBlockY,
					leftMouseButton: false,
					rightMouseButton: touchMods.ctrlKey === true,
					shiftKey: false,
					altKey: touchMods.altKey,
					pressure: touchMods.pressure,
					pointerType: 'touch',
				});
			},
			onStrokeMove: pt => {
				const cell = handlers.map(pt.clientX, pt.clientY, true);
				if (!cell) {
					return;
				}
				dispatch('onTextCanvasDrag', {
					x: cell.x,
					y: cell.y,
					halfBlockY: cell.halfBlockY,
					leftMouseButton: false,
					rightMouseButton: touchMods.ctrlKey === true,
					shiftKey: false,
					altKey: touchMods.altKey,
					pressure: touchMods.pressure,
					pointerType: 'touch',
				});
			},
			onStrokeEnd: () => dispatch('onTextCanvasUp', {}),
			onUndo: () => handlers.undo(),
			onRedo: () => handlers.redo(),
			onPinchStart: centroid => dispatch('onTextCanvasPinchStart', centroid),
			onPinchMove: update => dispatch('onTextCanvasPinchMove', update),
			onPinchEnd: () => dispatch('onTextCanvasPinchEnd', {}),
		},
		options,
	);

	const cancelAllTouch = () => {
		for (const id of touchIds) {
			recognizer.cancel(id);
		}
		touchIds.clear();
	};

	// ---- listeners ----------------------------------------------------
	/** @param {PointerEvent} e */
	const onPointerDown = e => {
		if (e.pointerType === 'touch') {
			if (penActive()) {
				e.preventDefault();
				return; // palm
			}
			// suppress compatibility mouse events for this touch
			e.preventDefault();
			if (touchIds.size === 0) {
				touchMods = {
					ctrlKey: e.ctrlKey === true,
					altKey: e.altKey === true,
					pressure: pressureOf(e),
				};
			}
			touchIds.add(e.pointerId);
			capture(e.pointerId);
			recognizer.down(e.pointerId, e.clientX, e.clientY);
			return;
		}
		if (e.pointerType === 'pen') {
			penIds.add(e.pointerId);
			// the pen wins over a palm that landed first
			cancelAllTouch();
		}
		if (strokePointer !== null) {
			return; // one drawing pointer at a time
		}
		const cell = handlers.map(e.clientX, e.clientY, false);
		if (!cell) {
			return; // degenerate font metrics mid-swap: skip the event
		}
		strokePointer = e.pointerId;
		capture(e.pointerId);
		if (e.altKey && handlers.sample) {
			handlers.sample(cell.x, cell.halfBlockY);
			return;
		}
		dispatch('onTextCanvasDown', {
			x: cell.x,
			y: cell.y,
			halfBlockY: cell.halfBlockY,
			leftMouseButton: e.button === 0 && e.ctrlKey !== true,
			rightMouseButton: e.button === 2 || e.ctrlKey,
			shiftKey: e.shiftKey === true,
			altKey: e.altKey === true,
			pressure: pressureOf(e),
			pointerType: e.pointerType,
		});
	};

	/** @param {PointerEvent} e */
	const onPointerMove = e => {
		if (e.pointerType === 'touch') {
			recognizer.move(e.pointerId, e.clientX, e.clientY);
			return;
		}
		e.preventDefault();
		const stroking = strokePointer === e.pointerId;
		// hover previews clamp during a captured stroke (moves arrive from
		// outside the canvas); free hover keeps raw coords
		const hover = handlers.map(e.clientX, e.clientY, stroking);
		if (!hover) {
			return;
		}
		dispatch('onTextCanvasMove', {
			x: hover.x,
			y: hover.y,
			halfBlockY: hover.halfBlockY,
		});
		if (stroking && (e.buttons & 3) !== 0) {
			// hover was mapped with clamp while stroking; reuse it
			dispatch('onTextCanvasDrag', {
				x: hover.x,
				y: hover.y,
				halfBlockY: hover.halfBlockY,
				leftMouseButton: (e.buttons & 1) !== 0 && e.ctrlKey !== true,
				rightMouseButton: (e.buttons & 2) !== 0 || e.ctrlKey,
				shiftKey: e.shiftKey === true,
				altKey: e.altKey === true,
				pressure: pressureOf(e),
				pointerType: e.pointerType,
			});
		}
	};

	/** @param {PointerEvent} e @param {boolean} cancelled */
	const endPointer = (e, cancelled) => {
		if (e.pointerType === 'touch') {
			if (!touchIds.delete(e.pointerId)) {
				return;
			}
			e.preventDefault();
			if (cancelled) {
				recognizer.cancel(e.pointerId);
			} else {
				recognizer.up(e.pointerId);
			}
			return;
		}
		penLifted(e.pointerId);
		e.preventDefault();
		if (strokePointer === e.pointerId) {
			strokePointer = null;
			dispatch('onTextCanvasUp', {});
		}
	};

	/** @param {PointerEvent} e */
	const onPointerUp = e => endPointer(e, false);
	/** @param {PointerEvent} e */
	const onPointerCancel = e => endPointer(e, true);

	/**
	 * capture loss without a prior up/cancel (rare browser edge): treat
	 * as a cancel for whatever is still tracked
	 * @param {PointerEvent} e
	 */
	const onLostCapture = e => {
		if (e.pointerType === 'touch' && touchIds.has(e.pointerId)) {
			touchIds.delete(e.pointerId);
			recognizer.cancel(e.pointerId);
			return;
		}
		penLifted(e.pointerId);
		if (strokePointer === e.pointerId) {
			strokePointer = null;
			dispatch('onTextCanvasUp', {});
		}
	};

	/** @param {Event} e */
	const onContextMenu = e => e.preventDefault();

	container.addEventListener('pointerdown', onPointerDown);
	container.addEventListener('pointermove', onPointerMove);
	container.addEventListener('pointerup', onPointerUp);
	container.addEventListener('pointercancel', onPointerCancel);
	container.addEventListener('lostpointercapture', onLostCapture);
	container.addEventListener('contextmenu', onContextMenu);

	return {
		dispose: () => {
			container.removeEventListener('pointerdown', onPointerDown);
			container.removeEventListener('pointermove', onPointerMove);
			container.removeEventListener('pointerup', onPointerUp);
			container.removeEventListener('pointercancel', onPointerCancel);
			container.removeEventListener('lostpointercapture', onLostCapture);
			container.removeEventListener('contextmenu', onContextMenu);
			recognizer.reset();
		},
		stats: () => ({
			strokePointer,
			penDown: penIds.size,
			touchCount: touchIds.size,
			gesture: recognizer.stats(),
		}),
	};
};
