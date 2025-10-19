import { describe, it, expect, beforeEach, vi } from 'vitest';
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

	describe('DOM Utilities', () => {
		it('should provide $ function for getting elements by ID', () => {
			const div = document.createElement('div');
			div.id = 'test-element';
			document.body.appendChild(div);

			const result = $('test-element');
			expect(result).toBe(div);
		});

		it('should provide $$ function for query selector', () => {
			const div = document.createElement('div');
			div.className = 'test-class';
			document.body.appendChild(div);

			const result = $$('.test-class');
			expect(result).toBe(div);
		});

		it('should create canvas with specified dimensions', () => {
			const canvas = createCanvas(100, 200);
			expect(canvas.tagName).toBe('CANVAS');
			expect(canvas.width).toBe(100);
			expect(canvas.height).toBe(200);
		});
	});

	describe('createSettingToggle', () => {
		it('should create a toggle with getter and setter', () => {
			const mockDiv = document.createElement('div');
			let testValue = false;
			const getter = vi.fn(() => testValue);
			const setter = vi.fn(value => {
				testValue = value;
			});

			const toggle = createSettingToggle(mockDiv, getter, setter);

			expect(toggle).toHaveProperty('sync');
			expect(toggle).toHaveProperty('update');
			expect(getter).toHaveBeenCalled();
		});

		it('should add enabled class when setting is true', () => {
			const mockDiv = document.createElement('div');
			const testValue = true;
			const getter = vi.fn(() => testValue);
			const setter = vi.fn();

			createSettingToggle(mockDiv, getter, setter);

			expect(mockDiv.classList.contains('enabled')).toBe(true);
		});

		it('should remove enabled class when setting is false', () => {
			const mockDiv = document.createElement('div');
			mockDiv.classList.add('enabled');
			const testValue = false;
			const getter = vi.fn(() => testValue);
			const setter = vi.fn();

			createSettingToggle(mockDiv, getter, setter);

			expect(mockDiv.classList.contains('enabled')).toBe(false);
		});

		it('should toggle setting on click', () => {
			const mockDiv = document.createElement('div');
			let testValue = false;
			const getter = vi.fn(() => testValue);
			const setter = vi.fn(value => {
				testValue = value;
			});

			createSettingToggle(mockDiv, getter, setter);

			const clickEvent = new window.Event('click');
			mockDiv.dispatchEvent(clickEvent);

			expect(setter).toHaveBeenCalledWith(true);
		});

		it('should sync with new getter and setter', () => {
			const mockDiv = document.createElement('div');
			const testValue = false;
			const getter = vi.fn(() => testValue);
			const setter = vi.fn();

			const toggle = createSettingToggle(mockDiv, getter, setter);

			const newValue = true;
			const newGetter = vi.fn(() => newValue);
			const newSetter = vi.fn();

			toggle.sync(newGetter, newSetter);

			expect(newGetter).toHaveBeenCalled();
			expect(mockDiv.classList.contains('enabled')).toBe(true);
		});
	});

	describe('Event Listener Functions', () => {
		describe('onReturn', () => {
			it('should trigger target click on Enter key', () => {
				const sourceDiv = document.createElement('div');
				const targetDiv = document.createElement('div');
				targetDiv.click = vi.fn();

				onReturn(sourceDiv, targetDiv);

				const enterEvent = new window.KeyboardEvent('keypress', {
					code: 'Enter',
					altKey: false,
					ctrlKey: false,
					metaKey: false,
				});
				sourceDiv.dispatchEvent(enterEvent);

				expect(targetDiv.click).toHaveBeenCalled();
			});

			it('should not trigger on Enter with modifier keys', () => {
				const sourceDiv = document.createElement('div');
				const targetDiv = document.createElement('div');
				targetDiv.click = vi.fn();

				onReturn(sourceDiv, targetDiv);

				const enterEvent = new window.KeyboardEvent('keypress', {
					code: 'Enter',
					ctrlKey: true,
				});
				sourceDiv.dispatchEvent(enterEvent);

				expect(targetDiv.click).not.toHaveBeenCalled();
			});
		});

		describe('onClick', () => {
			it('should call function with element on click', () => {
				const div = document.createElement('div');
				const mockFunc = vi.fn();

				onClick(div, mockFunc);

				const clickEvent = new window.Event('click');
				div.dispatchEvent(clickEvent);

				expect(mockFunc).toHaveBeenCalledWith(div);
			});
		});

		describe('onFileChange', () => {
			it('should call function with file when files are selected', () => {
				const input = document.createElement('input');
				input.type = 'file';
				const mockFunc = vi.fn();

				onFileChange(input, mockFunc);

				const mockFile = new window.File(['content'], 'test.txt', { type: 'text/plain' });
				const changeEvent = new window.Event('change');
				Object.defineProperty(changeEvent, 'target', { value: { files: [mockFile]} });

				input.dispatchEvent(changeEvent);

				expect(mockFunc).toHaveBeenCalledWith(mockFile);
			});

			it('should not call function when no files are selected', () => {
				const input = document.createElement('input');
				input.type = 'file';
				const mockFunc = vi.fn();

				onFileChange(input, mockFunc);

				const changeEvent = new window.Event('change');
				Object.defineProperty(changeEvent, 'target', { value: { files: []} });

				input.dispatchEvent(changeEvent);

				expect(mockFunc).not.toHaveBeenCalled();
			});
		});
	});

	describe('Position Info', () => {
		it('should create position info with update method', () => {
			const div = document.createElement('div');
			const posInfo = createPositionInfo(div);

			expect(posInfo).toHaveProperty('update');
		});

		it('should update element text content with 1-based coordinates', () => {
			const div = document.createElement('div');
			const posInfo = createPositionInfo(div);

			posInfo.update(5, 10);

			expect(div.textContent).toBe('6, 11');
		});
	});

	describe('Modal Functions', () => {
		it('should create modal controller with proper methods', () => {
			const mockModal = {
				open: false,
				showModal: vi.fn(),
				close: vi.fn(),
			};

			// Create required modal sections
			document.body.innerHTML = `
				<div id="resize-modal" class="hide"></div>
				<div id="fonts-modal" class="hide"></div>
				<div id="sauce-modal" class="hide"></div>
				<div id="websocket-modal" class="hide"></div>
				<div id="choice-modal" class="hide"></div>
				<div id="about-modal" class="hide"></div>
				<div id="update-modal" class="hide"></div>
				<div id="loading-modal" class="hide"></div>
				<div id="warning-modal" class="hide"></div>
				<div id="modalError"></div>
			`;

			const modalController = createModalController(mockModal);

			expect(typeof modalController.isOpen).toBe('function');
			expect(typeof modalController.open).toBe('function');
			expect(typeof modalController.close).toBe('function');
			expect(typeof modalController.error).toBe('function');
		});

		it('should show modal when opening', () => {
			const mockModal = {
				open: false,
				showModal: vi.fn(),
				close: vi.fn(),
			};

			document.body.innerHTML = `
				<div id="resize-modal" class="hide"></div>
				<div id="fonts-modal" class="hide"></div>
				<div id="sauce-modal" class="hide"></div>
				<div id="websocket-modal" class="hide"></div>
				<div id="choice-modal" class="hide"></div>
				<div id="about-modal" class="hide"></div>
				<div id="update-modal" class="hide"></div>
				<div id="loading-modal" class="hide"></div>
				<div id="warning-modal" class="hide"></div>
				<div id="modalError"></div>
			`;

			const modalController = createModalController(mockModal);
			modalController.open('resize');

			expect(mockModal.showModal).toHaveBeenCalled();
			expect(
				document.getElementById('resize-modal').classList.contains('hide'),
			).toBe(false);
		});
	});

	describe('undoAndRedo', () => {
		it('should call undo on Ctrl+Z', async () => {
			const { default: State } = await import('../../src/js/client/state.js');

			const ctrlZEvent = new window.KeyboardEvent('keydown', {
				code: 'KeyZ',
				ctrlKey: true,
			});

			undoAndRedo(ctrlZEvent);

			expect(State.textArtCanvas.undo).toHaveBeenCalled();
		});

		it('should call undo on Cmd+Z', async () => {
			const { default: State } = await import('../../src/js/client/state.js');

			const cmdZEvent = new window.KeyboardEvent('keydown', {
				code: 'KeyZ',
				metaKey: true,
				shiftKey: false,
			});

			undoAndRedo(cmdZEvent);

			expect(State.textArtCanvas.undo).toHaveBeenCalled();
		});

		it('should call redo on Ctrl+Y', async () => {
			const { default: State } = await import('../../src/js/client/state.js');

			const ctrlYEvent = new window.KeyboardEvent('keydown', {
				code: 'KeyY',
				ctrlKey: true,
			});

			undoAndRedo(ctrlYEvent);

			expect(State.textArtCanvas.redo).toHaveBeenCalled();
		});

		it('should call redo on Cmd+Shift+Z', async () => {
			const { default: State } = await import('../../src/js/client/state.js');

			const cmdShiftZEvent = new window.KeyboardEvent('keydown', {
				code: 'KeyZ',
				metaKey: true,
				shiftKey: true,
			});

			undoAndRedo(cmdShiftZEvent);

			expect(State.textArtCanvas.redo).toHaveBeenCalled();
		});

		it('should not trigger on other key combinations', async () => {
			const { default: State } = await import('../../src/js/client/state.js');

			const keyEvent = new window.KeyboardEvent('keydown', {
				code: 'KeyA',
				ctrlKey: true,
			});

			undoAndRedo(keyEvent);

			expect(State.textArtCanvas.undo).not.toHaveBeenCalled();
			expect(State.textArtCanvas.redo).not.toHaveBeenCalled();
		});
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

			expect(menu.classList.contains('menu-open')).toBe(true);

			vi.useRealTimers();
		});

		it('should close all menus when close is called', () => {
			vi.useFakeTimers();

			const menu1 = document.createElement('div');
			const menu2 = document.createElement('div');
			menu1.classList.add('menu-open');
			menu2.classList.add('menu-open');
			const view = document.createElement('div');
			view.focus = vi.fn();

			const controller = createMenuController([menu1, menu2], view);

			controller.close();

			expect(menu1.classList.contains('menu-open')).toBe(false);
			expect(menu2.classList.contains('menu-open')).toBe(false);

			vi.useRealTimers();
		});
	});

	describe('Additional DOM Utilities', () => {
		it('should provide $$$ function for querySelectorAll', async () => {
			// Need to import $$$ separately
			const { $$$ } = await import('../../src/js/client/ui.js');

			const div1 = document.createElement('div');
			div1.className = 'test-class-multi';
			const div2 = document.createElement('div');
			div2.className = 'test-class-multi';
			document.body.appendChild(div1);
			document.body.appendChild(div2);

			const results = $$$('.test-class-multi');
			expect(results.length).toBe(2);
		});
	});

	describe('Additional Exported Functions', () => {
		it('should test createGrid function existence', async () => {
			const module = await import('../../src/js/client/ui.js');
			expect(module.createGrid).toBeDefined();
			expect(typeof module.createGrid).toBe('function');
		});

		it('should test createToolPreview function existence', async () => {
			const module = await import('../../src/js/client/ui.js');
			expect(module.createToolPreview).toBeDefined();
			expect(typeof module.createToolPreview).toBe('function');
		});

		it('should test createFontSelect function existence', async () => {
			const module = await import('../../src/js/client/ui.js');
			expect(module.createFontSelect).toBeDefined();
			expect(typeof module.createFontSelect).toBe('function');
		});

		it('should test websocketUI function', async () => {
			const { websocketUI } = await import('../../src/js/client/ui.js');

			// Create elements with the specific classes
			const excludedDiv = document.createElement('div');
			excludedDiv.className = 'excluded-for-websocket';
			const includedDiv = document.createElement('div');
			includedDiv.className = 'included-for-websocket';

			document.body.appendChild(excludedDiv);
			document.body.appendChild(includedDiv);

			// Test showing websocket UI
			websocketUI(true);
			expect(includedDiv.style.display).toBe('block');
			expect(excludedDiv.style.display).toBe('none');

			// Test hiding websocket UI
			websocketUI(false);
			expect(includedDiv.style.display).toBe('none');
			expect(excludedDiv.style.display).toBe('block');
		});
	});
});
