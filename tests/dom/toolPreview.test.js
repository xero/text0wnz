import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createToolPreview } from '../../src/js/client/ui.js';

// Mutable font metrics so tests can simulate a zoom (scale factor) change
const metrics = { width: 8, height: 16 };

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		font: {
			getWidth: () => metrics.width,
			getHeight: () => metrics.height,
			drawWithAlpha: vi.fn(),
		},
		textArtCanvas: {
			getColumns: () => 80,
			getRows: () => 60,
		},
	},
}));

describe('Tool Preview DOM Tests', () => {
	let el;
	let preview;

	beforeEach(() => {
		document.body.innerHTML = '';
		metrics.width = 8;
		metrics.height = 16;
		el = document.createElement('div');
		el.id = 'toolPreview';
		document.body.appendChild(el);
		preview = createToolPreview(el);
	});

	it('should create chunk canvases positioned by the current font metrics', () => {
		// halfBlockY 90 -> text row 45 -> chunk index 1 (rows 25-49)
		preview.drawHalfBlock(7, 10, 90);
		const canvases = el.querySelectorAll('canvas');
		expect(canvases.length).toBe(1);
		expect(canvases[0].style.top).toBe('400px'); // 25 rows * 16px
		expect(canvases[0].width).toBe(640); // 80 cols * 8px
		expect(canvases[0].height).toBe(400);
	});

	it('should rebuild chunk canvases when the scale factor changes', () => {
		preview.drawHalfBlock(7, 10, 90);
		expect(el.querySelectorAll('canvas')[0].style.top).toBe('400px');

		// Zoom to 2x: only onScaleFactorChange is dispatched for this
		// (regression: the preview missed this event and kept stale metrics,
		// drawing a tall circle preview's lower part into the wrong place)
		metrics.width = 16;
		metrics.height = 32;
		document.dispatchEvent(new CustomEvent('onScaleFactorChange', { detail: 2 }));

		expect(el.querySelectorAll('canvas').length).toBe(0); // stale stack dropped
		preview.drawHalfBlock(7, 10, 90);
		const canvases = el.querySelectorAll('canvas');
		expect(canvases.length).toBe(1);
		expect(canvases[0].style.top).toBe('800px'); // 25 rows * 32px
		expect(canvases[0].width).toBe(1280); // 80 cols * 16px
		expect(canvases[0].height).toBe(800);
	});

	it('should clear drawn chunks without removing them', () => {
		preview.drawHalfBlock(7, 10, 10);
		preview.drawHalfBlock(7, 10, 90);
		expect(el.querySelectorAll('canvas').length).toBe(2);
		preview.clear();
		expect(el.querySelectorAll('canvas').length).toBe(2);
	});
});
