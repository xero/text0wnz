import { describe, it, expect, beforeEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { createPositionInfo } from '../../src/js/client/ui.js';

// Mock State module
vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

describe('Canvas and Position Info DOM Tests', () => {
	let user;
	let canvasContainer;
	let positionInfo;
	let cursor;
	let positionController;

	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Create a new userEvent instance for each test
		user = userEvent.setup();
		// Clear all mocks
		vi.clearAllMocks();

		// Create canvas container
		canvasContainer = document.createElement('div');
		canvasContainer.id = 'canvas-container';
		canvasContainer.style.width = '640px';
		canvasContainer.style.height = '400px';
		canvasContainer.tabIndex = 0;
		document.body.appendChild(canvasContainer);

		// Create cursor element
		cursor = document.createElement('div');
		cursor.className = 'cursor';
		cursor.style.position = 'absolute';
		cursor.style.left = '0px';
		cursor.style.top = '0px';
		canvasContainer.appendChild(cursor);

		// Create position info display
		positionInfo = document.createElement('div');
		positionInfo.id = 'position-info';
		positionInfo.textContent = '1, 1';
		document.body.appendChild(positionInfo);

		// Create position controller
		positionController = createPositionInfo(positionInfo);
	});

	describe('Position Info Display', () => {
		it('should display initial position as 1, 1', () => {
			expect(positionInfo.textContent).toBe('1, 1');
		});

		it('should update position info when update is called', () => {
			positionController.update(5, 10);
			expect(positionInfo.textContent).toBe('6, 11');
		});

		it('should display 1-indexed coordinates (adding 1 to 0-based)', () => {
			positionController.update(0, 0);
			expect(positionInfo.textContent).toBe('1, 1');

			positionController.update(9, 24);
			expect(positionInfo.textContent).toBe('10, 25');
		});

		it('should handle large coordinate values', () => {
			positionController.update(79, 49);
			expect(positionInfo.textContent).toBe('80, 50');
		});

		it('should update position info multiple times', () => {
			positionController.update(0, 0);
			expect(positionInfo.textContent).toBe('1, 1');

			positionController.update(5, 5);
			expect(positionInfo.textContent).toBe('6, 6');

			positionController.update(10, 10);
			expect(positionInfo.textContent).toBe('11, 11');
		});
	});

	describe('Canvas Container', () => {
		it('should have canvas container element', () => {
			expect(canvasContainer).toBeInTheDocument();
			expect(canvasContainer).toHaveAttribute('id', 'canvas-container');
		});

		it('should be focusable', () => {
			expect(canvasContainer).toHaveAttribute('tabindex', '0');
		});

		it('should contain cursor element', () => {
			const cursorEl = canvasContainer.querySelector('.cursor');
			expect(cursorEl).toBeInTheDocument();
		});

		it('should have proper dimensions', () => {
			expect(canvasContainer.style.width).toBe('640px');
			expect(canvasContainer.style.height).toBe('400px');
		});
	});

	describe('Cursor Element', () => {
		it('should have cursor element with correct class', () => {
			expect(cursor).toHaveClass('cursor');
		});

		it('should be positioned absolutely', () => {
			expect(cursor.style.position).toBe('absolute');
		});

		it('should start at position 0, 0', () => {
			expect(cursor.style.left).toBe('0px');
			expect(cursor.style.top).toBe('0px');
		});

		it('should be movable by updating position', () => {
			cursor.style.left = '80px';
			cursor.style.top = '160px';

			expect(cursor.style.left).toBe('80px');
			expect(cursor.style.top).toBe('160px');
		});
	});

	describe('Canvas Click Interactions', () => {
		it('should handle click events on canvas container', async () => {
			const clickHandler = vi.fn();
			canvasContainer.addEventListener('click', clickHandler);

			await user.click(canvasContainer);

			expect(clickHandler).toHaveBeenCalled();
		});

		it('should calculate position from click coordinates', () => {
			// Simulate character dimensions (8x16 pixels)
			const charWidth = 8;
			const charHeight = 16;

			// Simulate a click at pixel position 80, 160
			const clickX = 80;
			const clickY = 160;

			// Calculate character position
			const charX = Math.floor(clickX / charWidth);
			const charY = Math.floor(clickY / charHeight);

			expect(charX).toBe(10);
			expect(charY).toBe(10);

			// Update position info
			positionController.update(charX, charY);
			expect(positionInfo.textContent).toBe('11, 11');
		});

		it('should handle clicks at different canvas positions', () => {
			const charWidth = 8;
			const charHeight = 16;

			// Top-left corner
			let charX = Math.floor(0 / charWidth);
			let charY = Math.floor(0 / charHeight);
			positionController.update(charX, charY);
			expect(positionInfo.textContent).toBe('1, 1');

			// Middle of canvas
			charX = Math.floor(320 / charWidth);
			charY = Math.floor(200 / charHeight);
			positionController.update(charX, charY);
			expect(positionInfo.textContent).toBe('41, 13');

			// Near bottom-right
			charX = Math.floor(632 / charWidth);
			charY = Math.floor(384 / charHeight);
			positionController.update(charX, charY);
			expect(positionInfo.textContent).toBe('80, 25');
		});
	});

	describe('Cursor Position Updates', () => {
		it('should update cursor position to match character coordinates', () => {
			const charWidth = 8;
			const charHeight = 16;

			// Move cursor to character position 10, 5
			const charX = 10;
			const charY = 5;

			cursor.style.left = charX * charWidth + 'px';
			cursor.style.top = charY * charHeight + 'px';

			expect(cursor.style.left).toBe('80px');
			expect(cursor.style.top).toBe('80px');

			// Update position display
			positionController.update(charX, charY);
			expect(positionInfo.textContent).toBe('11, 6');
		});

		it('should synchronize cursor position with position info', () => {
			const charWidth = 8;
			const charHeight = 16;

			const positions = [
				{ x: 0, y: 0, displayX: 1, displayY: 1 },
				{ x: 5, y: 5, displayX: 6, displayY: 6 },
				{ x: 20, y: 10, displayX: 21, displayY: 11 },
				{ x: 79, y: 24, displayX: 80, displayY: 25 },
			];

			positions.forEach(pos => {
				cursor.style.left = pos.x * charWidth + 'px';
				cursor.style.top = pos.y * charHeight + 'px';
				positionController.update(pos.x, pos.y);

				expect(positionInfo.textContent).toBe(
					`${pos.displayX}, ${pos.displayY}`,
				);
			});
		});
	});

	describe('Canvas Focus Management', () => {
		it('should allow canvas to receive focus', () => {
			canvasContainer.focus();
			expect(document.activeElement).toBe(canvasContainer);
		});

		it('should maintain focus after interaction', async () => {
			canvasContainer.focus();
			await user.click(canvasContainer);

			// Canvas should still be focusable
			expect(canvasContainer).toHaveAttribute('tabindex', '0');
		});
	});
});
