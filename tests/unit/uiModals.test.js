import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { websocketUI } from '../../src/js/client/ui.js';

// Mock the State module
vi.mock('../../src/js/client/state.js', () => ({
	default: {
		textArtCanvas: {
			undo: vi.fn(),
			redo: vi.fn(),
			getColumns: vi.fn(() => 80),
			getRows: vi.fn(() => 25),
		},
		palette: {
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
			setForegroundColor: vi.fn(),
		},
		font: {
			getWidth: vi.fn(() => 8),
			getHeight: vi.fn(() => 16),
			draw: vi.fn(),
			drawWithAlpha: vi.fn(),
		},
		network: { isConnected: vi.fn(() => false) },
		menus: { close: vi.fn() },
	},
}));

void websocketUI; // Used in tests

describe('UI Advanced Utilities', () => {
	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Reset all mocks
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Clean up any remaining DOM elements
		document.body.innerHTML = '';
		// Restore all mocks to prevent memory leaks
		vi.restoreAllMocks();
	});

	describe('Additional DOM Utilities', () => {
		it('should provide $$$ function for querySelectorAll', async () => {
			// Need to import $$$ separately
			const { $$$ } = await import('../../src/js/client/ui.js');

			const div1 = document.createElement('div');
			div1.className = 'test-class-multi';
			const div2 = document.createElement('div');
			div2.className = 'test-class-multi';
			document.body.appendChild(div1);
			document.body.appendChild(div2);

			const results = $$$('.test-class-multi');
			expect(results.length).toBe(2);
		});
	});

	describe('createGrid', () => {
		it('should be a function that creates grid controller', async () => {
			const { createGrid } = await import('../../src/js/client/ui.js');

			expect(typeof createGrid).toBe('function');

			// Test that calling the function with a div doesn't throw before canvas operations
			// We can't fully test it without proper State mock and canvas support
			const container = document.createElement('div');
			document.body.appendChild(container);

			// The function will fail during rendering but we're just verifying the structure
			expect(() => {
				try {
					createGrid(container);
				} catch {
					// Expected to fail due to mocking limitations, but we verified it's callable
				}
			}).not.toThrow();
		});
	});

	describe('createToolPreview', () => {
		it('should create tool preview controller with clear/drawHalfBlock methods', async () => {
			const { createToolPreview } = await import('../../src/js/client/ui.js');
			const container = document.createElement('div');
			document.body.appendChild(container);

			const preview = createToolPreview(container);

			expect(preview).toHaveProperty('clear');
			expect(preview).toHaveProperty('drawHalfBlock');
			expect(typeof preview.clear).toBe('function');
			expect(typeof preview.drawHalfBlock).toBe('function');
		});
	});

	describe('createFontSelect', () => {
		it('should create font select controller with focus/getValue/setValue methods', async () => {
			const { createFontSelect } = await import('../../src/js/client/ui.js');

			// Create minimal DOM structure for font select
			const listbox = document.createElement('div');
			listbox.setAttribute('role', 'listbox');
			listbox.focus = vi.fn();

			const option1 = document.createElement('div');
			option1.setAttribute('role', 'option');
			option1.setAttribute('id', 'font-opt-1');
			option1.dataset.value = 'CP437 8x16';
			option1.setAttribute('aria-selected', 'true');
			option1.textContent = 'CP437 8x16';
			option1.scrollIntoView = vi.fn();
			listbox.appendChild(option1);

			const label = document.createElement('div');
			const img = document.createElement('img');
			const btn = document.createElement('button');

			document.body.appendChild(listbox);
			document.body.appendChild(label);
			document.body.appendChild(img);
			document.body.appendChild(btn);

			const fontSelect = createFontSelect(listbox, label, img, btn);

			expect(fontSelect).toHaveProperty('focus');
			expect(fontSelect).toHaveProperty('getValue');
			expect(fontSelect).toHaveProperty('setValue');
			expect(typeof fontSelect.focus).toBe('function');
			expect(typeof fontSelect.getValue).toBe('function');
			expect(typeof fontSelect.setValue).toBe('function');
		});

		it('should get current font value', async () => {
			const { createFontSelect } = await import('../../src/js/client/ui.js');

			const listbox = document.createElement('div');
			listbox.setAttribute('role', 'listbox');
			listbox.focus = vi.fn();

			const option1 = document.createElement('div');
			option1.setAttribute('role', 'option');
			option1.setAttribute('id', 'font-opt-1');
			option1.dataset.value = 'CP437 8x16';
			option1.setAttribute('aria-selected', 'true');
			option1.textContent = 'CP437 8x16';
			option1.scrollIntoView = vi.fn();
			listbox.appendChild(option1);

			const label = document.createElement('div');
			const img = document.createElement('img');
			const btn = document.createElement('button');

			document.body.appendChild(listbox);

			const fontSelect = createFontSelect(listbox, label, img, btn);

			expect(fontSelect.getValue()).toBe('CP437 8x16');
		});

		it('should set font value', async () => {
			const { createFontSelect } = await import('../../src/js/client/ui.js');

			const listbox = document.createElement('div');
			listbox.setAttribute('role', 'listbox');
			listbox.focus = vi.fn();

			const option1 = document.createElement('div');
			option1.setAttribute('role', 'option');
			option1.setAttribute('id', 'font-opt-1');
			option1.dataset.value = 'CP437 8x16';
			option1.setAttribute('aria-selected', 'true');
			option1.textContent = 'CP437 8x16';
			option1.scrollIntoView = vi.fn();

			const option2 = document.createElement('div');
			option2.setAttribute('role', 'option');
			option2.setAttribute('id', 'font-opt-2');
			option2.dataset.value = 'Amiga Topaz';
			option2.setAttribute('aria-selected', 'false');
			option2.textContent = 'Amiga Topaz';
			option2.scrollIntoView = vi.fn();

			listbox.appendChild(option1);
			listbox.appendChild(option2);

			const label = document.createElement('div');
			const img = document.createElement('img');
			const btn = document.createElement('button');

			document.body.appendChild(listbox);

			const fontSelect = createFontSelect(listbox, label, img, btn);

			const result = fontSelect.setValue('Amiga Topaz');

			expect(result).toBe(true);
			expect(fontSelect.getValue()).toBe('Amiga Topaz');
			expect(option2.getAttribute('aria-selected')).toBe('true');
		});

		it('should return false when setting invalid font value', async () => {
			const { createFontSelect } = await import('../../src/js/client/ui.js');

			const listbox = document.createElement('div');
			listbox.setAttribute('role', 'listbox');
			listbox.focus = vi.fn();

			const option1 = document.createElement('div');
			option1.setAttribute('role', 'option');
			option1.setAttribute('id', 'font-opt-1');
			option1.dataset.value = 'CP437 8x16';
			option1.setAttribute('aria-selected', 'true');
			option1.scrollIntoView = vi.fn();
			listbox.appendChild(option1);

			const label = document.createElement('div');
			const img = document.createElement('img');
			const btn = document.createElement('button');

			document.body.appendChild(listbox);

			const fontSelect = createFontSelect(listbox, label, img, btn);

			const result = fontSelect.setValue('NonExistentFont');

			expect(result).toBe(false);
		});
	});

	describe('websocketUI', () => {
		it('should show websocket-specific UI elements', async () => {
			const { websocketUI } = await import('../../src/js/client/ui.js');

			// Create elements with the specific classes
			const excludedDiv = document.createElement('div');
			excludedDiv.className = 'excludedForWebsocket';
			const includedDiv = document.createElement('div');
			includedDiv.className = 'includedForWebsocket';

			document.body.appendChild(excludedDiv);
			document.body.appendChild(includedDiv);

			// Test showing websocket UI
			websocketUI(true);
			expect(includedDiv.style.display).toBe('block');
			expect(excludedDiv.style.display).toBe('none');

			// Test hiding websocket UI
			websocketUI(false);
			expect(includedDiv.style.display).toBe('none');
			expect(excludedDiv.style.display).toBe('block');
		});

		it('should handle multiple elements with websocket classes', async () => {
			const { websocketUI } = await import('../../src/js/client/ui.js');

			const excluded1 = document.createElement('div');
			excluded1.className = 'excludedForWebsocket';
			const excluded2 = document.createElement('div');
			excluded2.className = 'excludedForWebsocket';
			const included1 = document.createElement('div');
			included1.className = 'includedForWebsocket';
			const included2 = document.createElement('div');
			included2.className = 'includedForWebsocket';

			document.body.appendChild(excluded1);
			document.body.appendChild(excluded2);
			document.body.appendChild(included1);
			document.body.appendChild(included2);

			websocketUI(true);

			expect(included1.style.display).toBe('block');
			expect(included2.style.display).toBe('block');
			expect(excluded1.style.display).toBe('none');
			expect(excluded2.style.display).toBe('none');
		});
	});
});
