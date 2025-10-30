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

void State; // Used in mocked tests

describe('UI Basic Utilities', () => {
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
});
