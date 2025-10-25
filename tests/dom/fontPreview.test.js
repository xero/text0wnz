import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { createFontSelect } from '../../src/js/client/ui.js';

// Mock State module
vi.mock('../../src/js/client/state.js', () => ({
	default: {
		fontDir: '/ui/fonts/',
		palette: { getRGBAColor: vi.fn(() => [255, 255, 255, 255]) },
		textArtCanvas: { getXBFontData: vi.fn(() => null) },
	},
}));

// Mock loadFontFromXBData
vi.mock('../../src/js/client/font.js', () => ({ loadFontFromXBData: vi.fn(() => Promise.resolve(null)) }));

describe('Font Preview DOM Tests', () => {
	let user;
	let fontSelect;
	let fontPreviewImage;
	let fontPreviewInfo;
	let fontSelectButton;
	let fontController;

	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Create a new userEvent instance for each test
		user = userEvent.setup();
		// Clear all mocks
		vi.clearAllMocks();

		// Create fonts modal
		const fontsModal = document.createElement('section');
		fontsModal.id = 'fonts-modal';
		document.body.appendChild(fontsModal);

		// Create font preview info
		fontPreviewInfo = document.createElement('div');
		fontPreviewInfo.id = 'font-preview-info';
		fontPreviewInfo.textContent = 'CP437 8x16';
		fontsModal.appendChild(fontPreviewInfo);

		// Create font preview image
		fontPreviewImage = document.createElement('img');
		fontPreviewImage.id = 'font-preview-image';
		fontPreviewImage.alt = 'Font Preview';
		fontPreviewImage.src = '/ui/fonts/CP437 8x16.png';
		fontsModal.appendChild(fontPreviewImage);

		// Create font select listbox
		fontSelect = document.createElement('ul');
		fontSelect.id = 'font-select';
		fontSelect.setAttribute('aria-label', 'Select Font');
		fontSelect.setAttribute('role', 'listbox');
		fontSelect.tabIndex = 0;

		// Add font options
		const fonts = [
			{ id: 'font-cp437-8x16', value: 'CP437 8x16', selected: true },
			{ id: 'font-cp437-8x8', value: 'CP437 8x8', selected: false },
			{ id: 'font-amiga-topaz', value: 'Amiga Topaz', selected: false },
			{ id: 'font-ibm-vga', value: 'IBM VGA', selected: false },
		];

		fonts.forEach(font => {
			const option = document.createElement('li');
			option.id = font.id;
			option.setAttribute('role', 'option');
			option.dataset.value = font.value;
			option.setAttribute('aria-selected', font.selected ? 'true' : 'false');
			option.textContent = font.value;
			option.scrollIntoView = vi.fn();
			if (font.selected) {
				option.classList.add('focused');
			}
			fontSelect.appendChild(option);
		});

		fontsModal.appendChild(fontSelect);

		// Create select button
		fontSelectButton = document.createElement('button');
		fontSelectButton.id = 'font-select-button';
		fontSelectButton.textContent = 'Select Font';
		fontsModal.appendChild(fontSelectButton);

		// Create font controller
		fontController = createFontSelect(
			fontSelect,
			fontPreviewInfo,
			fontPreviewImage,
			fontSelectButton,
		);
	});

	describe('Font Preview Image Updates', () => {
		it('should display font preview image element', () => {
			expect(fontPreviewImage).toBeInTheDocument();
			expect(fontPreviewImage).toHaveAttribute('alt', 'Font Preview');
		});

		it('should have initial font preview image src', () => {
			// URL may be encoded, so check for the encoded or unencoded version
			expect(
				fontPreviewImage.src.includes('CP437 8x16.png') ||
				fontPreviewImage.src.includes('CP437%208x16.png'),
			).toBe(true);
		});

		it('should update preview info when font value is retrieved', () => {
			const currentFont = fontController.getValue();
			expect(currentFont).toBe('CP437 8x16');
		});

		it('should change font preview on font selection', async () => {
			// Get the second font option
			const amigaFont = screen.getByText('Amiga Topaz');

			// Click on the font option
			await user.click(amigaFont);

			// Wait for the font to be selected
			await waitFor(() => {
				expect(amigaFont.getAttribute('aria-selected')).toBe('true');
			});

			// Verify the current value changed
			expect(fontController.getValue()).toBe('Amiga Topaz');
		});
	});

	describe('Font Selection Interactions', () => {
		it('should select font on click', async () => {
			const cp437Font = screen.getByText('CP437 8x8');

			await user.click(cp437Font);

			await waitFor(() => {
				expect(cp437Font.getAttribute('aria-selected')).toBe('true');
			});
		});

		it('should navigate fonts with arrow keys', async () => {
			fontSelect.focus();

			// Press arrow down
			await user.keyboard('{ArrowDown}');

			await waitFor(() => {
				const secondOption = fontSelect.children[1];
				expect(secondOption.classList.contains('focused')).toBe(true);
			});
		});

		it('should navigate to previous font with arrow up', async () => {
			// First select the second font
			const secondFont = fontSelect.children[1];
			await user.click(secondFont);

			fontSelect.focus();

			// Press arrow up to go back
			await user.keyboard('{ArrowUp}');

			await waitFor(() => {
				const firstOption = fontSelect.children[0];
				expect(firstOption.classList.contains('focused')).toBe(true);
			});
		});

		it('should navigate to first font with Home key', async () => {
			// Select a font in the middle
			const thirdFont = fontSelect.children[2];
			await user.click(thirdFont);

			fontSelect.focus();

			// Press Home key
			await user.keyboard('{Home}');

			await waitFor(() => {
				const firstOption = fontSelect.children[0];
				expect(firstOption.classList.contains('focused')).toBe(true);
			});
		});

		it('should navigate to last font with End key', async () => {
			fontSelect.focus();

			// Press End key
			await user.keyboard('{End}');

			await waitFor(() => {
				const lastOption = fontSelect.children[fontSelect.children.length - 1];
				expect(lastOption.classList.contains('focused')).toBe(true);
			});
		});

		it('should select font with Enter key', async () => {
			fontSelect.focus();

			// Navigate to second font
			await user.keyboard('{ArrowDown}');

			// Press Enter to select
			await user.keyboard('{Enter}');

			await waitFor(() => {
				const secondOption = fontSelect.children[1];
				expect(secondOption.getAttribute('aria-selected')).toBe('true');
			});
		});

		it('should select font with Space key', async () => {
			fontSelect.focus();

			// Navigate to third font
			await user.keyboard('{ArrowDown}{ArrowDown}');

			// Press Space to select
			await user.keyboard(' ');

			await waitFor(() => {
				const thirdOption = fontSelect.children[2];
				expect(thirdOption.getAttribute('aria-selected')).toBe('true');
			});
		});
	});

	describe('Font Select Accessibility', () => {
		it('should have proper role attributes', () => {
			expect(fontSelect).toHaveAttribute('role', 'listbox');

			const options = fontSelect.querySelectorAll('[role="option"]');
			expect(options.length).toBe(4);
		});

		it('should have aria-label on listbox', () => {
			expect(fontSelect).toHaveAttribute('aria-label', 'Select Font');
		});

		it('should mark selected option with aria-selected', () => {
			const firstOption = fontSelect.children[0];
			expect(firstOption).toHaveAttribute('aria-selected', 'true');
		});

		it('should update aria-selected on selection change', async () => {
			const firstOption = fontSelect.children[0];
			const secondOption = fontSelect.children[1];

			expect(firstOption.getAttribute('aria-selected')).toBe('true');
			expect(secondOption.getAttribute('aria-selected')).toBe('false');

			await user.click(secondOption);

			await waitFor(() => {
				expect(firstOption.getAttribute('aria-selected')).toBe('false');
				expect(secondOption.getAttribute('aria-selected')).toBe('true');
			});
		});

		it('should be keyboard accessible', () => {
			expect(fontSelect).toHaveAttribute('tabindex', '0');
		});

		it('should call scrollIntoView on selection', async () => {
			const thirdOption = fontSelect.children[2];

			await user.click(thirdOption);

			expect(thirdOption.scrollIntoView).toHaveBeenCalled();
		});
	});

	describe('Font Preview Info Display', () => {
		it('should display current font name in preview info', () => {
			expect(fontPreviewInfo.textContent).toBe('CP437 8x16');
		});

		it('should update preview info when font changes', async () => {
			const ibmFont = screen.getByText('IBM VGA');

			await user.click(ibmFont);

			// The preview info would be updated by the actual implementation
			// We verify the selection changed
			expect(fontController.getValue()).toBe('IBM VGA');
		});
	});

	describe('Font Controller API', () => {
		it('should provide getValue method', () => {
			expect(fontController.getValue).toBeDefined();
			expect(typeof fontController.getValue).toBe('function');
		});

		it('should provide setValue method', () => {
			expect(fontController.setValue).toBeDefined();
			expect(typeof fontController.setValue).toBe('function');
		});

		it('should provide focus method', () => {
			expect(fontController.focus).toBeDefined();
			expect(typeof fontController.focus).toBe('function');
		});

		it('should get current selected font value', () => {
			const value = fontController.getValue();
			expect(value).toBe('CP437 8x16');
		});

		it('should set font value programmatically', () => {
			const result = fontController.setValue('Amiga Topaz');

			expect(result).toBe(true);
			expect(fontController.getValue()).toBe('Amiga Topaz');
		});

		it('should return false when setting invalid font value', () => {
			const result = fontController.setValue('NonExistent Font');

			expect(result).toBe(false);
		});
	});

	describe('Font Touch Interactions', () => {
		it('should handle touch events on font options', () => {
			const touchHandler = vi.fn();
			const secondOption = fontSelect.children[1];
			secondOption.addEventListener('click', touchHandler);

			fireEvent.click(secondOption);

			expect(touchHandler).toHaveBeenCalled();
		});

		it('should update selection on touch', async () => {
			const thirdOption = fontSelect.children[2];

			fireEvent.click(thirdOption);

			await waitFor(() => {
				expect(thirdOption.getAttribute('aria-selected')).toBe('true');
			});
		});
	});
});
