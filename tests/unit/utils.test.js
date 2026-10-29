import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

vi.mock('../../src/js/client/toolbar.js', () => ({ default: {} }));

describe('UI Utilities', () => {
	describe('createCanvas', () => {
		beforeEach(() => {
			vi.stubGlobal('document', {
				createElement: vi.fn(tagName => {
					if (tagName === 'canvas') {
						return {
							width: 0,
							height: 0,
						};
					}
					return {};
				}),
				getElementById: vi.fn(id => ({ id })),
				querySelector: vi.fn(selector => ({ selector })),
				querySelectorAll: vi.fn(selector => [
					{ selector, idx: 0 },
					{ selector, idx: 1 },
				]),
			});
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should create a canvas with specified dimensions', async () => {
			// Import the module after setting up mocks
			const { createCanvas } = await import('../../src/js/client/ui.js');

			const canvas = createCanvas(800, 600);

			expect(document.createElement).toHaveBeenCalledWith('canvas');
			expect(canvas.width).toBe(800);
			expect(canvas.height).toBe(600);
		});

		it('should handle different dimensions', async () => {
			const { createCanvas } = await import('../../src/js/client/ui.js');

			const smallCanvas = createCanvas(100, 50);
			expect(smallCanvas.width).toBe(100);
			expect(smallCanvas.height).toBe(50);

			const largeCanvas = createCanvas(1920, 1080);
			expect(largeCanvas.width).toBe(1920);
			expect(largeCanvas.height).toBe(1080);
		});
	});

	describe('DOM selector utilities', () => {
		beforeEach(() => {
			// ui.js binds the document's selector methods at import, so the
			// stubs need .bind
			vi.stubGlobal('document', {
				getElementById: vi.fn(id => ({ id })),
				querySelector: vi.fn(selector => ({ selector })),
			});
			global.document.getElementById.bind = vi
				.fn()
				.mockReturnValue(global.document.getElementById);
			global.document.querySelector.bind = vi
				.fn()
				.mockReturnValue(global.document.querySelector);
		});

		it('should create shorthand selectors correctly', async () => {
			const { $, $$ } = await import('../../src/js/client/ui.js');

			const element = $('test-id');
			expect(element.id).toBe('test-id');

			const queryElement = $$('.test-class');
			expect(queryElement.selector).toBe('.test-class');
		});
	});
});
