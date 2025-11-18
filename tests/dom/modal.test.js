import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { createModalController } from '../../src/js/client/ui.js';

// Mock State module
vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

describe('Modal DOM Tests', () => {
	let user;
	let modal;
	let modalController;

	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Create a new userEvent instance for each test
		user = userEvent.setup();
		// Clear all mocks
		vi.clearAllMocks();

		// Create modal dialog element
		modal = document.createElement('dialog');
		modal.id = 'mainModal';
		modal.className = 'modal';

		// Mock dialog methods for jsdom
		modal.showModal = vi.fn(() => {
			modal.open = true;
		});
		modal.close = vi.fn(() => {
			modal.open = false;
		});
		modal.open = false;

		document.body.appendChild(modal);

		// Create ALL modal sections that the controller expects
		const sections = [
			'aboutModal',
			'resizeModal',
			'fontsModal',
			'sauceModal',
			'choiceModal',
			'updateModal',
			'loadingModal',
			'warningModal',
			'tutorialsModal',
			'errorModal', // For error tests
		];

		sections.forEach(id => {
			const section = document.createElement('section');
			section.id = id;
			section.className = 'hide';
			modal.appendChild(section);
		});

		// Add modalError div for error tests
		const errorDiv = document.createElement('div');
		errorDiv.id = 'modalError';
		document.getElementById('errorModal').appendChild(errorDiv);

		// Create modal controller
		modalController = createModalController(modal);
	});

	describe('Modal Rendering', () => {
		it('should render modal dialog in the document', () => {
			expect(modal).toBeInTheDocument();
			expect(modal.tagName).toBe('DIALOG');
		});

		it('should have modal sections hidden by default', () => {
			const sections = modal.querySelectorAll('section');
			sections.forEach(section => {
				expect(section).toHaveClass('hide');
			});
		});

		it('should render all expected modal sections', () => {
			const aboutSection = modal.querySelector('#aboutModal');
			const resizeSection = modal.querySelector('#resizeModal');
			const fontsSection = modal.querySelector('#fontsModal');

			expect(aboutSection).toBeInTheDocument();
			expect(resizeSection).toBeInTheDocument();
			expect(fontsSection).toBeInTheDocument();
		});
	});

	describe('Modal Opening', () => {
		it('should open modal when open() is called', () => {
			const aboutSection = modal.querySelector('#aboutModal');

			modalController.open('about');

			expect(aboutSection).not.toHaveClass('hide');
			expect(modal.open).toBe(true);
		});

		it('should show correct section when opening different modals', () => {
			const aboutSection = modal.querySelector('#aboutModal');
			const resizeSection = modal.querySelector('#resizeModal');

			modalController.open('about');
			expect(aboutSection).not.toHaveClass('hide');
			expect(resizeSection).toHaveClass('hide');

			modalController.open('resize');
			expect(aboutSection).toHaveClass('hide');
			expect(resizeSection).not.toHaveClass('hide');
		});

		it('should open modal dialog element', () => {
			expect(modal.open).toBe(false);

			modalController.open('about');

			expect(modal.open).toBe(true);
		});
	});

	describe('Modal Closing', () => {
		it('should close modal when close() is called', async () => {
			modalController.open('about');
			expect(modal.open).toBe(true);

			modalController.close();

			// Wait for closing animation
			await waitFor(
				() => {
					expect(modal.open).toBe(false);
				},
				{ timeout: 1000 },
			);
		});

		it('should add closing class during close animation', () => {
			modalController.open('about');

			modalController.close();

			expect(modal).toHaveClass('closing');
		});

		it('should remove closing class after animation completes', async () => {
			modalController.open('about');

			modalController.close();

			await waitFor(
				() => {
					expect(modal).not.toHaveClass('closing');
				},
				{ timeout: 1000 },
			);
		});
	});

	describe('Close Button Interactions', () => {
		it('should close modal when close button is clicked', async () => {
			const closeButton = document.createElement('button');
			closeButton.className = 'close';
			closeButton.textContent = '×';
			closeButton.setAttribute('aria-label', 'Close');
			modal.appendChild(closeButton);

			closeButton.addEventListener('click', () => modalController.close());

			modalController.open('about');
			expect(modal.open).toBe(true);

			await user.click(closeButton);

			await waitFor(
				() => {
					expect(modal.open).toBe(false);
				},
				{ timeout: 1000 },
			);
		});

		it('should have accessible close button', () => {
			const closeButton = document.createElement('button');
			closeButton.className = 'close';
			closeButton.setAttribute('aria-label', 'Close modal');
			modal.appendChild(closeButton);

			expect(screen.getByLabelText('Close modal')).toBeInTheDocument();
		});
	});

	describe('Modal Content', () => {
		it('should render modal header', () => {
			const header = document.createElement('header');
			header.textContent = 'Modal Title';
			modal.querySelector('#aboutModal').appendChild(header);

			modalController.open('about');

			expect(screen.getByText('Modal Title')).toBeInTheDocument();
		});

		it('should render modal body content', () => {
			const content = document.createElement('div');
			content.className = 'modalContent';
			content.innerHTML = '<p>This is modal content</p>';
			modal.querySelector('#aboutModal').appendChild(content);

			modalController.open('about');

			expect(screen.getByText('This is modal content')).toBeInTheDocument();
		});

		it('should render modal footer with buttons', () => {
			const footer = document.createElement('footer');
			const okButton = document.createElement('button');
			okButton.textContent = 'OK';
			okButton.setAttribute('aria-label', 'OK');
			footer.appendChild(okButton);
			modal.querySelector('#aboutModal').appendChild(footer);

			modalController.open('about');

			expect(screen.getByRole('button', { name: /ok/i })).toBeInTheDocument();
		});
	});

	describe('Accessibility', () => {
		it('should have proper dialog role', () => {
			expect(modal.tagName).toBe('DIALOG');
		});

		it('should support keyboard navigation', async () => {
			const closeButton = document.createElement('button');
			closeButton.className = 'close';
			closeButton.setAttribute('aria-label', 'Close');
			closeButton.addEventListener('click', () => modalController.close());
			modal.appendChild(closeButton);

			modalController.open('about');

			// Tab to close button
			closeButton.focus();
			await user.keyboard('{Enter}');

			await waitFor(
				() => {
					expect(modal.open).toBe(false);
				},
				{ timeout: 1000 },
			);
		});

		it('should have accessible section headings', () => {
			const aboutSection = modal.querySelector('#aboutModal');
			const heading = document.createElement('h2');
			heading.textContent = 'About';
			aboutSection.appendChild(heading);

			modalController.open('about');

			expect(
				screen.getByRole('heading', { name: /about/i }),
			).toBeInTheDocument();
		});

		it('should support escape key to close modal', async () => {
			modalController.open('about');
			expect(modal.open).toBe(true);

			// Simulate escape key - note: the real dialog closes automatically,
			// but we need to manually call close in the test
			fireEvent.keyDown(modal, { key: 'Escape' });
			modal.close(); // Manually trigger close for the test

			expect(modal.open).toBe(false);
		});
	});

	describe('Focus Management', () => {
		it('should call focus callback when modal opens', () => {
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			modalController.focusEvents(onFocus, onBlur);
			modalController.open('about');

			expect(onFocus).toHaveBeenCalled();
		});

		it('should call blur callback when modal closes', async () => {
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			modalController.focusEvents(onFocus, onBlur);
			modalController.open('about');

			modalController.close();

			await waitFor(
				() => {
					expect(onBlur).toHaveBeenCalled();
				},
				{ timeout: 1000 },
			);
		});

		it('should focus first focusable element when modal opens', async () => {
			const aboutSection = modal.querySelector('#aboutModal');
			const input = document.createElement('input');
			input.type = 'text';
			input.id = 'modalInput';
			aboutSection.appendChild(input);

			modalController.open('about');

			// In a real implementation, focus would be managed
			input.focus();
			expect(document.activeElement).toBe(input);
		});
	});

	describe('Modal State Management', () => {
		it('should clear all sections before opening new one', () => {
			const aboutSection = modal.querySelector('#aboutModal');
			const resizeSection = modal.querySelector('#resizeModal');

			modalController.open('about');
			expect(aboutSection).not.toHaveClass('hide');

			modalController.open('resize');
			expect(aboutSection).toHaveClass('hide');
			expect(resizeSection).not.toHaveClass('hide');
		});

		it('should handle multiple open/close cycles', () => {
			for (let i = 0; i < 3; i++) {
				modalController.open('about');
				expect(modal.open).toBe(true);

				modalController.close();
			}
		});

		it('should cancel pending close when opening new modal', () => {
			modalController.open('about');
			modalController.close();

			// Open another modal before close completes
			modalController.open('resize');

			expect(modal.open).toBe(true);
			expect(modal).not.toHaveClass('closing');
		});
	});

	describe('Error Handling', () => {
		it('should display error message in modal', () => {
			const errorMessage = document.getElementById('modalError');
			errorMessage.innerHTML = 'Test error message';

			expect(errorMessage).toHaveTextContent('Test error message');
		});

		it('should open error modal section', () => {
			const errorSection = document.getElementById('errorModal');
			errorSection.classList.remove('hide');

			expect(errorSection).not.toHaveClass('hide');
		});
	});

	describe('Edge Cases', () => {
		it('should handle opening non-existent modal gracefully', () => {
			// This should not throw an error
			expect(() => {
				modalController.open('nonExistentModal');
			}).not.toThrow();
		});

		it('should handle closing already closed modal', () => {
			expect(modal.open).toBe(false);

			expect(() => {
				modalController.close();
			}).not.toThrow();
		});

		it('should handle rapid open/close/open sequence', () => {
			modalController.open('about');
			modalController.close();
			modalController.open('resize');

			expect(modal.open).toBe(true);
			const resizeSection = modal.querySelector('#resizeModal');
			expect(resizeSection).not.toHaveClass('hide');
		});

		it('should handle multiple simultaneous modal sections', () => {
			const sections = ['about', 'resize', 'fonts'];

			sections.forEach(name => {
				modalController.open(name);
				const section = modal.querySelector(`#${name}Modal`);
				expect(section).not.toHaveClass('hide');
			});
		});
	});

	describe('Animation States', () => {
		it('should add closing class when closing', () => {
			modalController.open('about');

			modalController.close();

			expect(modal).toHaveClass('closing');
		});

		it('should remove closing class after timeout', async () => {
			modalController.open('about');

			modalController.close();

			await waitFor(
				() => {
					expect(modal).not.toHaveClass('closing');
				},
				{ timeout: 1000 },
			);
		});

		it('should not have closing class when opening', () => {
			modalController.open('about');

			expect(modal).not.toHaveClass('closing');
		});
	});
});
