import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { createFontSelect } from '../../src/js/client/ui.js';

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		fontDir: '/ui/fonts/',
		palette: { getRGBAColor: vi.fn(() => [255, 255, 255, 255]) },
		textArtCanvas: { getXBFontData: vi.fn(() => null) },
	},
}));

vi.mock('../../src/js/client/font.js', () => ({ loadFontFromXBData: vi.fn(() => Promise.resolve(null)) }));

describe('Font Preview DOM Tests', () => {
	let user;
	let fontSelect;
	let fontPreviewImage;
	let fontPreviewInfo;
	let fontSelectButton;
	let fontController;

	// jsdom never loads images, so tests that need a preview to land
	// fire load and error themselves
	const stubImages = () => {
		const images = [];
		vi.stubGlobal(
			'Image',
			class {
				constructor() {
					images.push(this);
				}
			},
		);
		return images;
	};

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	beforeEach(() => {
		document.body.innerHTML = '';
		user = userEvent.setup();
		vi.clearAllMocks();

		const fontsModal = document.createElement('section');
		fontsModal.id = 'fonts-modal';
		document.body.appendChild(fontsModal);

		fontPreviewInfo = document.createElement('div');
		fontPreviewInfo.id = 'font-preview-info';
		fontPreviewInfo.textContent = 'CP437 8x16';
		fontsModal.appendChild(fontPreviewInfo);

		fontPreviewImage = document.createElement('img');
		fontPreviewImage.id = 'font-preview-image';
		fontPreviewImage.alt = 'Font Preview';
		fontPreviewImage.src = '/ui/fonts/CP437 8x16.png';
		fontsModal.appendChild(fontPreviewImage);

		fontSelect = document.createElement('ul');
		fontSelect.id = 'font-select';
		fontSelect.setAttribute('aria-label', 'Select Font');
		fontSelect.setAttribute('role', 'listbox');
		fontSelect.tabIndex = 0;

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

		fontSelectButton = document.createElement('button');
		fontSelectButton.id = 'font-select-button';
		fontSelectButton.textContent = 'Select Font';
		fontsModal.appendChild(fontSelectButton);

		fontController = createFontSelect(
			fontSelect,
			fontPreviewInfo,
			fontPreviewImage,
			fontSelectButton,
		);
	});

	describe('Font Preview Image Updates', () => {
		it('should preview the selected font as soon as the list is built', () => {
			fontPreviewInfo.textContent = '';
			const images = stubImages();
			createFontSelect(
				fontSelect,
				fontPreviewInfo,
				fontPreviewImage,
				fontSelectButton,
			);
			const preview = images.at(-1);
			expect(preview.src).toBe('/ui/fonts/CP437 8x16.png');
			preview.onload();
			expect(fontPreviewInfo.textContent).toBe('CP437 8x16');
		});

		it('should change font preview on font selection', async () => {
			const images = stubImages();
			await user.click(screen.getByText('Amiga Topaz'));
			// the old preview stays up until the new image loads
			expect(fontPreviewImage.getAttribute('src')).toBe(
				'/ui/fonts/CP437 8x16.png',
			);
			images.at(-1).onload();
			expect(fontPreviewImage.getAttribute('src')).toBe(
				'/ui/fonts/Amiga Topaz.png',
			);
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

			await user.keyboard('{ArrowDown}');

			await waitFor(() => {
				const secondOption = fontSelect.children[1];
				expect(secondOption.classList.contains('focused')).toBe(true);
			});
		});

		it('should navigate to previous font with arrow up', async () => {
			const secondFont = fontSelect.children[1];
			await user.click(secondFont);

			fontSelect.focus();

			await user.keyboard('{ArrowUp}');

			await waitFor(() => {
				const firstOption = fontSelect.children[0];
				expect(firstOption.classList.contains('focused')).toBe(true);
			});
		});

		it('should navigate to first font with Home key', async () => {
			const thirdFont = fontSelect.children[2];
			await user.click(thirdFont);

			fontSelect.focus();

			await user.keyboard('{Home}');

			await waitFor(() => {
				const firstOption = fontSelect.children[0];
				expect(firstOption.classList.contains('focused')).toBe(true);
			});
		});

		it('should navigate to last font with End key', async () => {
			fontSelect.focus();

			await user.keyboard('{End}');

			await waitFor(() => {
				const lastOption = fontSelect.children[fontSelect.children.length - 1];
				expect(lastOption.classList.contains('focused')).toBe(true);
			});
		});

		it('should apply the highlighted font with Enter', async () => {
			const apply = vi.fn();
			fontSelectButton.addEventListener('click', apply);
			fontSelect.focus();

			await user.keyboard('{ArrowDown}');
			expect(apply).not.toHaveBeenCalled();

			await user.keyboard('{Enter}');
			expect(apply).toHaveBeenCalledTimes(1);
			expect(fontController.getValue()).toBe('CP437 8x8');
		});

		it('should apply the highlighted font with Space', async () => {
			const apply = vi.fn();
			fontSelectButton.addEventListener('click', apply);
			fontSelect.focus();

			await user.keyboard('{ArrowDown}{ArrowDown}');
			expect(apply).not.toHaveBeenCalled();

			await user.keyboard(' ');
			expect(apply).toHaveBeenCalledTimes(1);
			expect(fontController.getValue()).toBe('Amiga Topaz');
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

		it('should highlight the selected font only while the list has focus', async () => {
			const highlighted = () =>
				[...fontSelect.children].filter(opt =>
					opt.classList.contains('focused'));
			fontSelect.focus();
			await user.keyboard('{ArrowDown}');

			await user.tab();
			expect(highlighted()).toEqual([]);

			await user.tab({ shift: true });
			expect(highlighted()).toEqual([fontSelect.children[1]]);
		});

		it('should call scrollIntoView on selection', async () => {
			const thirdOption = fontSelect.children[2];

			await user.click(thirdOption);

			expect(thirdOption.scrollIntoView).toHaveBeenCalled();
		});
	});

	describe('Font Preview Info Display', () => {
		it('should update preview info when font changes', async () => {
			const images = stubImages();
			await user.click(screen.getByText('IBM VGA'));
			const preview = images.at(-1);
			expect(preview.src).toBe('/ui/fonts/IBM VGA.png');
			expect(fontPreviewInfo.textContent).toBe('CP437 8x16');
			preview.onload();
			expect(fontPreviewInfo.textContent).toBe('IBM VGA');
			expect(fontPreviewImage.getAttribute('src')).toBe('/ui/fonts/IBM VGA.png');
		});

		it('should mark a missing font in preview info', async () => {
			const images = stubImages();
			await user.click(screen.getByText('Amiga Topaz'));
			const preview = images.at(-1);
			preview.onerror();
			expect(fontPreviewInfo.textContent).toBe('Amiga Topaz (not found)');
			expect(preview.src).toBe('/ui/fonts/missing.png');
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
});
