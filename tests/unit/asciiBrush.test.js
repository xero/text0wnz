import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	createAsciiBrushController,
	createAsciiStrokePainter,
} from '../../src/js/client/asciiBrush.js';
import { createAsciiStampEngine } from '../../src/js/core/index';

// last write wins, exactly like editor cells inside one undo group
const grid = new Map();
const cellAt = (x, y) => grid.get(`${x},${y}`);

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
					grid.set(`${x},${y}`, { charCode, fg, bg });
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
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		value: '1',
	})),
}));

import State from '../../src/js/client/state.js';

const fire = (name, detail) =>
	document.dispatchEvent(new CustomEvent(name, { detail }));

describe('createAsciiBrushController', () => {
	let controller;

	beforeEach(() => {
		grid.clear();
		vi.clearAllMocks();
		controller = createAsciiBrushController();
		controller.enable();
	});

	afterEach(() => {
		controller.disable();
	});

	it('starts an undo group and leaves a pebble on pointer down', () => {
		fire('onTextCanvasDown', { x: 5, y: 5, halfBlockY: 11 });
		expect(State.textArtCanvas.startUndo).toHaveBeenCalledTimes(1);
		// lower half tap: period
		expect(cellAt(5, 5)).toMatchObject({ charCode: 46, fg: 7, bg: 4 });
	});

	it('weights an upper half tap with an apostrophe', () => {
		fire('onTextCanvasDown', { x: 5, y: 5, halfBlockY: 10 });
		expect(cellAt(5, 5).charCode).toBe(39);
	});

	it('preserves the existing cell background', () => {
		State.textArtCanvas.getBlock.mockReturnValue({
			charCode: 32,
			foregroundColor: 15,
			backgroundColor: 1,
		});
		fire('onTextCanvasDown', { x: 0, y: 0, halfBlockY: 1 });
		expect(cellAt(0, 0).bg).toBe(1);
	});

	it('resolves a flat drag to underscores, gap free', () => {
		fire('onTextCanvasDown', { x: 2, y: 8, halfBlockY: 17 });
		fire('onTextCanvasDrag', { x: 8, y: 8, halfBlockY: 17 });
		fire('onTextCanvasUp', {});
		for (let x = 2; x <= 8; x++) {
			expect(cellAt(x, 8).charCode).toBe(95);
		}
		expect(cellAt(1, 8)).toBeUndefined();
		expect(cellAt(9, 8)).toBeUndefined();
	});

	it('resolves a 45 degree drag to backslashes', () => {
		fire('onTextCanvasDown', { x: 0, y: 0, halfBlockY: 1 });
		fire('onTextCanvasDrag', { x: 4, y: 4, halfBlockY: 9 });
		fire('onTextCanvasUp', {});
		for (let i = 0; i <= 4; i++) {
			expect(cellAt(i, i).charCode).toBe(92);
		}
	});

	it('does not interpolate between strokes', () => {
		fire('onTextCanvasDown', { x: 0, y: 0, halfBlockY: 1 });
		fire('onTextCanvasUp', {});
		fire('onTextCanvasDown', { x: 10, y: 0, halfBlockY: 1 });
		fire('onTextCanvasUp', {});
		expect(cellAt(5, 0)).toBeUndefined();
		expect(State.textArtCanvas.startUndo).toHaveBeenCalledTimes(2);
	});

	it('ignores drags before a down and after an up', () => {
		fire('onTextCanvasDrag', { x: 1, y: 1, halfBlockY: 3 });
		expect(grid.size).toBe(0);
		fire('onTextCanvasDown', { x: 0, y: 0, halfBlockY: 1 });
		fire('onTextCanvasUp', {});
		grid.clear();
		fire('onTextCanvasDrag', { x: 3, y: 3, halfBlockY: 7 });
		expect(grid.size).toBe(0);
	});

	it('builds up on existing ink instead of carving it', () => {
		// the canvas already holds roman fill where this stroke passes
		State.textArtCanvas.getBlock.mockReturnValue({
			charCode: 36,
			foregroundColor: 7,
			backgroundColor: 0,
		});
		fire('onTextCanvasDown', { x: 2, y: 8, halfBlockY: 17 });
		fire('onTextCanvasDrag', { x: 8, y: 8, halfBlockY: 17 });
		fire('onTextCanvasUp', {});
		for (let x = 2; x <= 8; x++) {
			expect(cellAt(x, 8).charCode).toBe(36);
		}
	});

	it('merges crossing stems from separate strokes to a junction', () => {
		State.textArtCanvas.getBlock.mockReturnValue({
			charCode: 47,
			foregroundColor: 7,
			backgroundColor: 0,
		});
		fire('onTextCanvasDown', { x: 0, y: 0, halfBlockY: 1 });
		fire('onTextCanvasDrag', { x: 4, y: 4, halfBlockY: 9 });
		fire('onTextCanvasUp', {});
		for (let i = 0; i <= 4; i++) {
			expect(cellAt(i, i).charCode).toBe(88);
		}
	});

	it('stops listening when disabled', () => {
		controller.disable();
		fire('onTextCanvasDown', { x: 1, y: 1, halfBlockY: 3 });
		expect(grid.size).toBe(0);
		controller.enable();
	});

	describe('terminal joins against a drawn line', () => {
		beforeEach(() => {
			// a horizontal line of underscores on row 8 from column 5 on
			State.textArtCanvas.getBlock.mockImplementation((x, y) => ({
				charCode: y === 8 && x >= 5 ? 95 : 32,
				foregroundColor: 7,
				backgroundColor: 0,
			}));
		});

		it('a vertical ending on the line end hooks along it', () => {
			fire('onTextCanvasDown', { x: 5, y: 4, halfBlockY: 9 });
			fire('onTextCanvasDrag', { x: 5, y: 8, halfBlockY: 17 });
			fire('onTextCanvasUp', {});
			// line continues right only: L
			expect(cellAt(5, 8).charCode).toBe(76);
		});

		it('a vertical ending mid line takes the plus', () => {
			fire('onTextCanvasDown', { x: 9, y: 4, halfBlockY: 9 });
			fire('onTextCanvasDrag', { x: 9, y: 8, halfBlockY: 17 });
			fire('onTextCanvasUp', {});
			expect(cellAt(9, 8).charCode).toBe(43);
		});

		it('a rising vertical knots an underscore line with a period', () => {
			fire('onTextCanvasDown', { x: 9, y: 12, halfBlockY: 25 });
			fire('onTextCanvasDrag', { x: 9, y: 8, halfBlockY: 17 });
			fire('onTextCanvasUp', {});
			expect(cellAt(9, 8).charCode).toBe(46);
		});

		it('a rising vertical onto a dash line still takes the T', () => {
			State.textArtCanvas.getBlock.mockImplementation((x, y) => ({
				charCode: y === 8 && x >= 5 ? 45 : 32,
				foregroundColor: 7,
				backgroundColor: 0,
			}));
			fire('onTextCanvasDown', { x: 9, y: 12, halfBlockY: 25 });
			fire('onTextCanvasDrag', { x: 9, y: 8, halfBlockY: 17 });
			fire('onTextCanvasUp', {});
			expect(cellAt(9, 8).charCode).toBe(84);
		});

		it('a rising diagonal stopping short joins where the path continues', () => {
			fire('onTextCanvasDown', { x: 2, y: 12, halfBlockY: 25 });
			fire('onTextCanvasDrag', { x: 6, y: 9, halfBlockY: 19 });
			fire('onTextCanvasUp', {});
			// the knot lands one cell past the tip, on the line itself
			expect(cellAt(7, 8).charCode).toBe(46);
		});

		it('a stroke starting mid underscore line knots a period', () => {
			fire('onTextCanvasDown', { x: 9, y: 8, halfBlockY: 17 });
			fire('onTextCanvasDrag', { x: 9, y: 12, halfBlockY: 25 });
			fire('onTextCanvasUp', {});
			expect(cellAt(9, 8).charCode).toBe(46);
		});

		it('a stroke starting on an underscore line end knots a period', () => {
			fire('onTextCanvasDown', { x: 5, y: 8, halfBlockY: 17 });
			fire('onTextCanvasDrag', { x: 5, y: 12, halfBlockY: 25 });
			fire('onTextCanvasUp', {});
			expect(cellAt(5, 8).charCode).toBe(46);
		});

		it('snaps back a one cell overshoot into a terminal join', () => {
			// diagonal crosses the line and carries one whisker cell past
			// it; the crossing cell takes the join and the whisker comes
			// back off the canvas
			fire('onTextCanvasDown', { x: 4, y: 3, halfBlockY: 7 });
			fire('onTextCanvasDrag', { x: 10, y: 9, halfBlockY: 19 });
			fire('onTextCanvasUp', {});
			expect(cellAt(9, 8).charCode).toBe(74);
			expect(cellAt(10, 9).charCode).toBe(32);
		});

		it('the begin side snaps back a one cell overshoot too', () => {
			// touch down one cell past the line and draw away from it;
			// the crossed second cell takes the join and the start cell
			// comes back off the canvas
			fire('onTextCanvasDown', { x: 10, y: 9, halfBlockY: 19 });
			fire('onTextCanvasDrag', { x: 4, y: 3, halfBlockY: 7 });
			fire('onTextCanvasUp', {});
			expect(cellAt(10, 9).charCode).toBe(32);
			expect(cellAt(9, 8).charCode).toBe(74);
		});

		it('a begin two cells past the line stays a deliberate crossing', () => {
			fire('onTextCanvasDown', { x: 11, y: 10, halfBlockY: 21 });
			fire('onTextCanvasDrag', { x: 4, y: 3, halfBlockY: 7 });
			fire('onTextCanvasUp', {});
			expect(cellAt(10, 9).charCode).toBe(92);
			expect(cellAt(9, 8).charCode).toBe(37);
		});

		it('two cells past the line stays a deliberate crossing', () => {
			fire('onTextCanvasDown', { x: 4, y: 3, halfBlockY: 7 });
			fire('onTextCanvasDrag', { x: 11, y: 10, halfBlockY: 21 });
			fire('onTextCanvasUp', {});
			expect(cellAt(9, 8).charCode).toBe(37);
			expect(cellAt(10, 9).charCode).toBe(92);
			expect(cellAt(11, 10).charCode).toBe(92);
		});

		it('reaches across one blank cell and bridges the gap', () => {
			fire('onTextCanvasDown', { x: 9, y: 3, halfBlockY: 7 });
			fire('onTextCanvasDrag', { x: 9, y: 6, halfBlockY: 13 });
			fire('onTextCanvasUp', {});
			expect(cellAt(9, 7).charCode).toBe(124);
			expect(cellAt(9, 8).charCode).toBe(43);
		});

		it('the begin side reaches across a gap too', () => {
			fire('onTextCanvasDown', { x: 9, y: 10, halfBlockY: 21 });
			fire('onTextCanvasDrag', { x: 9, y: 14, halfBlockY: 29 });
			fire('onTextCanvasUp', {});
			expect(cellAt(9, 9).charCode).toBe(124);
			expect(cellAt(9, 8).charCode).toBe(46);
		});

		it('a crossing junction sweeps dangling taper crumbs off the line', () => {
			// the underscore line dies at x 10; a bar crossing at x 9
			// voices the plus and the lone trailing crumb gets swept,
			// while the long side of the line stays
			State.textArtCanvas.getBlock.mockImplementation((x, y) => ({
				charCode: y === 8 && x >= 5 && x <= 10 ? 95 : 32,
				foregroundColor: 7,
				backgroundColor: 0,
			}));
			fire('onTextCanvasDown', { x: 9, y: 4, halfBlockY: 9 });
			fire('onTextCanvasDrag', { x: 9, y: 12, halfBlockY: 25 });
			fire('onTextCanvasUp', {});
			expect(cellAt(9, 8).charCode).toBe(43);
			expect(cellAt(10, 8).charCode).toBe(32);
			expect(cellAt(8, 8)).toBeUndefined();
		});
	});
});

describe('createAsciiStrokePainter', () => {
	// a straight synthetic stroke, the same way the line tool builds one
	const strokeCells = () => {
		const engine = createAsciiStampEngine({ width: 2 });
		const out = [...engine.begin(2, 2, 0)];
		for (let x = 3; x <= 14; x++) {
			out.push(...engine.move(x, 2 + Math.floor((x - 2) / 3), (x - 2) % 2));
		}
		out.push(...engine.end());
		return out;
	};

	beforeEach(() => {
		grid.clear();
		vi.clearAllMocks();
		State.textArtCanvas.getBlock.mockReturnValue({
			charCode: 32,
			foregroundColor: 7,
			backgroundColor: 0,
		});
	});

	it('preview captures exactly what commit draws', () => {
		const cells = strokeCells();

		const committer = createAsciiStrokePainter();
		committer.begin();
		committer.commit(cells);

		const previewer = createAsciiStrokePainter();
		previewer.begin();
		const ghost = previewer.preview(cells);

		expect(ghost.length).toBeGreaterThan(0);
		expect(ghost.length).toBe(grid.size);
		for (const g of ghost) {
			expect(cellAt(g.x, g.y).charCode).toBe(g.charCode);
		}
	});

	it('preview leaves the canvas untouched', () => {
		const painter = createAsciiStrokePainter();
		painter.begin();
		painter.preview(strokeCells());
		expect(grid.size).toBe(0);
	});
});
