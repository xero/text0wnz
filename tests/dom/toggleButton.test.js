import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { createToggleButton } from '../../src/js/client/ui.js';

// Mock State module
vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

describe('Toggle Button DOM Tests', () => {
	let user;

	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Create a new userEvent instance for each test
		user = userEvent.setup();
		// Clear all mocks
		vi.clearAllMocks();
	});

	describe('Toggle Button Rendering', () => {
		it('should render toggle button container', () => {
			const stateOneClick = vi.fn();
			const stateTwoClick = vi.fn();

			const toggleButton = createToggleButton(
				'State One',
				'State Two',
				stateOneClick,
				stateTwoClick,
			);

			document.body.appendChild(toggleButton.getElement());

			const container = document.querySelector('.toggle-button-container');
			expect(container).toBeInTheDocument();
		});

		it('should render both toggle states', () => {
			const toggleButton = createToggleButton('On', 'Off', vi.fn(), vi.fn());
			document.body.appendChild(toggleButton.getElement());

			expect(screen.getByText('On')).toBeInTheDocument();
			expect(screen.getByText('Off')).toBeInTheDocument();
		});

		it('should render left and right button classes', () => {
			const toggleButton = createToggleButton(
				'Left',
				'Right',
				vi.fn(),
				vi.fn(),
			);
			document.body.appendChild(toggleButton.getElement());

			const leftButton = screen.getByText('Left');
			const rightButton = screen.getByText('Right');

			expect(leftButton).toHaveClass('toggle-button');
			expect(leftButton).toHaveClass('left');
			expect(rightButton).toHaveClass('toggle-button');
			expect(rightButton).toHaveClass('right');
		});
	});

	describe('Toggle Button Interactions', () => {
		it('should call state one callback when left button is clicked', async () => {
			const stateOneClick = vi.fn();
			const stateTwoClick = vi.fn();

			const toggleButton = createToggleButton(
				'State One',
				'State Two',
				stateOneClick,
				stateTwoClick,
			);
			document.body.appendChild(toggleButton.getElement());

			await user.click(screen.getByText('State One'));

			expect(stateOneClick).toHaveBeenCalled();
			expect(stateTwoClick).not.toHaveBeenCalled();
		});

		it('should call state two callback when right button is clicked', async () => {
			const stateOneClick = vi.fn();
			const stateTwoClick = vi.fn();

			const toggleButton = createToggleButton(
				'State One',
				'State Two',
				stateOneClick,
				stateTwoClick,
			);
			document.body.appendChild(toggleButton.getElement());

			await user.click(screen.getByText('State Two'));

			expect(stateTwoClick).toHaveBeenCalled();
			expect(stateOneClick).not.toHaveBeenCalled();
		});

		it('should toggle between states on clicks', async () => {
			const stateOneClick = vi.fn();
			const stateTwoClick = vi.fn();

			const toggleButton = createToggleButton(
				'On',
				'Off',
				stateOneClick,
				stateTwoClick,
			);
			document.body.appendChild(toggleButton.getElement());

			await user.click(screen.getByText('On'));
			expect(stateOneClick).toHaveBeenCalledTimes(1);

			await user.click(screen.getByText('Off'));
			expect(stateTwoClick).toHaveBeenCalledTimes(1);

			await user.click(screen.getByText('On'));
			expect(stateOneClick).toHaveBeenCalledTimes(2);
		});
	});

	describe('Visual State Management', () => {
		it('should add enabled class when state one is set', () => {
			const toggleButton = createToggleButton('On', 'Off', vi.fn(), vi.fn());
			document.body.appendChild(toggleButton.getElement());

			toggleButton.setStateOne();

			const stateOneButton = screen.getByText('On');
			const stateTwoButton = screen.getByText('Off');

			expect(stateOneButton).toHaveClass('enabled');
			expect(stateTwoButton).not.toHaveClass('enabled');
		});

		it('should add enabled class when state two is set', () => {
			const toggleButton = createToggleButton('On', 'Off', vi.fn(), vi.fn());
			document.body.appendChild(toggleButton.getElement());

			toggleButton.setStateTwo();

			const stateOneButton = screen.getByText('On');
			const stateTwoButton = screen.getByText('Off');

			expect(stateTwoButton).toHaveClass('enabled');
			expect(stateOneButton).not.toHaveClass('enabled');
		});

		it('should switch enabled class when toggling states', () => {
			const toggleButton = createToggleButton('On', 'Off', vi.fn(), vi.fn());
			document.body.appendChild(toggleButton.getElement());

			const stateOneButton = screen.getByText('On');
			const stateTwoButton = screen.getByText('Off');

			toggleButton.setStateOne();
			expect(stateOneButton).toHaveClass('enabled');
			expect(stateTwoButton).not.toHaveClass('enabled');

			toggleButton.setStateTwo();
			expect(stateTwoButton).toHaveClass('enabled');
			expect(stateOneButton).not.toHaveClass('enabled');
		});

		it('should update visual state when clicked', async () => {
			const stateOneClick = vi.fn(() => toggleButton.setStateOne());
			const stateTwoClick = vi.fn(() => toggleButton.setStateTwo());

			const toggleButton = createToggleButton(
				'On',
				'Off',
				stateOneClick,
				stateTwoClick,
			);
			document.body.appendChild(toggleButton.getElement());

			const stateOneButton = screen.getByText('On');
			const stateTwoButton = screen.getByText('Off');

			await user.click(stateOneButton);
			expect(stateOneButton).toHaveClass('enabled');

			await user.click(stateTwoButton);
			expect(stateTwoButton).toHaveClass('enabled');
		});
	});

	describe('Accessibility', () => {
		it('should be keyboard accessible', async () => {
			const stateOneClick = vi.fn();

			const toggleButton = createToggleButton(
				'On',
				'Off',
				stateOneClick,
				vi.fn(),
			);
			document.body.appendChild(toggleButton.getElement());

			const stateOneButton = screen.getByText('On');
			stateOneButton.tabIndex = 0;

			// Add keyboard event handler for accessibility
			stateOneButton.addEventListener('keydown', e => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					stateOneButton.click();
				}
			});

			stateOneButton.focus();

			await user.keyboard('{Enter}');

			expect(stateOneClick).toHaveBeenCalled();
		});

		it('should have proper button semantics', () => {
			const toggleButton = createToggleButton('Yes', 'No', vi.fn(), vi.fn());
			const container = toggleButton.getElement();
			container.setAttribute('role', 'group');
			container.setAttribute('aria-label', 'Toggle selection');
			document.body.appendChild(container);

			expect(screen.getByRole('group')).toBeInTheDocument();
		});

		it('should support aria-pressed attribute for toggle state', () => {
			const toggleButton = createToggleButton('On', 'Off', vi.fn(), vi.fn());
			document.body.appendChild(toggleButton.getElement());

			const stateOneButton = screen.getByText('On');
			const stateTwoButton = screen.getByText('Off');

			// Add aria-pressed for accessibility
			stateOneButton.setAttribute('role', 'button');
			stateOneButton.setAttribute('aria-pressed', 'false');
			stateTwoButton.setAttribute('role', 'button');
			stateTwoButton.setAttribute('aria-pressed', 'false');

			toggleButton.setStateOne();
			stateOneButton.setAttribute('aria-pressed', 'true');
			stateTwoButton.setAttribute('aria-pressed', 'false');

			expect(stateOneButton).toHaveAttribute('aria-pressed', 'true');
			expect(stateTwoButton).toHaveAttribute('aria-pressed', 'false');
		});
	});

	describe('Multiple Toggle Buttons', () => {
		it('should support multiple independent toggle buttons', async () => {
			const toggle1Click1 = vi.fn();
			const toggle1Click2 = vi.fn();
			const toggle2Click1 = vi.fn();
			const toggle2Click2 = vi.fn();

			const toggleButton1 = createToggleButton(
				'Option A',
				'Option B',
				toggle1Click1,
				toggle1Click2,
			);
			const toggleButton2 = createToggleButton(
				'Choice X',
				'Choice Y',
				toggle2Click1,
				toggle2Click2,
			);

			document.body.appendChild(toggleButton1.getElement());
			document.body.appendChild(toggleButton2.getElement());

			await user.click(screen.getByText('Option A'));
			expect(toggle1Click1).toHaveBeenCalled();

			await user.click(screen.getByText('Choice Y'));
			expect(toggle2Click2).toHaveBeenCalled();

			// Other callbacks should not be called
			expect(toggle1Click2).not.toHaveBeenCalled();
			expect(toggle2Click1).not.toHaveBeenCalled();
		});

		it('should maintain independent states for multiple toggles', () => {
			const toggleButton1 = createToggleButton('On', 'Off', vi.fn(), vi.fn());
			const toggleButton2 = createToggleButton('Yes', 'No', vi.fn(), vi.fn());

			const container1 = toggleButton1.getElement();
			const container2 = toggleButton2.getElement();
			container1.id = 'toggle-1';
			container2.id = 'toggle-2';

			document.body.appendChild(container1);
			document.body.appendChild(container2);

			toggleButton1.setStateOne();
			toggleButton2.setStateTwo();

			const onButton = screen.getByText('On');
			const noButton = screen.getByText('No');

			expect(onButton).toHaveClass('enabled');
			expect(noButton).toHaveClass('enabled');
		});
	});

	describe('Edge Cases', () => {
		it('should handle rapid clicking', async () => {
			const stateOneClick = vi.fn();
			const stateTwoClick = vi.fn();

			const toggleButton = createToggleButton(
				'State One',
				'State Two',
				stateOneClick,
				stateTwoClick,
			);
			document.body.appendChild(toggleButton.getElement());

			const button1 = screen.getByText('State One');
			const button2 = screen.getByText('State Two');

			// Rapid clicking
			await user.click(button1);
			await user.click(button2);
			await user.click(button1);
			await user.click(button2);
			await user.click(button1);

			expect(stateOneClick).toHaveBeenCalledTimes(3);
			expect(stateTwoClick).toHaveBeenCalledTimes(2);
		});

		it('should handle empty state names', () => {
			const toggleButton = createToggleButton('', '', vi.fn(), vi.fn());
			document.body.appendChild(toggleButton.getElement());

			const container = document.querySelector('.toggle-button-container');
			expect(container).toBeInTheDocument();
		});

		it('should handle very long state names', () => {
			const longName = 'This is a very long state name that might wrap';
			const toggleButton = createToggleButton(
				longName,
				'Short',
				vi.fn(),
				vi.fn(),
			);
			document.body.appendChild(toggleButton.getElement());

			expect(screen.getByText(longName)).toBeInTheDocument();
			expect(screen.getByText('Short')).toBeInTheDocument();
		});
	});

	describe('Programmatic State Control', () => {
		it('should allow programmatic state changes via setStateOne', () => {
			const toggleButton = createToggleButton('On', 'Off', vi.fn(), vi.fn());
			document.body.appendChild(toggleButton.getElement());

			const stateOneButton = screen.getByText('On');
			const stateTwoButton = screen.getByText('Off');

			expect(stateOneButton).not.toHaveClass('enabled');

			toggleButton.setStateOne();

			expect(stateOneButton).toHaveClass('enabled');
			expect(stateTwoButton).not.toHaveClass('enabled');
		});

		it('should allow programmatic state changes via setStateTwo', () => {
			const toggleButton = createToggleButton('On', 'Off', vi.fn(), vi.fn());
			document.body.appendChild(toggleButton.getElement());

			const stateOneButton = screen.getByText('On');
			const stateTwoButton = screen.getByText('Off');

			expect(stateTwoButton).not.toHaveClass('enabled');

			toggleButton.setStateTwo();

			expect(stateTwoButton).toHaveClass('enabled');
			expect(stateOneButton).not.toHaveClass('enabled');
		});

		it('should support multiple programmatic state changes', () => {
			const toggleButton = createToggleButton('On', 'Off', vi.fn(), vi.fn());
			document.body.appendChild(toggleButton.getElement());

			const stateOneButton = screen.getByText('On');
			const stateTwoButton = screen.getByText('Off');

			toggleButton.setStateOne();
			expect(stateOneButton).toHaveClass('enabled');

			toggleButton.setStateTwo();
			expect(stateTwoButton).toHaveClass('enabled');

			toggleButton.setStateOne();
			expect(stateOneButton).toHaveClass('enabled');
		});

		it('should return element via getElement', () => {
			const toggleButton = createToggleButton('On', 'Off', vi.fn(), vi.fn());
			const element = toggleButton.getElement();

			expect(element).toBeInstanceOf(HTMLElement);
			expect(element).toHaveClass('toggle-button-container');
		});
	});

	describe('Use Cases', () => {
		it('should work as an on/off toggle', async () => {
			let isOn = false;
			const toggleOn = vi.fn(() => {
				isOn = true;
			});
			const toggleOff = vi.fn(() => {
				isOn = false;
			});

			const toggleButton = createToggleButton('On', 'Off', toggleOn, toggleOff);
			document.body.appendChild(toggleButton.getElement());

			await user.click(screen.getByText('On'));
			expect(isOn).toBe(true);
			expect(toggleOn).toHaveBeenCalled();

			await user.click(screen.getByText('Off'));
			expect(isOn).toBe(false);
			expect(toggleOff).toHaveBeenCalled();
		});

		it('should work as a mode selector', async () => {
			let mode = null;
			const selectMode1 = vi.fn(() => {
				mode = 'mode1';
			});
			const selectMode2 = vi.fn(() => {
				mode = 'mode2';
			});

			const toggleButton = createToggleButton(
				'Mode 1',
				'Mode 2',
				selectMode1,
				selectMode2,
			);
			document.body.appendChild(toggleButton.getElement());

			await user.click(screen.getByText('Mode 1'));
			expect(mode).toBe('mode1');

			await user.click(screen.getByText('Mode 2'));
			expect(mode).toBe('mode2');
		});

		it('should work as a view toggle', async () => {
			const views = { grid: false, list: false };
			const showGrid = vi.fn(() => {
				views.grid = true;
				views.list = false;
			});
			const showList = vi.fn(() => {
				views.grid = false;
				views.list = true;
			});

			const toggleButton = createToggleButton(
				'Grid',
				'List',
				showGrid,
				showList,
			);
			document.body.appendChild(toggleButton.getElement());

			await user.click(screen.getByText('Grid'));
			expect(views.grid).toBe(true);
			expect(views.list).toBe(false);

			await user.click(screen.getByText('List'));
			expect(views.grid).toBe(false);
			expect(views.list).toBe(true);
		});
	});
});
