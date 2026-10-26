import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import Toolbar from '../../src/js/client/toolbar.js';
import State from '../../src/js/client/state.js';

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
		document.body.innerHTML = '';
		user = userEvent.setup();
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
			expect(button).toHaveClass('toolbarDisplayed');
		});

		it('should add toolbarDisplayed class when tool is activated', async () => {
			const button = document.createElement('button');
			button.id = 'active-tool';
			button.setAttribute('aria-label', 'Active Tool');
			document.body.appendChild(button);

			Toolbar.add(button, vi.fn(), vi.fn());

			await user.click(button);

			expect(button).toHaveClass('toolbarDisplayed');
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

			await user.click(screen.getByRole('button', { name: /tool 1/i }));
			expect(button1).toHaveClass('toolbarDisplayed');
			expect(onFocus1).toHaveBeenCalled();

			await user.click(screen.getByRole('button', { name: /tool 2/i }));
			expect(button2).toHaveClass('toolbarDisplayed');
			expect(button1).not.toHaveClass('toolbarDisplayed');
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

			// one activation per click
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
			expect(button).toHaveClass('toolbarDisplayed');
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

			await user.click(button1);
			expect(button1).toHaveClass('toolbarDisplayed');

			vi.clearAllMocks();

			await user.click(button2);
			expect(button2).toHaveClass('toolbarDisplayed');

			vi.clearAllMocks();

			Toolbar.returnToPreviousTool();
			expect(onFocus1).toHaveBeenCalled();
			expect(button1).toHaveClass('toolbarDisplayed');
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

			expect(button).not.toHaveClass('toolbarDisplayed');

			await user.click(button);

			expect(button).toHaveClass('toolbarDisplayed');
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
			expect(button).toHaveClass('toolbarDisplayed');
		});

		it('should handle rapid clicks', async () => {
			const button = document.createElement('button');
			button.id = 'rapid-click';
			button.setAttribute('aria-label', 'Rapid Click');
			document.body.appendChild(button);

			const onFocus = vi.fn();
			Toolbar.add(button, onFocus, vi.fn());

			await user.click(button);
			await user.click(button);
			await user.click(button);

			expect(onFocus).toHaveBeenCalledTimes(3);
		});

		it('should handle buttons appended after page load', async () => {
			const button = document.createElement('button');
			button.id = 'dynamic-tool';
			button.setAttribute('aria-label', 'Dynamic Tool');
			button.textContent = 'Dynamic';

			document.body.appendChild(button);

			const onFocus = vi.fn();
			Toolbar.add(button, onFocus, vi.fn());

			await user.click(screen.getByRole('button', { name: /dynamic tool/i }));

			expect(onFocus).toHaveBeenCalled();
		});
	});

	describe('Visual State Management', () => {
		it('should remove toolbarDisplayed class from previous tool', async () => {
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

			await user.click(button1);
			expect(button1).toHaveClass('toolbarDisplayed');
			expect(button2).not.toHaveClass('toolbarDisplayed');

			await user.click(button2);
			expect(button1).not.toHaveClass('toolbarDisplayed');
			expect(button2).toHaveClass('toolbarDisplayed');
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

			for (const button of buttons) {
				await user.click(button);

				const activeButtons = buttons.filter(b =>
					b.classList.contains('toolbarDisplayed'));
				expect(activeButtons).toHaveLength(1);
				expect(activeButtons[0]).toBe(button);
			}
		});
	});

	describe('Escape chain focus guard', () => {
		let chain;

		beforeEach(() => {
			chain = {
				modal: { isOpen: vi.fn(() => false) },
				// close() is required: tool enable() calls closeMenu
				flyouts: { close: vi.fn(), closeAndFocus: vi.fn(() => false) },
				panels: { closeDrawer: vi.fn(() => false) },
				selectionBar: { dismiss: vi.fn(() => false) },
			};
			Object.assign(State, chain);
		});

		afterEach(() => {
			delete State.modal;
			delete State.flyouts;
			delete State.panels;
			delete State.selectionBar;
		});

		const pressEscape = target => {
			const event = new KeyboardEvent('keydown', {
				code: 'Escape',
				bubbles: true,
				cancelable: true,
			});
			target.dispatchEvent(event);
			return event;
		};

		const addTool = id => {
			const button = document.createElement('button');
			button.id = id;
			button.setAttribute('aria-label', id);
			document.body.appendChild(button);
			Toolbar.add(button, vi.fn(), vi.fn());
			return button;
		};

		it('Escape in the chat input leaves selection and tool alone', async () => {
			const tool = addTool('escape-chat-tool');
			await user.click(tool);
			const input = document.createElement('input');
			input.type = 'text';
			input.id = 'messageInput';
			document.body.appendChild(input);
			input.focus();
			const event = pressEscape(input);
			expect(event.defaultPrevented).toBe(false);
			expect(chain.flyouts.closeAndFocus).not.toHaveBeenCalled();
			expect(chain.panels.closeDrawer).not.toHaveBeenCalled();
			expect(chain.selectionBar.dismiss).not.toHaveBeenCalled();
			expect(Toolbar.getCurrentTool()).toBe('escape-chat-tool');
		});

		it('Escape in contentEditable stays inert', () => {
			const editor = document.createElement('div');
			// jsdom does not implement the real isContentEditable getter
			Object.defineProperty(editor, 'isContentEditable', { value: true });
			document.body.appendChild(editor);
			const event = pressEscape(editor);
			expect(event.defaultPrevented).toBe(false);
			expect(chain.flyouts.closeAndFocus).not.toHaveBeenCalled();
		});

		it('Escape under an open dialog never preventDefaults', () => {
			chain.modal.isOpen.mockReturnValue(true);
			const event = pressEscape(document.body);
			expect(event.defaultPrevented).toBe(false);
			expect(chain.flyouts.closeAndFocus).not.toHaveBeenCalled();
		});

		it('Escape from the canvas walks flyout, drawer, selection, previous tool', async () => {
			chain.flyouts.closeAndFocus.mockReturnValueOnce(true);
			let event = pressEscape(document.body);
			expect(event.defaultPrevented).toBe(true);
			expect(chain.panels.closeDrawer).not.toHaveBeenCalled();
			expect(chain.selectionBar.dismiss).not.toHaveBeenCalled();

			chain.panels.closeDrawer.mockReturnValueOnce(true);
			event = pressEscape(document.body);
			expect(chain.selectionBar.dismiss).not.toHaveBeenCalled();

			const t1 = addTool('escape-walk-t1');
			const t2 = addTool('escape-walk-t2');
			await user.click(t1);
			await user.click(t2);
			pressEscape(document.body);
			expect(Toolbar.getCurrentTool()).toBe('escape-walk-t1');
		});
	});
});
