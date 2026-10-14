import State from './state.js';
import { $ } from './ui.js';
import {
	cellInRange,
	createAsciiStampEngine,
	junctionForTip,
	mergeGlyphs,
} from '../core/index';

const createAsciiBrushController = () => {
	const engine = createAsciiStampEngine();
	let stroking = false;
	// what each touched cell held BEFORE this stroke: additive contact
	// merges against that, never against our own live revisions, or a
	// revised cell would escalate against itself
	const strokeOriginals = new Map();
	const bar = $('brushToolbar');
	const nav = $('brushes');
	const widthMenu = $('aWidth');
	const widthSelect = $('asciiWidth');

	const applyWidth = () => {
		engine.setWidth(parseInt(widthSelect.value, 10) || 1);
	};

	// what a cell held BEFORE this stroke, whether or not we inked it:
	// junctions must read the canvas the stroke landed on, not its own
	// fresh marks
	const originalAt = (x, y, columns, rows) => {
		if (!cellInRange(x, y, columns, rows)) {
			return 0;
		}
		const held = strokeOriginals.get(y * 65536 + x);
		return held === undefined
			? State.textArtCanvas.getBlock(x, y).charCode
			: held;
	};

	// a stroke ending against a line voices the contact as a junction
	// glyph; the junction may sit on the tip cell itself or one cell
	// past it, where the path would have continued into the line. meta
	// is the approach: the tip's own for endings, the negated departure
	// for a stroke that STARTED against the line
	const tipJunction = (cell, meta, fg, draw, columns, rows) => {
		const { dx, dy } = meta;
		const candidates = [
			[cell.x, cell.y],
			[cell.x + dx, cell.y + dy],
		];
		if (dx !== 0 && dy !== 0) {
			candidates.push([cell.x, cell.y + dy]);
		}
		for (const [jx, jy] of candidates) {
			if (!cellInRange(jx, jy, columns, rows)) {
				continue;
			}
			const glyph = junctionForTip(
				meta,
				originalAt(jx, jy, columns, rows),
				originalAt(jx - 1, jy, columns, rows),
				originalAt(jx + 1, jy, columns, rows),
			);
			if (glyph !== 0) {
				const bg = State.textArtCanvas.getBlock(jx, jy).backgroundColor;
				draw(glyph, fg, bg, jx, jy);
				return true;
			}
		}
		return false;
	};

	// the engine revises cells as the stroke reveals itself; last wins
	// inside the stroke's single undo group, so drawing stays fully live
	const apply = cells => {
		if (cells.length === 0) {
			return;
		}
		const fg = State.palette.getForegroundColor();
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		State.textArtCanvas.draw(draw => {
			for (const cell of cells) {
				if (cell.tip && tipJunction(cell, cell.tip, fg, draw, columns, rows)) {
					continue;
				}
				if (
					cell.root &&
					tipJunction(
						cell,
						{ dx: -cell.root.dx, dy: -cell.root.dy, cls: cell.root.cls },
						fg,
						draw,
						columns,
						rows,
					)
				) {
					continue;
				}
				// ribbon spans and spline overshoot can reach past the
				// canvas; unclipped writes wrap through the cell index to
				// the far side of the neighboring row
				if (!cellInRange(cell.x, cell.y, columns, rows)) {
					continue;
				}
				// fg paints, bg survives: the brush draws strokes, not blocks
				const block = State.textArtCanvas.getBlock(cell.x, cell.y);
				const key = cell.y * 65536 + cell.x;
				let original = strokeOriginals.get(key);
				if (original === undefined) {
					original = block.charCode;
					strokeOriginals.set(key, original);
				}
				draw(
					mergeGlyphs(original, cell.charCode),
					fg,
					block.backgroundColor,
					cell.x,
					cell.y,
				);
			}
		}, false);
	};

	const canvasDown = e => {
		State.textArtCanvas.startUndo();
		stroking = true;
		strokeOriginals.clear();
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
		widthSelect.addEventListener('change', applyWidth);
		applyWidth();
		bar.style.display = 'flex';
		widthMenu.style.display = 'flex';
		nav.classList.add('enabled');
	};

	const disable = () => {
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		widthSelect.removeEventListener('change', applyWidth);
		bar.style.display = 'none';
		widthMenu.style.display = 'none';
		nav.classList.remove('enabled');
	};

	return {
		enable: enable,
		disable: disable,
	};
};

export { createAsciiBrushController };
