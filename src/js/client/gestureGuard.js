// @ts-check
/**
 * Global gesture guard. The canvas owns gestures that start on it
 * (pointer.js feeds its own recognizer, and a second finger there
 * must keep cancelling strokes), so this guard owns every touch that
 * starts anywhere else: pinches on the chrome drive the EDITOR zoom
 * through the same onTextCanvasPinch* events zoom.js already
 * consumes, and Safari's own page zoom is suppressed so an off-target
 * pinch or double tap can no longer skew the layout. Ownership is
 * disjoint by start target, so a pinch never fires both paths.
 */
import { createGestureRecognizer } from './gestures.js';

/** @param {HTMLElement} canvasContainer */
const createGestureGuard = canvasContainer => {
	/**
	 * @param {string} name
	 * @param {unknown} detail
	 */
	const dispatch = (name, detail) =>
		document.dispatchEvent(new CustomEvent(name, { detail }));

	// pinch only: strokes, undo and redo stay canvas gestures
	const recognizer = createGestureRecognizer({
		onPinchStart: centroid => dispatch('onTextCanvasPinchStart', centroid),
		onPinchMove: update => dispatch('onTextCanvasPinchMove', update),
		onPinchEnd: () => dispatch('onTextCanvasPinchEnd', {}),
	});

	const tracked = new Set();
	/* global Node -- browser builtin; the shared eslint env predates it */
	/** @param {EventTarget | null} target */
	const outsideCanvas = target =>
		!(target instanceof Node) || !canvasContainer.contains(target);

	document.addEventListener('pointerdown', e => {
		if (e.pointerType !== 'touch' || !outsideCanvas(e.target)) {
			return;
		}
		tracked.add(e.pointerId);
		recognizer.down(e.pointerId, e.clientX, e.clientY);
	});
	document.addEventListener('pointermove', e => {
		if (tracked.has(e.pointerId)) {
			recognizer.move(e.pointerId, e.clientX, e.clientY);
		}
	});
	document.addEventListener('pointerup', e => {
		if (tracked.has(e.pointerId)) {
			tracked.delete(e.pointerId);
			recognizer.up(e.pointerId);
		}
	});
	document.addEventListener('pointercancel', e => {
		if (tracked.has(e.pointerId)) {
			tracked.delete(e.pointerId);
			recognizer.cancel(e.pointerId);
		}
	});

	// Safari reports pinches as gesture events and zooms the page by
	// default; preventDefault leaves the zoom to the recognizer above
	/** @param {Event} e */
	const block = e => e.preventDefault();
	for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
		document.addEventListener(name, block, { passive: false });
	}
};

export { createGestureGuard };
