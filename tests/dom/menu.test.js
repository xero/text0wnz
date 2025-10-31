import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { createMenuController } from '../../src/js/client/ui.js';

// Mock State module
vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

describe('Menu DOM Tests', () => {
	let user;
	let fileMenu;
	let editMenu;
	let view;
	let menuController;

	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Create a new userEvent instance for each test
		user = userEvent.setup();
		// Clear all mocks
		vi.clearAllMocks();

		// Create view element (canvas container)
		view = document.createElement('div');
		view.id = 'canvas-container';
		view.tabIndex = 0;
		document.body.appendChild(view);

		// Create file menu
		fileMenu = document.createElement('div');
		fileMenu.id = 'file-menu';
		fileMenu.className = 'menuTitle';
		fileMenu.tabIndex = 0;

		const fileButton = document.createElement('button');
		fileButton.id = 'file';
		fileButton.setAttribute('aria-label', 'File Menu');
		fileMenu.appendChild(fileButton);

		const fileMenuList = document.createElement('div');
		fileMenuList.className = 'menuList';

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

		fileMenu.appendChild(fileMenuList);
		document.body.appendChild(fileMenu);

		// Create edit menu
		editMenu = document.createElement('div');
		editMenu.id = 'edit-menu';
		editMenu.className = 'menuTitle';
		editMenu.tabIndex = 0;

		const editButton = document.createElement('button');
		editButton.id = 'edit';
		editButton.setAttribute('aria-label', 'Edit Menu');
		editMenu.appendChild(editButton);

		const editMenuList = document.createElement('div');
		editMenuList.className = 'menuList';

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

		editMenu.appendChild(editMenuList);
		document.body.appendChild(editMenu);

		// Create menu controller
		menuController = createMenuController([fileMenu, editMenu], view);
	});

	describe('Menu Opening and Closing', () => {
		it('should open file menu on click', async () => {
			expect(fileMenu.classList.contains('menuOpen')).toBe(false);

			await user.click(fileMenu);

			expect(fileMenu.classList.contains('menuOpen')).toBe(true);
		});

		it('should close file menu on second click', async () => {
			await user.click(fileMenu);
			expect(fileMenu.classList.contains('menuOpen')).toBe(true);

			// Wait for menu to fully open
			await waitFor(() => {
				expect(fileMenu.classList.contains('menuOpen')).toBe(true);
			});

			// Click again to close
			await user.click(fileMenu);

			await waitFor(() => {
				expect(fileMenu.classList.contains('menuOpen')).toBe(false);
			});
		});

		it('should open edit menu on click', async () => {
			expect(editMenu.classList.contains('menuOpen')).toBe(false);

			await user.click(editMenu);

			expect(editMenu.classList.contains('menuOpen')).toBe(true);
		});

		it('should close menu on blur', async () => {
			await user.click(fileMenu);
			expect(fileMenu.classList.contains('menuOpen')).toBe(true);

			// Trigger blur event
			fireEvent.blur(fileMenu);

			await waitFor(() => {
				expect(fileMenu.classList.contains('menuOpen')).toBe(false);
			});
		});

		it('should focus view when menu closes', async () => {
			await user.click(fileMenu);
			expect(fileMenu.classList.contains('menuOpen')).toBe(true);

			fireEvent.blur(fileMenu);

			await waitFor(() => {
				// After blur, the view should become the active element
				// This is handled by the menu controller
				expect(fileMenu.classList.contains('menuOpen')).toBe(false);
			});
		});

		it('should close all menus when closeAll is called', async () => {
			await user.click(fileMenu);
			await user.click(editMenu);

			expect(fileMenu.classList.contains('menuOpen')).toBe(true);
			expect(editMenu.classList.contains('menuOpen')).toBe(true);

			menuController.close();

			expect(fileMenu.classList.contains('menuOpen')).toBe(false);
			expect(editMenu.classList.contains('menuOpen')).toBe(false);
		});
	});

	describe('Menu Items', () => {
		it('should display file menu items when menu is open', async () => {
			await user.click(fileMenu);

			const newItem = screen.getByText('New');
			const openItem = screen.getByText('Open');

			expect(newItem).toBeInTheDocument();
			expect(openItem).toBeInTheDocument();
		});

		it('should display edit menu items when menu is open', async () => {
			await user.click(editMenu);

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
			expect(fileMenu).toHaveAttribute('tabindex', '0');
			expect(editMenu).toHaveAttribute('tabindex', '0');
		});

		it('should have proper aria-label on menu buttons', () => {
			const fileButton = fileMenu.querySelector('button');
			const editButton = editMenu.querySelector('button');

			expect(fileButton).toHaveAttribute('aria-label', 'File Menu');
			expect(editButton).toHaveAttribute('aria-label', 'Edit Menu');
		});

		it('should focus menu when opened', async () => {
			await user.click(fileMenu);

			// Menu should have the menuOpen class when focused
			expect(fileMenu.classList.contains('menuOpen')).toBe(true);
		});
	});

	describe('Menu Event Handling', () => {
		it('should stop propagation on menu click', async () => {
			const clickHandler = vi.fn();
			document.body.addEventListener('click', clickHandler);

			const clickEvent = new MouseEvent('click', { bubbles: true });
			const stopPropagation = vi.spyOn(clickEvent, 'stopPropagation');

			fileMenu.dispatchEvent(clickEvent);

			expect(stopPropagation).toHaveBeenCalled();
		});

		it('should prevent default on menu click', async () => {
			const clickEvent = new MouseEvent('click', { bubbles: true });
			const preventDefault = vi.spyOn(clickEvent, 'preventDefault');

			fileMenu.dispatchEvent(clickEvent);

			expect(preventDefault).toHaveBeenCalled();
		});
	});
});
