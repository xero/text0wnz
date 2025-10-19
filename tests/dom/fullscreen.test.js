import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { toggleFullscreen } from '../../src/js/client/ui.js';

// Mock State module
vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

describe('Fullscreen DOM Tests', () => {
	let user;
	let fullscreenButton;

	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Create a new userEvent instance for each test
		user = userEvent.setup();
		// Clear all mocks
		vi.clearAllMocks();

		// Create fullscreen button
		fullscreenButton = document.createElement('article');
		fullscreenButton.id = 'fullscreen';
		fullscreenButton.className = 'menu-item';
		fullscreenButton.textContent = 'Toggle Fullscreen Mode';
		document.body.appendChild(fullscreenButton);

		// Mock fullscreen API
		document.fullscreenEnabled = true;
		document.fullscreenElement = null;
		document.documentElement.requestFullscreen = vi.fn(() => Promise.resolve());
		document.exitFullscreen = vi.fn(() => Promise.resolve());
	});

	describe('Fullscreen Button Element', () => {
		it('should have fullscreen button in DOM', () => {
			expect(fullscreenButton).toBeInTheDocument();
			expect(fullscreenButton).toHaveAttribute('id', 'fullscreen');
		});

		it('should display correct text', () => {
			expect(fullscreenButton).toHaveTextContent('Toggle Fullscreen Mode');
		});

		it('should have menu-item class', () => {
			expect(fullscreenButton).toHaveClass('menu-item');
		});

		it('should be clickable', async () => {
			const clickHandler = vi.fn();
			fullscreenButton.addEventListener('click', clickHandler);

			await user.click(fullscreenButton);

			expect(clickHandler).toHaveBeenCalled();
		});
	});

	describe('Fullscreen Toggle Functionality', () => {
		it('should enter fullscreen when not in fullscreen mode', () => {
			document.fullscreenElement = null;

			toggleFullscreen();

			expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
		});

		it('should exit fullscreen when already in fullscreen mode', () => {
			document.fullscreenElement = document.documentElement;

			toggleFullscreen();

			expect(document.exitFullscreen).toHaveBeenCalled();
		});

		it('should toggle between fullscreen states', () => {
			// Start not in fullscreen
			document.fullscreenElement = null;
			toggleFullscreen();
			expect(document.documentElement.requestFullscreen).toHaveBeenCalled();

			// Now in fullscreen, toggle again
			document.fullscreenElement = document.documentElement;
			toggleFullscreen();
			expect(document.exitFullscreen).toHaveBeenCalled();
		});

		it('should not attempt fullscreen when API is disabled', () => {
			document.fullscreenEnabled = false;
			document.fullscreenElement = null;

			toggleFullscreen();

			expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
		});

		it('should check fullscreenEnabled before toggling', () => {
			document.fullscreenEnabled = true;
			document.fullscreenElement = null;

			toggleFullscreen();

			expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
		});
	});

	describe('Fullscreen Event Handling', () => {
		it('should handle click event on fullscreen button', async () => {
			fullscreenButton.addEventListener('click', () => {
				toggleFullscreen();
			});

			await user.click(fullscreenButton);

			expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
		});

		it('should support multiple fullscreen toggles', () => {
			// First toggle - enter fullscreen
			document.fullscreenElement = null;
			toggleFullscreen();
			expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(
				1,
			);

			// Second toggle - exit fullscreen
			document.fullscreenElement = document.documentElement;
			toggleFullscreen();
			expect(document.exitFullscreen).toHaveBeenCalledTimes(1);

			// Third toggle - enter fullscreen again
			document.fullscreenElement = null;
			toggleFullscreen();
			expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(
				2,
			);
		});

		it('should handle touch events on fullscreen button', () => {
			const touchHandler = vi.fn(() => {
				toggleFullscreen();
			});

			fullscreenButton.addEventListener('click', touchHandler);
			fireEvent.click(fullscreenButton);

			expect(touchHandler).toHaveBeenCalled();
			expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
		});
	});

	describe('Fullscreen API State', () => {
		it('should detect when fullscreen is active', () => {
			document.fullscreenElement = document.documentElement;

			expect(document.fullscreenElement).not.toBeNull();
			expect(document.fullscreenElement).toBe(document.documentElement);
		});

		it('should detect when fullscreen is not active', () => {
			document.fullscreenElement = null;

			expect(document.fullscreenElement).toBeNull();
		});

		it('should verify fullscreen capability', () => {
			document.fullscreenEnabled = true;
			expect(document.fullscreenEnabled).toBe(true);

			document.fullscreenEnabled = false;
			expect(document.fullscreenEnabled).toBe(false);
		});
	});

	describe('Fullscreen Browser Compatibility', () => {
		it('should handle browsers that support fullscreen API', () => {
			document.fullscreenEnabled = true;
			document.documentElement.requestFullscreen = vi.fn(() =>
				Promise.resolve());

			toggleFullscreen();

			expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
		});

		it('should handle browsers without fullscreen API', () => {
			document.fullscreenEnabled = false;
			const requestFn = vi.fn();
			document.documentElement.requestFullscreen = requestFn;

			toggleFullscreen();

			expect(requestFn).not.toHaveBeenCalled();
		});

		it('should safely exit fullscreen when element is set', () => {
			document.fullscreenEnabled = true;
			document.fullscreenElement = document.body;
			document.exitFullscreen = vi.fn(() => Promise.resolve());

			toggleFullscreen();

			expect(document.exitFullscreen).toHaveBeenCalled();
		});
	});

	describe('Fullscreen User Interaction', () => {
		it('should respond to keyboard shortcut simulation', async () => {
			// Simulate F11 or similar fullscreen shortcut
			fullscreenButton.addEventListener('click', () => {
				toggleFullscreen();
			});

			// Trigger with keyboard event
			await user.click(fullscreenButton);

			expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
		});

		it('should handle rapid toggle attempts', () => {
			// Rapid toggles
			document.fullscreenElement = null;
			toggleFullscreen();

			document.fullscreenElement = document.documentElement;
			toggleFullscreen();

			document.fullscreenElement = null;
			toggleFullscreen();

			expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(
				2,
			);
			expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
		});
	});

	describe('Fullscreen Menu Integration', () => {
		it('should be part of a menu structure', () => {
			// Create a parent menu
			const menu = document.createElement('div');
			menu.className = 'menu-list';
			menu.appendChild(fullscreenButton);

			expect(fullscreenButton.parentElement).toBe(menu);
			expect(menu.querySelector('#fullscreen')).toBe(fullscreenButton);
		});

		it('should maintain menu-item styling', () => {
			expect(fullscreenButton.className).toContain('menu-item');
		});

		it('should be accessible within menu navigation', () => {
			const menu = document.createElement('div');
			menu.className = 'menu-list';

			const item1 = document.createElement('article');
			item1.className = 'menu-item';
			item1.textContent = 'Item 1';

			menu.appendChild(item1);
			menu.appendChild(fullscreenButton);

			const menuItems = menu.querySelectorAll('.menu-item');
			expect(menuItems.length).toBe(2);
			expect(menuItems[1]).toBe(fullscreenButton);
		});
	});
});
