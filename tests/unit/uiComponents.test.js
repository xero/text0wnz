import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import State from '../../src/js/client/state.js';
import {
	viewportTap,
	createPaintShortcuts,
	createResolutionController,
	createDragDropController,
	createGrid,
	createToolPreview,
} from '../../src/js/client/ui.js';

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		textArtCanvas: {
			undo: vi.fn(),
			redo: vi.fn(),
			getColumns: vi.fn(() => 80),
			getRows: vi.fn(() => 25),
		},
		palette: {
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
			setForegroundColor: vi.fn(),
		},
		font: {
			getWidth: vi.fn(() => 8),
			getHeight: vi.fn(() => 16),
			draw: vi.fn(),
			drawWithAlpha: vi.fn(),
		},
		network: { isConnected: vi.fn(() => false) },
		flyouts: { close: vi.fn() },
	},
}));

describe('UI Components', () => {
	// works in both Node and browser environments
	const createEvent = (type, props = {}) => {
		const event = document.createEvent('Event');
		event.initEvent(type, true, true);
		Object.assign(event, props);
		return event;
	};

	beforeEach(() => {
		document.body.innerHTML = '';
		vi.clearAllMocks();
	});

	afterEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	describe('viewportTap', () => {
		it('quick 2-finger tap outside the canvas undoes (v2 margin gesture)', () => {
			const view = document.createElement('div');
			document.body.appendChild(view);

			viewportTap(view);
			State.textArtCanvas.undo.mockClear();
			State.flyouts.close.mockClear();

			const touchStartEvent = createEvent('touchstart');
			// real Touch objects carry their own target; the margin
			// gesture judges every touch, not just the event target
			touchStartEvent.touches = [
				{ identifier: 1, target: view },
				{ identifier: 2, target: view },
			];
			view.dispatchEvent(touchStartEvent);
			expect(State.flyouts.close).toHaveBeenCalled();

			const touchEndEvent = createEvent('touchend');
			touchEndEvent.changedTouches = [{ identifier: 1 }, { identifier: 2 }];
			view.dispatchEvent(touchEndEvent);
			expect(State.textArtCanvas.undo).toHaveBeenCalledTimes(1);
		});

		it('slow 2-finger lift outside the canvas does not undo', () => {
			vi.useFakeTimers();
			const view = document.createElement('div');
			document.body.appendChild(view);

			viewportTap(view);
			State.textArtCanvas.undo.mockClear();

			const touchStartEvent = createEvent('touchstart');
			// real Touch objects carry their own target; the margin
			// gesture judges every touch, not just the event target
			touchStartEvent.touches = [
				{ identifier: 1, target: view },
				{ identifier: 2, target: view },
			];
			view.dispatchEvent(touchStartEvent);
			vi.advanceTimersByTime(400);
			const touchEndEvent = createEvent('touchend');
			touchEndEvent.changedTouches = [{ identifier: 1 }, { identifier: 2 }];
			view.dispatchEvent(touchEndEvent);
			expect(State.textArtCanvas.undo).not.toHaveBeenCalled();
			vi.useRealTimers();
		});

		it('fires on the LAST lift when fingers leave separately (hardware reality)', () => {
			const view = document.createElement('div');
			document.body.appendChild(view);

			viewportTap(view);
			State.textArtCanvas.undo.mockClear();

			const touchStartEvent = createEvent('touchstart');
			// real Touch objects carry their own target; the margin
			// gesture judges every touch, not just the event target
			touchStartEvent.touches = [
				{ identifier: 1, target: view },
				{ identifier: 2, target: view },
			];
			view.dispatchEvent(touchStartEvent);

			// finger 1 lifts first; finger 2 is still down
			const firstLift = createEvent('touchend');
			firstLift.changedTouches = [{ identifier: 1 }];
			firstLift.touches = [{ identifier: 2 }];
			view.dispatchEvent(firstLift);
			expect(State.textArtCanvas.undo).not.toHaveBeenCalled();

			// finger 2 lifts: NOW it is a tap
			const lastLift = createEvent('touchend');
			lastLift.changedTouches = [{ identifier: 2 }];
			lastLift.touches = [];
			view.dispatchEvent(lastLift);
			expect(State.textArtCanvas.undo).toHaveBeenCalledTimes(1);

			// and it fires exactly once (no double-undo on stray events)
			const stray = createEvent('touchend');
			stray.changedTouches = [];
			stray.touches = [];
			view.dispatchEvent(stray);
			expect(State.textArtCanvas.undo).toHaveBeenCalledTimes(1);
		});

		it('taps ON the canvas never undo here (the recognizer owns them)', () => {
			const view = document.createElement('div');
			const canvas = document.createElement('div');
			canvas.id = 'canvasContainer';
			view.appendChild(canvas);
			document.body.appendChild(view);

			viewportTap(view);
			State.textArtCanvas.undo.mockClear();

			const touchStartEvent = createEvent('touchstart');
			// real Touch objects carry their own target; the margin
			// gesture judges every touch, not just the event target
			touchStartEvent.touches = [
				{ identifier: 1, target: canvas },
				{ identifier: 2, target: canvas },
			];
			canvas.dispatchEvent(touchStartEvent);
			const touchEndEvent = createEvent('touchend');
			touchEndEvent.changedTouches = [{ identifier: 1 }, { identifier: 2 }];
			canvas.dispatchEvent(touchEndEvent);
			expect(State.textArtCanvas.undo).not.toHaveBeenCalled();
			canvas.remove();
		});
	});

	describe('createPaintShortcuts', () => {
		it('should create paint shortcuts controller', () => {
			const keyPair = {
				d: document.createElement('button'),
				q: document.createElement('button'),
			};

			const controller = createPaintShortcuts(keyPair);

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
			expect(controller).toHaveProperty('ignore');
			expect(controller).toHaveProperty('unignore');
		});

		it('should handle number key shortcuts for colors', () => {
			const keyPair = {};

			createPaintShortcuts(keyPair);

			State.palette.setForegroundColor.mockClear();

			const keyEvent = new KeyboardEvent('keydown', {
				key: '3',
				code: 'Digit3',
				ctrlKey: false,
				altKey: false,
				shiftKey: false,
				metaKey: false,
			});

			document.dispatchEvent(keyEvent);

			expect(State.palette.setForegroundColor).toHaveBeenCalled();
		});

		it('should ignore shortcuts when ignore is called', () => {
			const keyPair = { d: document.createElement('button') };
			keyPair.d.click = vi.fn();

			const controller = createPaintShortcuts(keyPair);

			controller.ignore();

			const keyEvent = new KeyboardEvent('keydown', {
				key: 'd',
				code: 'KeyD',
				ctrlKey: false,
				altKey: false,
				shiftKey: false,
				metaKey: false,
			});

			document.dispatchEvent(keyEvent);

			expect(keyPair.d.click).not.toHaveBeenCalled();
		});

		it('should enable shortcuts with unignore', () => {
			const keyPair = { d: document.createElement('button') };
			keyPair.d.click = vi.fn();
			keyPair.d.classList.add('test');

			const controller = createPaintShortcuts(keyPair);

			controller.ignore();
			controller.unignore();

			const keyEvent = new KeyboardEvent('keydown', {
				key: 'd',
				code: 'KeyD',
				ctrlKey: false,
				altKey: false,
				shiftKey: false,
				metaKey: false,
			});

			document.dispatchEvent(keyEvent);

			expect(keyPair.d.click).toHaveBeenCalled();
		});
	});

	// E2E covers createGrid and createToolPreview rendering output; these
	// only pin lazy allocation

	describe('createGrid', () => {
		it('should defer grid canvas creation until toggled on', () => {
			const el = document.createElement('div');
			document.body.appendChild(el);

			const grid = createGrid(el);

			expect(el.querySelectorAll('canvas').length).toBe(0);
			expect(grid.isShown()).toBe(false);

			grid.show(true);
			expect(grid.isShown()).toBe(true);
			expect(el.querySelectorAll('canvas').length).toBeGreaterThan(0);

			grid.show(false);
			expect(grid.isShown()).toBe(false);
			expect(el.querySelectorAll('canvas').length).toBe(0);
		});
	});

	describe('createToolPreview', () => {
		it('should create preview canvases lazily per 25-row chunk', () => {
			State.textArtCanvas.getRows.mockReturnValue(100);
			const el = document.createElement('div');
			document.body.appendChild(el);

			const preview = createToolPreview(el);

			expect(el.querySelectorAll('canvas').length).toBe(0);

			// Half-block y 150 is text row 75, chunk 3
			preview.drawHalfBlock(7, 0, 150);
			expect(el.querySelectorAll('canvas').length).toBe(1);

			// Half-block y 0 is text row 0, chunk 0
			preview.drawHalfBlock(7, 0, 0);
			expect(el.querySelectorAll('canvas').length).toBe(2);

			expect(State.font.drawWithAlpha).toHaveBeenCalledTimes(2);
			expect(() => preview.clear()).not.toThrow();
		});
	});

	describe('createResolutionController', () => {
		it('should update resolution display on canvas size change', () => {
			const lbl = document.createElement('span');
			const txtC = document.createElement('input');
			const txtR = document.createElement('input');
			document.body.appendChild(lbl);

			createResolutionController(lbl, txtC, txtR);

			const event = createEvent('onTextCanvasSizeChange');
			document.dispatchEvent(event);

			expect(lbl.innerText).toContain('x');
		});
	});

	describe('createDragDropController', () => {
		it('should handle file drag and drop', () => {
			const handler = vi.fn();
			const el = document.createElement('div');
			document.body.appendChild(el);

			createDragDropController(handler, el);

			const dragEnterEvent = createEvent('dragenter');
			dragEnterEvent.preventDefault = vi.fn();
			document.dispatchEvent(dragEnterEvent);

			expect(el.style.display).toBe('flex');

			const dropEvent = createEvent('drop');
			dropEvent.preventDefault = vi.fn();
			dropEvent.dataTransfer = { files: [{ name: 'test.ans' }]};
			document.dispatchEvent(dropEvent);

			expect(handler).toHaveBeenCalledWith({ name: 'test.ans' });
			expect(el.style.display).toBe('none');
		});

		it('should handle drag leave', () => {
			const handler = vi.fn();
			const el = document.createElement('div');
			document.body.appendChild(el);

			createDragDropController(handler, el);

			const dragEnterEvent = createEvent('dragenter');
			dragEnterEvent.preventDefault = vi.fn();
			document.dispatchEvent(dragEnterEvent);

			const dragLeaveEvent = createEvent('dragleave');
			dragLeaveEvent.preventDefault = vi.fn();
			document.dispatchEvent(dragLeaveEvent);

			expect(el.style.display).toBe('none');
		});
	});
});
