import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAsciiBrushController } from '../../src/js/client/asciiBrush.js';

const drawCalls = [];

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		palette: {
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
		},
		textArtCanvas: {
			startUndo: vi.fn(),
			draw: vi.fn(callback => {
				callback((charCode, fg, bg, x, y) => {
					drawCalls.push({ charCode, fg, bg, x, y });
				});
			}),
			getBlock: vi.fn(() => ({
				charCode: 65,
				foregroundColor: 7,
				backgroundColor: 4,
			})),
			getColumns: vi.fn(() => 80),
			getRows: vi.fn(() => 25),
		},
		positionInfo: { update: vi.fn() },
	},
}));

vi.mock('../../src/js/client/ui.js', () => ({
	$: vi.fn(() => ({
		style: { display: 'none' },
		classList: { add: vi.fn(), remove: vi.fn() },
	})),
}));

import State from '../../src/js/client/state.js';

const fire = (name, detail) =>
	document.dispatchEvent(new CustomEvent(name, { detail }));

describe('createAsciiBrushController', () => {
	let controller;

	beforeEach(() => {
		drawCalls.length = 0;
		vi.clearAllMocks();
		controller = createAsciiBrushController();
		controller.enable();
	});

	afterEach(() => {
		controller.disable();
	});

	it('starts an undo group and stamps $ on pointer down', () => {
		fire('onTextCanvasDown', { x: 5, y: 5, halfBlockY: 10 });
		expect(State.textArtCanvas.startUndo).toHaveBeenCalledTimes(1);
		expect(drawCalls).toEqual([{ charCode: 36, fg: 7, bg: 4, x: 5, y: 5 }]);
	});

	it('preserves the existing cell background', () => {
		State.textArtCanvas.getBlock.mockReturnValue({
			charCode: 32,
			foregroundColor: 15,
			backgroundColor: 1,
		});
		fire('onTextCanvasDown', { x: 0, y: 0, halfBlockY: 0 });
		expect(drawCalls[0].bg).toBe(1);
	});

	it('interpolates a continuous path across a fast drag', () => {
		fire('onTextCanvasDown', { x: 0, y: 0, halfBlockY: 0 });
		fire('onTextCanvasDrag', { x: 4, y: 4, halfBlockY: 8 });
		const cells = drawCalls.map(c => [c.x, c.y]);
		expect(cells).toEqual([
			[0, 0],
			[1, 1],
			[2, 2],
			[3, 3],
			[4, 4],
		]);
	});

	it('does not restamp the previous cell on adjacent drags', () => {
		fire('onTextCanvasDown', { x: 3, y: 3, halfBlockY: 6 });
		fire('onTextCanvasDrag', { x: 4, y: 3, halfBlockY: 6 });
		expect(drawCalls).toHaveLength(2);
		expect(drawCalls[1]).toMatchObject({ x: 4, y: 3 });
	});

	it('ignores drags that stay in the same cell', () => {
		fire('onTextCanvasDown', { x: 3, y: 3, halfBlockY: 6 });
		fire('onTextCanvasDrag', { x: 3, y: 3, halfBlockY: 7 });
		expect(drawCalls).toHaveLength(1);
	});

	it('resets the stroke on pointer up', () => {
		fire('onTextCanvasDown', { x: 0, y: 0, halfBlockY: 0 });
		fire('onTextCanvasUp', {});
		fire('onTextCanvasDown', { x: 10, y: 0, halfBlockY: 0 });
		// no interpolation between strokes
		expect(drawCalls).toHaveLength(2);
		expect(State.textArtCanvas.startUndo).toHaveBeenCalledTimes(2);
	});

	it('stops listening when disabled', () => {
		controller.disable();
		fire('onTextCanvasDown', { x: 1, y: 1, halfBlockY: 2 });
		expect(drawCalls).toHaveLength(0);
		controller.enable();
	});
});
