import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import State from '../../src/js/client/state.js';
import {
	$,
	$$,
	createCanvas,
	createSettingToggle,
	onClick,
	onReturn,
	onFileChange,
	createPositionInfo,
	createModalController,
	undoAndRedo,
	createGenericController,
	createToggleButton,
	enforceMaxBytes,
	websocketUI,
	toggleFullscreen,
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

describe('UI Utilities', () => {
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

	describe('createToggleButton', () => {
		it('should create toggle button with two states', () => {
			const stateOneClick = vi.fn();
			const stateTwoClick = vi.fn();

			const toggle = createToggleButton(
				'State One',
				'State Two',
				stateOneClick,
				stateTwoClick,
			);

			expect(toggle).toHaveProperty('getElement');
			expect(toggle).toHaveProperty('setStateOne');
			expect(toggle).toHaveProperty('setStateTwo');

			const element = toggle.getElement();
			expect(element.classList.contains('toggle-button-container')).toBe(true);
		});

		it('should trigger state one click when state one is clicked', () => {
			const stateOneClick = vi.fn();
			const stateTwoClick = vi.fn();

			const toggle = createToggleButton(
				'State One',
				'State Two',
				stateOneClick,
				stateTwoClick,
			);
			const element = toggle.getElement();
			const stateOneDiv = element.querySelector('.left');

			stateOneDiv.click();

			expect(stateOneClick).toHaveBeenCalled();
		});

		it('should trigger state two click when state two is clicked', () => {
			const stateOneClick = vi.fn();
			const stateTwoClick = vi.fn();

			const toggle = createToggleButton(
				'State One',
				'State Two',
				stateOneClick,
				stateTwoClick,
			);
			const element = toggle.getElement();
			const stateTwoDiv = element.querySelector('.right');

			stateTwoDiv.click();

			expect(stateTwoClick).toHaveBeenCalled();
		});

		it('should set visual state correctly', () => {
			const toggle = createToggleButton(
				'State One',
				'State Two',
				vi.fn(),
				vi.fn(),
			);
			const element = toggle.getElement();
			const stateOneDiv = element.querySelector('.left');
			const stateTwoDiv = element.querySelector('.right');

			toggle.setStateOne();
			expect(stateOneDiv.classList.contains('enabled')).toBe(true);
			expect(stateTwoDiv.classList.contains('enabled')).toBe(false);

			toggle.setStateTwo();
			expect(stateOneDiv.classList.contains('enabled')).toBe(false);
			expect(stateTwoDiv.classList.contains('enabled')).toBe(true);
		});
	});

	describe('createGenericController', () => {
		it('should create controller with enable and disable methods', () => {
			const panel = document.createElement('div');
			const nav = document.createElement('div');

			const controller = createGenericController(panel, nav);

			expect(controller).toHaveProperty('enable');
			expect(controller).toHaveProperty('disable');
		});

		it('should show panel and add enabled-parent class on enable', () => {
			const panel = document.createElement('div');
			const nav = document.createElement('div');

			const controller = createGenericController(panel, nav);
			controller.enable();

			expect(panel.style.display).toBe('flex');
			expect(nav.classList.contains('enabled-parent')).toBe(true);
		});

		it('should hide panel and remove enabled-parent class on disable', () => {
			const panel = document.createElement('div');
			const nav = document.createElement('div');
			nav.classList.add('enabled-parent');

			const controller = createGenericController(panel, nav);
			controller.disable();

			expect(panel.style.display).toBe('none');
			expect(nav.classList.contains('enabled-parent')).toBe(false);
		});
	});

	describe('enforceMaxBytes', () => {
		it('should truncate comments when they exceed max bytes', () => {
			const sauceComments = document.createElement('textarea');
			sauceComments.id = 'sauce-comments';
			sauceComments.value = 'x'.repeat(20000); // Way over the limit

			const sauceBytes = document.createElement('input');
			sauceBytes.id = 'sauce-bytes';

			document.body.appendChild(sauceComments);
			document.body.appendChild(sauceBytes);

			enforceMaxBytes();

			expect(sauceComments.value.length).toBeLessThanOrEqual(16320);
			expect(sauceBytes.value).toMatch(/\d+\/16320 bytes/);
		});

		it('should not modify comments when under max bytes', () => {
			const originalValue = 'Short comment';
			const sauceComments = document.createElement('textarea');
			sauceComments.id = 'sauce-comments';
			sauceComments.value = originalValue;

			const sauceBytes = document.createElement('input');
			sauceBytes.id = 'sauce-bytes';

			document.body.appendChild(sauceComments);
			document.body.appendChild(sauceBytes);

			enforceMaxBytes();

			expect(sauceComments.value).toBe(originalValue);
		});
	});

	describe('websocketUI', () => {
		it('should show websocket elements when show is true', () => {
			const excludedEl = document.createElement('div');
			excludedEl.classList.add('excluded-for-websocket');
			const includedEl = document.createElement('div');
			includedEl.classList.add('included-for-websocket');

			document.body.appendChild(excludedEl);
			document.body.appendChild(includedEl);

			websocketUI(true);

			expect(excludedEl.style.display).toBe('none');
			expect(includedEl.style.display).toBe('block');
		});

		it('should hide websocket elements when show is false', () => {
			const excludedEl = document.createElement('div');
			excludedEl.classList.add('excluded-for-websocket');
			const includedEl = document.createElement('div');
			includedEl.classList.add('included-for-websocket');

			document.body.appendChild(excludedEl);
			document.body.appendChild(includedEl);

			websocketUI(false);

			expect(excludedEl.style.display).toBe('block');
			expect(includedEl.style.display).toBe('none');
		});
	});

	describe('toggleFullscreen', () => {
		it('should request fullscreen when not in fullscreen', () => {
			// Mock fullscreen API
			document.fullscreenEnabled = true;
			document.fullscreenElement = null;
			document.documentElement.requestFullscreen = vi.fn();

			toggleFullscreen();

			expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
		});

		it('should exit fullscreen when in fullscreen', () => {
			// Mock fullscreen API
			document.fullscreenEnabled = true;
			document.fullscreenElement = document.documentElement;
			document.exitFullscreen = vi.fn();

			toggleFullscreen();

			expect(document.exitFullscreen).toHaveBeenCalled();
		});
	});

	describe('createModalController', () => {
		it('should create modal controller with required methods', () => {
			const modal = document.createElement('dialog');
			modal.showModal = vi.fn();
			modal.close = vi.fn();

			// Create modal sections
			[
				'about',
				'resize',
				'fonts',
				'sauce',
				'websocket',
				'choice',
				'update',
				'loading',
				'warning',
			].forEach(name => {
				const section = document.createElement('div');
				section.id = `${name}-modal`;
				section.classList.add('hide');
				document.body.appendChild(section);
			});

			const modalError = document.createElement('div');
			modalError.id = 'modalError';
			document.body.appendChild(modalError);

			const controller = createModalController(modal);

			expect(controller).toHaveProperty('isOpen');
			expect(controller).toHaveProperty('open');
			expect(controller).toHaveProperty('close');
			expect(controller).toHaveProperty('error');
			expect(controller).toHaveProperty('focusEvents');
		});

		it('should open specified modal', () => {
			const modal = document.createElement('dialog');
			modal.showModal = vi.fn();
			modal.close = vi.fn();

			const aboutModal = document.createElement('div');
			aboutModal.id = 'about-modal';
			aboutModal.classList.add('hide');
			document.body.appendChild(aboutModal);

			// Create other modals
			[
				'resize',
				'fonts',
				'sauce',
				'websocket',
				'choice',
				'update',
				'loading',
				'warning',
			].forEach(name => {
				const section = document.createElement('div');
				section.id = `${name}-modal`;
				section.classList.add('hide');
				document.body.appendChild(section);
			});

			const modalError = document.createElement('div');
			modalError.id = 'modalError';
			document.body.appendChild(modalError);

			const controller = createModalController(modal);
			controller.open('about');

			expect(aboutModal.classList.contains('hide')).toBe(false);
			expect(modal.showModal).toHaveBeenCalled();
		});

		it('should close modal after timeout', () => {
			vi.useFakeTimers();

			const modal = document.createElement('dialog');
			modal.showModal = vi.fn();
			modal.close = vi.fn();
			modal.open = false;

			[
				'about',
				'resize',
				'fonts',
				'sauce',
				'websocket',
				'choice',
				'update',
				'loading',
				'warning',
			].forEach(name => {
				const section = document.createElement('div');
				section.id = `${name}-modal`;
				section.classList.add('hide');
				document.body.appendChild(section);
			});

			const modalError = document.createElement('div');
			modalError.id = 'modalError';
			document.body.appendChild(modalError);

			const controller = createModalController(modal);

			// Open a modal first
			const aboutModal = document.createElement('div');
			aboutModal.id = 'about-modal';
			aboutModal.classList.add('hide');
			document.body.appendChild(aboutModal);

			controller.open('about');
			controller.close();

			vi.advanceTimersByTime(800);

			expect(modal.close).toHaveBeenCalled();

			vi.useRealTimers();
		});

		it('should handle error messages', () => {
			const modal = document.createElement('dialog');
			modal.showModal = vi.fn();
			modal.close = vi.fn();

			[
				'about',
				'resize',
				'fonts',
				'sauce',
				'websocket',
				'choice',
				'update',
				'loading',
				'warning',
			].forEach(name => {
				const section = document.createElement('div');
				section.id = `${name}-modal`;
				section.classList.add('hide');
				document.body.appendChild(section);
			});

			const modalError = document.createElement('div');
			modalError.id = 'modalError';
			document.body.appendChild(modalError);

			const errorModal = document.createElement('div');
			errorModal.id = 'error-modal';
			errorModal.classList.add('hide');
			document.body.appendChild(errorModal);

			const controller = createModalController(modal);
			controller.error('Test error message');

			expect(modalError.innerHTML).toBe('Test error message');
		});

		it('should handle focus events', () => {
			const modal = document.createElement('dialog');
			modal.showModal = vi.fn();
			modal.close = vi.fn();

			[
				'about',
				'resize',
				'fonts',
				'sauce',
				'websocket',
				'choice',
				'update',
				'loading',
				'warning',
			].forEach(name => {
				const section = document.createElement('div');
				section.id = `${name}-modal`;
				section.classList.add('hide');
				document.body.appendChild(section);
			});

			const modalError = document.createElement('div');
			modalError.id = 'modalError';
			document.body.appendChild(modalError);

			const onFocus = vi.fn();
			const onBlur = vi.fn();

			const controller = createModalController(modal);
			controller.focusEvents(onFocus, onBlur);

			// Open modal should trigger focus
			const aboutModal = document.createElement('div');
			aboutModal.id = 'about-modal';
			aboutModal.classList.add('hide');
			document.body.appendChild(aboutModal);

			controller.open('about');
			expect(onFocus).toHaveBeenCalled();
		});
	});

});
