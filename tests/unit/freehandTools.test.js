import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import State from '../../src/js/client/state.js';
import { createShadingController } from '../../src/js/client/freehandTools.js';

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		palette: { getForegroundColor: vi.fn(() => 7) },
		textArtCanvas: {
			startUndo: vi.fn(),
			draw: vi.fn(callback => {
				const mockCallback = vi.fn();
				callback(mockCallback);
			}),
			getBlock: vi.fn(() => ({
				charCode: 65,
				foregroundColor: 7,
				backgroundColor: 0,
			})),
		},
		positionInfo: { update: vi.fn() },
		toolSettings: { show: vi.fn() },
	},
}));

vi.mock('../../src/js/client/toolbar.js', () => ({
	default: {
		add: vi.fn(() => ({ enable: vi.fn() })),
		returnToPreviousTool: vi.fn(),
	},
}));

vi.mock('../../src/js/client/ui.js', async () =>
	(await import('./uiMock.js')).createUiMock());

// the controller only hooks the document: a stub records the handlers
const mockDocument = {
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
};

vi.stubGlobal('document', mockDocument);

describe('Freehand Tools', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('shading stroke state', () => {
		let mockPanel;

		beforeEach(() => {
			mockPanel = {
				enable: vi.fn(),
				disable: vi.fn(),
				getMode: vi.fn(() => ({
					charCode: 178,
					foreground: 7,
					background: 0,
				})),
				select: vi.fn(),
				ignore: vi.fn(),
				unignore: vi.fn(),
				redrawGlyphs: vi.fn(),
			};
		});

		const capture = name =>
			mockDocument.addEventListener.mock.calls
				.filter(call => call[0] === name)
				.pop()[1];

		it('a half-row wiggle inside one cell advances the ramp once', () => {
			const controller = createShadingController(mockPanel, false);
			controller.enable();
			const down = capture('onTextCanvasDown');
			const drag = capture('onTextCanvasDrag');
			down({ detail: { x: 5, y: 5, halfBlockY: 10 } });
			expect(State.textArtCanvas.draw).toHaveBeenCalledTimes(1);
			// same cell, other half row: the same point
			drag({ detail: { x: 5, y: 5, halfBlockY: 11 } });
			expect(State.textArtCanvas.draw).toHaveBeenCalledTimes(1);
			controller.disable();
		});

		it('a drag with no down paints nothing and never throws', () => {
			const controller = createShadingController(mockPanel, false);
			controller.enable();
			const drag = capture('onTextCanvasDrag');
			// drawMode is undefined here: it must neither throw on
			// drawMode.foreground nor paint with a stale mode
			expect(() => drag({ detail: { x: 3, y: 3, halfBlockY: 6 } })).not.toThrow();
			expect(State.textArtCanvas.draw).not.toHaveBeenCalled();
			controller.disable();
		});

		it('disable() closes the stroke: a re-enabled drag stays inert', () => {
			const controller = createShadingController(mockPanel, false);
			controller.enable();
			const down = capture('onTextCanvasDown');
			down({ detail: { x: 2, y: 2, halfBlockY: 4 } });
			controller.disable();
			controller.enable();
			const drag = capture('onTextCanvasDrag');
			State.textArtCanvas.draw.mockClear();
			drag({ detail: { x: 9, y: 9, halfBlockY: 18 } });
			expect(State.textArtCanvas.draw).not.toHaveBeenCalled();
			controller.disable();
		});
	});
});
