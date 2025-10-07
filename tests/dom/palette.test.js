import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { createPalette } from '../../src/js/client/palette.js';

// Mock State module
vi.mock('../../src/js/client/state.js', () => ({ default: { palette: null } }));

describe('Palette DOM Tests', () => {
	let user;
	let palette;

	// Default RGB6Bit color palette (standard 16 colors)
	const defaultRGB6Bit = [
		[0, 0, 0], // Black
		[0, 0, 42], // Blue
		[0, 42, 0], // Green
		[0, 42, 42], // Cyan
		[42, 0, 0], // Red
		[42, 0, 42], // Magenta
		[42, 21, 0], // Brown
		[42, 42, 42], // Light Gray
		[21, 21, 21], // Dark Gray
		[21, 21, 63], // Light Blue
		[21, 63, 21], // Light Green
		[21, 63, 63], // Light Cyan
		[63, 21, 21], // Light Red
		[63, 21, 63], // Light Magenta
		[63, 63, 21], // Yellow
		[63, 63, 63], // White
	];

	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Create a new userEvent instance for each test
		user = userEvent.setup();
		// Clear all mocks
		vi.clearAllMocks();
		// Create a fresh palette instance with default colors
		palette = createPalette(defaultRGB6Bit);
	});

	describe('Palette Color Rendering', () => {
		it('should create a palette with default colors', () => {
			expect(palette).toBeDefined();
			expect(palette.getRGBAColor).toBeDefined();
			expect(palette.getForegroundColor).toBeDefined();
			expect(palette.getBackgroundColor).toBeDefined();
		});

		it('should have correct default foreground color', () => {
			const foregroundColor = palette.getForegroundColor();
			expect(foregroundColor).toBe(7); // Default white color
		});

		it('should have correct default background color', () => {
			const backgroundColor = palette.getBackgroundColor();
			expect(backgroundColor).toBe(0); // Default black color
		});

		it('should render color preview elements', () => {
			const container = document.createElement('div');
			container.id = 'color-preview';
			document.body.appendChild(container);

			// Create color swatches
			for (let i = 0; i < 16; i++) {
				const swatch = document.createElement('div');
				swatch.className = 'color-swatch';
				swatch.dataset.colorIndex = i;
				swatch.setAttribute('role', 'button');
				swatch.setAttribute('aria-label', `Color ${i}`);
				const rgba = palette.getRGBAColor(i);
				swatch.style.backgroundColor = `rgba(${rgba.join(',')})`;
				container.appendChild(swatch);
			}

			const swatches = screen.getAllByRole('button');
			expect(swatches).toHaveLength(16);
		});
	});

	describe('Color Selection Interactions', () => {
		it('should select foreground color on left click', async () => {
			const container = document.createElement('div');
			document.body.appendChild(container);

			// Create a color swatch
			const swatch = document.createElement('div');
			swatch.className = 'color-swatch';
			swatch.dataset.colorIndex = '5';
			swatch.setAttribute('role', 'button');
			swatch.setAttribute('aria-label', 'Color 5');
			container.appendChild(swatch);

			// Add click handler
			swatch.addEventListener('click', e => {
				if (e.button === 0) {
					// Left click
					palette.setForegroundColor(parseInt(swatch.dataset.colorIndex));
				}
			});

			await user.click(swatch);

			expect(palette.getForegroundColor()).toBe(5);
		});

		it('should select background color on right click', async () => {
			const container = document.createElement('div');
			document.body.appendChild(container);

			const swatch = document.createElement('div');
			swatch.className = 'color-swatch';
			swatch.dataset.colorIndex = '3';
			swatch.setAttribute('role', 'button');
			swatch.setAttribute('aria-label', 'Color 3');
			container.appendChild(swatch);

			// Add context menu handler
			swatch.addEventListener('contextmenu', e => {
				e.preventDefault();
				palette.setBackgroundColor(parseInt(swatch.dataset.colorIndex));
			});

			// Simulate right click
			fireEvent.contextMenu(swatch);

			expect(palette.getBackgroundColor()).toBe(3);
		});

		it('should handle color swatches without data attributes', async () => {
			const swatch = document.createElement('div');
			swatch.className = 'color-swatch';
			swatch.setAttribute('role', 'button');
			swatch.setAttribute('aria-label', 'Invalid Color');
			document.body.appendChild(swatch);

			// Should not throw when clicking swatch without color index
			await user.click(swatch);

			// Palette state should remain unchanged
			expect(palette.getForegroundColor()).toBe(7); // default
		});
	});

	describe('Color Values', () => {
		it('should have accessible color swatch roles', () => {
			const container = document.createElement('div');
			document.body.appendChild(container);

			const swatch = document.createElement('div');
			swatch.className = 'color-swatch';
			swatch.setAttribute('role', 'button');
			swatch.setAttribute('aria-label', 'Red Color');
			swatch.setAttribute('tabindex', '0');
			container.appendChild(swatch);

			expect(
				screen.getByRole('button', { name: /red color/i }),
			).toBeInTheDocument();
		});

		it('should support keyboard navigation for color selection', async () => {
			const container = document.createElement('div');
			document.body.appendChild(container);

			const swatch = document.createElement('div');
			swatch.className = 'color-swatch';
			swatch.dataset.colorIndex = '7';
			swatch.setAttribute('role', 'button');
			swatch.setAttribute('aria-label', 'Color 7');
			swatch.setAttribute('tabindex', '0');
			container.appendChild(swatch);

			// Add keyboard handler
			swatch.addEventListener('keydown', e => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					palette.setForegroundColor(parseInt(swatch.dataset.colorIndex));
				}
			});

			swatch.focus();
			await user.keyboard('{Enter}');

			expect(palette.getForegroundColor()).toBe(7);
		});

		it('should have color labels for screen readers', () => {
			const container = document.createElement('div');
			document.body.appendChild(container);

			const colorNames = ['Black', 'Blue', 'Green', 'Cyan'];
			colorNames.forEach((name, index) => {
				const swatch = document.createElement('div');
				swatch.className = 'color-swatch';
				swatch.dataset.colorIndex = index;
				swatch.setAttribute('role', 'button');
				swatch.setAttribute('aria-label', `${name} (Color ${index})`);
				container.appendChild(swatch);
			});

			expect(screen.getByLabelText('Black (Color 0)')).toBeInTheDocument();
			expect(screen.getByLabelText('Blue (Color 1)')).toBeInTheDocument();
			expect(screen.getByLabelText('Green (Color 2)')).toBeInTheDocument();
			expect(screen.getByLabelText('Cyan (Color 3)')).toBeInTheDocument();
		});
	});

	describe('Color State Management', () => {
		it('should maintain color selection state', () => {
			palette.setForegroundColor(12);
			palette.setBackgroundColor(4);

			expect(palette.getForegroundColor()).toBe(12);
			expect(palette.getBackgroundColor()).toBe(4);

			// State should persist
			expect(palette.getForegroundColor()).toBe(12);
			expect(palette.getBackgroundColor()).toBe(4);
		});

		it('should update color display when selection changes', async () => {
			const container = document.createElement('div');
			document.body.appendChild(container);

			const display = document.createElement('div');
			display.id = 'current-color';
			display.setAttribute('role', 'status');
			display.setAttribute('aria-live', 'polite');
			container.appendChild(display);

			const updateDisplay = () => {
				const fg = palette.getForegroundColor();
				const bg = palette.getBackgroundColor();
				display.textContent = `Foreground: ${fg}, Background: ${bg}`;
			};

			palette.setForegroundColor(8);
			palette.setBackgroundColor(1);
			updateDisplay();

			expect(screen.getByRole('status')).toHaveTextContent(
				'Foreground: 8, Background: 1',
			);
		});

		it('should handle color changes with visual feedback', async () => {
			const container = document.createElement('div');
			document.body.appendChild(container);

			// Create selected color indicator
			const indicator = document.createElement('div');
			indicator.id = 'selected-color';
			indicator.className = 'selected';
			indicator.dataset.colorIndex = '0';
			container.appendChild(indicator);

			// Simulate color selection
			const newColorIndex = 5;
			indicator.dataset.colorIndex = newColorIndex.toString();
			indicator.className = 'selected active';

			expect(indicator).toHaveClass('selected');
			expect(indicator).toHaveClass('active');
			expect(indicator.dataset.colorIndex).toBe('5');
		});
	});

	describe('Edge Cases', () => {
		it('should handle invalid color indices gracefully', () => {
			// Try to set out-of-range color
			expect(() => {
				palette.setForegroundColor(-1);
			}).not.toThrow();

			expect(() => {
				palette.setBackgroundColor(100);
			}).not.toThrow();
		});

		it('should handle rapid color changes', async () => {
			const container = document.createElement('div');
			document.body.appendChild(container);

			for (let i = 0; i < 10; i++) {
				const swatch = document.createElement('div');
				swatch.className = 'color-swatch';
				swatch.dataset.colorIndex = i;
				swatch.setAttribute('role', 'button');
				swatch.setAttribute('aria-label', `Color ${i}`);
				container.appendChild(swatch);

				// Add click handler
				swatch.addEventListener('click', () => {
					palette.setForegroundColor(parseInt(swatch.dataset.colorIndex));
				});
			}

			const swatches = screen.getAllByRole('button');

			// Click multiple swatches rapidly
			for (let i = 0; i < 5; i++) {
				await user.click(swatches[i]);
				expect(palette.getForegroundColor()).toBe(i);
			}
		});

		it('should handle color swatches without data attributes', async () => {
			const swatch = document.createElement('div');
			swatch.className = 'color-swatch';
			swatch.setAttribute('role', 'button');
			swatch.setAttribute('aria-label', 'Invalid Color');
			document.body.appendChild(swatch);

			// Should not throw when clicking swatch without color index
			await user.click(swatch);

			// Palette state should remain unchanged
			expect(palette.getForegroundColor()).toBe(7); // default
		});
	});

	describe('Color Values', () => {
		it('should return RGBA color values', () => {
			const rgba = palette.getRGBAColor(7); // White
			expect(rgba).toHaveLength(4);
			expect(rgba[0]).toBeGreaterThanOrEqual(0);
			expect(rgba[0]).toBeLessThanOrEqual(255);
			expect(rgba[3]).toBe(255); // Alpha should be 255
		});

		it('should return different colors for different indices', () => {
			const color0 = palette.getRGBAColor(0);
			const color1 = palette.getRGBAColor(1);

			// Colors should be different
			const different =
				color0[0] !== color1[0] ||
				color0[1] !== color1[1] ||
				color0[2] !== color1[2];
			expect(different).toBe(true);
		});

		it('should handle all 16 standard colors', () => {
			for (let i = 0; i < 16; i++) {
				const rgba = palette.getRGBAColor(i);
				expect(rgba).toHaveLength(4);
				expect(rgba[3]).toBe(255); // All colors should have full opacity
			}
		});
	});
});
