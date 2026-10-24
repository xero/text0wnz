import State from './state.js';
import { $, createSegmentedControl } from './ui.js';
import { mountSetting } from './freehandTools.js';
import {
	cellInRange,
	createAsciiStampEngine,
	isJunctionGlyph,
	isLightInk,
	junctionForTip,
	lineAxis,
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
	const sweptKeys = new Set();

	// what a cell held BEFORE this stroke, whether or not we inked it:
	// junctions must read the canvas the stroke landed on, not its own
	// fresh marks
	const originalAt = (x, y, columns, rows) => {
		if (!cellInRange(x, y, columns, rows)) {
			return 0;
		}
		const key = y * 65536 + x;
		if (sweptKeys.has(key)) {
			// a swept whisker is blank now: merging against its pre sweep
			// char would voice junctions into empty space
			return 32;
		}
		const held = strokeOriginals.get(key);
		return held === undefined
			? State.textArtCanvas.getBlock(x, y).charCode
			: held.charCode;
	};

	// a junction inherits its line's loose ends: taper crumbs from the
	// stroke that drew the joined line often dangle a cell or two past
	// the contact, and they read as whiskers once a junction anchors
	// the corner. a short run of light ink that dies into blank space
	// within two cells along the line's axis is such a crumb and gets
	// swept; a run that keeps going, or meets heavy ink, is the line
	// itself and stays
	const sweepStubs = (jx, jy, axis, draw, columns, rows) => {
		if (!axis) {
			return;
		}
		for (const dir of [1, -1]) {
			const run = [];
			let dangling = false;
			for (let step = 1; step <= 3; step++) {
				const x = jx + axis.dx * dir * step;
				const y = jy + axis.dy * dir * step;
				if (!cellInRange(x, y, columns, rows)) {
					dangling = true;
					break;
				}
				// the current stroke owns its own cells
				if (strokeOriginals.has(y * 65536 + x)) {
					break;
				}
				const block = State.textArtCanvas.getBlock(x, y);
				if (block.charCode === 0 || block.charCode === 32) {
					dangling = true;
					break;
				}
				if (!isLightInk(block.charCode) || run.length >= 2) {
					break;
				}
				// a light cell braced by line ink square to the walk is a
				// corner cap anchored to its own structure, not a crumb: a
				// box top dies into blank by design and must survive its
				// bar's junctions. the brace reads pre stroke state so a
				// ghost and its commit agree
				const braced = [
					[x - axis.dy, y + axis.dx],
					[x + axis.dy, y - axis.dx],
				].some(([bx, by]) => {
					const n = lineAxis(originalAt(bx, by, columns, rows));
					return n !== null && n.dx * axis.dx + n.dy * axis.dy === 0;
				});
				if (braced) {
					break;
				}
				run.push({
					x: x,
					y: y,
					charCode: block.charCode,
					fg: block.foregroundColor,
					bg: block.backgroundColor,
				});
			}
			if (dangling) {
				for (const c of run) {
					// the erasure registers as stroke state: later cells in
					// the same batch must merge against what stood here
					// before the sweep, or a ghost built without canvas
					// writes diverges from its commit
					const key = c.y * 65536 + c.x;
					if (!strokeOriginals.has(key)) {
						strokeOriginals.set(key, {
							charCode: c.charCode,
							fg: c.fg,
							bg: c.bg,
						});
					}
					sweptKeys.add(key);
					draw(32, c.fg, c.bg, c.x, c.y);
				}
			}
		}
	};

	// a stroke ending against a line voices the contact as a junction
	// glyph; at 1x zoom the pen rarely stops on the exact cell, so the
	// probe forgives a near miss by one cell on either side. meta is
	// the approach: the tip's own for endings, the negated departure
	// for a stroke that STARTED against the line. allowBack enables
	// snap-back for both ends: one step behind in meta terms is the
	// crossed cell, which for the root is the stroke's second cell, so
	// a touch down that overshot through a line by one leaves no
	// whisker either
	const tipJunction = (cell, meta, allowBack, fg, draw, columns, rows) => {
		const { dx, dy } = meta;
		// junction writes register like any other stroke write: a later
		// cell revisiting one must merge against the real canvas content
		const holdOriginal = (jx, jy) => {
			const key = jy * 65536 + jx;
			if (!strokeOriginals.has(key)) {
				const b = State.textArtCanvas.getBlock(jx, jy);
				strokeOriginals.set(key, {
					charCode: b.charCode,
					fg: b.foregroundColor,
					bg: b.backgroundColor,
				});
			}
		};
		const joinAt = (jx, jy) => {
			if (!cellInRange(jx, jy, columns, rows)) {
				return false;
			}
			const contact = originalAt(jx, jy, columns, rows);
			const glyph = junctionForTip(
				meta,
				contact,
				originalAt(jx - 1, jy, columns, rows),
				originalAt(jx + 1, jy, columns, rows),
			);
			if (glyph === 0) {
				return false;
			}
			const bg = State.textArtCanvas.getBlock(jx, jy).backgroundColor;
			holdOriginal(jx, jy);
			draw(glyph, fg, bg, jx, jy);
			sweepStubs(jx, jy, lineAxis(contact), draw, columns, rows);
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
		// corner joins: a horizontal stroke meeting a bar that ends one
		// row above or below its endpoint never sees it through the row
		// probes; the corner glyph stands its stem toward the bar with
		// the foot back along the stroke
		if (dy === 0 && dx !== 0 && cellInRange(cell.x, cell.y, columns, rows)) {
			const above = originalAt(cell.x, cell.y - 1, columns, rows) === 124;
			const below = originalAt(cell.x, cell.y + 1, columns, rows) === 124;
			if (above !== below) {
				const glyph = above ? (dx > 0 ? 74 : 76) : dx > 0 ? 55 : 114;
				const bg = State.textArtCanvas.getBlock(
					cell.x,
					cell.y,
				).backgroundColor;
				holdOriginal(cell.x, cell.y);
				draw(glyph, fg, bg, cell.x, cell.y);
				return true;
			}
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
			holdOriginal(cell.x + dx, cell.y + dy);
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
					true,
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
			// a controller voiced junction lands raw, like tipJunction's
			// own picks: the weight tables would eat a period knot on
			// the very underscore that earned it
			if (cell.joint) {
				const jBlock = State.textArtCanvas.getBlock(cell.x, cell.y);
				const jKey = cell.y * 65536 + cell.x;
				if (!strokeOriginals.has(jKey)) {
					strokeOriginals.set(jKey, {
						charCode: jBlock.charCode,
						fg: jBlock.foregroundColor,
						bg: jBlock.backgroundColor,
					});
				}
				draw(cell.charCode, fg, jBlock.backgroundColor, cell.x, cell.y);
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
			const merged = mergeGlyphs(original.charCode, cell.charCode);
			draw(merged, fg, block.backgroundColor, cell.x, cell.y);
			if (merged !== original.charCode && isJunctionGlyph(merged)) {
				sweepStubs(
					cell.x,
					cell.y,
					lineAxis(original.charCode),
					draw,
					columns,
					rows,
				);
			}
		}
	};

	const begin = () => {
		strokeOriginals.clear();
		sweptKeys.clear();
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
	const nav = $('brushes');

	// each swatch previews the stroke footprint: thin pebbles at one
	// and two, then the dollar ribbon growing with its fill rank
	const widthSwatch = n => (n === 1 ? '.' : n === 2 ? ':' : '$'.repeat(n - 2));
	const widthControl = createSegmentedControl(
		'asciiWidth',
		[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({
			value: n,
			label: String(n),
			glyph: widthSwatch(n),
		})),
		width => {
			engine.setWidth(width);
			State.toolSettings.set('asciiWidth', width);
		},
	);
	mountSetting('ascii', 'Width', widthControl.getElement());
	widthControl.set(State.toolSettings.get('asciiWidth', 1));
	engine.setWidth(widthControl.value());

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
		nav.classList.add('enabled');
		State.toolSettings.show('ascii');
	};

	const disable = () => {
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		nav.classList.remove('enabled');
	};

	return {
		enable: enable,
		disable: disable,
	};
};

export { createAsciiBrushController, createAsciiStrokePainter };
