import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import State from '../../src/js/client/state.js';
import {
	viewportTap,
	createPaintShortcuts,
	createResolutionController,
	createDragDropController,
	createMenuController,
} from '../../src/js/client/ui.js';

// Mock the State module
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
		menus: { close: vi.fn() },
	},
}));

describe('UI Components', () => {
	// Helper to create events that work in both Node and browser environments
	const createEvent = (type, props = {}) => {
		const event = document.createEvent('Event');
		event.initEvent(type, true, true);
		Object.assign(event, props);
		return event;
	};

	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Reset all mocks
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Clean up any remaining DOM elements
		document.body.innerHTML = '';
		// Restore all mocks to prevent memory leaks
		vi.restoreAllMocks();
	});

	describe('viewportTap', () => {
		it('should handle two-finger tap for undo', () => {
			vi.useFakeTimers();
			const view = document.createElement('div');
			document.body.appendChild(view);

			viewportTap(view);

			// Simulate two-finger touch start
			const touchStartEvent = createEvent('touchstart');
			touchStartEvent.touches = [{ identifier: 1 }, { identifier: 2 }];
			view.dispatchEvent(touchStartEvent);

			vi.advanceTimersByTime(100);

			// Simulate two-finger touch end
			const touchEndEvent = createEvent('touchend');
			touchEndEvent.changedTouches = [{ identifier: 1 }, { identifier: 2 }];
			view.dispatchEvent(touchEndEvent);

			expect(State.textArtCanvas.undo).toHaveBeenCalled();

			vi.useRealTimers();
		});

		it('should not undo if tap duration is too long', () => {
			vi.useFakeTimers();
			const view = document.createElement('div');
			document.body.appendChild(view);

			viewportTap(view);

			State.textArtCanvas.undo.mockClear();

			// Simulate two-finger touch start
			const touchStartEvent = createEvent('touchstart');
			touchStartEvent.touches = [{ identifier: 1 }, { identifier: 2 }];
			view.dispatchEvent(touchStartEvent);

			// Wait too long
			vi.advanceTimersByTime(400);

			// Simulate two-finger touch end
			const touchEndEvent = createEvent('touchend');
			touchEndEvent.changedTouches = [{ identifier: 1 }, { identifier: 2 }];
			view.dispatchEvent(touchEndEvent);

			expect(State.textArtCanvas.undo).not.toHaveBeenCalled();

			vi.useRealTimers();
		});

		it('should handle touch cancel', () => {
			const view = document.createElement('div');
			document.body.appendChild(view);

			viewportTap(view);

			// Simulate touch cancel
			const touchCancelEvent = createEvent('touchcancel');
			expect(() => view.dispatchEvent(touchCancelEvent)).not.toThrow();
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

			// Clear the mock to ensure we track only this call
			State.palette.setForegroundColor.mockClear();

			// Simulate pressing '3' key
			const keyEvent = new KeyboardEvent('keydown', {
				key: '3',
				code: 'Digit3',
				ctrlKey: false,
				altKey: false,
				shiftKey: false,
				metaKey: false,
			});

			document.dispatchEvent(keyEvent);

			// Color should be set
			expect(State.palette.setForegroundColor).toHaveBeenCalled();
		});

		it('should ignore shortcuts when ignore is called', () => {
			const keyPair = { d: document.createElement('button') };
			keyPair.d.click = vi.fn();

			const controller = createPaintShortcuts(keyPair);

			controller.ignore();

			// Try to trigger shortcut
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

			// Now shortcut should work
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

	// Note: createGrid and createToolPreview are complex rendering functions
	// that require full canvas context and State initialization. They are tested via E2E tests.

	describe('createResolutionController', () => {
		it('should update resolution display on canvas size change', () => {
			const lbl = document.createElement('span');
			const txtC = document.createElement('input');
			const txtR = document.createElement('input');
			document.body.appendChild(lbl);

			createResolutionController(lbl, txtC, txtR);

			// Trigger canvas size change event
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

			// Simulate drag enter
			const dragEnterEvent = createEvent('dragenter');
			dragEnterEvent.preventDefault = vi.fn();
			document.dispatchEvent(dragEnterEvent);

			expect(el.style.display).toBe('flex');

			// Simulate drop
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

			// Simulate drag enter
			const dragEnterEvent = createEvent('dragenter');
			dragEnterEvent.preventDefault = vi.fn();
			document.dispatchEvent(dragEnterEvent);

			// Simulate drag leave
			const dragLeaveEvent = createEvent('dragleave');
			dragLeaveEvent.preventDefault = vi.fn();
			document.dispatchEvent(dragLeaveEvent);

			expect(el.style.display).toBe('none');
		});
	});

	describe('createMenuController', () => {
		it('should create menu controller with close method', () => {
			const menu1 = document.createElement('div');
			const menu2 = document.createElement('div');
			const view = document.createElement('div');
			view.focus = vi.fn();

			const controller = createMenuController([menu1, menu2], view);

			expect(controller).toHaveProperty('close');
		});

		it('should toggle menu open state on click', () => {
			vi.useFakeTimers();

			const menu = document.createElement('div');
			const view = document.createElement('div');
			view.focus = vi.fn();
			menu.focus = vi.fn();
			document.body.appendChild(menu);

			createMenuController([menu], view);

			// Click to open
			const clickEvent = createEvent('click');
			clickEvent.stopPropagation = vi.fn();
			clickEvent.preventDefault = vi.fn();
			menu.dispatchEvent(clickEvent);

			expect(menu.classList.contains('menuOpen')).toBe(true);

			vi.useRealTimers();
		});

		it('should close all menus when close is called', () => {
			vi.useFakeTimers();

			const menu1 = document.createElement('div');
			const menu2 = document.createElement('div');
			menu1.classList.add('menuOpen');
			menu2.classList.add('menuOpen');
			const view = document.createElement('div');
			view.focus = vi.fn();

			const controller = createMenuController([menu1, menu2], view);

			controller.close();

			expect(menu1.classList.contains('menuOpen')).toBe(false);
			expect(menu2.classList.contains('menuOpen')).toBe(false);

			vi.useRealTimers();
		});
	});
});
