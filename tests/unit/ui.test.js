import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	$,
	$$,
	createCanvas,
	createSettingToggle,
	onClick,
	onReturn,
	onFileChange,
	onSelectChange,
	createPositionInfo,
	createModalController,
	undoAndRedo,
	createGenericController,
	createToggleButton,
	enforceMaxBytes,
	websocketUI,
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
	},
}));

describe('UI Utilities', () => {
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

		describe('onSelectChange', () => {
			it('should call function with select value on change', () => {
				const select = document.createElement('select');
				const option = document.createElement('option');
				option.value = 'option2';
				select.appendChild(option);
				select.value = 'option2';
				const mockFunc = vi.fn();

				onSelectChange(select, mockFunc);

				const changeEvent = new window.Event('change');
				select.dispatchEvent(changeEvent);

				expect(mockFunc).toHaveBeenCalledWith('option2');
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
});
