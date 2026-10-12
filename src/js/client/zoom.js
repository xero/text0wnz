// @ts-check
/**
 * Zoom controller: every zoom input lands on one
 * setZoom with an optional focal point, and the renderer's own zoom
 * (the scaled font metrics everything reads) stays the single source
 * of truth via State.font.setScaleFactor.
 *
 * Inputs wired here:
 * - pinch: the normalizer's onTextCanvasPinch* document events. The
 *   centroid pans the viewport (which also gives touch users 2-finger
 *   scrolling back, since touch-action: none took the native scroller
 *   away on the canvas) and the spread zooms at the centroid. On the
 *   GL renderer zoom applies continuously at rAF cadence; the legacy
 *   chunk renderer repaints too slowly for that, so it pans live and
 *   commits the zoom once at pinch end.
 * - ctrl/cmd + wheel: trackpad pinch and mouse-wheel zoom at the
 *   cursor, continuous on GL, debounced commit on the chunk renderer.
 * - the slider and ctrl/cmd +=/- route through zoomIn/zoomOut
 *   (ui.js keeps its direct fallback when no controller exists, which
 *   is also what its unit tests exercise).
 *
 * Focal anchoring: scaled cell sizes are floor-quantized, so the
 * ratio uses the REAL before/after metrics, and the scroll correction
 * applies after the canvas relayouts (onCanvasLayoutChange from
 * canvas.js) by re-reading the fresh bounding rect: scrolling by the
 * difference between where the anchored point landed and where the
 * focal point was puts it back under the pointer exactly.
 *
 * During interactive zoom (pinch or a wheel burst) isInteractiveZoom()
 * is true and canvas.js skips the "updating settings" modal; the state
 * save happens once at gesture end.
 */

import State from './state.js';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.5;
export const WHEEL_ZOOM_SENSITIVITY = 0.002;
export const WHEEL_IDLE_MS = 250;
export const CHUNK_WHEEL_COMMIT_MS = 150;
export const FOCAL_PENDING_TIMEOUT_MS = 1000;

/** @type {{isInteractive: () => boolean, dispose: () => void} | null} */
let singleton = null;

export const getZoomController = () => singleton;
export const isInteractiveZoom = () =>
	singleton !== null && singleton.isInteractive();

/** @param {number} z */
const clampZoom = z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/**
 * @param {HTMLElement} viewport the scrolling element (#viewport)
 */
export const createZoomController = viewport => {
	// one controller per app: a replacement detaches its predecessor's
	// document and viewport listeners
	singleton?.dispose();
	const aborter = new AbortController();
	const signal = aborter.signal;
	let interactive = false;
	let wheelIdleTimer = 0;
	let chunkCommitTimer = 0;
	/** @type {{clientX: number, clientY: number, offX: number, offY: number, ratioX: number, ratioY: number} | null} */
	let pendingAnchor = null;
	let pendingAnchorAt = 0;
	/** @type {number | null} */
	let rafHandle = null;
	/** @type {{scale: number, focal: {clientX: number, clientY: number} | null} | null} */
	let rafTarget = null;
	let pinchStartZoom = 1;
	let pendingPinchScale = 0;
	/** @type {{clientX: number, clientY: number} | null} */
	let lastCentroid = null;

	const canvasContainer = () => document.getElementById('canvasContainer');

	// canvas.js reports 'webgl2-slack-buffer' or 'canvas2d-chunks';
	// match on the family, never an exact id
	const glRenderer = () => {
		const id = /** @type {any} */ (State).textArtCanvas?.getRendererId?.();
		return typeof id === 'string' && id.startsWith('webgl');
	};

	const getZoom = () => State.font?.getScaleFactor?.() ?? 1;

	const save = () => {
		if (State.saveToLocalStorage) {
			State.saveToLocalStorage();
		}
	};

	/**
	 * @param {number} scale
	 * @param {{clientX: number, clientY: number} | null} focal
	 */
	const applyZoom = (scale, focal) => {
		const container = canvasContainer();
		const next = clampZoom(scale);
		const font = State.font;
		if (!font || !font.setScaleFactor || next === getZoom()) {
			return false;
		}
		if (focal && container) {
			const rect = container.getBoundingClientRect();
			const oldW = font.getWidth();
			const oldH = font.getHeight();
			font.setScaleFactor(next);
			pendingAnchor = {
				clientX: focal.clientX,
				clientY: focal.clientY,
				offX: focal.clientX - rect.left,
				offY: focal.clientY - rect.top,
				ratioX: font.getWidth() / oldW,
				ratioY: font.getHeight() / oldH,
			};
			pendingAnchorAt = performance.now();
		} else {
			font.setScaleFactor(next);
		}
		return true;
	};

	// scroll correction once the canvas relayouts at the new scale
	document.addEventListener(
		'onCanvasLayoutChange',
		() => {
			if (!pendingAnchor) {
				return;
			}
			if (performance.now() - pendingAnchorAt > FOCAL_PENDING_TIMEOUT_MS) {
				pendingAnchor = null;
				return;
			}
			const container = canvasContainer();
			if (!container) {
				pendingAnchor = null;
				return;
			}
			const a = pendingAnchor;
			pendingAnchor = null;
			const rect = container.getBoundingClientRect();
			viewport.scrollLeft += rect.left + a.offX * a.ratioX - a.clientX;
			viewport.scrollTop += rect.top + a.offY * a.ratioY - a.clientY;
		},
		{ signal },
	);

	/**
	 * rAF-throttled apply for continuous (GL) zoom
	 * @param {number} scale
	 * @param {{clientX: number, clientY: number} | null} focal
	 */
	const scheduleApply = (scale, focal) => {
		rafTarget = { scale, focal };
		if (rafHandle !== null) {
			return;
		}
		rafHandle = requestAnimationFrame(() => {
			rafHandle = null;
			if (rafTarget) {
				applyZoom(rafTarget.scale, rafTarget.focal);
				rafTarget = null;
			}
		});
	};

	// a gesture ends with its LAST scheduled zoom applied while still
	// interactive, or the pending rAF fires after interactive drops and
	// flashes the settings modal with a stale zoom already saved
	const flushScheduled = () => {
		if (rafHandle !== null) {
			cancelAnimationFrame(rafHandle);
			rafHandle = null;
		}
		if (rafTarget) {
			applyZoom(rafTarget.scale, rafTarget.focal);
			rafTarget = null;
		}
	};

	/**
	 * @param {number} scale
	 * @param {{clientX: number, clientY: number}} [focal]
	 */
	const setZoom = (scale, focal) => {
		const changed = applyZoom(scale, focal ?? null);
		if (changed && !interactive) {
			save();
		}
		return changed;
	};

	const viewportCenter = () => {
		const rect = viewport.getBoundingClientRect();
		return {
			clientX: rect.left + rect.width / 2,
			clientY: rect.top + rect.height / 2,
		};
	};

	// stepped zoom snaps to the 0.5 grid the slider and shortcuts use
	const zoomIn = () =>
		setZoom(Math.floor(getZoom() * 2) / 2 + ZOOM_STEP, viewportCenter());
	const zoomOut = () =>
		setZoom(Math.ceil(getZoom() * 2) / 2 - ZOOM_STEP, viewportCenter());
	const zoomReset = () => setZoom(1, viewportCenter());

	// ---- pinch ---------------------------------------------------------
	document.addEventListener(
		'onTextCanvasPinchStart',
		() => {
			interactive = true;
			pinchStartZoom = getZoom();
			pendingPinchScale = 0;
			lastCentroid = null;
		},
		{ signal },
	);

	document.addEventListener(
		'onTextCanvasPinchMove',
		e => {
			const detail = /** @type {CustomEvent} */ (e).detail;
			if (!detail || !detail.centroid) {
				return;
			}
			lastCentroid = detail.centroid;
			viewport.scrollLeft -= detail.centroidDelta?.clientX ?? 0;
			viewport.scrollTop -= detail.centroidDelta?.clientY ?? 0;
			const target = clampZoom(pinchStartZoom * (detail.scale || 1));
			if (glRenderer()) {
				scheduleApply(target, detail.centroid);
			} else {
				pendingPinchScale = target;
			}
		},
		{ signal },
	);

	document.addEventListener(
		'onTextCanvasPinchEnd',
		() => {
			// commit while still interactive so the final relayout skips
			// the settings modal, THEN drop the flag and save the result
			flushScheduled();
			if (!glRenderer() && pendingPinchScale > 0) {
				applyZoom(pendingPinchScale, lastCentroid);
				pendingPinchScale = 0;
			}
			interactive = false;
			save();
		},
		{ signal },
	);

	// ---- ctrl/cmd + wheel (trackpad pinch arrives this way) ------------
	let wheelTarget = 0; // 0 = no burst in flight

	viewport.addEventListener(
		'wheel',
		e => {
			if (!e.ctrlKey && !e.metaKey) {
				return;
			}
			e.preventDefault();
			interactive = true;
			const focal = { clientX: e.clientX, clientY: e.clientY };
			// accumulate across the burst: each tick multiplies the PENDING
			// target, never the lagging applied zoom (a 10-notch burst must
			// compound, not commit only its last notch)
			const base = wheelTarget > 0 ? wheelTarget : getZoom();
			wheelTarget = clampZoom(
				base * Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY),
			);
			clearTimeout(wheelIdleTimer);
			wheelIdleTimer = /** @type {number} */ (
				/** @type {unknown} */ (
					setTimeout(() => {
						// final value lands while still interactive (no modal),
						// then the flag drops and the result saves
						flushScheduled();
						if (wheelTarget > 0) {
							clearTimeout(chunkCommitTimer);
							applyZoom(wheelTarget, focal);
							wheelTarget = 0;
						}
						interactive = false;
						save();
					}, WHEEL_IDLE_MS)
				)
			);
			if (glRenderer()) {
				scheduleApply(wheelTarget, focal);
			} else {
				clearTimeout(chunkCommitTimer);
				chunkCommitTimer = /** @type {number} */ (
					/** @type {unknown} */ (
						setTimeout(() => {
							applyZoom(wheelTarget, focal);
						}, CHUNK_WHEEL_COMMIT_MS)
					)
				);
			}
		},
		{ passive: false, signal },
	);

	const controller = {
		setZoom,
		zoomIn,
		zoomOut,
		zoomReset,
		getZoom,
		isInteractive: () => interactive,
		dispose: () => {
			aborter.abort();
			clearTimeout(wheelIdleTimer);
			clearTimeout(chunkCommitTimer);
			if (rafHandle !== null) {
				cancelAnimationFrame(rafHandle);
				rafHandle = null;
			}
			rafTarget = null;
			interactive = false;
			if (singleton === controller) {
				singleton = null;
			}
		},
	};
	singleton = controller;
	return controller;
};
