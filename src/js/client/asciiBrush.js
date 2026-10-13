import State from './state.js';
import { $ } from './ui.js';

// P0 skeleton stamp: a bare fill char. The ascii stamp engine (core)
// replaces this with slope-aware glyph selection; keeping the seam a
// single function lets the engine swap in without touching the
// controller's event or undo wiring.
const FILL_CHAR = 36; // $

const createAsciiBrushController = () => {
	// last stamped cell; strokes interpolate from here so fast drags
	// stay continuous (pointer events arrive sparsely)
	let prev = null;
	const bar = $('brushToolbar');
	const nav = $('brushes');

	const line = (x0, y0, x1, y1, callback) => {
		const dx = Math.abs(x1 - x0);
		const sx = x0 < x1 ? 1 : -1;
		const dy = Math.abs(y1 - y0);
		const sy = y0 < y1 ? 1 : -1;
		let err = (dx > dy ? dx : -dy) / 2;
		let e2;

		while (true) {
			callback(x0, y0);
			if (x0 === x1 && y0 === y1) {
				break;
			}
			e2 = err;
			if (e2 > -dx) {
				err -= dy;
				x0 += sx;
			}
			if (e2 < dy) {
				err += dx;
				y0 += sy;
			}
		}
	};

	const stamp = (draw, x, y) => {
		// fg paints, bg survives: the brush draws strokes, not blocks
		const bg = State.textArtCanvas.getBlock(x, y).backgroundColor;
		draw(FILL_CHAR, State.palette.getForegroundColor(), bg, x, y);
	};

	const drawTo = coords => {
		if (prev && prev.x === coords.x && prev.y === coords.y) {
			return;
		}
		State.textArtCanvas.draw(draw => {
			if (prev) {
				// skip the first cell: prev was stamped by the previous event
				let first = true;
				line(prev.x, prev.y, coords.x, coords.y, (x, y) => {
					if (first) {
						first = false;
						return;
					}
					stamp(draw, x, y);
				});
			} else {
				stamp(draw, coords.x, coords.y);
			}
		}, false);
		State.positionInfo.update(coords.x, coords.y);
		prev = coords;
	};

	const canvasDown = e => {
		State.textArtCanvas.startUndo();
		drawTo(e.detail);
	};

	const canvasDrag = e => {
		drawTo(e.detail);
	};

	// stroke end: P3 hook for the terminal re-skin pass
	const canvasUp = () => {
		prev = null;
	};

	const enable = () => {
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasUp', canvasUp);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
		bar.style.display = 'flex';
		nav.classList.add('enabled');
	};

	const disable = () => {
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		bar.style.display = 'none';
		nav.classList.remove('enabled');
	};

	return {
		enable: enable,
		disable: disable,
	};
};

export { createAsciiBrushController };
