import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import Toolbar from '../../src/js/client/toolbar.js';

// Mock State module
vi.mock('../../src/js/client/state.js', () => ({
	default: {
		menus: { close: vi.fn() },
		selectionTool: {
			isMoveMode: vi.fn(() => false),
			toggleMoveMode: vi.fn(),
		},
	},
}));

describe('Toolbar DOM Tests', () => {
	let user;

	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Create a new userEvent instance for each test
		user = userEvent.setup();
		// Clear all mocks
		vi.clearAllMocks();
	});

	describe('Toolbar Button Rendering', () => {
		it('should render toolbar button in the document', () => {
			const button = document.createElement('button');
			button.id = 'brush-tool';
			button.textContent = 'Brush';
			button.setAttribute('aria-label', 'Brush Tool');
			document.body.appendChild(button);

			Toolbar.add(button, vi.fn(), vi.fn());

			expect(
				screen.getByRole('button', { name: /brush/i }),
			).toBeInTheDocument();
		});

		it('should render multiple toolbar buttons', () => {
			const buttons = [
				{ id: 'brush-tool', label: 'Brush Tool' },
				{ id: 'eraser-tool', label: 'Eraser Tool' },
				{ id: 'fill-tool', label: 'Fill Tool' },
			];

			buttons.forEach(({ id, label }) => {
				const button = document.createElement('button');
				button.id = id;
				button.setAttribute('aria-label', label);
				button.textContent = label;
				document.body.appendChild(button);
				Toolbar.add(button, vi.fn(), vi.fn());
			});

			expect(
				screen.getByRole('button', { name: /brush tool/i }),
			).toBeInTheDocument();
			expect(
				screen.getByRole('button', { name: /eraser tool/i }),
			).toBeInTheDocument();
			expect(
				screen.getByRole('button', { name: /fill tool/i }),
			).toBeInTheDocument();
		});

		it('should render buttons with accessible labels', () => {
			const button = document.createElement('button');
			button.id = 'sample-tool';
			button.setAttribute('aria-label', 'Sample Tool');
			document.body.appendChild(button);

			Toolbar.add(button, vi.fn(), vi.fn());

			const toolButton = screen.getByLabelText('Sample Tool');
			expect(toolButton).toBeInTheDocument();
			expect(toolButton).toHaveAttribute('aria-label', 'Sample Tool');
		});
	});

	describe('Toolbar Button Interactions', () => {
		it('should activate a tool button on click', async () => {
			const button = document.createElement('button');
			button.id = 'test-tool';
			button.textContent = 'Test';
			button.setAttribute('aria-label', 'Test Tool');
			document.body.appendChild(button);

			const onFocus = vi.fn();
			Toolbar.add(button, onFocus, vi.fn());

			await user.click(screen.getByRole('button', { name: /test tool/i }));

			expect(onFocus).toHaveBeenCalled();
			expect(button).toHaveClass('toolbar-displayed');
		});

		it('should add toolbar-displayed class when tool is activated', async () => {
			const button = document.createElement('button');
			button.id = 'active-tool';
			button.setAttribute('aria-label', 'Active Tool');
			document.body.appendChild(button);

			Toolbar.add(button, vi.fn(), vi.fn());

			await user.click(button);

			expect(button).toHaveClass('toolbar-displayed');
		});

		it('should switch between tools when clicking different buttons', async () => {
			const button1 = document.createElement('button');
			button1.id = 'tool-1';
			button1.setAttribute('aria-label', 'Tool 1');
			button1.textContent = 'Tool 1';
			document.body.appendChild(button1);

			const button2 = document.createElement('button');
			button2.id = 'tool-2';
			button2.setAttribute('aria-label', 'Tool 2');
			button2.textContent = 'Tool 2';
			document.body.appendChild(button2);

			const onFocus1 = vi.fn();
			const onBlur1 = vi.fn();
			const onFocus2 = vi.fn();

			Toolbar.add(button1, onFocus1, onBlur1);
			Toolbar.add(button2, onFocus2, vi.fn());

			// Activate first tool
			await user.click(screen.getByRole('button', { name: /tool 1/i }));
			expect(button1).toHaveClass('toolbar-displayed');
			expect(onFocus1).toHaveBeenCalled();

			// Activate second tool
			await user.click(screen.getByRole('button', { name: /tool 2/i }));
			expect(button2).toHaveClass('toolbar-displayed');
			expect(button1).not.toHaveClass('toolbar-displayed');
			expect(onBlur1).toHaveBeenCalled();
			expect(onFocus2).toHaveBeenCalled();
		});

		it('should handle double-clicking on a tool button', async () => {
			const button = document.createElement('button');
			button.id = 'double-click-tool';
			button.setAttribute('aria-label', 'Double Click Tool');
			document.body.appendChild(button);

			const onFocus = vi.fn();
			Toolbar.add(button, onFocus, vi.fn());

			await user.dblClick(button);

			// Should call onFocus twice (once for each click)
			expect(onFocus).toHaveBeenCalledTimes(2);
		});
	});

	describe('Programmatic Tool Switching', () => {
		it('should switch tool using switchTool method', () => {
			const button = document.createElement('button');
			button.id = 'switch-target';
			button.setAttribute('aria-label', 'Switch Target');
			document.body.appendChild(button);

			const onFocus = vi.fn();
			Toolbar.add(button, onFocus, vi.fn());

			Toolbar.switchTool('switch-target');

			expect(onFocus).toHaveBeenCalled();
			expect(button).toHaveClass('toolbar-displayed');
		});

		it('should return to previous tool using returnToPreviousTool', async () => {
			const button1 = document.createElement('button');
			button1.id = 'previous-tool-test-1';
			button1.setAttribute('aria-label', 'Previous Tool 1');
			document.body.appendChild(button1);

			const button2 = document.createElement('button');
			button2.id = 'previous-tool-test-2';
			button2.setAttribute('aria-label', 'Previous Tool 2');
			document.body.appendChild(button2);

			const onFocus1 = vi.fn();
			const onFocus2 = vi.fn();

			Toolbar.add(button1, onFocus1, vi.fn());
			Toolbar.add(button2, onFocus2, vi.fn());

			// Activate first tool
			await user.click(button1);
			expect(button1).toHaveClass('toolbar-displayed');

			vi.clearAllMocks();

			// Activate second tool
			await user.click(button2);
			expect(button2).toHaveClass('toolbar-displayed');

			vi.clearAllMocks();

			// Return to previous tool
			Toolbar.returnToPreviousTool();
			expect(onFocus1).toHaveBeenCalled();
			expect(button1).toHaveClass('toolbar-displayed');
		});

		it('should get current tool ID', async () => {
			const button = document.createElement('button');
			button.id = 'current-tool-id-test';
			button.setAttribute('aria-label', 'Current Tool');
			document.body.appendChild(button);

			Toolbar.add(button, vi.fn(), vi.fn());
			await user.click(button);

			const currentTool = Toolbar.getCurrentTool();
			expect(currentTool).toBe('current-tool-id-test');
		});
	});

	describe('Accessibility', () => {
		it('should have accessible button roles', () => {
			const button = document.createElement('button');
			button.id = 'a11y-tool';
			button.setAttribute('aria-label', 'Accessibility Tool');
			document.body.appendChild(button);

			Toolbar.add(button, vi.fn(), vi.fn());

			const toolButton = screen.getByRole('button');
			expect(toolButton).toBeInTheDocument();
		});

		it('should have proper ARIA labels', () => {
			const tools = [
				{ id: 'brush', label: 'Brush Tool' },
				{ id: 'eraser', label: 'Eraser Tool' },
			];

			tools.forEach(({ id, label }) => {
				const button = document.createElement('button');
				button.id = id;
				button.setAttribute('aria-label', label);
				document.body.appendChild(button);
				Toolbar.add(button, vi.fn(), vi.fn());
			});

			expect(screen.getByLabelText('Brush Tool')).toBeInTheDocument();
			expect(screen.getByLabelText('Eraser Tool')).toBeInTheDocument();
		});

		it('should maintain focus state visually with CSS class', async () => {
			const button = document.createElement('button');
			button.id = 'focus-visual';
			button.setAttribute('aria-label', 'Focus Visual');
			document.body.appendChild(button);

			Toolbar.add(button, vi.fn(), vi.fn());

			expect(button).not.toHaveClass('toolbar-displayed');

			await user.click(button);

			expect(button).toHaveClass('toolbar-displayed');
		});
	});

	describe('Edge Cases', () => {
		it('should handle buttons without aria-label gracefully', async () => {
			const button = document.createElement('button');
			button.id = 'no-aria-label';
			button.textContent = 'No Label';
			document.body.appendChild(button);

			expect(() => {
				Toolbar.add(button, vi.fn(), vi.fn());
			}).not.toThrow();

			await user.click(button);
			expect(button).toHaveClass('toolbar-displayed');
		});

		it('should handle rapid clicks', async () => {
			const button = document.createElement('button');
			button.id = 'rapid-click';
			button.setAttribute('aria-label', 'Rapid Click');
			document.body.appendChild(button);

			const onFocus = vi.fn();
			Toolbar.add(button, onFocus, vi.fn());

			// Click multiple times rapidly
			await user.click(button);
			await user.click(button);
			await user.click(button);

			// Should handle all clicks without error
			expect(onFocus).toHaveBeenCalledTimes(3);
		});

		it('should handle buttons appended after page load', async () => {
			// Simulate dynamic button creation
			const button = document.createElement('button');
			button.id = 'dynamic-tool';
			button.setAttribute('aria-label', 'Dynamic Tool');
			button.textContent = 'Dynamic';

			// Add to DOM after test start
			document.body.appendChild(button);

			const onFocus = vi.fn();
			Toolbar.add(button, onFocus, vi.fn());

			await user.click(screen.getByRole('button', { name: /dynamic tool/i }));

			expect(onFocus).toHaveBeenCalled();
		});
	});

	describe('Visual State Management', () => {
		it('should remove toolbar-displayed class from previous tool', async () => {
			const button1 = document.createElement('button');
			button1.id = 'visual-state-1';
			button1.setAttribute('aria-label', 'Visual State 1');
			document.body.appendChild(button1);

			const button2 = document.createElement('button');
			button2.id = 'visual-state-2';
			button2.setAttribute('aria-label', 'Visual State 2');
			document.body.appendChild(button2);

			Toolbar.add(button1, vi.fn(), vi.fn());
			Toolbar.add(button2, vi.fn(), vi.fn());

			// Activate first tool
			await user.click(button1);
			expect(button1).toHaveClass('toolbar-displayed');
			expect(button2).not.toHaveClass('toolbar-displayed');

			// Activate second tool
			await user.click(button2);
			expect(button1).not.toHaveClass('toolbar-displayed');
			expect(button2).toHaveClass('toolbar-displayed');
		});

		it('should maintain only one active tool at a time', async () => {
			const buttons = [];
			for (let i = 0; i < 5; i++) {
				const button = document.createElement('button');
				button.id = `multi-tool-${i}`;
				button.setAttribute('aria-label', `Tool ${i}`);
				document.body.appendChild(button);
				Toolbar.add(button, vi.fn(), vi.fn());
				buttons.push(button);
			}

			// Click each button
			for (const button of buttons) {
				await user.click(button);

				// Count how many buttons have the active class
				const activeButtons = buttons.filter(b =>
					b.classList.contains('toolbar-displayed'));
				expect(activeButtons).toHaveLength(1);
				expect(activeButtons[0]).toBe(button);
			}
		});
	});
});
