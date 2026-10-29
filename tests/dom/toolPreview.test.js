import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createToolPreview } from '../../src/js/client/ui.js';

// mutable so tests can simulate a zoom (scale factor) change
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
			getMirrorMode: vi.fn(() => false),
			getMirrorX: vi.fn(x => 79 - x),
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

		// Zoom dispatches only onScaleFactorChange; a preview that misses it
		// keeps stale metrics and draws shape previews in the wrong place
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

	it('ghosts the reflected half in mirror mode (every shape tool at once)', async () => {
		const State = (await import('../../src/js/client/state.js')).default;
		State.textArtCanvas.getMirrorMode.mockReturnValue(true);
		State.font.drawWithAlpha.mockClear();
		preview.drawHalfBlock(7, 10, 10);
		const columns = State.font.drawWithAlpha.mock.calls.map(call => call[3]);
		expect(columns).toEqual([10, 69]); // x and its reflection
		// a self-mirroring column (odd-width center) draws exactly once
		State.font.drawWithAlpha.mockClear();
		State.textArtCanvas.getMirrorX.mockReturnValueOnce(10);
		preview.drawHalfBlock(7, 10, 10);
		expect(State.font.drawWithAlpha).toHaveBeenCalledTimes(1);
		State.textArtCanvas.getMirrorMode.mockReturnValue(false);
	});

	it('should clear drawn chunks without removing them', () => {
		preview.drawHalfBlock(7, 10, 10);
		preview.drawHalfBlock(7, 10, 90);
		expect(el.querySelectorAll('canvas').length).toBe(2);
		preview.clear();
		expect(el.querySelectorAll('canvas').length).toBe(2);
	});
});
