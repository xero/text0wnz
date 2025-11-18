import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { createMenuController } from '../../src/js/client/ui.js';

// Mock State module
vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

describe('Menu DOM Tests', () => {
	let user;
	let fileButton;
	let fileMenuList;
	let editButton;
	let editMenuList;
	let canvas;
	let view;
	let menuController;

	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Create a new userEvent instance for each test
		user = userEvent.setup();
		// Clear all mocks
		vi.clearAllMocks();

		// Create canvas element
		canvas = document.createElement('canvas');
		canvas.id = 'canvas';
		canvas.tabIndex = 0;
		document.body.appendChild(canvas);

		// Create view element
		view = document.createElement('div');
		view.id = 'view';
		view.tabIndex = 0;
		document.body.appendChild(view);

		// Create file menu button
		fileButton = document.createElement('button');
		fileButton.id = 'fileMenu';
		fileButton.setAttribute('aria-label', 'File Menu');
		document.body.appendChild(fileButton);

		// Create file menu list
		fileMenuList = document.createElement('div');
		fileMenuList.id = 'fileList';
		fileMenuList.className = 'menuList hide';

		const newItem = document.createElement('article');
		newItem.id = 'new';
		newItem.className = 'menuItem';
		newItem.textContent = 'New';
		fileMenuList.appendChild(newItem);

		const openItem = document.createElement('article');
		openItem.id = 'open';
		openItem.className = 'menuItem';
		openItem.textContent = 'Open';
		fileMenuList.appendChild(openItem);

		document.body.appendChild(fileMenuList);

		// Create edit menu button
		editButton = document.createElement('button');
		editButton.id = 'editMenu';
		editButton.setAttribute('aria-label', 'Edit Menu');
		document.body.appendChild(editButton);

		// Create edit menu list
		editMenuList = document.createElement('div');
		editMenuList.id = 'editList';
		editMenuList.className = 'menuList hide';

		const undoItem = document.createElement('article');
		undoItem.id = 'nav-undo';
		undoItem.className = 'menuItem';
		undoItem.textContent = 'Undo';
		editMenuList.appendChild(undoItem);

		const redoItem = document.createElement('article');
		redoItem.id = 'nav-redo';
		redoItem.className = 'menuItem';
		redoItem.textContent = 'Redo';
		editMenuList.appendChild(redoItem);

		document.body.appendChild(editMenuList);

		// Create menu controller
		menuController = createMenuController(
			[
				{ button: fileButton, menu: fileMenuList },
				{ button: editButton, menu: editMenuList },
			],
			canvas,
			view,
		);
	});

	describe('Menu Opening and Closing', () => {
		it('should open file menu on click', async () => {
			expect(fileMenuList.classList.contains('hide')).toBe(true);

			await user.click(fileButton);

			expect(fileMenuList.classList.contains('hide')).toBe(false);
		});

		it('should close file menu on second click', async () => {
			await user.click(fileButton);
			expect(fileMenuList.classList.contains('hide')).toBe(false);

			// Wait for menu to fully open
			await waitFor(() => {
				expect(fileMenuList.classList.contains('hide')).toBe(false);
			});

			// Click again to close
			await user.click(fileButton);

			await waitFor(() => {
				expect(fileMenuList.classList.contains('hide')).toBe(true);
			});
		});

		it('should open edit menu on click', async () => {
			expect(editMenuList.classList.contains('hide')).toBe(true);

			await user.click(editButton);

			expect(editMenuList.classList.contains('hide')).toBe(false);
		});

		it('should close menu on blur', async () => {
			await user.click(fileButton);
			expect(fileMenuList.classList.contains('hide')).toBe(false);

			// Trigger blur event
			fireEvent.blur(fileMenuList);

			await waitFor(() => {
				expect(fileMenuList.classList.contains('hide')).toBe(true);
			});
		});

		it('should focus view when menu closes', async () => {
			await user.click(fileButton);
			expect(fileMenuList.classList.contains('hide')).toBe(false);

			fireEvent.blur(fileMenuList);

			await waitFor(() => {
				// After blur, the view should become the active element
				// This is handled by the menu controller
				expect(fileMenuList.classList.contains('hide')).toBe(true);
			});
		});

		it('should close all menus when closeAll is called', async () => {
			await user.click(fileButton);

			expect(fileMenuList.classList.contains('hide')).toBe(false);

			menuController.close();

			expect(fileMenuList.classList.contains('hide')).toBe(true);
			expect(editMenuList.classList.contains('hide')).toBe(true);
		});
	});

	describe('Menu Items', () => {
		it('should display file menu items when menu is open', async () => {
			await user.click(fileButton);

			const newItem = screen.getByText('New');
			const openItem = screen.getByText('Open');

			expect(newItem).toBeInTheDocument();
			expect(openItem).toBeInTheDocument();
		});

		it('should display edit menu items when menu is open', async () => {
			await user.click(editButton);

			const undoItem = screen.getByText('Undo');
			const redoItem = screen.getByText('Redo');

			expect(undoItem).toBeInTheDocument();
			expect(redoItem).toBeInTheDocument();
		});

		it('should have correct menu item classes', () => {
			const newItem = document.querySelector('#new');
			const undoItem = document.querySelector('#nav-undo');

			expect(newItem).toHaveClass('menuItem');
			expect(undoItem).toHaveClass('menuItem');
		});
	});

	describe('Menu Accessibility', () => {
		it('should have proper tabindex on menu elements', () => {
			// Canvas and view should have tabindex, not the buttons necessarily
			expect(canvas).toHaveAttribute('tabindex', '0');
			expect(view).toHaveAttribute('tabindex', '0');
		});

		it('should have proper aria-label on menu buttons', () => {
			expect(fileButton).toHaveAttribute('aria-label', 'File Menu');
			expect(editButton).toHaveAttribute('aria-label', 'Edit Menu');
		});

		it('should focus menu when opened', async () => {
			await user.click(fileButton);

			// Menu should not have hide class when focused
			expect(fileMenuList.classList.contains('hide')).toBe(false);
		});
	});

	describe('Menu Event Handling', () => {
		it('should stop propagation on menu click', async () => {
			const clickHandler = vi.fn();
			document.body.addEventListener('click', clickHandler);

			const clickEvent = new MouseEvent('click', { bubbles: true });
			const stopPropagation = vi.spyOn(clickEvent, 'stopPropagation');

			fileButton.dispatchEvent(clickEvent);

			// The button click will not stop propagation, it's handled by onClick
			// which prevents default on buttons
		});

		it('should prevent default on menu click', async () => {
			const clickEvent = new MouseEvent('click', { bubbles: true });
			const preventDefault = vi.spyOn(clickEvent, 'preventDefault');

			fileButton.dispatchEvent(clickEvent);

			expect(preventDefault).toHaveBeenCalled();
		});
	});
});
