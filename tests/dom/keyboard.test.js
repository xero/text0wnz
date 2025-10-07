import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

describe('Keyboard Shortcuts DOM Tests', () => {
	let user;

	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Create a new userEvent instance for each test
		user = userEvent.setup();
		// Clear all mocks
		vi.clearAllMocks();
	});

	describe('Keyboard Event Handling', () => {
		it('should trigger action on keyboard shortcut', async () => {
			const handleShortcut = vi.fn();

			const button = document.createElement('button');
			button.id = 'test-button';
			button.textContent = 'Action (Ctrl+K)';
			button.setAttribute('aria-label', 'Action');
			document.body.appendChild(button);

			// Add keyboard event listener
			document.addEventListener('keydown', e => {
				if (e.ctrlKey && e.key === 'k') {
					e.preventDefault();
					handleShortcut();
				}
			});

			await user.keyboard('{Control>}k{/Control}');

			expect(handleShortcut).toHaveBeenCalled();
		});

		it('should support multiple keyboard shortcuts', async () => {
			const handlers = {
				copy: vi.fn(),
				paste: vi.fn(),
				cut: vi.fn(),
			};

			document.addEventListener('keydown', e => {
				if (e.ctrlKey && e.key === 'c') {
					e.preventDefault();
					handlers.copy();
				}
				if (e.ctrlKey && e.key === 'v') {
					e.preventDefault();
					handlers.paste();
				}
				if (e.ctrlKey && e.key === 'x') {
					e.preventDefault();
					handlers.cut();
				}
			});

			await user.keyboard('{Control>}c{/Control}');
			expect(handlers.copy).toHaveBeenCalled();

			await user.keyboard('{Control>}v{/Control}');
			expect(handlers.paste).toHaveBeenCalled();

			await user.keyboard('{Control>}x{/Control}');
			expect(handlers.cut).toHaveBeenCalled();
		});

		it('should handle function keys', async () => {
			const handleF1 = vi.fn();

			document.addEventListener('keydown', e => {
				if (e.key === 'F1') {
					e.preventDefault();
					handleF1();
				}
			});

			await user.keyboard('{F1}');

			expect(handleF1).toHaveBeenCalled();
		});

		it('should distinguish between different modifier keys', async () => {
			const handlers = {
				ctrl: vi.fn(),
				alt: vi.fn(),
				shift: vi.fn(),
			};

			document.addEventListener('keydown', e => {
				if (e.ctrlKey && e.key === 's' && !e.altKey && !e.shiftKey) {
					e.preventDefault();
					handlers.ctrl();
				}
				if (e.altKey && e.key === 's' && !e.ctrlKey && !e.shiftKey) {
					e.preventDefault();
					handlers.alt();
				}
				if (
					e.shiftKey &&
					e.key.toLowerCase() === 's' &&
					!e.ctrlKey &&
					!e.altKey
				) {
					e.preventDefault();
					handlers.shift();
				}
			});

			// Use fireEvent for more control over modifier keys
			fireEvent.keyDown(document, { key: 's', ctrlKey: true });
			expect(handlers.ctrl).toHaveBeenCalled();

			fireEvent.keyDown(document, { key: 's', altKey: true });
			expect(handlers.alt).toHaveBeenCalled();

			fireEvent.keyDown(document, { key: 'S', shiftKey: true });
			expect(handlers.shift).toHaveBeenCalled();
		});
	});

	describe('Keyboard Navigation', () => {
		it('should navigate with arrow keys', async () => {
			const items = [];
			for (let i = 0; i < 4; i++) {
				const item = document.createElement('button');
				item.id = `item-${i}`;
				item.textContent = `Item ${i}`;
				item.setAttribute('tabindex', '0');
				document.body.appendChild(item);
				items.push(item);
			}

			let currentIndex = 0;
			items[currentIndex].focus();

			document.addEventListener('keydown', e => {
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					currentIndex = Math.min(currentIndex + 1, items.length - 1);
					items[currentIndex].focus();
				}
				if (e.key === 'ArrowUp') {
					e.preventDefault();
					currentIndex = Math.max(currentIndex - 1, 0);
					items[currentIndex].focus();
				}
			});

			await user.keyboard('{ArrowDown}');
			expect(document.activeElement).toBe(items[1]);

			await user.keyboard('{ArrowDown}');
			expect(document.activeElement).toBe(items[2]);

			await user.keyboard('{ArrowUp}');
			expect(document.activeElement).toBe(items[1]);
		});

		it('should support tab navigation', async () => {
			const button1 = document.createElement('button');
			button1.id = 'btn1';
			button1.textContent = 'Button 1';
			button1.setAttribute('tabindex', '0');

			const button2 = document.createElement('button');
			button2.id = 'btn2';
			button2.textContent = 'Button 2';
			button2.setAttribute('tabindex', '0');

			document.body.appendChild(button1);
			document.body.appendChild(button2);

			button1.focus();
			expect(document.activeElement).toBe(button1);

			await user.keyboard('{Tab}');
			expect(document.activeElement).toBe(button2);
		});

		it('should support home/end keys for navigation', async () => {
			const container = document.createElement('div');
			container.setAttribute('role', 'list');
			document.body.appendChild(container);

			const items = [];
			for (let i = 0; i < 5; i++) {
				const item = document.createElement('div');
				item.setAttribute('role', 'listitem');
				item.setAttribute('tabindex', '0');
				item.textContent = `Item ${i}`;
				container.appendChild(item);
				items.push(item);
			}

			let currentIndex = 2;
			items[currentIndex].focus();

			document.addEventListener('keydown', e => {
				if (e.key === 'Home') {
					e.preventDefault();
					currentIndex = 0;
					items[currentIndex].focus();
				}
				if (e.key === 'End') {
					e.preventDefault();
					currentIndex = items.length - 1;
					items[currentIndex].focus();
				}
			});

			await user.keyboard('{Home}');
			expect(document.activeElement).toBe(items[0]);

			await user.keyboard('{End}');
			expect(document.activeElement).toBe(items[4]);
		});
	});

	describe('Shortcut Visual Indicators', () => {
		it('should display keyboard shortcuts in UI', () => {
			const button = document.createElement('button');
			button.textContent = 'Save ';

			const kbd = document.createElement('kbd');
			kbd.textContent = 'Ctrl+S';
			button.appendChild(kbd);

			document.body.appendChild(button);

			expect(screen.getByText(/save/i)).toBeInTheDocument();
			expect(screen.getByText('Ctrl+S')).toBeInTheDocument();
		});

		it('should show shortcuts in tooltips', () => {
			const button = document.createElement('button');
			button.id = 'copy-btn';
			button.textContent = 'Copy';
			button.setAttribute('title', 'Copy (Ctrl+C)');
			button.setAttribute('aria-label', 'Copy (Ctrl+C)');
			document.body.appendChild(button);

			expect(button).toHaveAttribute('title', 'Copy (Ctrl+C)');
			expect(button).toHaveAttribute('aria-label', 'Copy (Ctrl+C)');
		});

		it('should render shortcut hints in menu items', () => {
			const menu = document.createElement('div');
			menu.setAttribute('role', 'menu');

			const menuItem = document.createElement('div');
			menuItem.setAttribute('role', 'menuitem');
			menuItem.innerHTML = 'Undo <kbd>Ctrl+Z</kbd>';
			menu.appendChild(menuItem);

			document.body.appendChild(menu);

			expect(screen.getByText('Undo')).toBeInTheDocument();
			expect(screen.getByText('Ctrl+Z')).toBeInTheDocument();
		});
	});

	describe('Text Input with Keyboard', () => {
		it('should type text into input field', async () => {
			const input = document.createElement('input');
			input.id = 'text-input';
			input.type = 'text';
			input.setAttribute('aria-label', 'Text Input');
			document.body.appendChild(input);

			await user.type(input, 'Hello World');

			expect(input).toHaveValue('Hello World');
		});

		it('should handle backspace key', async () => {
			const input = document.createElement('input');
			input.id = 'text-input';
			input.type = 'text';
			document.body.appendChild(input);

			await user.type(input, 'Hello{Backspace}{Backspace}');

			expect(input).toHaveValue('Hel');
		});

		it('should handle enter key in input', async () => {
			const input = document.createElement('input');
			input.id = 'text-input';
			input.type = 'text';
			document.body.appendChild(input);

			const handleSubmit = vi.fn();
			input.addEventListener('keypress', e => {
				if (e.key === 'Enter') {
					e.preventDefault();
					handleSubmit();
				}
			});

			await user.type(input, 'test{Enter}');

			expect(handleSubmit).toHaveBeenCalled();
		});

		it('should clear input with Ctrl+A and Delete', async () => {
			const input = document.createElement('input');
			input.id = 'text-input';
			input.type = 'text';
			input.value = 'Delete me';
			document.body.appendChild(input);

			input.focus();
			await user.keyboard('{Control>}a{/Control}{Delete}');

			expect(input).toHaveValue('');
		});
	});

	describe('Accessibility with Keyboard', () => {
		it('should activate button with Enter key', async () => {
			const button = document.createElement('button');
			button.id = 'test-button';
			button.textContent = 'Click me';
			document.body.appendChild(button);

			const handleClick = vi.fn();
			button.addEventListener('click', handleClick);

			button.focus();
			await user.keyboard('{Enter}');

			expect(handleClick).toHaveBeenCalled();
		});

		it('should activate button with Space key', async () => {
			const button = document.createElement('button');
			button.id = 'test-button';
			button.textContent = 'Click me';
			document.body.appendChild(button);

			const handleClick = vi.fn();
			button.addEventListener('click', handleClick);

			button.focus();
			await user.keyboard('{ }');

			expect(handleClick).toHaveBeenCalled();
		});

		it('should support aria-keyshortcuts attribute', () => {
			const button = document.createElement('button');
			button.id = 'save-button';
			button.textContent = 'Save';
			button.setAttribute('aria-label', 'Save');
			button.setAttribute('aria-keyshortcuts', 'Control+S');
			document.body.appendChild(button);

			expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+S');
		});
	});

	describe('Preventing Default Behavior', () => {
		it('should prevent default browser shortcuts', async () => {
			const handleSave = vi.fn();

			const preventDefaultHandler = e => {
				if (e.ctrlKey && e.key === 's') {
					e.preventDefault();
					handleSave();
				}
			};

			document.addEventListener('keydown', preventDefaultHandler);

			const event = new KeyboardEvent('keydown', {
				key: 's',
				ctrlKey: true,
				bubbles: true,
			});
			const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

			document.dispatchEvent(event);

			expect(preventDefaultSpy).toHaveBeenCalled();
			expect(handleSave).toHaveBeenCalled();

			document.removeEventListener('keydown', preventDefaultHandler);
		});

		it('should stop propagation when needed', async () => {
			const outerHandler = vi.fn();
			const innerHandler = vi.fn();

			const outer = document.createElement('div');
			outer.id = 'outer';
			const inner = document.createElement('div');
			inner.id = 'inner';
			inner.setAttribute('tabindex', '0');

			outer.appendChild(inner);
			document.body.appendChild(outer);

			outer.addEventListener('keydown', outerHandler);
			inner.addEventListener('keydown', e => {
				e.stopPropagation();
				innerHandler();
			});

			inner.focus();
			await user.keyboard('a');

			expect(innerHandler).toHaveBeenCalled();
			expect(outerHandler).not.toHaveBeenCalled();
		});
	});

	describe('Edge Cases', () => {
		it('should handle multiple simultaneous key presses', () => {
			const handler = vi.fn();

			document.addEventListener('keydown', e => {
				if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'k') {
					e.preventDefault();
					handler();
				}
			});

			fireEvent.keyDown(document, { key: 'K', ctrlKey: true, shiftKey: true });

			expect(handler).toHaveBeenCalled();
		});

		it('should handle rapid key presses', async () => {
			const handler = vi.fn();

			const input = document.createElement('input');
			input.id = 'rapid-input';
			document.body.appendChild(input);

			input.addEventListener('keydown', handler);

			await user.type(input, 'abcdefghij');

			expect(handler).toHaveBeenCalledTimes(10);
		});

		it('should handle special characters', async () => {
			const input = document.createElement('input');
			input.id = 'special-input';
			input.type = 'text';
			document.body.appendChild(input);

			await user.type(input, '!@#$%^&*()');

			expect(input).toHaveValue('!@#$%^&*()');
		});

		it('should handle keys that do not produce characters', async () => {
			const handlers = {
				escape: vi.fn(),
				capsLock: vi.fn(),
			};

			document.addEventListener('keydown', e => {
				if (e.key === 'Escape') {
					handlers.escape();
				}
				if (e.key === 'CapsLock') {
					handlers.capsLock();
				}
			});

			await user.keyboard('{Escape}');
			expect(handlers.escape).toHaveBeenCalled();

			await user.keyboard('{CapsLock}');
			expect(handlers.capsLock).toHaveBeenCalled();
		});
	});

	describe('Global vs Local Shortcuts', () => {
		it('should handle global shortcuts at document level', async () => {
			const globalHandler = vi.fn();

			document.addEventListener('keydown', e => {
				if (e.ctrlKey && e.key === 'n') {
					e.preventDefault();
					globalHandler();
				}
			});

			await user.keyboard('{Control>}n{/Control}');

			expect(globalHandler).toHaveBeenCalled();
		});

		it('should handle local shortcuts on specific elements', async () => {
			const localHandler = vi.fn();

			const textarea = document.createElement('textarea');
			textarea.id = 'local-area';
			document.body.appendChild(textarea);

			textarea.addEventListener('keydown', e => {
				if (e.ctrlKey && e.key === 'b') {
					e.preventDefault();
					localHandler();
				}
			});

			textarea.focus();
			await user.keyboard('{Control>}b{/Control}');

			expect(localHandler).toHaveBeenCalled();
		});

		it('should prevent shortcuts when input is focused', async () => {
			const shortcutHandler = vi.fn();

			const input = document.createElement('input');
			input.id = 'text-input';
			input.type = 'text';
			document.body.appendChild(input);

			document.addEventListener('keydown', e => {
				// Don't trigger shortcuts when typing in input
				if (
					e.target.tagName !== 'INPUT' &&
					e.target.tagName !== 'TEXTAREA' &&
					e.ctrlKey &&
					e.key === 'k'
				) {
					shortcutHandler();
				}
			});

			input.focus();
			fireEvent.keyDown(input, { key: 'k', ctrlKey: true });

			expect(shortcutHandler).not.toHaveBeenCalled();

			// But should work when input is not focused
			document.body.focus();
			fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

			expect(shortcutHandler).toHaveBeenCalled();
		});
	});
});
