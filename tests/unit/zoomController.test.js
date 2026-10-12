/**
 * Zoom controller: one setZoom with focal anchoring behind pinch,
 * ctrl/cmd+wheel, slider, and keyboard steps. GL zooms continuously at
 * rAF cadence; the chunk renderer commits once at gesture end.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
	let scale = 1;
	const state = {
		font: {
			getScaleFactor: () => scale,
			setScaleFactor: vi.fn(next => {
				scale = next;
			}),
			getWidth: () => Math.floor(8 * scale),
			getHeight: () => Math.floor(16 * scale),
		},
		textArtCanvas: { getRendererId: vi.fn(() => 'webgl2-slack-buffer') },
		saveToLocalStorage: vi.fn(),
	};
	return {
		state,
		setScale: v => {
			scale = v;
		},
	};
});

vi.mock('../../src/js/client/state.js', () => ({ default: mocks.state }));

import {
	createZoomController,
	isInteractiveZoom,
	ZOOM_MIN,
	ZOOM_MAX,
} from '../../src/js/client/zoom.js';

/* global WheelEvent -- jsdom provides it; the shared eslint env predates it */

let rafQueue;
let viewport;
let container;

const flushRaf = () => {
	while (rafQueue.length) {
		rafQueue.shift()();
	}
};

const pinch = (name, detail = {}) =>
	document.dispatchEvent(new CustomEvent(name, { detail }));

beforeEach(() => {
	rafQueue = [];
	vi.stubGlobal('requestAnimationFrame', cb => rafQueue.push(cb));
	mocks.setScale(1);
	mocks.state.font.setScaleFactor.mockClear();
	mocks.state.saveToLocalStorage.mockClear();
	mocks.state.textArtCanvas.getRendererId.mockReturnValue('webgl2-slack-buffer');
	viewport = document.createElement('div');
	viewport.id = 'viewport';
	container = document.createElement('div');
	container.id = 'canvasContainer';
	container.getBoundingClientRect = vi.fn(() => ({
		left: 100,
		top: 50,
		width: 640,
		height: 400,
	}));
	document.body.append(viewport, container);
});

afterEach(() => {
	vi.unstubAllGlobals();
	document.body.innerHTML = '';
});

describe('zoom controller', () => {
	it('setZoom clamps to the slider range and saves', () => {
		const zoom = createZoomController(viewport);
		zoom.setZoom(99);
		expect(mocks.state.font.setScaleFactor).toHaveBeenCalledWith(ZOOM_MAX);
		zoom.setZoom(0.01);
		expect(mocks.state.font.setScaleFactor).toHaveBeenCalledWith(ZOOM_MIN);
		expect(mocks.state.saveToLocalStorage).toHaveBeenCalledTimes(2);
	});

	it('zoomIn/zoomOut snap fractional zoom to the 0.5 grid', () => {
		const zoom = createZoomController(viewport);
		mocks.setScale(1.37);
		zoom.zoomIn();
		expect(mocks.state.font.setScaleFactor).toHaveBeenLastCalledWith(1.5);
		mocks.setScale(1.37);
		zoom.zoomOut();
		expect(mocks.state.font.setScaleFactor).toHaveBeenLastCalledWith(1);
		zoom.zoomReset();
		expect(mocks.state.font.setScaleFactor).toHaveBeenLastCalledWith(1);
	});

	it('ctrl/cmd plus, minus, and zero step the zoom from any mode', () => {
		createZoomController(viewport);
		const key = (code, init = {}) =>
			document.dispatchEvent(
				new KeyboardEvent('keydown', {
					code,
					ctrlKey: true,
					cancelable: true,
					...init,
				}),
			);
		key('Equal');
		expect(mocks.state.font.setScaleFactor).toHaveBeenLastCalledWith(1.5);
		mocks.setScale(1.5);
		key('Minus');
		expect(mocks.state.font.setScaleFactor).toHaveBeenLastCalledWith(1);
		mocks.setScale(3);
		mocks.state.font.setScaleFactor.mockClear();
		key('Digit0');
		expect(mocks.state.font.setScaleFactor).not.toHaveBeenCalled();
		// text fields keep their own ctrl combos
		mocks.setScale(2);
		mocks.state.font.setScaleFactor.mockClear();
		const input = document.createElement('input');
		document.body.appendChild(input);
		input.dispatchEvent(
			new KeyboardEvent('keydown', {
				code: 'Equal',
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			}),
		);
		expect(mocks.state.font.setScaleFactor).not.toHaveBeenCalled();
	});

	it('pinch pans the viewport and zooms continuously on GL', () => {
		createZoomController(viewport);
		viewport.scrollLeft = 200;
		viewport.scrollTop = 300;
		pinch('onTextCanvasPinchStart', { clientX: 150, clientY: 150 });
		expect(isInteractiveZoom()).toBe(true);
		pinch('onTextCanvasPinchMove', {
			centroid: { clientX: 160, clientY: 140 },
			centroidDelta: { clientX: 10, clientY: -10 },
			scale: 2,
		});
		expect(viewport.scrollLeft).toBe(190);
		expect(viewport.scrollTop).toBe(310);
		flushRaf();
		expect(mocks.state.font.setScaleFactor).toHaveBeenLastCalledWith(2);
		expect(mocks.state.saveToLocalStorage).not.toHaveBeenCalled();
		pinch('onTextCanvasPinchEnd');
		expect(isInteractiveZoom()).toBe(false);
		expect(mocks.state.saveToLocalStorage).toHaveBeenCalledTimes(1);
	});

	it('pinch on the chunk renderer commits once at the end', () => {
		mocks.state.textArtCanvas.getRendererId.mockReturnValue('canvas2d-chunks');
		createZoomController(viewport);
		pinch('onTextCanvasPinchStart', {});
		pinch('onTextCanvasPinchMove', {
			centroid: { clientX: 100, clientY: 100 },
			centroidDelta: { clientX: 0, clientY: 0 },
			scale: 3,
		});
		flushRaf();
		expect(mocks.state.font.setScaleFactor).not.toHaveBeenCalled();
		pinch('onTextCanvasPinchEnd');
		expect(mocks.state.font.setScaleFactor).toHaveBeenCalledWith(3);
	});

	it('ctrl+wheel zooms at the cursor; plain wheel is untouched', () => {
		createZoomController(viewport);
		viewport.dispatchEvent(
			new WheelEvent('wheel', { deltaY: 53, cancelable: true }),
		);
		flushRaf();
		expect(mocks.state.font.setScaleFactor).not.toHaveBeenCalled();
		const zoomWheel = new WheelEvent('wheel', {
			deltaY: -500,
			ctrlKey: true,
			clientX: 120,
			clientY: 80,
			cancelable: true,
		});
		viewport.dispatchEvent(zoomWheel);
		expect(zoomWheel.defaultPrevented).toBe(true);
		expect(isInteractiveZoom()).toBe(true);
		flushRaf();
		expect(mocks.state.font.setScaleFactor).toHaveBeenCalled();
		const applied = mocks.state.font.setScaleFactor.mock.calls.at(-1)[0];
		expect(applied).toBeGreaterThan(1);
	});

	it('wheel bursts accumulate instead of committing only the last notch', () => {
		vi.useFakeTimers();
		mocks.state.textArtCanvas.getRendererId.mockReturnValue('canvas2d-chunks');
		createZoomController(viewport);
		const tick = () =>
			viewport.dispatchEvent(
				new WheelEvent('wheel', {
					deltaY: -100,
					ctrlKey: true,
					clientX: 100,
					clientY: 100,
					cancelable: true,
				}),
			);
		for (let i = 0; i < 5; i++) {
			tick();
			vi.advanceTimersByTime(20);
		}
		vi.advanceTimersByTime(300);
		const applied = mocks.state.font.setScaleFactor.mock.calls.at(-1)[0];
		// five compounding notches: exp(0.2 * 5) ~ 2.72, not exp(0.2) ~ 1.22
		expect(applied).toBeGreaterThan(2);
		// the idle flush dropped the interactive flag and saved once
		expect(isInteractiveZoom()).toBe(false);
		expect(mocks.state.saveToLocalStorage).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});

	it('pinch end applies the final rAF target before saving', () => {
		createZoomController(viewport);
		pinch('onTextCanvasPinchStart', {});
		pinch('onTextCanvasPinchMove', {
			centroid: { clientX: 100, clientY: 100 },
			centroidDelta: { clientX: 0, clientY: 0 },
			scale: 2.5,
		});
		// rAF has NOT run yet; the end must flush it while interactive
		pinch('onTextCanvasPinchEnd');
		expect(mocks.state.font.setScaleFactor).toHaveBeenCalledWith(2.5);
		expect(isInteractiveZoom()).toBe(false);
		// nothing left in the rAF queue to double-apply
		flushRaf();
		expect(mocks.state.font.setScaleFactor).toHaveBeenCalledTimes(1);
	});

	it('focal anchoring corrects scroll after the canvas relayouts', () => {
		const zoom = createZoomController(viewport);
		viewport.scrollLeft = 0;
		viewport.scrollTop = 0;
		// focal at client (180, 114): 80px/64px into the container at 1x
		zoom.setZoom(2, { clientX: 180, clientY: 114 });
		// container relayouts (same origin in the stub): the anchored
		// point now sits at off*2 from the origin, so scroll shifts by off
		document.dispatchEvent(new CustomEvent('onCanvasLayoutChange', {}));
		expect(viewport.scrollLeft).toBe(80);
		expect(viewport.scrollTop).toBe(64);
		// a second layout event must not double-apply
		document.dispatchEvent(new CustomEvent('onCanvasLayoutChange', {}));
		expect(viewport.scrollLeft).toBe(80);
	});
});
