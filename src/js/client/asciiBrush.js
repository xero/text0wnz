import State from './state.js';
import { $ } from './ui.js';
import { createAsciiStampEngine } from '../core/index';

const createAsciiBrushController = () => {
	const engine = createAsciiStampEngine();
	let stroking = false;
	const bar = $('brushToolbar');
	const nav = $('brushes');

	// the engine revises cells as the stroke reveals itself; last wins
	// inside the stroke's single undo group, so drawing stays fully live
	const apply = cells => {
		if (cells.length === 0) {
			return;
		}
		const fg = State.palette.getForegroundColor();
		State.textArtCanvas.draw(draw => {
			for (const cell of cells) {
				// fg paints, bg survives: the brush draws strokes, not blocks
				const bg = State.textArtCanvas.getBlock(
					cell.x,
					cell.y,
				).backgroundColor;
				draw(cell.charCode, fg, bg, cell.x, cell.y);
			}
		}, false);
	};

	const canvasDown = e => {
		State.textArtCanvas.startUndo();
		stroking = true;
		apply(engine.begin(e.detail.x, e.detail.y, e.detail.halfBlockY % 2));
		State.positionInfo.update(e.detail.x, e.detail.y);
	};

	const canvasDrag = e => {
		if (!stroking) {
			return;
		}
		apply(engine.move(e.detail.x, e.detail.y, e.detail.halfBlockY % 2));
		State.positionInfo.update(e.detail.x, e.detail.y);
	};

	const canvasUp = () => {
		if (stroking) {
			apply(engine.end());
			stroking = false;
		}
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
