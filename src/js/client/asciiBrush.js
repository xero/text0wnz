import State from './state.js';
import { $ } from './ui.js';
import {
	cellInRange,
	createAsciiStampEngine,
	junctionForTip,
	mergeGlyphs,
} from '../core/index';

/**
 * Applies engine stamp output to the document: additive contact
 * merges, bg preservation, and tip/root junction voicing. Shared by
 * the freehand brush and the line tool, whose straight strokes earn
 * the same joins. commit() writes to the canvas; preview() runs the
 * identical pipeline and captures the writes instead, so a ghost can
 * be pixel-faithful to what a commit would produce.
 */
const createAsciiStrokePainter = () => {
	// what each touched cell held BEFORE this stroke: additive contact
	// merges against that, never against our own live revisions, or a
	// revised cell would escalate against itself; the full block is
	// kept so snap-back can restore a whisker cell faithfully
	const strokeOriginals = new Map();

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
			: held.charCode;
	};

	// a stroke ending against a line voices the contact as a junction
	// glyph; at 1x zoom the pen rarely stops on the exact cell, so the
	// probe forgives a near miss by one cell on either side. meta is
	// the approach: the tip's own for endings, the negated departure
	// for a stroke that STARTED against the line. allowBack enables
	// snap-back, which only makes sense at the tip: behind the root
	// lies the stroke body, not a whisker
	const tipJunction = (cell, meta, allowBack, fg, draw, columns, rows) => {
		const { dx, dy } = meta;
		const joinAt = (jx, jy) => {
			if (!cellInRange(jx, jy, columns, rows)) {
				return false;
			}
			const glyph = junctionForTip(
				meta,
				originalAt(jx, jy, columns, rows),
				originalAt(jx - 1, jy, columns, rows),
				originalAt(jx + 1, jy, columns, rows),
			);
			if (glyph === 0) {
				return false;
			}
			const bg = State.textArtCanvas.getBlock(jx, jy).backgroundColor;
			draw(glyph, fg, bg, jx, jy);
			return true;
		};
		// the stroke ended on the line itself
		if (joinAt(cell.x, cell.y)) {
			return true;
		}
		// snap-back: overshot by exactly one cell; the crossed cell one
		// step behind the tip becomes the join and the whisker cell is
		// restored to what it held before the stroke. two or more cells
		// past stays a deliberate crossing
		if (allowBack) {
			const held = strokeOriginals.get((cell.y - dy) * 65536 + (cell.x - dx));
			if (held !== undefined && joinAt(cell.x - dx, cell.y - dy)) {
				const tip = strokeOriginals.get(cell.y * 65536 + cell.x);
				if (tip !== undefined) {
					draw(tip.charCode, tip.fg, tip.bg, cell.x, cell.y);
				}
				return true;
			}
		}
		// stopped one short: join where the path would have continued
		if (joinAt(cell.x + dx, cell.y + dy)) {
			return true;
		}
		if (dx !== 0 && dy !== 0 && joinAt(cell.x, cell.y + dy)) {
			return true;
		}
		// stopped two short with a clean gap: bridge the blank cell with
		// the stroke's own leg glyph so the join connects
		const mid = originalAt(cell.x + dx, cell.y + dy, columns, rows);
		if ((mid === 0 || mid === 32) && joinAt(cell.x + 2 * dx, cell.y + 2 * dy)) {
			const leg = dx === 0 ? 124 : dx * dy > 0 ? 92 : dy === 0 ? 95 : 47;
			const bg = State.textArtCanvas.getBlock(
				cell.x + dx,
				cell.y + dy,
			).backgroundColor;
			draw(leg, fg, bg, cell.x + dx, cell.y + dy);
			return true;
		}
		return false;
	};

	const applyCells = (cells, draw) => {
		const fg = State.palette.getForegroundColor();
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		for (const cell of cells) {
			if (
				cell.tip &&
				tipJunction(cell, cell.tip, true, fg, draw, columns, rows)
			) {
				continue;
			}
			if (
				cell.root &&
				tipJunction(
					cell,
					{ dx: -cell.root.dx, dy: -cell.root.dy, cls: cell.root.cls },
					false,
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
				original = {
					charCode: block.charCode,
					fg: block.foregroundColor,
					bg: block.backgroundColor,
				};
				strokeOriginals.set(key, original);
			}
			draw(
				mergeGlyphs(original.charCode, cell.charCode),
				fg,
				block.backgroundColor,
				cell.x,
				cell.y,
			);
		}
	};

	const begin = () => {
		strokeOriginals.clear();
	};

	// the engine revises cells as the stroke reveals itself; last wins
	// inside the stroke's single undo group, so drawing stays fully live
	const commit = cells => {
		if (cells.length === 0) {
			return;
		}
		State.textArtCanvas.draw(draw => {
			applyCells(cells, draw);
		}, false);
	};

	// same pipeline, writes captured last-wins instead of landing on
	// the canvas; the caller blits the survivors onto the ghost overlay
	const preview = cells => {
		const ghost = new Map();
		applyCells(cells, (charCode, fg, _bg, x, y) => {
			ghost.set(y * 65536 + x, { charCode: charCode, fg: fg, x: x, y: y });
		});
		return [...ghost.values()];
	};

	return {
		begin: begin,
		commit: commit,
		preview: preview,
	};
};

const createAsciiBrushController = () => {
	const engine = createAsciiStampEngine();
	const painter = createAsciiStrokePainter();
	let stroking = false;
	const bar = $('brushToolbar');
	const nav = $('brushes');
	const widthMenu = $('aWidth');
	const widthSelect = $('asciiWidth');

	// the width config lives inside the tool button; a tap on it must
	// not bubble into the button's click handler, whose preventDefault
	// would keep the picker from opening on touch
	widthMenu.addEventListener('click', e => e.stopPropagation());

	const applyWidth = () => {
		engine.setWidth(parseInt(widthSelect.value, 10) || 1);
	};

	const canvasDown = e => {
		State.textArtCanvas.startUndo();
		stroking = true;
		painter.begin();
		painter.commit(engine.begin(e.detail.x, e.detail.y, e.detail.halfBlockY % 2));
		State.positionInfo.update(e.detail.x, e.detail.y);
	};

	const canvasDrag = e => {
		if (!stroking) {
			return;
		}
		painter.commit(engine.move(e.detail.x, e.detail.y, e.detail.halfBlockY % 2));
		State.positionInfo.update(e.detail.x, e.detail.y);
	};

	const canvasUp = () => {
		if (stroking) {
			painter.commit(engine.end());
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

export { createAsciiBrushController, createAsciiStrokePainter };
